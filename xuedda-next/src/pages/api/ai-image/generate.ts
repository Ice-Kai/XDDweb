import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fail, json, ok, readJson } from '../../../lib/api';
import { cookieValue } from '../../../lib/auth';
import { db } from '../../../lib/db';
import { AI_GENERATION_COST, refundGenerationCredits, reserveGenerationCredits } from '../../../lib/credits';
import { MEMBER_COOKIE, verifyMemberToken } from '../../../lib/member';
import { checkAiPromptSafety } from '../../../lib/ai-content-safety';
import { activeAiChannels } from '../../../lib/ai-channels';
import {
  getAiModelSelection,
  recordAiModelFailure,
  recordAiModelSuccess,
  type AiModelSelection,
} from '../../../lib/ai-model-health';

const env = {
  ...(import.meta.env as Record<string, string | undefined>),
  ...(typeof process !== 'undefined' ? process.env : {}),
};

const RATIOS = new Set(['1:1', '16:9', '9:16', '3:4', '4:3']);
const RESOLUTIONS = new Set(['1K', '2K', '4K']);
// 4K generations on the upstream regularly need > 4 minutes, and pulling a 4K
// image back from the provider CDN over the mainland link does not fit in 20s.
// These ceilings were the direct cause of the "生成等待超时" and "返图下载失败
// This operation was aborted" failures. Keep PROVIDER_TOTAL < PROCESSING so the
// poll-side orphan sweep never fires on a task that is still legitimately running.
const PROCESSING_TIMEOUT_MS = 12 * 60 * 1000;
const PROVIDER_TOTAL_TIMEOUT_MS = 9 * 60 * 1000;
const PROVIDER_ATTEMPT_TIMEOUT_MS = 3 * 60 * 1000;
const PROVIDER_POLL_TIMEOUT_MS = 15 * 1000;
const PROVIDER_IMAGE_READY_TIMEOUT_MS = 30 * 1000;
const GENERATED_IMAGE_FETCH_TIMEOUT_MS = 90 * 1000;
const GENERATED_IMAGE_FETCH_ATTEMPTS = 4;
// A transient error (429/5xx or a network blip) while polling an already-submitted
// async task must NOT bubble out to the submit loop — that abandons the running
// (already-billed) upstream job and resubmits a brand new one on the next key,
// burning one more generation per blip. Retry the same task in place this many
// consecutive times before giving up.
const PROVIDER_POLL_MAX_CONSECUTIVE_FAILURES = 5;
const SERVER_IMAGE_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SERVER_TASK_RECOVERY_LIMIT = 50;
// A task is a live promise only inside the process that accepted it. After a PM2
// restart that process is gone, so any row still 'processing' that this process
// is not tracking (and that is past this grace) was orphaned by the restart —
// fail it fast and refund instead of making the user wait out PROCESSING_TIMEOUT.
// NOTE: this relies on running a single process (see ecosystem.config.cjs).
const ORPHAN_GRACE_MS = 90 * 1000;
// The upstream is not consistent about async status names: gpt-image tasks start
// as 'queued'/'in_progress' but banana tasks start as 'running'. Missing 'running'
// here made the poll loop exit immediately and report "没拿到有效返图" on a task
// that was actually still generating. Treat all of these as still-in-progress.
const PROVIDER_IN_PROGRESS_STATUSES = new Set([
  'queued', 'processing', 'in_progress', 'running', 'pending', 'starting', 'waiting', 'submitted',
]);
// Terminal success can also arrive under a few different names.
const PROVIDER_DONE_STATUSES = new Set(['completed', 'succeeded', 'success', 'done']);
const aiWorkerGlobal = globalThis as typeof globalThis & {
  __xddAiActiveTasks?: Map<string, Promise<void>>;
};
// Astro may load the page route and the internal worker through different
// server chunks. Keep the in-flight registry process-global so both entrypoints
// always see the same task and never start two pollers for one upstream job.
const activeTasks = aiWorkerGlobal.__xddAiActiveTasks ||= new Map<string, Promise<void>>();
type ProviderKeyState = { inFlight: number; failures: number; cooldownUntil: number; lastUsedAt: number };
const providerKeyStates = new Map<string, ProviderKeyState>();

type UnknownRecord = Record<string, unknown>;
type TaskRow = {
  request_id: string;
  prompt: string;
  ratio: string;
  status: string;
  provider_task_id: string | null;
  provider_model: string | null;
  provider_progress: number;
  image_url: string | null;
  error_message: string;
  credit_cost: number;
  created_at: string;
  completed_at: string | null;
};

type AsyncProviderTask = {
  id: string;
  status: string;
  progress?: number;
  url?: string;
  error?: unknown;
};

async function fetchTextWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const body = await response.text();
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBytesWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { response, bytes };
  } finally {
    clearTimeout(timer);
  }
}

class ProviderRequestError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly status = 0, readonly code = 'PROVIDER_UPSTREAM') {
    super(message);
    this.name = 'ProviderRequestError';
  }
}

class ProviderTaskNotFoundError extends Error {
  constructor() {
    super('上游任务已失效，无法恢复，本次积分已退回。');
    this.name = 'ProviderTaskNotFoundError';
  }
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? value as UnknownRecord : null;
}

function findImage(value: unknown): string | null {
  if (typeof value === 'string') {
    const dataUrl = value.match(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/i);
    if (dataUrl?.[0]) return dataUrl[0].replace(/\s/g, '');
    const markdown = value.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i);
    if (markdown?.[1]) return markdown[1];
    const url = value.match(/https?:\/\/[^\s"'<>]+/i);
    return url?.[0]?.replace(/[),.;]+$/, '') || null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImage(item);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  for (const key of ['b64_json', 'image_base64', 'base64']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.length > 100) return `data:image/png;base64,${candidate}`;
  }
  for (const key of [
    'url', 'image_url', 'video_url', 'image', 'images', 'urls', 'files',
    'content', 'data', 'output', 'outputs', 'choices', 'message', 'result',
    'response', 'task_result',
  ]) {
    const found = findImage(record[key]);
    if (found) return found;
  }
  return null;
}

function collectKeys() {
  return [...new Set([env.IMAGE_PROXY_API_KEYS, env.IMAGE_PROXY_API_KEY]
    .filter(Boolean).join('\n').split(/[\n,;]+/)
    .map((key) => key.trim()).filter(Boolean))];
}

function providerKeyState(key: string) {
  let state = providerKeyStates.get(key);
  if (!state) {
    state = { inFlight: 0, failures: 0, cooldownUntil: 0, lastUsedAt: 0 };
    providerKeyStates.set(key, state);
  }
  return state;
}

function rankedProviderKeys(keys: string[]) {
  const now = Date.now();
  return [...keys].sort((left, right) => {
    const a = providerKeyState(left);
    const b = providerKeyState(right);
    const aCooling = a.cooldownUntil > now ? 1 : 0;
    const bCooling = b.cooldownUntil > now ? 1 : 0;
    return aCooling - bCooling
      || a.inFlight - b.inFlight
      || a.failures - b.failures
      || a.lastUsedAt - b.lastUsedAt;
  });
}

function acquireProviderKey(key: string) {
  const state = providerKeyState(key);
  state.inFlight += 1;
  state.lastUsedAt = Date.now();
}

function releaseProviderKey(key: string) {
  const state = providerKeyState(key);
  state.inFlight = Math.max(0, state.inFlight - 1);
}

function markProviderKeySuccess(key: string) {
  const state = providerKeyState(key);
  state.failures = 0;
  state.cooldownUntil = 0;
}

function markProviderKeyFailure(key: string, status = 0) {
  const state = providerKeyState(key);
  state.failures += 1;
  const delay = status === 401 || status === 403
    ? 10 * 60_000
    : status === 429
      ? 45_000
      : 12_000;
  state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + delay);
}

function collectBaseUrls() {
  return [env.IMAGE_PROXY_BASE_URLS, env.IMAGE_PROXY_BASE_URL]
    .filter(Boolean).join('\n').split(/[\n,;]+/)
    .map((url) => url.trim().replace(/\/+$/, '')).filter(Boolean);
}

function sizeForRatio(_ratio: string) {
  // The only validated ZEX image2 payload uses a square 1024 canvas. Ratio stays
  // in the prompt until the provider documents other accepted image dimensions.
  return '1024x1024';
}

function isAsyncImageModel(selection: AiModelSelection) {
  return selection.model === 'nano_banana_2'
    || selection.model === 'nano_banana_pro'
    || selection.model === 'gpt-image-2';
}

function aspectRatioForAsyncProvider(ratio: string) {
  return new Set(['1:1', '9:16', '16:9']).has(ratio) ? ratio : 'auto';
}

function providerErrorMessage(value: unknown) {
  const record = asRecord(value);
  const nested = asRecord(record?.error);
  return typeof nested?.message === 'string'
    ? nested.message
    : typeof record?.message === 'string'
      ? record.message
      : '生成失败，本次积分已退回。';
}

function safeProviderTaskError(value: unknown) {
  const raw = providerErrorMessage(value);
  if (/safety|moderation|policy|sensitive|nsfw|色情|政治|暴力|敏感|审核/i.test(raw)) {
    return new ProviderRequestError('内容未通过安全审核，请调整提示词或参考图后重试。', false, 400, 'PROVIDER_SAFETY');
  }
  return new ProviderRequestError('生成任务失败，本次积分已退回，请稍后重试。', false, 502, 'PROVIDER_TASK_FAILED');
}

function isPublicReferenceImage(value: string) {
  return /^https?:\/\//i.test(value) || /^data:image\/(jpeg|png|webp);base64,/i.test(value);
}

function friendlyProviderError(status: number) {
  if (status === 401 || status === 403) return 'AI 服务配置暂时异常，本次积分已退回，请稍后再试。';
  if (status === 413) return '提示词或图片过大，请缩短内容后重试。';
  if (status === 429) return '当前生成通道繁忙，已尝试切换其他通道，请稍后再试。';
  if (status >= 500) return 'AI 生图服务暂时繁忙，本次积分已退回，请稍后再试。';
  return 'AI 生图服务暂时不可用，本次积分已退回，请稍后再试。';
}

function providerErrorCode(status: number) {
  if (status === 401 || status === 403) return 'PROVIDER_AUTH';
  if (status === 413) return 'REFERENCE_TOO_LARGE';
  if (status === 429) return 'PROVIDER_BUSY';
  if (status >= 500) return 'PROVIDER_UPSTREAM';
  return 'PROVIDER_REQUEST_FAILED';
}

function shouldRetryWithAnotherKey(status: number) {
  return status === 401 || status === 403 || status === 408 || status === 409 || status === 429 || status >= 500;
}

async function callZexImage(
  prompt: string,
  ratio: string,
  selection: AiModelSelection,
  referenceImages: string[] = [],
  onProviderTask?: (task: AsyncProviderTask) => Promise<void>,
) {
  const channels = await activeAiChannels();
  const keys = channels.map((channel) => channel.apiKey);
  const baseByKey = new Map(channels.map((channel) => [channel.apiKey, channel.baseUrl]));
  if (!keys.length || !channels.some((channel) => channel.baseUrl)) throw new Error('AI 生图服务尚未配置。');
  if (isAsyncImageModel(selection)) {
    return callZexAsyncImage(prompt, ratio, selection, keys, baseByKey, referenceImages, onProviderTask);
  }
  // Each job starts at a different key. Transient/key-specific failures retry the
  // remaining keys once; keys never leave the server or reach browser code.
  const orderedKeys = rankedProviderKeys(keys);
  const deadline = Date.now() + PROVIDER_TOTAL_TIMEOUT_MS;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < orderedKeys.length; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('生成超时，请稍后再试。');
    const key = orderedKeys[attempt];
    const base = baseByKey.get(key) || '';
    if (!base) continue;
    acquireProviderKey(key);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(PROVIDER_ATTEMPT_TIMEOUT_MS, remaining));
    try {
      const response = await fetch(`${base}${referenceImages.length ? '/images/edits' : '/images/generations'}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: selection.providerModel,
          prompt: `${prompt}\n\n请按 ${ratio} 构图，主体完整，避免裁切。`,
          n: 1,
          size: sizeForRatio(ratio),
          ...(referenceImages.length
            ? { image: referenceImages.length === 1 ? referenceImages[0] : referenceImages }
            : {}),
        }),
        signal: controller.signal,
      });
      const raw = await response.text();
      let payload: unknown = raw;
      try { payload = JSON.parse(raw); } catch {}
      if (!response.ok) {
        lastError = new ProviderRequestError(
          friendlyProviderError(response.status),
          shouldRetryWithAnotherKey(response.status),
          response.status,
          providerErrorCode(response.status),
        );
        markProviderKeyFailure(key, response.status);
        if (lastError.retryable && attempt + 1 < orderedKeys.length) continue;
        throw lastError;
      }
      const image = findImage(payload);
      if (!image) throw new Error('生成失败，未能获取图片，本次积分已退回。');
      await recordAiModelSuccess(selection);
      markProviderKeySuccess(key);
      return image;
    } catch (error) {
      lastError = error instanceof Error
        ? (error.name === 'AbortError' ? new Error('生成超时，请稍后再试。') : error)
        : new Error('AI 生图服务暂时不可用，请稍后再试。');
      if (lastError instanceof ProviderRequestError && !lastError.retryable) {
        await recordAiModelFailure(selection, 'permanent', lastError.message);
        throw lastError;
      }
      if (!(lastError instanceof ProviderRequestError)) markProviderKeyFailure(key);
      if (attempt + 1 >= orderedKeys.length) {
        await recordAiModelFailure(selection, 'transient', lastError.message);
        throw lastError;
      }
    } finally {
      clearTimeout(timeout);
      releaseProviderKey(key);
    }
  }
  await recordAiModelFailure(
    selection,
    lastError instanceof ProviderRequestError && !lastError.retryable ? 'permanent' : 'transient',
    lastError?.message || '',
  );
  throw lastError || new Error('AI 生图服务暂时不可用，请稍后再试。');
}

async function callZexAsyncImage(
  prompt: string,
  ratio: string,
  selection: AiModelSelection,
  keys: string[],
  baseByKey: Map<string, string>,
  referenceImages: string[],
  onProviderTask?: (task: AsyncProviderTask) => Promise<void>,
) {
  if (!keys.length || !baseByKey.size) throw new Error('AI 生图服务尚未配置。');

  const orderedKeys = rankedProviderKeys(keys);
  const deadline = Date.now() + PROVIDER_TOTAL_TIMEOUT_MS;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < orderedKeys.length; attempt += 1) {
    const key = orderedKeys[attempt];
    const base = baseByKey.get(key) || '';
    if (!base) continue;
    acquireProviderKey(key);
    try {
      const submitted = await fetchTextWithTimeout(`${base}/videos`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: selection.providerModel,
          prompt,
          aspect_ratio: aspectRatioForAsyncProvider(ratio),
          ...(referenceImages.length ? { images: referenceImages } : {}),
        }),
      }, PROVIDER_ATTEMPT_TIMEOUT_MS);
      const response = submitted.response;
      const raw = submitted.body;
      let payload: unknown = raw;
      try { payload = JSON.parse(raw); } catch {}
      if (!response.ok) {
        const providerError = new ProviderRequestError(friendlyProviderError(response.status), shouldRetryWithAnotherKey(response.status), response.status, providerErrorCode(response.status));
        lastError = providerError;
        markProviderKeyFailure(key, response.status);
        if (providerError.retryable && attempt + 1 < orderedKeys.length) continue;
        throw providerError;
      }

      let task = (asRecord(payload) || {}) as AsyncProviderTask;
      if (!task.id || typeof task.id !== 'string') throw new Error('生成任务创建失败，请稍后重试。');
      await onProviderTask?.(task);

      let consecutivePollFailures = 0;
      while (PROVIDER_IN_PROGRESS_STATUSES.has(task.status)) {
        if (Date.now() >= deadline) throw new Error('生成等待超时，积分已退回，请稍后重试。');
        await new Promise((resolve) => setTimeout(resolve, 2500));
        let poll: Response;
        let pollRaw = '';
        try {
          const polled = await fetchTextWithTimeout(`${base}/videos/${encodeURIComponent(task.id)}`, {
            headers: { authorization: `Bearer ${key}` },
          }, PROVIDER_POLL_TIMEOUT_MS);
          poll = polled.response;
          pollRaw = polled.body;
        } catch (error) {
          // Network blip while polling a task that is already running upstream. Retry
          // the SAME task instead of bubbling out — bubbling would resubmit a new
          // (billed) generation on the next key and reset the user's progress.
          consecutivePollFailures += 1;
          if (consecutivePollFailures < PROVIDER_POLL_MAX_CONSECUTIVE_FAILURES && Date.now() < deadline) continue;
          throw error;
        }
        if (!poll.ok) {
          // A 429/5xx on the status endpoint is transient the same way a network blip
          // is: keep polling the same task rather than throwing out to the submit loop
          // (which resubmits and double-bills the upstream). Only give up once the
          // failures are sustained.
          if (shouldRetryWithAnotherKey(poll.status)) {
            consecutivePollFailures += 1;
            if (consecutivePollFailures < PROVIDER_POLL_MAX_CONSECUTIVE_FAILURES && Date.now() < deadline) continue;
          }
          markProviderKeyFailure(key, poll.status);
          throw new ProviderRequestError(friendlyProviderError(poll.status), shouldRetryWithAnotherKey(poll.status), poll.status, providerErrorCode(poll.status));
        }
        consecutivePollFailures = 0;
        let pollPayload: unknown = pollRaw;
        try { pollPayload = JSON.parse(pollRaw); } catch {}
        task = (asRecord(pollPayload) || {}) as AsyncProviderTask;
        await onProviderTask?.(task);
      }

      if (task.status === 'failed' || task.status === 'cancelled') {
        throw safeProviderTaskError(task);
      }
      let image = findImage(task);
      if (!image && PROVIDER_DONE_STATUSES.has(task.status)) {
        // Some async providers publish `completed` before the final image URL is
        // replicated. Keep querying the same task briefly instead of turning a
        // successful generation into a false failure.
        const imageReadyDeadline = Date.now() + PROVIDER_IMAGE_READY_TIMEOUT_MS;
        let imageReadyPollFailures = 0;
        while (!image && Date.now() < imageReadyDeadline) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          try {
            const polled = await fetchTextWithTimeout(`${base}/videos/${encodeURIComponent(task.id)}`, {
              headers: { authorization: `Bearer ${key}` },
            }, PROVIDER_POLL_TIMEOUT_MS);
            let pollPayload: unknown = polled.body;
            try { pollPayload = JSON.parse(polled.body); } catch {}
            if (!polled.response.ok) {
              throw new ProviderRequestError(
                friendlyProviderError(polled.response.status),
                shouldRetryWithAnotherKey(polled.response.status),
                polled.response.status,
                providerErrorCode(polled.response.status),
              );
            }
            imageReadyPollFailures = 0;
            task = (asRecord(pollPayload) || {}) as AsyncProviderTask;
            await onProviderTask?.(task);
            if (task.status === 'failed' || task.status === 'cancelled') {
              throw safeProviderTaskError(task);
            }
            image = findImage(task);
          } catch (error) {
            imageReadyPollFailures += 1;
            if (imageReadyPollFailures >= 3) throw error;
          }
        }
      }
      if (!image) throw new Error('生成失败，未能获取图片，本次积分已退回。');
      await recordAiModelSuccess(selection);
      markProviderKeySuccess(key);
      return image;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('AI 生图服务暂时不可用，请稍后再试。');
      if (!(lastError instanceof ProviderRequestError)) markProviderKeyFailure(key);
      if (lastError instanceof ProviderRequestError && lastError.retryable && attempt + 1 < orderedKeys.length) continue;
      if (lastError instanceof ProviderRequestError && ['PROVIDER_SAFETY', 'REFERENCE_TOO_LARGE'].includes(lastError.code)) {
        throw lastError;
      }
      await recordAiModelFailure(selection, lastError instanceof ProviderRequestError && !lastError.retryable ? 'permanent' : 'transient', lastError.message);
      throw lastError;
    } finally {
      releaseProviderKey(key);
    }
  }

  await recordAiModelFailure(selection, 'transient', lastError?.message || '');
  throw lastError || new Error('AI 生图服务暂时不可用，请稍后再试。');
}

function providerTaskFromPayload(payload: unknown) {
  const record = asRecord(payload);
  const nested = asRecord(record?.data) || asRecord(record?.result) || asRecord(record?.task);
  return (nested || record || {}) as AsyncProviderTask;
}

async function recoverZexAsyncImage(
  providerTaskId: string,
  onProviderTask?: (task: AsyncProviderTask) => Promise<void>,
) {
  const channels = await activeAiChannels();
  if (!channels.length) throw new Error('AI 生图服务尚未配置。');

  let selected: { baseUrl: string; apiKey: string } | null = null;
  let task: AsyncProviderTask | null = null;
  for (const channel of channels) {
    try {
      const polled = await fetchTextWithTimeout(
        `${channel.baseUrl}/videos/${encodeURIComponent(providerTaskId)}`,
        { headers: { authorization: `Bearer ${channel.apiKey}` } },
        PROVIDER_POLL_TIMEOUT_MS,
      );
      if (!polled.response.ok) continue;
      let payload: unknown = polled.body;
      try { payload = JSON.parse(polled.body); } catch {}
      const candidate = providerTaskFromPayload(payload);
      if (!candidate.id || !candidate.status) continue;
      selected = { baseUrl: channel.baseUrl, apiKey: channel.apiKey };
      task = candidate;
      break;
    } catch {
      // A task is bound to the credential that created it. Try every configured
      // channel without persisting an API key in the generation row.
    }
  }
  if (!selected || !task) throw new ProviderTaskNotFoundError();

  const deadline = Date.now() + PROVIDER_TOTAL_TIMEOUT_MS;
  let consecutiveFailures = 0;
  await onProviderTask?.(task);
  while (PROVIDER_IN_PROGRESS_STATUSES.has(task.status)) {
    if (Date.now() >= deadline) throw new Error('恢复上游任务超时，本次积分已退回。');
    await new Promise((resolve) => setTimeout(resolve, 2500));
    try {
      const polled = await fetchTextWithTimeout(
        `${selected.baseUrl}/videos/${encodeURIComponent(providerTaskId)}`,
        { headers: { authorization: `Bearer ${selected.apiKey}` } },
        PROVIDER_POLL_TIMEOUT_MS,
      );
      if (!polled.response.ok) throw new Error(`上游任务查询失败（HTTP ${polled.response.status}）。`);
      let payload: unknown = polled.body;
      try { payload = JSON.parse(polled.body); } catch {}
      task = providerTaskFromPayload(payload);
      consecutiveFailures = 0;
      await onProviderTask?.(task);
    } catch (error) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= PROVIDER_POLL_MAX_CONSECUTIVE_FAILURES) throw error;
    }
  }
  if (task.status === 'failed' || task.status === 'cancelled') throw safeProviderTaskError(task);

  let image = findImage(task);
  const imageReadyDeadline = Date.now() + PROVIDER_IMAGE_READY_TIMEOUT_MS;
  while (!image && PROVIDER_DONE_STATUSES.has(task.status) && Date.now() < imageReadyDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const polled = await fetchTextWithTimeout(
      `${selected.baseUrl}/videos/${encodeURIComponent(providerTaskId)}`,
      { headers: { authorization: `Bearer ${selected.apiKey}` } },
      PROVIDER_POLL_TIMEOUT_MS,
    );
    if (!polled.response.ok) continue;
    let payload: unknown = polled.body;
    try { payload = JSON.parse(polled.body); } catch {}
    task = providerTaskFromPayload(payload);
    await onProviderTask?.(task);
    image = findImage(task);
  }
  if (!image) throw new Error('上游任务已完成，但没有拿到有效返图，本次积分已退回。');
  return image;
}

async function exists(target: string) {
  try { await access(target); return true; } catch { return false; }
}

function imageExtension(contentType: string, source: string) {
  if (/webp/i.test(contentType)) return '.webp';
  if (/gif/i.test(contentType)) return '.gif';
  if (/jpe?g/i.test(contentType)) return '.jpg';
  const fromUrl = path.extname(source.split('?')[0]).toLowerCase();
  return /^\.(png|jpe?g|webp|gif)$/.test(fromUrl) ? fromUrl : '.png';
}

async function generatedAssetDirs(folder: string) {
  const parts = folder.split('/').filter(Boolean);
  const dirs = new Set<string>();
  const root = String(env.UPLOADS_ROOT || '').trim();
  if (root) dirs.add(path.join(root, ...parts.slice(1)));
  dirs.add(path.join(process.cwd(), 'public', ...parts));
  const clientRoot = path.join(process.cwd(), 'dist', 'client');
  if (await exists(clientRoot)) dirs.add(path.join(clientRoot, ...parts));
  return [...dirs];
}

async function persistGeneratedImage(source: string, requestId: string) {
  let bytes: Buffer;
  let contentType = 'image/png';
  if (source.startsWith('data:image/')) {
    const match = source.match(/^data:([^;,]+);base64,(.+)$/i);
    if (!match) throw new Error('返图数据格式无效。');
    contentType = match[1];
    bytes = Buffer.from(match[2], 'base64');
  } else {
    let lastError: unknown;
    bytes = Buffer.alloc(0);
    for (let attempt = 1; attempt <= GENERATED_IMAGE_FETCH_ATTEMPTS; attempt += 1) {
      try {
        const downloaded = await fetchBytesWithTimeout(source, {
          headers: { 'user-agent': 'Mozilla/5.0' },
        }, GENERATED_IMAGE_FETCH_TIMEOUT_MS);
        const response = downloaded.response;
        if (!response.ok) throw new Error(`返图下载失败（HTTP ${response.status}）。`);
        contentType = response.headers.get('content-type') || contentType;
        bytes = downloaded.bytes;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < GENERATED_IMAGE_FETCH_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
    }
    if (!bytes.length) {
      const detail = lastError instanceof Error ? lastError.message : '未知网络错误';
      throw new Error(`返图下载失败，已自动重试 ${GENERATED_IMAGE_FETCH_ATTEMPTS} 次：${detail}`);
    }
  }
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error('返图文件无效或过大。');

  const month = new Date().toISOString().slice(0, 7).replace('-', '');
  const folder = `/uploads/ai/${month}`;
  const filename = `${requestId}${imageExtension(contentType, source)}`;
  const dirs = await generatedAssetDirs(folder);
  await Promise.all(dirs.map(async (dir) => {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), bytes);
  }));
  return `${folder}/${filename}`;
}

async function removeGeneratedImage(imageUrl: string | null) {
  if (!imageUrl || !imageUrl.startsWith('/uploads/ai/')) return;
  const relative = imageUrl.split('/').filter(Boolean);
  if (relative.some((part) => part === '..')) return;
  const roots = new Set<string>();
  const uploadsRoot = String(env.UPLOADS_ROOT || '').trim();
  if (uploadsRoot) roots.add(path.join(uploadsRoot, ...relative.slice(1)));
  roots.add(path.join(process.cwd(), 'public', ...relative));
  roots.add(path.join(process.cwd(), 'dist', 'client', ...relative));
  await Promise.allSettled([...roots].map((target) => unlink(target)));
}

let lastServerImageCleanupAt = 0;
let serverImageCleanup: Promise<void> | null = null;

function scheduleExpiredImageCleanup() {
  if (serverImageCleanup || Date.now() - lastServerImageCleanupAt < SERVER_IMAGE_CLEANUP_INTERVAL_MS) return;
  serverImageCleanup = (async () => {
    const [rows] = await db.query<Array<{ member_id: number; request_id: string; image_url: string | null }>>(
      `SELECT member_id,request_id,image_url
       FROM xdd_ai_generations
       WHERE image_url IS NOT NULL
         AND completed_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
       ORDER BY id ASC LIMIT 500`,
    );
    for (const row of rows) {
      await removeGeneratedImage(row.image_url);
      await db.query(
        `UPDATE xdd_ai_generations SET image_url = NULL
         WHERE member_id = ? AND request_id = ? AND completed_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`,
        [row.member_id, row.request_id],
      );
    }
    lastServerImageCleanupAt = Date.now();
  })().catch((error) => {
    console.error('[ai-image] seven-day image cleanup failed', error);
  }).finally(() => {
    serverImageCleanup = null;
  });
}

function rowPayload(row: TaskRow) {
  return {
    requestId: row.request_id,
    prompt: row.prompt,
    ratio: row.ratio,
    status: row.status,
    progress: Math.max(0, Math.min(100, Number(row.provider_progress || 0))),
    image: row.image_url || '',
    error: row.error_message || '',
    creditCost: Number(row.credit_cost || AI_GENERATION_COST),
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

async function loadTask(memberId: number, requestId: string) {
  const [rows] = await db.query<TaskRow[]>(
    `SELECT request_id,prompt,ratio,status,provider_task_id,provider_model,provider_progress,image_url,error_message,credit_cost,created_at,completed_at
     FROM xdd_ai_generations WHERE member_id = ? AND request_id = ? LIMIT 1`,
    [memberId, requestId],
  );
  return rows[0] || null;
}

async function ensureHiddenHistoryTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS xdd_ai_generation_hidden (
      member_id INT NOT NULL,
      request_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
      hidden_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (member_id, request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function runTask(
  memberId: number,
  requestId: string,
  prompt: string,
  ratio: string,
  selection: AiModelSelection,
  referenceImages: string[] = [],
) {
  try {
    const upstreamImage = await callZexImage(prompt, ratio, selection, referenceImages, async (providerTask) => {
      await db.query(
        `UPDATE xdd_ai_generations
         SET provider_task_id = ?, provider_model = ?, provider_progress = ?
         WHERE member_id = ? AND request_id = ? AND status = 'processing'`,
        [providerTask.id, selection.providerModel, Math.max(0, Math.min(100, Number(providerTask.progress || 0))), memberId, requestId],
      );
    });
    const current = await loadTask(memberId, requestId);
    if (!current || current.status === 'cancelled') return;
    const image = await persistGeneratedImage(upstreamImage, requestId);
    await db.query(
      `UPDATE xdd_ai_generations SET status = 'completed', image_url = ?, completed_at = NOW() WHERE member_id = ? AND request_id = ?`,
      [image, memberId, requestId],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'AI 生图服务暂时不可用，请稍后再试。';
    const current = await loadTask(memberId, requestId);
    if (current?.status !== 'cancelled') {
      await Promise.allSettled([
        refundGenerationCredits(memberId, requestId, Number(current?.credit_cost || selection.creditCost), message),
        db.query(
          `UPDATE xdd_ai_generations SET status = 'failed', error_message = ?, completed_at = NOW() WHERE member_id = ? AND request_id = ?`,
          [message, memberId, requestId],
        ),
      ]);
    }
  } finally {
    activeTasks.delete(requestId);
  }
}

async function runRecoveredTask(memberId: number, task: TaskRow) {
  try {
    if (!task.provider_task_id) throw new ProviderTaskNotFoundError();
    const upstreamImage = await recoverZexAsyncImage(task.provider_task_id, async (providerTask) => {
      await db.query(
        `UPDATE xdd_ai_generations SET provider_progress = ?
         WHERE member_id = ? AND request_id = ? AND status = 'processing'`,
        [Math.max(0, Math.min(100, Number(providerTask.progress || 0))), memberId, task.request_id],
      );
    });
    const current = await loadTask(memberId, task.request_id);
    if (!current || current.status !== 'processing') return;
    const image = await persistGeneratedImage(upstreamImage, task.request_id);
    await db.query(
      `UPDATE xdd_ai_generations
       SET status = 'completed', provider_progress = 100, image_url = ?, error_message = '', completed_at = NOW()
       WHERE member_id = ? AND request_id = ? AND status = 'processing'`,
      [image, memberId, task.request_id],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : '恢复生成任务失败，本次积分已退回。';
    const current = await loadTask(memberId, task.request_id);
    if (current?.status === 'processing') {
      await Promise.allSettled([
        refundGenerationCredits(memberId, task.request_id, Number(current.credit_cost || AI_GENERATION_COST), message),
        db.query(
          `UPDATE xdd_ai_generations SET status = 'failed', error_message = ?, completed_at = NOW()
           WHERE member_id = ? AND request_id = ? AND status = 'processing'`,
          [message, memberId, task.request_id],
        ),
      ]);
    }
  } finally {
    activeTasks.delete(task.request_id);
  }
}

function ensureTaskRecovery(memberId: number, task: TaskRow) {
  if (task.status !== 'processing' || !task.provider_task_id || activeTasks.has(task.request_id)) return;
  const recovery = runRecoveredTask(memberId, task);
  activeTasks.set(task.request_id, recovery);
  void recovery;
}

let serverTaskSweep: Promise<{ recovered: number; refunded: number }> | null = null;

// Called by the process-local worker endpoint. The browser is deliberately not
// part of the execution chain: it may close immediately after POST returns.
// Processing tasks live in MySQL, are resumed from provider_task_id after a
// restart, and the final image is copied into our own server storage.
export function sweepServerGenerationTasks() {
  if (serverTaskSweep) return serverTaskSweep;
  serverTaskSweep = (async () => {
    const [rows] = await db.query<Array<TaskRow & { member_id: number }>>(
      `SELECT member_id,request_id,prompt,ratio,status,provider_task_id,provider_model,
              provider_progress,image_url,error_message,credit_cost,created_at,completed_at
       FROM xdd_ai_generations
       WHERE status = 'processing'
       ORDER BY id ASC
       LIMIT ?`,
      [SERVER_TASK_RECOVERY_LIMIT],
    );
    let recovered = 0;
    let refunded = 0;
    for (const task of rows) {
      if (activeTasks.has(task.request_id)) continue;
      if (task.provider_task_id) {
        ensureTaskRecovery(task.member_id, task);
        recovered += 1;
        continue;
      }
      if (Date.now() - new Date(task.created_at).getTime() <= ORPHAN_GRACE_MS) continue;
      const message = '服务器重启前尚未取得上游任务编号，任务无法恢复，本次积分已自动退回。';
      const [result] = await db.query(
        `UPDATE xdd_ai_generations
         SET status='failed', error_message=?, completed_at=NOW()
         WHERE member_id=? AND request_id=? AND status='processing' AND provider_task_id IS NULL`,
        [message, task.member_id, task.request_id],
      );
      if (Number((result as { affectedRows?: number }).affectedRows || 0) > 0) {
        await refundGenerationCredits(task.member_id, task.request_id, Number(task.credit_cost || AI_GENERATION_COST), message);
        refunded += 1;
      }
    }
    scheduleExpiredImageCleanup();
    return { recovered, refunded };
  })().finally(() => {
    serverTaskSweep = null;
  });
  return serverTaskSweep;
}

export const GET: APIRoute = async ({ request }) => {
  scheduleExpiredImageCleanup();
  const memberId = verifyMemberToken(cookieValue(request.headers, MEMBER_COOKIE));
  if (!memberId) return fail('请先登录后使用 AI 生图。', 401);
  await ensureHiddenHistoryTable();
  const [rows] = await db.query<TaskRow[]>(
    `SELECT request_id,prompt,ratio,status,provider_task_id,provider_model,provider_progress,image_url,error_message,credit_cost,created_at,completed_at
     FROM xdd_ai_generations g
     WHERE g.member_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM xdd_ai_generation_hidden h
         WHERE h.member_id = g.member_id
           AND h.request_id COLLATE utf8mb4_unicode_ci = g.request_id COLLATE utf8mb4_unicode_ci
       )
     ORDER BY g.id DESC LIMIT 60`,
    [memberId],
  );
  rows.forEach((task) => ensureTaskRecovery(memberId, task));
  return ok({ tasks: rows.map(rowPayload) });
};

export const DELETE: APIRoute = async ({ request }) => {
  const memberId = verifyMemberToken(cookieValue(request.headers, MEMBER_COOKIE));
  if (!memberId) return fail('请先登录后管理生成记录。', 401);
  const body = await readJson<{ requestId?: unknown; purge?: unknown }>(request);
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  if (!requestId) return fail('缺少任务编号。', 400);
  const task = await loadTask(memberId, requestId);
  if (!task) return fail('记录不存在或无权访问。', 404);
  if (task.status === 'processing') return fail('生成中的任务请先停止，再删除记录。', 409);
  if (body.purge === true) {
    await removeGeneratedImage(task.image_url);
    await db.query(
      `UPDATE xdd_ai_generations SET image_url = NULL WHERE member_id = ? AND request_id = ?`,
      [memberId, requestId],
    );
  }
  await ensureHiddenHistoryTable();
  await db.query(
    `INSERT INTO xdd_ai_generation_hidden (member_id,request_id) VALUES (?,?)
     ON DUPLICATE KEY UPDATE hidden_at=NOW()`,
    [memberId, requestId],
  );
  return ok({ requestId, hidden: true });
};

export const POST: APIRoute = async ({ request }) => {
  scheduleExpiredImageCleanup();
  const body = await readJson<{ prompt?: unknown; ratio?: unknown; model?: unknown; resolution?: unknown; asyncMode?: unknown; requestId?: unknown; referenceImages?: unknown }>(request);
  const memberId = verifyMemberToken(cookieValue(request.headers, MEMBER_COOKIE));
  if (!memberId) return fail('请先登录后使用 AI 生图。', 401);

  const mode = typeof body.asyncMode === 'string' ? body.asyncMode : 'start';
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  if (mode === 'poll') {
    if (!requestId) return fail('缺少任务编号。', 400);
    const task = await loadTask(memberId, requestId);
    if (!task) return fail('任务不存在或无权访问。', 404);
    if (
      task.status === 'processing'
      && !task.provider_task_id
      && !activeTasks.has(requestId)
      && Date.now() - new Date(task.created_at).getTime() > ORPHAN_GRACE_MS
    ) {
      // The worker that was running this task is gone (typically a restart).
      // Refund and fail immediately rather than making the user wait it out.
      const message = '生成中断，本次积分已退回，请重新生成。';
      await Promise.allSettled([
        refundGenerationCredits(memberId, requestId, Number(task.credit_cost || AI_GENERATION_COST), message),
        db.query(`UPDATE xdd_ai_generations SET status='failed', error_message=?, completed_at=NOW() WHERE member_id=? AND request_id=? AND status='processing'`, [message, memberId, requestId]),
      ]);
      return json({ ok: false, ...rowPayload({ ...task, status: 'failed', error_message: message }), message }, 502);
    }
    if (task.status === 'processing' && task.provider_task_id && !activeTasks.has(requestId)) {
      ensureTaskRecovery(memberId, task);
      return json({ ok: false, ...rowPayload(task), recovering: true }, 202);
    }
    if (task.status === 'processing' && !activeTasks.has(requestId) && Date.now() - new Date(task.created_at).getTime() > PROCESSING_TIMEOUT_MS) {
      const message = '任务等待超时，积分已退回，请重新生成。';
      await Promise.allSettled([
        refundGenerationCredits(memberId, requestId, Number(task.credit_cost || AI_GENERATION_COST), message),
        db.query(`UPDATE xdd_ai_generations SET status='failed', error_message=?, completed_at=NOW() WHERE member_id=? AND request_id=?`, [message, memberId, requestId]),
      ]);
      return json({ ok: false, ...rowPayload({ ...task, status: 'failed', error_message: message }), message }, 502);
    }
    return json({ ok: task.status === 'completed', ...rowPayload(task) }, task.status === 'processing' ? 202 : task.status === 'completed' ? 200 : 502);
  }

  if (mode === 'cancel') {
    if (!requestId) return fail('缺少任务编号。', 400);
    const task = await loadTask(memberId, requestId);
    if (!task || task.status !== 'processing') return fail('当前任务无法取消。', 400);
    const message = '用户已取消生成，积分已退回。';
    await Promise.allSettled([
      refundGenerationCredits(memberId, requestId, Number(task.credit_cost || AI_GENERATION_COST), message),
      db.query(`UPDATE xdd_ai_generations SET status='cancelled', error_message=?, completed_at=NOW() WHERE member_id=? AND request_id=?`, [message, memberId, requestId]),
    ]);
    return ok({ requestId, status: 'cancelled' });
  }

  if (String(env.AI_IMAGE_ENABLED || '').trim().toLowerCase() !== 'true') {
    return fail('AI 创作服务正在维护。', 503, { code: 'AI_SERVICE_DISABLED' });
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 1600) : '';
  const safety = checkAiPromptSafety(prompt);
  if (!safety.allowed) {
    return fail(safety.message || '该提示词当前不支持提交。', 400, { code: 'PROMPT_BLOCKED', category: safety.category });
  }
  if (!prompt) return fail('请输入提示词后再生成。', 400);
  const ratio = typeof body.ratio === 'string' && RATIOS.has(body.ratio) ? body.ratio : '16:9';
  const resolution = typeof body.resolution === 'string' && RESOLUTIONS.has(body.resolution) ? body.resolution : '1K';
  const selection = await getAiModelSelection(body.model, resolution);
  if (!selection) return fail('模型或清晰度不存在。', 400);
  if (!selection.enabled) return fail('该模型或清晰度暂时不可用，请稍后再试或更换清晰度。', 503, { code: 'MODEL_UNAVAILABLE' });
  if (selection.creditCost <= 0) return fail('该模型尚未配置积分价格。', 503, { code: 'MODEL_PRICE_MISSING' });
  const referenceImages = Array.isArray(body.referenceImages)
    ? body.referenceImages.filter((item): item is string => typeof item === 'string' && isPublicReferenceImage(item)).slice(0, 5)
    : [];
  if (Array.isArray(body.referenceImages) && referenceImages.length !== body.referenceImages.length) {
    return fail('参考图格式无效，仅支持图片直链或 Base64 图片，最多 5 张。', 400);
  }
  const referencePayloadSize = referenceImages.reduce((total, item) => total + Buffer.byteLength(item, 'utf8'), 0);
  if (referencePayloadSize > 8 * 1024 * 1024) {
    return fail('参考图总体积过大，请减少图片数量或压缩后重试。', 413, { code: 'REFERENCE_TOO_LARGE' });
  }
  // Reference images (图生图) only go through the async /videos edit pipeline. Sending
  // them to a sync model would silently hit /images/edits and, if the model can't edit,
  // fail after the credits were already reserved. Reject up front with a clear hint.
  if (referenceImages.length && !isAsyncImageModel(selection)) {
    return fail('该模型不支持参考图（图生图），请改用 Banana 或 GPT Image 模型。', 400, { code: 'MODEL_NO_REFERENCE' });
  }
  if (!(await activeAiChannels()).length) return fail('AI 生图服务尚未配置。', 503);

  const id = /^[A-Za-z0-9-]{16,64}$/.test(requestId) ? requestId : crypto.randomUUID();
  const existing = await loadTask(memberId, id);
  if (existing) return json({ ok: existing.status === 'completed', ...rowPayload(existing) }, existing.status === 'processing' ? 202 : 200);

  let charged = false;
  try {
    const charge = await reserveGenerationCredits(memberId, id, selection.creditCost);
    charged = true;
    await db.query(
      `INSERT INTO xdd_ai_generations (member_id,request_id,prompt,ratio,credit_cost,status,provider_model) VALUES (?,?,?,?,?,'processing',?)`,
      [memberId, id, prompt, ratio, selection.creditCost, selection.providerModel],
    );
    const task = runTask(memberId, id, prompt, ratio, selection, referenceImages);
    activeTasks.set(id, task);
    void task;
    return json({ ok: true, requestId: id, status: 'processing', creditCost: selection.creditCost, balance: charge.balance }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建生成任务失败。';
    if (charged) await refundGenerationCredits(memberId, id, selection.creditCost, message);
    return fail(message, /积分不足|用户不存在/.test(message) ? 400 : 502);
  }
};
