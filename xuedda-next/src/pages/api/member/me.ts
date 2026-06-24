import type { APIRoute } from 'astro';
import { cookieValue } from '../../../lib/auth';
import { getMemberById, isVip, MEMBER_COOKIE, verifyMemberToken } from '../../../lib/member';
import { ok } from '../../../lib/api';

export const GET: APIRoute = async ({ request }) => {
  const id = verifyMemberToken(cookieValue(request.headers, MEMBER_COOKIE));
  const member = id ? await getMemberById(id) : null;
  return ok({ member, isVip: isVip(member) });
};
