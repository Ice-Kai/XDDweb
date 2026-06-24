import type { APIRoute } from 'astro';
import { cookieValue } from '../../../lib/auth';
import { getDownloadById } from '../../../lib/content';
import { getMemberById, isVip, MEMBER_COOKIE, verifyMemberToken } from '../../../lib/member';
import { fail, ok } from '../../../lib/api';

export const GET: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  const item = await getDownloadById(id);
  if (!item) return fail('资源不存在', 404);

  const memberId = verifyMemberToken(cookieValue(request.headers, MEMBER_COOKIE));
  const member = memberId ? await getMemberById(memberId) : null;
  if (!member) return fail('请先登录后下载', 401);
  if (item.just_vip && !isVip(member)) return fail('该资源需要 VIP 会员', 403);

  const files = item.files?.length
    ? item.files
    : item.file_url
      ? [{ name: item.title, url: item.file_url, pass: item.pass, fileSize: item.size }]
      : [];

  if (!files.length) return fail('该资源暂未配置下载链接', 404);
  return ok({ item: { id: item.id, title: item.title }, files });
};
