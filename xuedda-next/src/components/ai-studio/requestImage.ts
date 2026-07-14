type ImageGenerationResult = {
  image?: string;
  error?: string;
  code?: string;
  taskId?: string;
  status?: string;
  [key: string]: unknown;
};

function throwImageRequestError(result: ImageGenerationResult, fallback: string): never {
  const error = new Error(result.error || fallback);
  if (result.code) {
    (error as Error & { code?: string }).code = result.code;
  }
  throw error;
}

async function readSafeJson(response: Response): Promise<ImageGenerationResult> {
  const text = await response.text();
  try {
    return JSON.parse(text) as ImageGenerationResult;
  } catch {
    return { error: response.ok ? "生图服务没有返回有效数据。" : "生图服务暂时不可用，请稍后再试。" };
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Request canceled", "AbortError"));
      return;
    }

    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Request canceled", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function requestImageGeneration(
  endpoint: string,
  payload: Record<string, unknown>,
  options: {
    asyncTask?: boolean;
    signal?: AbortSignal;
    taskId?: string;
    startTaskId?: string;
    onTaskId?: (taskId: string) => void;
  } = {},
) {
  const asyncTask = options.asyncTask === true;
  let startResult: ImageGenerationResult;

  if (asyncTask && options.taskId) {
    startResult = { taskId: options.taskId, status: "processing" };
  } else {
    const startResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(asyncTask ? { ...payload, asyncMode: "start", taskId: options.startTaskId } : payload),
      signal: options.signal,
    });
    startResult = await readSafeJson(startResponse);

    if (!startResponse.ok && startResponse.status !== 202) {
      throwImageRequestError(startResult, `Request failed with status ${startResponse.status}`);
    }
  }

  if (startResult.image) return startResult;
  if (!asyncTask || !startResult.taskId) {
    throw new Error(startResult.error || "生图服务没有返回图片。");
  }

  options.onTaskId?.(startResult.taskId);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    await sleep(attempt === 0 ? 2500 : 3000, options.signal);
    const pollResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        asyncMode: "poll",
        taskId: startResult.taskId,
      }),
      signal: options.signal,
    });
    const pollResult = await readSafeJson(pollResponse);

    if (pollResponse.ok && pollResult.image) return pollResult;
    if (pollResponse.status !== 202) {
      throwImageRequestError(pollResult, `Task failed with status ${pollResponse.status}`);
    }
  }

  throw new Error("图片还在生成中，请稍后再试。");
}
