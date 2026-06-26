import type { APIRoute } from 'astro';
import { fail, ok, readJson } from '../../../lib/api';

const env = import.meta.env as Record<string, string | undefined>;

const RATIOS = new Set(['1:1', '16:9', '9:16', '3:4', '4:3']);

type UnknownRecord = Record<string, unknown>;

let keyCursor = 0;
let baseUrlCursor = 0;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? (value as UnknownRecord) : null;
}

function findImage(value: unknown): string | null {
  if (typeof value === 'string') {
    const markdown = value.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i);
    if (markdown?.[1]) return markdown[1];

    const dataUrl = value.match(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/i);
    if (dataUrl?.[0]) return dataUrl[0].replace(/\s/g, '');

    const url = value.match(/https?:\/\/[^\s"'<>]+/i);
    if (url?.[0]) return url[0].replace(/[),.;]+$/, '');
    return null;
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
    if (typeof candidate === 'string' && candidate.length > 100) {
      return `data:image/png;base64,${candidate}`;
    }
  }

  for (const key of ['url', 'image_url', 'image', 'content', 'data', 'output', 'choices', 'message', 'result']) {
    const found = findImage(record[key]);
    if (found) return found;
  }

  return null;
}

async function makePreviewSafe(image: string) {
  if (image.startsWith('data:image/')) return image;

  try {
    const response = await fetch(image, { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!response.ok) return image;
    const contentType = response.headers.get('content-type') || 'image/png';
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 12 * 1024 * 1024) return image;
    const base64 = Buffer.from(bytes).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch {
    return image;
  }
}

function collectKeys() {
  return [env.IMAGE_PROXY_API_KEYS, env.IMAGE_PROXY_API_KEY]
    .filter(Boolean)
    .join('\n')
    .split(/[\n,;]+/)
    .map((key) => key.trim())
    .filter(Boolean);
}

function collectBaseUrls() {
  return [env.IMAGE_PROXY_BASE_URLS, env.IMAGE_PROXY_BASE_URL]
    .filter(Boolean)
    .join('\n')
    .split(/[\n,;]+/)
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function pick<T>(items: T[], cursor: number) {
  return items[cursor % items.length];
}

function friendlyGenerateError(status: number, detail?: string) {
  if (status === 401 || status === 403) return '生图服务鉴权失败，请稍后再试。';
  if (status === 413) return '图片或提示词太大了，请缩短内容后再试。';
  if (status === 429) return '当前生成请求太多，请稍后再试。';
  if (status === 502 || status === 503 || status === 504) return '生图服务暂时不可用，请稍后再试。';
  if (detail && /quota|insufficient|model|余额|额度|预扣|no available channel/i.test(detail)) {
    return '生图服务暂时不可用，请稍后再试。';
  }
  return '生成失败，请稍后再试。';
}

async function callVercelProxy(url: string, body: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const secret = env.IMAGE_PROXY_SECRET?.trim();
  if (secret) headers['x-proxy-secret'] = secret;

  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const raw = await response.text();
  let payload: unknown = raw;
  try { payload = JSON.parse(raw); } catch {}

  if (!response.ok) {
    const record = asRecord(payload);
    const message = typeof record?.error === 'string' ? record.error : raw.slice(0, 500);
    throw new Error(friendlyGenerateError(response.status, message));
  }

  const image = findImage(payload);
  if (!image) throw new Error('生成完成，但没有拿到图片，请稍后再试。');
  return makePreviewSafe(image);
}

async function callOpenAiCompatible(prompt: string, ratio: string) {
  const keys = collectKeys();
  const urls = collectBaseUrls();
  if (!keys.length || !urls.length) return null;

  const key = pick(keys, keyCursor);
  keyCursor = (keyCursor + 1) % keys.length;
  const base = pick(urls, baseUrlCursor);
  baseUrlCursor = (baseUrlCursor + 1) % urls.length;
  const model = env.IMAGE_PROXY_MODEL?.trim() || 'gpt-image-2';

  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: `${prompt}\n\n画面比例：${ratio}` }],
    }),
  });
  const raw = await response.text();
  let payload: unknown = raw;
  try { payload = JSON.parse(raw); } catch {}

  if (!response.ok) {
    const record = asRecord(payload);
    const message = typeof record?.error === 'string' ? record.error : raw.slice(0, 500);
    throw new Error(friendlyGenerateError(response.status, message));
  }

  const image = findImage(payload);
  if (!image) throw new Error('生成完成，但没有拿到图片，请稍后再试。');
  return makePreviewSafe(image);
}

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ prompt?: unknown; ratio?: unknown; provider?: unknown; quality?: unknown }>(request);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 1600) : '';
  const ratio = typeof body.ratio === 'string' && RATIOS.has(body.ratio) ? body.ratio : '16:9';

  if (!prompt) return fail('请输入提示词', 400);

  const vercelUrl = env.IMAGE_PROXY_VERCEL_URL?.trim();
  const hasDirect = collectKeys().length > 0 && collectBaseUrls().length > 0;
  if (!vercelUrl && !hasDirect) {
    return fail('生图后端尚未配置，请稍后再试。', 503, { code: 'NOT_CONFIGURED' });
  }

  try {
    const image = vercelUrl
      ? await callVercelProxy(vercelUrl, {
          prompt,
          ratio,
          provider: typeof body.provider === 'string' ? body.provider : 'gpt',
          quality: typeof body.quality === 'string' ? body.quality : 'standard',
        })
      : await callOpenAiCompatible(prompt, ratio);
    if (!image) return fail('生图后端尚未配置，请稍后再试。', 503, { code: 'NOT_CONFIGURED' });
    return ok({ image });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '生图服务暂时不可用，请稍后再试。', 502);
  }
};
