import type { APIRoute } from 'astro';
import { clientIp, rateLimit } from '../../../lib/ratelimit';
import { createMemberToken, registerMember, setMemberCookie } from '../../../lib/member';
import { fail, readJson } from '../../../lib/api';

export const POST: APIRoute = async ({ request }) => {
  const limited = rateLimit(`member-register:${clientIp(request)}`, 8, 60_000);
  if (!limited.ok) return fail('操作太频繁，请稍后再试', 429);
  const body = await readJson<{ username?: string; password?: string }>(request);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (username.length < 3 || password.length < 6) return fail('用户名至少 3 位，密码至少 6 位');
  try {
    const member = await registerMember(username, password);
    if (!member) return fail('注册失败');
    return new Response(JSON.stringify({ ok: true, member }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'set-cookie': setMemberCookie(createMemberToken(member)),
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '注册失败');
  }
};
