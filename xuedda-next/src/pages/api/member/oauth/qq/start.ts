import type { APIRoute } from 'astro';
import { createOAuthState, oauthFailure, providerCallbackUrl, redirect, safeNext } from '../../../../../lib/oauth';

export const GET: APIRoute = async ({ request, url }) => {
  const appId = process.env.QQ_APP_ID || import.meta.env.QQ_APP_ID;
  if (!appId) return redirect(oauthFailure('qq', 'missing'));

  const callback = providerCallbackUrl(request, 'qq');
  const state = createOAuthState('qq', safeNext(url.searchParams.get('next')));
  const auth = new URL('https://graph.qq.com/oauth2.0/authorize');
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('client_id', String(appId));
  auth.searchParams.set('redirect_uri', callback);
  auth.searchParams.set('state', state);
  auth.searchParams.set('scope', 'get_user_info');
  return redirect(auth.toString());
};
