import type { APIRoute } from 'astro';
import { createHmac, randomUUID } from 'node:crypto';
import { fail, readJson } from '../../../lib/api';
import { verifyCaptcha } from '../../../lib/captcha';
import { createMemberToken, registerMember, setMemberCookie } from '../../../lib/member';
import { clientIp, rateLimit } from '../../../lib/ratelimit';
import { publicRegistrationEnabled, secureCookieSuffix, sessionSecret } from '../../../lib/security';

const REGISTER_DEVICE_COOKIE = 'xdd_register_device';

function cookieValue(headers: Headers, name: string) {
  const cookie = headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function registerDeviceCookie(deviceId: string) {
  return `${REGISTER_DEVICE_COOKIE}=${encodeURIComponent(deviceId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}${secureCookieSuffix()}`;
}

function registrationFingerprint(value: string) {
  return createHmac('sha256', sessionSecret()).update(value || 'unknown').digest('hex');
}

export const POST: APIRoute = async ({ request }) => {
  if (!publicRegistrationEnabled()) return fail('当前暂未开放公开注册', 403);

  const ip = clientIp(request);
  const deviceId = cookieValue(request.headers, REGISTER_DEVICE_COOKIE) || randomUUID();
  const limits = [
    rateLimit(`member-register-minute:${ip}`, 3, 60_000),
    rateLimit(`member-register-hour-ip:${ip}`, 2, 60 * 60 * 1000),
    rateLimit(`member-register-day-ip:${ip}`, 5, 24 * 60 * 60 * 1000),
    rateLimit(`member-register-hour-device:${deviceId}`, 2, 60 * 60 * 1000),
  ];
  if (limits.some((item) => !item.ok)) {
    return fail('注册太频繁，请稍后再试。', 429);
  }

  const body = await readJson<{
    username?: string;
    password?: string;
    captchaToken?: string;
    captchaAnswer?: string;
    agreementAccepted?: string | boolean | number;
  }>(request);

  const accepted = body.agreementAccepted === true || body.agreementAccepted === 1 || body.agreementAccepted === '1' || body.agreementAccepted === 'true' || body.agreementAccepted === 'on';
  if (!accepted) {
    return fail('请先阅读并同意用户协议。', 400);
  }

  if (!verifyCaptcha(String(body.captchaToken || ''), String(body.captchaAnswer || ''))) {
    return fail('验证码错误或已过期，请重新输入', 400, { captcha: true });
  }

  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (username.length < 3 || password.length < 6) return fail('用户名至少 3 位，密码至少 6 位');

  try {
    const member = await registerMember(username, password, {
      ipHash: registrationFingerprint(`ip:${ip}`),
      deviceHash: registrationFingerprint(`device:${deviceId}`),
    });
    if (!member) return fail('注册失败');

    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
    headers.append('set-cookie', setMemberCookie(createMemberToken(member)));
    headers.append('set-cookie', registerDeviceCookie(deviceId));
    return new Response(JSON.stringify({ ok: true, member }), { headers });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '注册失败');
  }
};
