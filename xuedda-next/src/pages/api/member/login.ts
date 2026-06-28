import type { APIRoute } from 'astro';
import { fail, readJson } from '../../../lib/api';
import { verifyCaptcha } from '../../../lib/captcha';
import { createMemberToken, loginMember, setMemberCookie } from '../../../lib/member';
import { clientIp, rateLimit } from '../../../lib/ratelimit';

export const POST: APIRoute = async ({ request }) => {
  const limited = rateLimit(`member-login:${clientIp(request)}`, 20, 60_000);
  if (!limited.ok) return fail('操作太频繁，请稍后再试', 429);

  const body = await readJson<{
    username?: string;
    password?: string;
    captchaToken?: string;
    captchaAnswer?: string;
  }>(request);

  if (!verifyCaptcha(String(body.captchaToken || ''), String(body.captchaAnswer || ''))) {
    return fail('验证码错误或已过期，请重新输入', 400, { captcha: true });
  }

  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) return fail('请输入用户名和密码');

  const member = await loginMember(username, password);
  if (!member) return fail('用户名或密码错误', 401);

  return new Response(JSON.stringify({ ok: true, member }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': setMemberCookie(createMemberToken(member)),
    },
  });
};
