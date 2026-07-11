import type { APIRoute } from 'astro';
import { fail, ok, readJson } from '../../../lib/api';
import { verifyCaptcha } from '../../../lib/captcha';
import { logAction } from '../../../lib/adminlog';
import { appPrefix, db } from '../../../lib/db';
import { findMemberForPasswordReset } from '../../../lib/member';
import { clientIp, rateLimit } from '../../../lib/ratelimit';

function ticketNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const tail = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FP-${y}${m}${day}-${tail}`;
}

function clean(value: unknown, max = 120) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

export const POST: APIRoute = async ({ request }) => {
  const ip = clientIp(request);
  const limited = rateLimit(`member-forgot:${ip}`, 5, 60 * 60 * 1000);
  if (!limited.ok) return fail('操作太频繁，请稍后再试', 429);

  const body = await readJson<{
    username?: string;
    contact?: string;
    captchaToken?: string;
    captchaAnswer?: string;
  }>(request);

  if (!verifyCaptcha(String(body.captchaToken || ''), String(body.captchaAnswer || ''))) {
    return fail('验证码错误或已过期，请重新输入', 400, { captcha: true });
  }

  const username = clean(body.username, 120);
  const contact = clean(body.contact, 160);
  if (username.length < 3) return fail('请输入要找回的用户名或邮箱');
  if (contact.length < 5) return fail('请留下手机、邮箱或微信，方便核验');

  const ticket = ticketNo();
  const member = await findMemberForPasswordReset(username);
  const memberId = member?.id || 0;
  const title = `找回密码申请 ${ticket}`;
  const content = [
    `申请编号：${ticket}`,
    `账号线索：${username}`,
    `联系方式：${contact}`,
    `匹配结果：${member ? `会员ID ${member.id} / ${member.username || member.email || '未命名'}` : '未匹配到账号'}`,
    `来源 IP：${ip}`,
    '',
    '处理建议：管理员核验联系方式与账号归属后，再人工重置密码或联系用户补充信息。',
  ].join('\n');

  await db.query(
    `INSERT INTO ${appPrefix}feedback (member_id,title,content,created_at) VALUES (?,?,?,NOW())`,
    [memberId, title, content],
  );

  await logAction({
    admin: 'system',
    action: 'password-reset',
    targetType: 'member',
    targetId: memberId,
    title,
    detail: `账号线索：${username}；联系方式：${contact}；IP：${ip}；${member ? `匹配会员ID ${member.id}` : '未匹配账号'}`,
  });

  // Always return success to avoid exposing whether an account exists.
  return ok({
    ticket,
    message: '申请已提交。请保存编号并扫码联系客服，管理员核验后会协助处理。',
  });
};
