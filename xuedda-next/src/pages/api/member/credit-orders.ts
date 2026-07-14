import type { APIRoute } from 'astro';
import { fail, ok, readJson } from '../../../lib/api';
import { cookieValue } from '../../../lib/auth';
import { createCreditOrder, createCustomCreditOrder, getCreditOrder } from '../../../lib/credit-orders';
import { MEMBER_COOKIE, verifyMemberToken } from '../../../lib/member';
import { clientIp, rateLimit } from '../../../lib/ratelimit';

function memberId(request: Request) {
  return verifyMemberToken(cookieValue(request.headers, MEMBER_COOKIE));
}

export const POST: APIRoute = async ({ request }) => {
  const id = memberId(request);
  if (!id) return fail('请先登录后充值', 401);
  const limited = rateLimit(`credit-order:${id}:${clientIp(request)}`, 5, 60_000);
  if (!limited.ok) return fail('下单过于频繁，请稍后再试', 429);
  const body = await readJson<{ productId?: unknown; amountFen?: unknown }>(request);
  const hasProduct = body.productId !== undefined && body.productId !== null && body.productId !== '';
  const hasAmount = body.amountFen !== undefined && body.amountFen !== null && body.amountFen !== '';
  if (hasProduct === hasAmount) return fail('请选择积分套餐或填写自定义充值金额');
  try {
    if (hasAmount) {
      const amountFen = Number(body.amountFen);
      return ok(await createCustomCreditOrder(id, amountFen, clientIp(request)));
    }
    const productId = Number(body.productId);
    if (!Number.isSafeInteger(productId) || productId < 1) return fail('请选择有效的积分套餐');
    return ok(await createCreditOrder(id, productId, clientIp(request)));
  } catch (error) {
    return fail(error instanceof Error ? error.message : '创建支付订单失败', 502);
  }
};

export const GET: APIRoute = async ({ request, url }) => {
  const id = memberId(request);
  if (!id) return fail('请先登录后查询订单', 401);
  const sn = String(url.searchParams.get('orderSn') || '').trim();
  if (!/^XD\d{14}[A-F0-9]{10}$/.test(sn)) return fail('订单号无效');
  const order = await getCreditOrder(id, sn);
  return order ? ok({ order }) : fail('订单不存在', 404);
};
