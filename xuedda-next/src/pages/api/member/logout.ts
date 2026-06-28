import type { APIRoute } from 'astro';
import { clearMemberCookies } from '../../../lib/member';

function logoutHeaders(request: Request, next?: string) {
  const headers = new Headers({
    'cache-control': 'no-store',
  });
  if (next) headers.set('location', next);
  const host = request.headers.get('host');
  for (const cookie of clearMemberCookies(host)) headers.append('set-cookie', cookie);
  return headers;
}

export const POST: APIRoute = async ({ request }) => {
  const headers = logoutHeaders(request);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify({ ok: true }), { headers });
};

export const GET: APIRoute = async ({ request, url }) => {
  const next = url.searchParams.get('next') || '/';
  const location = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return new Response(null, {
    status: 302,
    headers: logoutHeaders(request, location),
  });
};
