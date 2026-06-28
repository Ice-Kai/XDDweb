import type { APIRoute } from 'astro';
import { fail, ok, readJson } from '../../../lib/api';
import { verifyCaptcha } from '../../../lib/captcha';
import { logAction } from '../../../lib/adminlog';
import { findMemberForPasswordReset } from '../../../lib/member';
import { clientIp, rateLimit } from '../../../lib/ratelimit';

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

  const username = String(body.username || '').trim();
  const contact = String(body.contact || '').trim();
  if (username.length < 3) return fail('请输入要找回的用户名或邮箱');
  if (contact.length < 5) return fail('请留下手机号、邮箱或微信，方便核验');

  const member = await findMemberForPasswordReset(username);
  await logAction({
    admin: 'system',
    action: 'password-reset',
    targetType: 'member',
    targetId: member?.id || 0,
    title: member ? `找回密码申请：${member.username || username}` : `找回密码申请：${username}`,
    detail: `联系信息：${contact}；IP：${ip}；匹配：${member ? `会员ID ${member.id}` : '未匹配账号'}`,
  });

  // Always return success to avoid exposing whether an account exists.
  return ok({
    message: '申请已提交。如果账号信息匹配，管理员核验后会联系你处理。',
  });
};
