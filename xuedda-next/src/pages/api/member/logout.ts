import type { APIRoute } from 'astro';
import { clearMemberCookie } from '../../../lib/member';

export const POST: APIRoute = async () => {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'set-cookie': clearMemberCookie(),
    },
  });
};

export const GET: APIRoute = async ({ url }) => {
  const next = url.searchParams.get('next') || '/';
  const location = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return new Response(null, {
    status: 302,
    headers: {
      location,
      'cache-control': 'no-store',
      'set-cookie': clearMemberCookie(),
    },
  });
};
