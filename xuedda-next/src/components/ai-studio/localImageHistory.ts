export type LocalImageHistoryItem = {
  id: string;
  prompt: string;
  image: string;
  thumbnail?: string;
  createdAt: string;
};

const DB_NAME = "belongstoai-ai-image";
const STORE_NAME = "generated-history";
const WORKSPACE_STORE_NAME = "workspace-state";
const WORKSPACE_MAIN_IMAGE_KEY = "main-image";
const WORKSPACE_REFERENCES_KEY = "reference-images";
const WORKSPACE_ANNOTATION_KEY = "annotation-state";
const WORKSPACE_COMPARE_SOURCE_KEY = "compare-source";
const MAX_HISTORY_ITEMS = 40;

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

function openHistoryDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }

    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains(WORKSPACE_STORE_NAME)) {
        db.createObjectStore(WORKSPACE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open image history database."));
  });
}

async function withWorkspaceStore<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openHistoryDb();
  try {
    return await requestToPromise(callback(db.transaction(WORKSPACE_STORE_NAME, mode).objectStore(WORKSPACE_STORE_NAME)));
  } finally {
    db.close();
  }
}

export async function loadWorkspaceMainImage() {
  return (await withWorkspaceStore<string | undefined>("readonly", (store) => store.get(WORKSPACE_MAIN_IMAGE_KEY))) || "";
}

export async function saveWorkspaceMainImage(image: string) {
  if (!image) return clearWorkspaceMainImage();
  await withWorkspaceStore<IDBValidKey>("readwrite", (store) => store.put(image, WORKSPACE_MAIN_IMAGE_KEY));
}

export async function clearWorkspaceMainImage() {
  await withWorkspaceStore<undefined>("readwrite", (store) => store.delete(WORKSPACE_MAIN_IMAGE_KEY));
}

export async function loadWorkspaceReferences<T>() {
  return (await withWorkspaceStore<T[] | undefined>("readonly", (store) => store.get(WORKSPACE_REFERENCES_KEY))) || [];
}

export async function saveWorkspaceReferences<T>(references: T[]) {
  await withWorkspaceStore<IDBValidKey>("readwrite", (store) => store.put(references, WORKSPACE_REFERENCES_KEY));
}

export async function loadWorkspaceAnnotation<T>() {
  return (await withWorkspaceStore<T | undefined>("readonly", (store) => store.get(WORKSPACE_ANNOTATION_KEY))) || null;
}

export async function saveWorkspaceAnnotation<T>(annotation: T | null) {
  if (!annotation) {
    await withWorkspaceStore<undefined>("readwrite", (store) => store.delete(WORKSPACE_ANNOTATION_KEY));
    return;
  }
  await withWorkspaceStore<IDBValidKey>("readwrite", (store) => store.put(annotation, WORKSPACE_ANNOTATION_KEY));
}

export async function loadWorkspaceCompareSource() {
  return (await withWorkspaceStore<string | undefined>("readonly", (store) => store.get(WORKSPACE_COMPARE_SOURCE_KEY))) || "";
}

export async function saveWorkspaceCompareSource(image: string) {
  if (!image) {
    await withWorkspaceStore<undefined>("readwrite", (store) => store.delete(WORKSPACE_COMPARE_SOURCE_KEY));
    return;
  }
  await withWorkspaceStore<IDBValidKey>("readwrite", (store) => store.put(image, WORKSPACE_COMPARE_SOURCE_KEY));
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openHistoryDb();
  try {
    return await requestToPromise(callback(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)));
  } finally {
    db.close();
  }
}

export async function loadLocalImageHistory() {
  const items = await withStore<LocalImageHistoryItem[]>("readonly", (store) => store.getAll());
  return items
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_HISTORY_ITEMS);
}

export async function saveLocalImageHistoryItem(item: LocalImageHistoryItem) {
  await withStore<IDBValidKey>("readwrite", (store) => store.put(item));

  const items = await withStore<LocalImageHistoryItem[]>("readonly", (store) => store.getAll());
  items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const staleItems = items.slice(MAX_HISTORY_ITEMS);
  if (staleItems.length === 0) return;

  const db = await openHistoryDb();
  try {
    const store = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
    await Promise.all(staleItems.map((stale) => requestToPromise(store.delete(stale.id))));
  } finally {
    db.close();
  }
}

export async function deleteLocalImageHistoryItem(id: string) {
  await withStore<undefined>("readwrite", (store) => store.delete(id));
}

export async function clearLocalImageHistory() {
  await withStore<undefined>("readwrite", (store) => store.clear());
}
