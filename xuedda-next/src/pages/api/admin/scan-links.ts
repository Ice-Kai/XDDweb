import type { APIRoute } from 'astro';
import { db, appPrefix } from '../../../lib/db';
import { ok, fail, readJson } from '../../../lib/api';

// Best-effort netdisk link checker. Baidu actively blocks server-side probing
// and renders much of the page with JS, so this is a HEURISTIC: 'dead' when a
// known失效 marker is found, 'ok' when reachable without one, 'unknown' on
// timeout / block / non-http. Treat 'unknown' as "needs a manual look".

const DEAD_MARKERS = [
  '你访问的页面不存在',
  '分享的文件已经被取消',
  '分享已过期',
  '链接错误',
  '啊哦，你来晚了',
  '文件已经被删除',
  '已经被取消',
  '此链接分享内容可能因为涉及侵权',
  '该分享已被删除',
  '分享文件已被删除',
];

async function checkUrl(rawUrl: string): Promise<'ok' | 'dead' | 'unknown'> {
  const url = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return 'unknown';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36' },
    });
    const text = await res.text().catch(() => '');
    if (DEAD_MARKERS.some((m) => text.includes(m))) return 'dead';
    if (res.status >= 400) return 'dead';
    return 'ok';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ ids?: unknown }>(request);
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean).slice(0, 60) : [];
  if (!ids.length) return fail('没有要扫描的资源', 400);

  const [rows] = await db.query<any[]>(
    `SELECT id, file_url FROM ${appPrefix}contents WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );

  const results: Array<{ id: number; status: string }> = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      const status = await checkUrl(String(row.file_url || ''));
      results.push({ id: Number(row.id), status });
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, rows.length) }, worker));

  const dead = results.filter((r) => r.status === 'dead').length;
  const unknown = results.filter((r) => r.status === 'unknown').length;
  return ok({ results, summary: { total: results.length, dead, unknown, ok: results.length - dead - unknown } });
};
