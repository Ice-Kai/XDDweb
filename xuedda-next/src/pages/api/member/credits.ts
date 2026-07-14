import type { APIRoute } from 'astro';
import { fail, ok, readJson } from '../../../lib/api';
import { getCreditOverview, listCreditProducts, redeemCreditCode } from '../../../lib/credits';
import { cookieValue } from '../../../lib/auth';
import { MEMBER_COOKIE, verifyMemberToken } from '../../../lib/member';
import { clientIp, rateLimit } from '../../../lib/ratelimit';
import { aiGenerationPrice } from '../../../lib/ai-pricing';

function memberId(request: Request) {
  return verifyMemberToken(cookieValue(request.headers, MEMBER_COOKIE));
}

export const GET: APIRoute = async ({ request }) => {
  const id = memberId(request);
  if (!id) return fail('请先登录后查看积分', 401);
  const [overview, products] = await Promise.all([getCreditOverview(id), listCreditProducts()]);
  return ok({ ...overview, products, minimumGenerationCost: aiGenerationPrice('image2', '1K')?.credits || 15 });
};

export const POST: APIRoute = async ({ request }) => {
  const limited = rateLimit(`credit-redeem:${clientIp(request)}`, 8, 60_000);
  if (!limited.ok) return fail('兑换操作过于频繁，请稍后再试', 429);
  const id = memberId(request);
  if (!id) return fail('请先登录后兑换卡密', 401);
  const body = await readJson<{ code?: unknown }>(request);
  try {
    return ok(await redeemCreditCode(id, body.code));
  } catch (error) {
    return fail(error instanceof Error ? error.message : '卡密兑换失败');
  }
};
