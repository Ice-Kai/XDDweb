import type { APIRoute } from 'astro';
import { cookieValue } from '../../../lib/auth';
import { fail, ok } from '../../../lib/api';
import { getMemberDownloadLogs } from '../../../lib/content';
import { MEMBER_COOKIE, verifyMemberToken } from '../../../lib/member';
import { clientIp, rateLimit } from '../../../lib/ratelimit';

export const GET: APIRoute = async ({ request, url }) => {
  const limited = rateLimit(`member-downloads:${clientIp(request)}`, 60, 60_000);
  if (!limited.ok) return fail('操作太频繁，请稍后再试', 429);

  const memberId = verifyMemberToken(cookieValue(request.headers, MEMBER_COOKIE));
  if (!memberId) return fail('请先登录', 401);

  const limit = Number(url.searchParams.get('limit') || 20);
  const rows = await getMemberDownloadLogs(memberId, limit);
  return ok({ rows });
};
