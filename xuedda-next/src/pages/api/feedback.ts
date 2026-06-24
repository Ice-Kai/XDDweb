import type { APIRoute } from 'astro';
import { cookieValue } from '../../lib/auth';
import { fail, ok, readJson } from '../../lib/api';
import { db } from '../../lib/db';
import { MEMBER_COOKIE, verifyMemberToken } from '../../lib/member';
import { clientIp, rateLimit } from '../../lib/ratelimit';

export const POST: APIRoute = async ({ request }) => {
  const limited = rateLimit(`feedback:${clientIp(request)}`, 6, 60_000);
  if (!limited.ok) return fail('提交太频繁，请稍后再试', 429);

  const body = await readJson<{ title?: string; content?: string }>(request);
  const title = String(body.title || '').trim().slice(0, 120);
  const content = String(body.content || '').trim().slice(0, 4000);
  if (!title || !content) return fail('请填写标题和内容');

  const memberId = verifyMemberToken(cookieValue(request.headers, MEMBER_COOKIE));
  await db.query('INSERT INTO xuedda.feedback (member_id,title,content,created_at) VALUES (?,?,?,NOW())', [memberId || 0, title, content]);
  return ok();
};
