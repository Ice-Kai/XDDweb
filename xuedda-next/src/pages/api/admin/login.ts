import type { APIRoute } from 'astro';
import { createAdminToken, loginAdmin, setAdminCookie } from '../../../lib/auth';
import { clientIp, rateLimit } from '../../../lib/ratelimit';
import { fail, readJson } from '../../../lib/api';

export const POST: APIRoute = async ({ request }) => {
  const limited = rateLimit(`admin-login:${clientIp(request)}`, 12, 60_000);
  if (!limited.ok) return fail('操作太频繁，请稍后再试', 429);

  const body = await readJson<{ username?: string; password?: string }>(request);
  const admin = await loginAdmin(String(body.username || '').trim(), String(body.password || ''));
  if (!admin) return fail('账号或密码错误', 401);

  return new Response(JSON.stringify({ ok: true, admin }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': setAdminCookie(createAdminToken(admin)),
    },
  });
};
