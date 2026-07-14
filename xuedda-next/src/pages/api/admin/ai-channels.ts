import type { APIRoute } from 'astro';
import { fail, ok, readJson } from '../../../lib/api';
import { deleteAiChannel, listAiChannels, saveAiChannel } from '../../../lib/ai-channels';
import { logAction } from '../../../lib/adminlog';

export const GET: APIRoute = async () => ok({ channels: await listAiChannels(false) });

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const id = await saveAiChannel(body);
    await logAction({ admin: (locals as any).admin?.name, action: body.id ? 'update' : 'create', targetType: 'ai_channel', targetId: id, title: String(body.name || 'AI 渠道') });
    return ok({ id });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '保存 AI 渠道失败。', 400);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const body = await readJson<Record<string, unknown>>(request);
  const id = Math.max(0, Math.trunc(Number(body.id || 0)));
  if (!id) return fail('渠道 ID 无效。', 400);
  await deleteAiChannel(id);
  await logAction({ admin: (locals as any).admin?.name, action: 'delete', targetType: 'ai_channel', targetId: id, title: '删除 AI 渠道' });
  return ok({ id });
};
