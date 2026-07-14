import type { APIRoute } from 'astro';
import { json } from '../../../lib/api';
import { sweepServerGenerationTasks } from '../ai-image/generate';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const expected = String(process.env.AI_WORKER_SECRET || '');
  const supplied = request.headers.get('authorization') || '';
  if (!expected || supplied !== `Bearer ${expected}`) {
    return json({ ok: false, message: 'Forbidden' }, 403);
  }
  const result = await sweepServerGenerationTasks();
  return json({ ok: true, ...result });
};
