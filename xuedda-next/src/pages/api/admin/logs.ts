import type { APIRoute } from 'astro';
import { ok } from '../../../lib/api';
import { listLogs } from '../../../lib/adminlog';

export const GET: APIRoute = async ({ url }) => {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 30)));
  const { rows, total } = await listLogs(page, limit, {
    date: url.searchParams.get('date') || '',
    action: url.searchParams.get('action') || '',
    q: url.searchParams.get('q') || '',
  });
  return ok({ rows, total, page, limit });
};
