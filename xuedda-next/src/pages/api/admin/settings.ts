import type { APIRoute } from 'astro';
import { getSetting, setSetting } from '../../../lib/settings';
import { ok, readJson } from '../../../lib/api';

export const GET: APIRoute = async ({ url }) => {
  const key = url.searchParams.get('key') || 'home_hero';
  return ok({ key, value: await getSetting(key, null) });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<any>(request);
  await setSetting(String(body.key), body.value);
  return ok();
};
