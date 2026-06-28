import type { APIRoute } from 'astro';
import { db, appPrefix } from '../lib/db';
import { SECTIONS } from '../lib/content';

export const prerender = false;

const SITE = 'https://www.xuedda.com';

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function url(loc: string, lastmod?: string) {
  const cleanLoc = loc.startsWith('http') ? loc : `${SITE}${loc}`;
  const mod = lastmod ? `<lastmod>${esc(lastmod.slice(0, 10))}</lastmod>` : '';
  return `<url><loc>${esc(cleanLoc)}</loc>${mod}</url>`;
}

export const GET: APIRoute = async () => {
  const staticUrls = [
    '/',
    '/c/model',
    '/c/texture',
    '/c/software',
    '/c/video',
    '/member/login',
    '/member/register',
    '/feedback',
  ];
  const sectionUrls = Object.keys(SECTIONS).map((slug) => `/c/${slug}`);
  const [rows] = await db.query<any[]>(
    `SELECT id, updated_at, created_at
     FROM ${appPrefix}contents
     WHERE is_show = 1
     ORDER BY updated_at DESC, id DESC
     LIMIT 5000`,
  );

  const seen = new Set<string>();
  const entries: string[] = [];
  for (const loc of [...staticUrls, ...sectionUrls]) {
    if (seen.has(loc)) continue;
    seen.add(loc);
    entries.push(url(loc));
  }
  for (const row of rows) {
    const loc = `/d/${Number(row.id)}`;
    if (seen.has(loc)) continue;
    seen.add(loc);
    entries.push(url(loc, row.updated_at || row.created_at));
  }

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>`, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800',
    },
  });
};
