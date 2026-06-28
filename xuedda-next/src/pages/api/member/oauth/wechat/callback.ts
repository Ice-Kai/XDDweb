import type { APIRoute } from 'astro';
import { createMemberToken, setMemberCookie, upsertOAuthMember } from '../../../../../lib/member';
import { oauthFailure, redirect, verifyOAuthState } from '../../../../../lib/oauth';

type WechatToken = { access_token?: string; openid?: string; errcode?: number; errmsg?: string };
type WechatUser = { nickname?: string; headimgurl?: string; sex?: number; errcode?: number; errmsg?: string };

export const GET: APIRoute = async ({ url }) => {
  const appId = String(process.env.WECHAT_APP_ID || import.meta.env.WECHAT_APP_ID || '');
  const secret = String(process.env.WECHAT_APP_SECRET || import.meta.env.WECHAT_APP_SECRET || '');
  const state = verifyOAuthState('wechat', url.searchParams.get('state'));
  const code = url.searchParams.get('code');
  if (!appId || !secret) return redirect(oauthFailure('wechat', 'missing'));
  if (!state || !code) return redirect(oauthFailure('wechat', 'state'));

  const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
  tokenUrl.searchParams.set('appid', appId);
  tokenUrl.searchParams.set('secret', secret);
  tokenUrl.searchParams.set('code', code);
  tokenUrl.searchParams.set('grant_type', 'authorization_code');
  const token = await fetch(tokenUrl).then((r) => r.json() as Promise<WechatToken>);
  if (!token.access_token || !token.openid) return redirect(oauthFailure('wechat', 'token'));

  const userUrl = new URL('https://api.weixin.qq.com/sns/userinfo');
  userUrl.searchParams.set('access_token', token.access_token);
  userUrl.searchParams.set('openid', token.openid);
  userUrl.searchParams.set('lang', 'zh_CN');
  const user = await fetch(userUrl).then((r) => r.json() as Promise<WechatUser>);
  const member = await upsertOAuthMember('wechat', {
    openid: token.openid,
    nickname: user.nickname,
    avatar: user.headimgurl,
    sex: user.sex,
  });
  if (!member) return redirect(oauthFailure('wechat', 'member'));

  return redirect(state.next || '/', {
    'set-cookie': setMemberCookie(createMemberToken(member)),
  });
};
