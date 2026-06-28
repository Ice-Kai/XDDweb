import crypto from 'node:crypto';
import { sessionSecret } from './security';

export type OAuthProvider = 'qq' | 'wechat';

interface OAuthState {
  provider: OAuthProvider;
  next: string;
  exp: number;
}

function sign(payload: string) {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function safeNext(value?: string | null) {
  const next = String(value || '/').trim();
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/api/')) return '/';
  return next;
}

export function createOAuthState(provider: OAuthProvider, next?: string | null) {
  const payload = Buffer.from(JSON.stringify({
    provider,
    next: safeNext(next),
    exp: Date.now() + 10 * 60 * 1000,
  } satisfies OAuthState)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyOAuthState(provider: OAuthProvider, state?: string | null) {
  try {
    if (!state || !state.includes('.')) return null;
    const [payload, sig] = state.split('.');
    const expected = sign(payload);
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState;
    if (data.provider !== provider || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function siteBaseUrl(request: Request) {
  const env = {
    ...import.meta.env,
    ...(typeof process !== 'undefined' ? process.env : {}),
  };
  const configured = String(env.PUBLIC_SITE_URL || env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:4321';
  const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export function providerCallbackUrl(request: Request, provider: OAuthProvider) {
  const env = {
    ...import.meta.env,
    ...(typeof process !== 'undefined' ? process.env : {}),
  };
  const key = provider === 'qq' ? 'QQ_CALLBACK_URL' : 'WECHAT_CALLBACK_URL';
  const configured = String(env[key] || '').trim();
  if (configured) return configured;
  return `${siteBaseUrl(request)}/api/member/oauth/${provider}/callback`;
}

export function redirect(location: string, headers?: HeadersInit) {
  return new Response(null, { status: 302, headers: { ...(headers || {}), location } });
}

export function oauthFailure(provider: OAuthProvider, reason: string) {
  const params = new URLSearchParams({ intro: '1', oauth: `${provider}_${reason}` });
  return `/?${params.toString()}`;
}
