import type { APIRoute } from 'astro';
import { createOAuthState, oauthFailure, providerCallbackUrl, redirect, safeNext } from '../../../../../lib/oauth';

export const GET: APIRoute = async ({ request, url }) => {
  const appId = process.env.WECHAT_APP_ID || import.meta.env.WECHAT_APP_ID;
  if (!appId) return redirect(oauthFailure('wechat', 'missing'));

  const callback = providerCallbackUrl(request, 'wechat');
  const state = createOAuthState('wechat', safeNext(url.searchParams.get('next')));
  const auth = new URL('https://open.weixin.qq.com/connect/qrconnect');
  auth.searchParams.set('appid', String(appId));
  auth.searchParams.set('redirect_uri', callback);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', 'snsapi_login');
  auth.searchParams.set('state', state);
  return redirect(`${auth.toString()}#wechat_redirect`);
};
