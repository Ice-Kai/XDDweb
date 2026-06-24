import type { APIRoute } from 'astro';
import { clearMemberCookie } from '../../../lib/member';
import { ok } from '../../../lib/api';

export const POST: APIRoute = async () => {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': clearMemberCookie(),
    },
  });
};
