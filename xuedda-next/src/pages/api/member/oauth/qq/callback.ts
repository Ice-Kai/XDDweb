import type { APIRoute } from 'astro';
import { createMemberToken, setMemberCookie, upsertOAuthMember } from '../../../../../lib/member';
import { oauthFailure, providerCallbackUrl, redirect, verifyOAuthState } from '../../../../../lib/oauth';

type QQToken = { access_token?: string; error?: number; error_description?: string };
type QQMe = { client_id?: string; openid?: string; error?: number; error_description?: string };
type QQUser = { ret?: number; nickname?: string; figureurl_qq_2?: string; figureurl_qq_1?: string; gender?: string; msg?: string };

export const GET: APIRoute = async ({ request, url }) => {
  const appId = String(process.env.QQ_APP_ID || import.meta.env.QQ_APP_ID || '');
  const appKey = String(process.env.QQ_APP_KEY || import.meta.env.QQ_APP_KEY || '');
  const state = verifyOAuthState('qq', url.searchParams.get('state'));
  const code = url.searchParams.get('code');
  if (!appId || !appKey) return redirect(oauthFailure('qq', 'missing'));
  if (!state || !code) return redirect(oauthFailure('qq', 'state'));

  const callback = providerCallbackUrl(request, 'qq');
  const tokenUrl = new URL('https://graph.qq.com/oauth2.0/token');
  tokenUrl.searchParams.set('grant_type', 'authorization_code');
  tokenUrl.searchParams.set('client_id', appId);
  tokenUrl.searchParams.set('client_secret', appKey);
  tokenUrl.searchParams.set('code', code);
  tokenUrl.searchParams.set('redirect_uri', callback);
  tokenUrl.searchParams.set('fmt', 'json');

  const token = await fetch(tokenUrl).then((r) => r.json() as Promise<QQToken>);
  if (!token.access_token) return redirect(oauthFailure('qq', 'token'));

  const meUrl = new URL('https://graph.qq.com/oauth2.0/me');
  meUrl.searchParams.set('access_token', token.access_token);
  meUrl.searchParams.set('fmt', 'json');
  const me = await fetch(meUrl).then((r) => r.json() as Promise<QQMe>);
  if (!me.openid) return redirect(oauthFailure('qq', 'openid'));

  const userUrl = new URL('https://graph.qq.com/user/get_user_info');
  userUrl.searchParams.set('access_token', token.access_token);
  userUrl.searchParams.set('oauth_consumer_key', appId);
  userUrl.searchParams.set('openid', me.openid);
  const user = await fetch(userUrl).then((r) => r.json() as Promise<QQUser>);
  const member = await upsertOAuthMember('qq', {
    openid: me.openid,
    nickname: user.nickname,
    avatar: user.figureurl_qq_2 || user.figureurl_qq_1,
    sex: user.gender,
  });
  if (!member) return redirect(oauthFailure('qq', 'member'));

  return redirect(state.next || '/', {
    'set-cookie': setMemberCookie(createMemberToken(member)),
  });
};
