import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

const env = {
  ...import.meta.env,
  ...(typeof process !== 'undefined' ? process.env : {}),
};

export interface WechatPayConfig {
  appId: string;
  mchId: string;
  apiKey: string;
  notifyUrl: string;
}

export function wechatPayConfig(): WechatPayConfig | null {
  const config = {
    appId: String(env.WXPAY_APP_ID || '').trim(),
    mchId: String(env.WXPAY_MCH_ID || '').trim(),
    apiKey: String(env.WXPAY_API_KEY || '').trim(),
    notifyUrl: String(env.WXPAY_NOTIFY_URL || '').trim(),
  };
  return Object.values(config).every(Boolean) ? config : null;
}

function scalar(value: unknown) {
  return value == null ? '' : String(value);
}

export function signWechatV2(data: Record<string, unknown>, key: string) {
  const source = Object.entries(data)
    .filter(([name, value]) => name !== 'sign' && scalar(value) !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${scalar(value)}`)
    .join('&');
  return crypto.createHash('md5').update(`${source}&key=${key}`, 'utf8').digest('hex').toUpperCase();
}

const parser = new XMLParser({ ignoreAttributes: true, trimValues: true, parseTagValue: false });
const builder = new XMLBuilder({ ignoreAttributes: true, format: false });

export function parseWechatXml(xml: string): Record<string, string> {
  const root = parser.parse(xml)?.xml || {};
  return Object.fromEntries(Object.entries(root).map(([key, value]) => [key, scalar(value)]));
}

export function wechatXml(data: Record<string, unknown>) {
  return builder.build({ xml: data });
}

export function verifyWechatV2(data: Record<string, string>, config: WechatPayConfig) {
  const sign = scalar(data.sign).toUpperCase();
  const expected = signWechatV2(data, config.apiKey);
  if (!sign || sign.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sign), Buffer.from(expected));
}

function nonce() {
  return crypto.randomBytes(16).toString('hex');
}

function paymentClientIp(value: string) {
  const first = value.split(',')[0]?.trim() || '';
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(first) ? first : '127.0.0.1';
}

export async function createWechatNativeOrder(input: {
  orderSn: string;
  body: string;
  amountFen: number;
  productId: string;
  clientIp: string;
}) {
  const config = wechatPayConfig();
  if (!config) throw new Error('微信支付通道尚未完成配置');
  const payload: Record<string, unknown> = {
    appid: config.appId,
    mch_id: config.mchId,
    nonce_str: nonce(),
    body: input.body.slice(0, 120),
    out_trade_no: input.orderSn,
    total_fee: input.amountFen,
    spbill_create_ip: paymentClientIp(input.clientIp),
    notify_url: config.notifyUrl,
    trade_type: 'NATIVE',
    product_id: input.productId,
    sign_type: 'MD5',
  };
  payload.sign = signWechatV2(payload, config.apiKey);
  const response = await fetch('https://api.mch.weixin.qq.com/pay/unifiedorder', {
    method: 'POST',
    headers: { 'content-type': 'application/xml; charset=utf-8' },
    body: wechatXml(payload),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`微信支付服务暂时不可用（${response.status}）`);
  const result = parseWechatXml(await response.text());
  if (!verifyWechatV2(result, config)) throw new Error('微信支付响应验签失败');
  if (result.return_code !== 'SUCCESS' || result.result_code !== 'SUCCESS' || !result.code_url) {
    throw new Error(result.err_code_des || result.return_msg || '微信支付下单失败');
  }
  return {
    codeUrl: result.code_url,
    qrDataUrl: await QRCode.toDataURL(result.code_url, { width: 280, margin: 1, errorCorrectionLevel: 'M' }),
  };
}

export function wechatCallbackResponse(ok: boolean, message = ok ? 'OK' : 'FAIL') {
  return new Response(wechatXml({
    return_code: ok ? 'SUCCESS' : 'FAIL',
    return_msg: message.slice(0, 120),
  }), { status: 200, headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
