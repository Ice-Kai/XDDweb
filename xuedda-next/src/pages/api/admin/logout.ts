import type { APIRoute } from 'astro';
import { clearAdminCookie } from '../../../lib/auth';

export const POST: APIRoute = async () => {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': clearAdminCookie(),
    },
  });
};

export const GET = POST;
