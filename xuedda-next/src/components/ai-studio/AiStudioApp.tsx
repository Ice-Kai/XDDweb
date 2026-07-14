import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Clock3,
  Download,
  ImagePlus,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import './ai-studio.css';
import { CanvasWorkbench, type CanvasAnnotationState, type CanvasWorkbenchHandle } from './CanvasWorkbench';
import {
  clearWorkspaceMainImage,
  deleteLocalImageHistoryItem,
  loadLocalImageHistory,
  loadWorkspaceMainImage,
  loadWorkspaceAnnotation,
  loadWorkspaceCompareSource,
  loadWorkspaceReferences,
  saveLocalImageHistoryItem,
  saveWorkspaceMainImage,
  saveWorkspaceAnnotation,
  saveWorkspaceCompareSource,
  saveWorkspaceReferences,
} from './localImageHistory';

type Resolution = { value: string; creditCost: number; enabled: boolean; status: string };
type Model = { id: string; label: string; resolutions: Resolution[] };
type Reference = { id: string; name: string; dataUrl: string };
type Task = {
  requestId: string;
  prompt: string;
  status: string;
  image?: string;
  progress?: number;
  error?: string;
  createdAt?: string;
};

const TASK_KEY = 'xdd-react-ai-generation-task';
const RESULT_KEY = 'xdd-react-ai-current-result';
const EMPTY_RESULT = '__empty__';
const DRAFT_RESULT = '__draft__';
const MAX_REFERENCES = 5;

function supportsReferenceImages(modelId: string) {
  return modelId === 'image2'
    || modelId === 'nano_banana_2'
    || modelId === 'nano_banana_pro'
    || modelId === 'gpt-image-2';
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `xdd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) {
    throw new Error(data.message || data.error || `请求失败 (${response.status})`);
  }
  return data;
}

function compressImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('图片解析失败'));
      image.onload = () => {
        const maxSide = 1800;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) return reject(new Error('浏览器无法处理图片'));
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function elapsedLabel(startedAt: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}分${seconds % 60}秒` : `${seconds}秒`;
}

async function cropUniformBorderBlob(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const source = document.createElement('canvas');
  source.width = bitmap.width;
  source.height = bitmap.height;
  const context = source.getContext('2d', { willReadFrequently: true });
  if (!context) return blob;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = context.getImageData(0, 0, source.width, source.height);
  const { data, width, height } = pixels;
  const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]].map(([x, y]) => {
    const index = (y * width + x) * 4;
    return [data[index], data[index + 1], data[index + 2]];
  });
  const stride = Math.max(1, Math.floor(Math.max(width, height) / 1600));
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += stride) for (let x = 0; x < width; x += stride) {
    const index = (y * width + x) * 4;
    const background = corners.some((color) =>
      Math.abs(data[index] - color[0]) + Math.abs(data[index + 1] - color[1]) + Math.abs(data[index + 2] - color[2]) < 24
    );
    if (data[index + 3] > 8 && !background) {
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return blob;
  const cropWidth = Math.min(width - left, right - left + stride);
  const cropHeight = Math.min(height - top, bottom - top + stride);
  if (1 - (cropWidth * cropHeight) / (width * height) < .08) return blob;
  const output = document.createElement('canvas');
  output.width = cropWidth;
  output.height = cropHeight;
  output.getContext('2d')?.drawImage(source, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return new Promise<Blob>((resolve) => output.toBlob((value) => resolve(value || blob), 'image/png'));
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('图片保存到浏览器失败'));
    reader.readAsDataURL(blob);
  });
}

export default function AiStudioApp({ allowGuestPreview = false }: { allowGuestPreview?: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<CanvasWorkbenchHandle>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [modelId, setModelId] = useState('image2');
  const [resolution, setResolution] = useState('1K');
  const [ratio, setRatio] = useState('16:9');
  const [prompt, setPrompt] = useState('');
  const [references, setReferences] = useState<Reference[]>([]);
  const [result, setResult] = useState('');
  const [compareSource, setCompareSource] = useState('');
  const [annotation, setAnnotation] = useState<CanvasAnnotationState | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareAt, setCompareAt] = useState(50);
  const [history, setHistory] = useState<Task[]>([]);
  const [credits, setCredits] = useState<number | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState('0秒');
  const [message, setMessage] = useState('');
  // 0=idle 1=提交任务 2=排队 3=生成中 — drives the staged progress indicator so the
  // user sees where the job is instead of just an elapsed-seconds counter.
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState('');
  const [editorHasImage, setEditorHasImage] = useState(false);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargeQr, setRechargeQr] = useState('');
  const [rechargeOrder, setRechargeOrder] = useState('');
  const [rechargeMsg, setRechargeMsg] = useState('打开微信扫一扫，二维码 15 分钟内有效，支付后积分自动到账。');
  const [rechargeBusy, setRechargeBusy] = useState(false);
  const rechargeTimer = useRef(0);

  const selectedModel = models.find((item) => item.id === modelId);
  const selectedResolution = selectedModel?.resolutions.find((item) => item.value === resolution);
  const busy = task?.status === 'processing';

  const enabledModels = useMemo(
    () => models.filter((item) => item.resolutions.some((entry) => entry.enabled)),
    [models],
  );

  useEffect(() => {
    void (async () => {
      const [,, tasks, draftImage, draftReferences, draftAnnotation, draftCompareSource] = await Promise.all([
        loadModels(),
        loadCredits(),
        loadHistory(),
        loadWorkspaceMainImage().catch(() => ''),
        loadWorkspaceReferences<Reference>().catch(() => []),
        loadWorkspaceAnnotation<CanvasAnnotationState>().catch(() => null),
        loadWorkspaceCompareSource().catch(() => ''),
      ]);
      const savedResult = localStorage.getItem(RESULT_KEY) || '';
      if (savedResult === EMPTY_RESULT) setResult('');
      else if (savedResult === DRAFT_RESULT && draftImage) setResult(draftImage);
      else if (draftImage) setResult(draftImage);
      if (draftReferences.length) setReferences(draftReferences.slice(0, MAX_REFERENCES));
      if (draftAnnotation) setAnnotation(draftAnnotation);
      if (draftCompareSource) setCompareSource(draftCompareSource);
      const restored = restoreTask();
      if (!restored) {
        const active = tasks.find((item) => item.status === 'processing');
        if (active) {
          setStartedAt(Date.parse(active.createdAt || '') || Date.now());
          persistTask(active);
          void pollTask(active);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedModel) return;
    const current = selectedModel.resolutions.find((item) => item.value === resolution && item.enabled);
    if (!current) setResolution(selectedModel.resolutions.find((item) => item.enabled)?.value || '1K');
  }, [modelId, models, resolution, selectedModel]);

  useEffect(() => {
    if (!busy || !startedAt) return;
    const timer = window.setInterval(() => setElapsed(elapsedLabel(startedAt)), 1000);
    return () => window.clearInterval(timer);
  }, [busy, startedAt]);

  async function loadModels() {
    const data = await readJson(await fetch('/api/ai-image/models', { credentials: 'include' }));
    const next = Array.isArray(data.models) ? data.models : [];
    setModels(next);
    const first = next.find((item: Model) => item.resolutions.some((entry) => entry.enabled));
    if (first) setModelId((current) => next.some((item: Model) => item.id === current) ? current : first.id);
  }

  async function loadCredits() {
    const response = await fetch('/api/member/credits', { credentials: 'include' });
    if (response.status === 401) {
      if (allowGuestPreview) {
        setCredits(0);
        return;
      }
      window.location.replace(`/member/login?next=${encodeURIComponent('/ai-studio/')}`);
      return;
    }
    const data = await readJson(response);
    setCredits(Number(data.balance ?? data.credits ?? 0));
  }

  function rechargeAmountFen(value: string) {
    const normalized = String(value || '').trim();
    if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(normalized)) return 0;
    const [yuan, cents = ''] = normalized.split('.');
    return Number(yuan) * 100 + Number(`${cents}00`.slice(0, 2));
  }

  function openRecharge() {
    window.clearInterval(rechargeTimer.current);
    setRechargeAmount('');
    setRechargeQr('');
    setRechargeOrder('');
    setRechargeMsg('打开微信扫一扫，二维码 15 分钟内有效，支付后积分自动到账。');
    setRechargeBusy(false);
    setRechargeOpen(true);
  }

  function closeRecharge() {
    window.clearInterval(rechargeTimer.current);
    setRechargeOpen(false);
  }

  async function submitRecharge() {
    const amountFen = rechargeAmountFen(rechargeAmount);
    if (amountFen < 100 || amountFen > 500000) {
      setRechargeMsg('请输入 1.00 至 5000.00 元之间的有效金额。');
      return;
    }
    setRechargeBusy(true);
    setRechargeMsg('正在创建安全支付订单…');
    setRechargeQr('');
    try {
      const response = await fetch('/api/member/credit-orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountFen }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.message || '创建支付订单失败');
      setRechargeOrder(data.orderSn);
      setRechargeQr(data.qrDataUrl);
      setRechargeMsg('打开微信扫一扫完成支付，到账后自动关闭。');
      window.clearInterval(rechargeTimer.current);
      rechargeTimer.current = window.setInterval(() => void pollRecharge(data.orderSn), 2000);
    } catch (reason) {
      setRechargeMsg(reason instanceof Error ? reason.message : '创建支付订单失败');
    } finally {
      setRechargeBusy(false);
    }
  }

  async function pollRecharge(orderSn: string) {
    try {
      const response = await fetch(`/api/member/credit-orders?orderSn=${encodeURIComponent(orderSn)}`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) return;
      const status = data.order?.status;
      if (status === 'paid') {
        window.clearInterval(rechargeTimer.current);
        setRechargeQr('');
        setRechargeMsg(`支付成功，已到账 ${data.order.credits} 积分。`);
        void loadCredits();
        window.setTimeout(() => setRechargeOpen(false), 1600);
      } else if (status === 'closed' || status === 'failed') {
        window.clearInterval(rechargeTimer.current);
        setRechargeMsg(status === 'closed' ? '二维码已过期，请重新发起充值。' : '订单创建失败，请重试。');
      }
    } catch {
      /* transient poll error, keep trying */
    }
  }

  async function loadHistory() {
    const localItems = await loadLocalImageHistory().catch(() => []);
    const localTasks = localItems.map((item) => ({
      requestId: item.id,
      prompt: item.prompt,
      status: 'completed',
      image: item.image,
      createdAt: item.createdAt,
    }));
    setHistory(localTasks);
    const response = await fetch('/api/ai-image/generate', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) return [] as Task[];
    const data = await response.json().catch(() => ({}));
    const serverTasks = Array.isArray(data.tasks) ? data.tasks as Task[] : [];
    const localById = new Map(localTasks.map((item) => [item.requestId, item]));

    // Server images remain available for seven days. Cache every newly completed
    // image into IndexedDB so it survives server cleanup and appears in the left
    // history even when the browser was offline or the Node process restarted.
    for (const item of serverTasks.slice(0, 40)) {
      if (item.status !== 'completed' || !item.image || localById.has(item.requestId)) continue;
      try {
        const imageResponse = await fetch(item.image, { credentials: 'include', cache: 'no-store' });
        if (!imageResponse.ok) continue;
        const localImage = await blobToDataUrl(await cropUniformBorderBlob(await imageResponse.blob()));
        const createdAt = item.createdAt || new Date().toISOString();
        await saveLocalImageHistoryItem({ id: item.requestId, prompt: item.prompt, image: localImage, createdAt });
        localById.set(item.requestId, { ...item, image: localImage, status: 'completed', createdAt });
      } catch {
        // Keep the server task visible to the polling flow and retry next visit.
      }
    }
    const merged = [...localById.values()]
      .sort((left, right) => Date.parse(right.createdAt || '') - Date.parse(left.createdAt || ''))
      .slice(0, 40);
    setHistory(merged);
    return serverTasks;
  }

  async function deleteHistoryItem(item: Task) {
    if (!window.confirm('删除这条生成记录？该操作只会从你的历史列表中隐藏，不影响积分明细。')) return;
    setError('');
    try {
      await deleteLocalImageHistoryItem(item.requestId);
      await fetch('/api/ai-image/generate', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: item.requestId, purge: true }),
      }).catch(() => undefined);
      setHistory((current) => current.filter((entry) => entry.requestId !== item.requestId));
      if (result === item.image) clearCanvas();
      setMessage('生成记录已删除。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除生成记录失败');
    }
  }

  function persistTask(next: Task | null) {
    setTask(next);
    try {
      if (next) localStorage.setItem(TASK_KEY, JSON.stringify(next));
      else localStorage.removeItem(TASK_KEY);
    } catch {}
  }

  function restoreTask() {
    try {
      const saved = JSON.parse(localStorage.getItem(TASK_KEY) || 'null') as Task | null;
      if (saved?.requestId && saved.status === 'processing') {
        setStartedAt(Date.parse(saved.createdAt || '') || Date.now());
        persistTask(saved);
        void pollTask(saved);
        return true;
      }
    } catch {}
    return false;
  }

  async function addReferenceFiles(files: FileList | File[]) {
    setError('');
    const available = Math.max(0, MAX_REFERENCES - references.length);
    const accepted = [...files].filter((file) => /^image\/(jpeg|png|webp)$/i.test(file.type)).slice(0, available);
    if (!accepted.length) return setError('请选择 JPG、PNG 或 WebP 图片，最多 5 张。');
    const next = await Promise.all(accepted.map(async (file) => ({ id: uid(), name: file.name, dataUrl: await compressImage(file) })));
    setReferences((current) => {
      const combined = [...current, ...next].slice(0, MAX_REFERENCES);
      void saveWorkspaceReferences(combined).catch(() => {});
      return combined;
    });
    if (!supportsReferenceImages(modelId)) {
      const referenceModel = enabledModels.find((item) => supportsReferenceImages(item.id));
      if (referenceModel) {
        setModelId(referenceModel.id);
        setResolution(referenceModel.resolutions.find((item) => item.enabled)?.value || '1K');
        setMessage(`已添加参考图，并自动切换到 ${referenceModel.label} 图生图模型。`);
      }
    }
  }

  function handleEditorImageChange(hasImage: boolean) {
    setEditorHasImage(hasImage);
    if (!hasImage || supportsReferenceImages(modelId)) return;
    const referenceModel = enabledModels.find((item) => supportsReferenceImages(item.id));
    if (!referenceModel) return;
    setModelId(referenceModel.id);
    setResolution(referenceModel.resolutions.find((item) => item.enabled)?.value || '1K');
    setMessage(`已载入主图，并自动切换到 ${referenceModel.label} 图生图模型。`);
  }

  async function generate() {
    if (busy || !prompt.trim()) return;
    setError('');
    setPhase(1);
    setMessage('正在提交任务到服务器…');
    const editorComposite = await editorRef.current?.exportComposite();
    const editorReferences = editorRef.current?.exportReferences() || [];
    const referencePayload = [editorComposite, ...editorReferences, ...references.map((item) => item.dataUrl)]
      .filter((item): item is string => Boolean(item))
      .filter((item, index, all) => all.indexOf(item) === index)
      .slice(0, MAX_REFERENCES);
    let requestModelId = modelId;
    let requestResolution = resolution;
    if (referencePayload.length && !supportsReferenceImages(requestModelId)) {
      const referenceModel = enabledModels.find((item) => supportsReferenceImages(item.id));
      if (!referenceModel) {
        setError('当前没有可用的图生图模型，请稍后重试。');
        setMessage('');
        return;
      }
      requestModelId = referenceModel.id;
      requestResolution = referenceModel.resolutions.find((item) => item.enabled)?.value || '1K';
      setModelId(requestModelId);
      setResolution(requestResolution);
      setMessage(`检测到参考图，已自动使用 ${referenceModel.label} 生成。`);
    }
    const next: Task = { requestId: uid(), prompt: prompt.trim(), status: 'processing', createdAt: new Date().toISOString() };
    const start = Date.now();
    setStartedAt(start);
    persistTask(next);
    const nextCompareSource = editorComposite || references[0]?.dataUrl || '';
    setCompareSource(nextCompareSource);
    void saveWorkspaceCompareSource(nextCompareSource).catch(() => {});
    try {
      const data = await readJson(await fetch('/api/ai-image/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          asyncMode: 'start',
          requestId: next.requestId,
          prompt: next.prompt,
          model: requestModelId,
          resolution: requestResolution,
          ratio,
          referenceImages: referencePayload,
        }),
      }));
      if (typeof data.balance !== 'undefined') setCredits(Number(data.balance));
      if (data.image) await finishTask({ ...next, ...data, status: 'completed' });
      else { setPhase(2); setMessage('已提交，排队等待上游空闲…'); await pollTask(next); }
    } catch (reason) {
      persistTask(null);
      setPhase(0);
      setError(reason instanceof Error ? reason.message : '生成请求失败');
      setMessage('');
    }
  }

  async function pollTask(current: Task) {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt ? 2000 : 600));
      try {
        const response = await fetch('/api/ai-image/generate', {
          method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ asyncMode: 'poll', requestId: current.requestId }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 404) throw new Error('任务不存在或已失效，请重新生成。');
        if (data.status === 'completed' && data.image) return await finishTask({ ...current, ...data });
        if (data.status === 'failed' || data.status === 'cancelled') {
          persistTask(null);
          setPhase(0);
          setError(data.message || data.error || '任务未完成，积分已退回。');
          setMessage('');
          void loadCredits();
          return;
        }
        if (!response.ok && response.status !== 202) throw new Error(data.message || data.error || '任务查询失败');
        const next = { ...current, ...data, status: 'processing' };
        persistTask(next);
        const p = Math.round(Number(data.progress || 0));
        const waitedMs = Date.now() - (startedAt || Date.now());
        // Without upstream progress we can't tell queue from running, so treat the
        // first few seconds as 排队 and anything past that (or any progress) as 生成中 —
        // matches what the user actually perceives.
        const generating = p > 0 || waitedMs > 8000;
        setPhase(generating ? 3 : 2);
        const head = generating ? (p > 0 ? `生成中 · ${p}%` : '生成中') : '排队中，等待上游空闲';
        setMessage(`${head} · 已等待 ${elapsedLabel(startedAt || Date.now())}`);
      } catch (reason) {
        const detail = reason instanceof Error ? reason.message : '无法读取任务状态';
        if (/不存在|已失效|未完成|已退回|已取消/i.test(detail)) {
          persistTask(null);
          setError(detail);
          setMessage('');
          return;
        }
        setError('网络暂时中断，任务仍保存在服务器，正在自动重连。');
        setMessage(`正在恢复任务状态 · 已等待 ${elapsedLabel(startedAt || Date.now())}`);
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    }
    persistTask(null);
    setPhase(0);
    setError('生成等待超时，任务记录仍保存在服务器，请稍后刷新历史记录。');
  }

  async function finishTask(done: Task) {
    if (!done.image) return;
    const response = await fetch(done.image, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error('返图读取失败，请在任务记录中重试。');
    const localImage = await blobToDataUrl(await cropUniformBorderBlob(await response.blob()));
    const createdAt = done.createdAt || new Date().toISOString();
    await Promise.all([
      saveLocalImageHistoryItem({ id: done.requestId, prompt: done.prompt, image: localImage, createdAt }),
      saveWorkspaceMainImage(localImage),
    ]);
    setResult(localImage);
    setAnnotation(null);
    void saveWorkspaceAnnotation(null).catch(() => {});
    localStorage.setItem(RESULT_KEY, DRAFT_RESULT);
    setHistory((current) => [
      { ...done, image: localImage, status: 'completed', createdAt },
      ...current.filter((item) => item.requestId !== done.requestId),
    ].slice(0, 40));
    persistTask(null);
    setPhase(0);
    setMessage('生成完成，图片已保存到当前浏览器。');
    void loadCredits();
  }

  async function cancelTask() {
    if (!task) return;
    await fetch('/api/ai-image/generate', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ asyncMode: 'cancel', requestId: task.requestId }),
    }).catch(() => undefined);
    persistTask(null);
    setPhase(0);
    setMessage('已停止生成，未消耗的积分会自动退回。');
  }

  async function downloadResult() {
    const composite = await editorRef.current?.exportComposite();
    if (composite) {
      const link = document.createElement('a');
      link.href = composite;
      link.download = `xdesign-ai-${Date.now()}.jpg`;
      link.click();
      return;
    }
    if (!result) return;
    try {
      const response = await fetch(result, { credentials: 'include' });
      const blob = await cropUniformBorderBlob(await response.blob());
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `xdesign-ai-${Date.now()}.${blob.type.includes('jpeg') ? 'jpg' : 'png'}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      window.open(result, '_blank', 'noopener,noreferrer');
    }
  }

  function clearCanvas() {
    editorRef.current?.clearCanvas();
    setResult('');
    localStorage.setItem(RESULT_KEY, EMPTY_RESULT);
    setCompareSource('');
    setAnnotation(null);
    setReferences([]);
    void saveWorkspaceReferences([]).catch(() => {});
    void saveWorkspaceAnnotation(null).catch(() => {});
    void saveWorkspaceCompareSource('').catch(() => {});
    setMessage('画布已清空。');
  }

  return (
    <main className="react-studio">
      <header className="studio-header">
        <a className="studio-brand" href="/"><span>XD</span><strong>XDesign AI Studio</strong></a>
        <div className="studio-header-actions">
          <a href="/"><ArrowLeft size={15} /> 素材站</a>
          <a className="credit-chip" href="/member/credits">积分 <b>{credits ?? '--'}</b></a>
          <button className="credit-topup" type="button" onClick={openRecharge}>充值</button>
          <button type="button" onClick={() => void loadHistory()} title="刷新历史"><RefreshCw size={15} /></button>
        </div>
      </header>

      <aside className="studio-history">
        <div className="panel-title"><span>生成记录</span><small>本机保存</small></div>
        <div className="history-list">
          {history.length ? history.map((item) => (
            <div className="history-item" key={item.requestId}>
              <button className="history-open" type="button" onClick={() => { setResult(item.image || ''); setPrompt(item.prompt || ''); setAnnotation(null); void saveWorkspaceAnnotation(null).catch(() => {}); if (item.image) { localStorage.setItem(RESULT_KEY, DRAFT_RESULT); void saveWorkspaceMainImage(item.image); } }}>
                <img src={item.image} alt="历史生成结果" />
                <span>{item.prompt || '未命名创作'}</span>
              </button>
              <button className="history-delete" type="button" title="删除记录" aria-label={`删除 ${item.prompt || '未命名创作'}`} onClick={() => void deleteHistoryItem(item)}><Trash2 size={13} /></button>
            </div>
          )) : <p className="empty-copy">暂无生成记录</p>}
        </div>
      </aside>

      <section className="studio-canvas">
        <CanvasWorkbench
          ref={editorRef}
          initialImage={result}
          initialAnnotation={annotation}
          onCanvasImageChange={handleEditorImageChange}
          onMainImageSourceChange={(source) => {
            if (source) {
              setResult(source);
              localStorage.setItem(RESULT_KEY, DRAFT_RESULT);
              void saveWorkspaceMainImage(source).catch(() => {});
            } else {
              setResult('');
              localStorage.setItem(RESULT_KEY, EMPTY_RESULT);
              void clearWorkspaceMainImage().catch(() => {});
            }
          }}
          onAnnotationChange={(next) => {
            setAnnotation(next);
            void saveWorkspaceAnnotation(next).catch(() => {});
          }}
        />
        {editorHasImage && <div className="canvas-toolbar studio-editor-actions">
          {compareSource && result && <button type="button" onClick={() => setCompareOpen(true)}>前后对比</button>}
          <button type="button" onClick={() => void downloadResult()}><Download size={16} /> 下载画布</button>
        </div>}
      </section>

      <aside className="studio-composer">
        <div className="composer-head"><div><span>新对话</span><small>服务器任务可恢复</small></div>{busy && <LoaderCircle className="spin" size={17} />}</div>
        <div className="suggestions">
          {['电商主图', '室内空间效果', '材质替换', 'Logo 概念'].map((item) => (
            <button key={item} type="button" onClick={() => setPrompt(`请生成${item}，画面真实、构图完整、细节清晰。`)}>{item}</button>
          ))}
        </div>
        <div className="composer-spacer" />
        {busy && (
          <ol className="phase-steps" aria-label="生成进度">
            {[{ n: 1, label: '提交任务' }, { n: 2, label: '排队' }, { n: 3, label: '生成中' }].map((step) => (
              <li key={step.n} className={phase > step.n ? 'done' : phase === step.n ? 'active' : ''}>
                <i>{phase > step.n ? '✓' : step.n}</i>
                <span>{step.label}</span>
              </li>
            ))}
          </ol>
        )}
        {message && <p className="composer-message">{message}</p>}
        {error && <p className="composer-error">{error}</p>}
        <div className="composer-card">
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述你的想法，或上传参考图…" />
          {references.length > 0 && (
            <div className="reference-strip">
              <div className="reference-strip-head"><span>参考图 {references.length}/{MAX_REFERENCES}</span><button type="button" onClick={() => { setReferences([]); void saveWorkspaceReferences([]).catch(() => {}); }}>清空</button></div>
              <div className="reference-grid">
                {references.map((item) => <div key={item.id}><img src={item.dataUrl} alt={item.name} /><button type="button" onClick={() => setReferences((current) => { const next = current.filter((entry) => entry.id !== item.id); void saveWorkspaceReferences(next).catch(() => {}); return next; })}><X size={12} /></button></div>)}
              </div>
            </div>
          )}
          <div className="ratio-tabs">
            {['16:9', '1:1', '9:16', '4:3', '3:4'].map((item) => <button key={item} type="button" className={ratio === item ? 'active' : ''} onClick={() => setRatio(item)}>{item}</button>)}
          </div>
          <div className="composer-selects">
            <label><span>模型</span><select value={modelId} onChange={(event) => setModelId(event.target.value)}>{models.map((item) => {
              const usable = item.resolutions.some((entry) => entry.enabled);
              return <option key={item.id} value={item.id} disabled={!usable}>{item.label}{usable ? '' : ' · 暂时不可用'}</option>;
            })}</select></label>
            <label><span>清晰度</span><select value={resolution} onChange={(event) => setResolution(event.target.value)}>{selectedModel?.resolutions.map((item) => <option key={item.value} value={item.value} disabled={!item.enabled}>{item.value} · {item.creditCost}积分{!item.enabled ? ' · 暂不可用' : ''}</option>)}</select></label>
          </div>
          {selectedResolution && !selectedResolution.enabled && <p className="reference-model-note">当前清晰度暂时不可用，请更换清晰度或稍后再试。</p>}
          {(editorHasImage || references.length > 0) && <p className="reference-model-note">参考图模式：主图与参考图会随当前支持图生图的模型一起提交。</p>}
          <div className="composer-actions">
            <button className="reference-button" type="button" onClick={() => fileInput.current?.click()}><ImagePlus size={16} /> 参考图</button>
            {busy ? <button className="stop-button" type="button" onClick={() => void cancelTask()}><Pause size={16} /> 停止 · {elapsed}</button> : <button className="generate-button" type="button" disabled={!prompt.trim() || !selectedResolution?.enabled} onClick={() => void generate()}><Play size={16} /> 生成</button>}
          </div>
        </div>
      </aside>

      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => { if (event.target.files) void addReferenceFiles(event.target.files); event.target.value = ''; }} />

      {rechargeOpen && (
        <div className="recharge-overlay" onClick={closeRecharge}>
          <div className="recharge-box" onClick={(event) => event.stopPropagation()}>
            <header><strong>微信扫码充值</strong><button type="button" onClick={closeRecharge}><X size={18} /></button></header>
            {!rechargeQr && (
              <div className="recharge-form">
                <label>充值金额（元）</label>
                <div className="recharge-amount"><span>¥</span><input type="text" inputMode="decimal" autoComplete="off" placeholder="1.00 - 5000.00" value={rechargeAmount} onChange={(event) => setRechargeAmount(event.target.value)} /></div>
                <div className="recharge-quick">{['10', '30', '50', '100', '200'].map((v) => (
                  <button type="button" key={v} className={rechargeAmount === Number(v).toFixed(2) ? 'active' : ''} onClick={() => setRechargeAmount(Number(v).toFixed(2))}>¥{v}</button>
                ))}</div>
                <div className="recharge-preview">{rechargeAmountFen(rechargeAmount) >= 100 && rechargeAmountFen(rechargeAmount) <= 500000 ? <>本次到账 <b>{rechargeAmountFen(rechargeAmount)}</b> 积分</> : '1 元 = 100 积分'}</div>
                <button className="recharge-submit" type="button" disabled={rechargeBusy} onClick={() => void submitRecharge()}>{rechargeBusy ? '创建订单中…' : '生成支付二维码'}</button>
              </div>
            )}
            {rechargeQr && <img className="recharge-qr" src={rechargeQr} alt="微信支付二维码" />}
            <p className="recharge-msg">{rechargeMsg}</p>
            {rechargeOrder && <code className="recharge-order">订单号 {rechargeOrder}</code>}
          </div>
        </div>
      )}

      {compareOpen && compareSource && result && (
        <div className="compare-overlay" onClick={() => setCompareOpen(false)}>
          <div className="compare-dialog" onClick={(event) => event.stopPropagation()}>
            <header><strong>前后对比</strong><button type="button" onClick={() => setCompareOpen(false)}><X size={18} /></button></header>
            <div className="compare-stage-react">
              <img src={compareSource} alt="参考图" />
              <div style={{ clipPath: `inset(0 0 0 ${compareAt}%)` }}><img src={result} alt="生成图" /></div>
              <i style={{ left: `${compareAt}%` }} />
              <input type="range" min="0" max="100" value={compareAt} onChange={(event) => setCompareAt(Number(event.target.value))} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
