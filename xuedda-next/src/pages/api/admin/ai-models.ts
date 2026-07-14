import type { APIRoute } from 'astro';
import { fail, ok, readJson } from '../../../lib/api';
import { getAiModelCatalog, resetAiModelHealth, setAiModelPrice } from '../../../lib/ai-model-health';
import { logAction } from '../../../lib/adminlog';

export const GET: APIRoute = async () => ok({ models: await getAiModelCatalog() });

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await readJson<{ action?: unknown; model?: unknown; resolution?: unknown; creditCost?: unknown }>(request);
  if (body.action === 'price') {
    const model = await setAiModelPrice(body.model, body.resolution, body.creditCost);
    if (!model) return fail('模型、清晰度或积分价格无效。', 400);
    await logAction({
      admin: (locals as any).admin?.name,
      action: 'update',
      targetType: 'ai_model_price',
      title: `调整模型价格：${model.label} ${model.resolution} = ${model.creditCost} 积分`,
    });
    return ok({ model });
  }
  if (body.action !== 'reset') return fail('不支持的操作。', 400);
  const model = await resetAiModelHealth(body.model, body.resolution);
  if (!model) return fail('模型或清晰度不存在。', 400);
  await logAction({
    admin: (locals as any).admin?.name,
    action: 'update',
    targetType: 'ai_model_health',
    title: `重置模型状态：${model.label} ${model.resolution}`,
  });
  return ok({ model });
};
