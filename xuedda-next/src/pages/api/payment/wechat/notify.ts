import type { APIRoute } from 'astro';
import { settleWechatCreditOrder } from '../../../../lib/credit-orders';
import { parseWechatXml, verifyWechatV2, wechatCallbackResponse, wechatPayConfig } from '../../../../lib/wechat-pay';

export const POST: APIRoute = async ({ request }) => {
  const config = wechatPayConfig();
  if (!config) return wechatCallbackResponse(false, 'PAYMENT_NOT_CONFIGURED');
  try {
    const xml = await request.text();
    if (!xml || xml.length > 64_000) return wechatCallbackResponse(false, 'INVALID_BODY');
    const data = parseWechatXml(xml);
    if (!verifyWechatV2(data, config)) return wechatCallbackResponse(false, 'INVALID_SIGN');
    if (data.return_code !== 'SUCCESS' || data.result_code !== 'SUCCESS') return wechatCallbackResponse(false, 'PAYMENT_FAILED');
    if (data.appid !== config.appId || data.mch_id !== config.mchId) return wechatCallbackResponse(false, 'MERCHANT_MISMATCH');
    await settleWechatCreditOrder(data);
    return wechatCallbackResponse(true);
  } catch {
    return wechatCallbackResponse(false, 'PROCESS_FAILED');
  }
};

// WeChat only ever POSTs the payment result. Browsers, health probes and crawlers
// hitting this path used to fall through to a 502 from the upstream and look like
// real errors; answer a quiet 405 for every non-POST method instead.
export const ALL: APIRoute = () =>
  new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
