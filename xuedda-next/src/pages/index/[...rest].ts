import type { APIRoute } from 'astro';
import { getRootCategory, SECTION_SLUG_BY_ID } from '../../lib/content';

export const prerender = false;

const PREFIX_FALLBACK: Record<string, string> = {
  download: 'model',
  article: 'news',
  course: 'video',
  picture: 'texture',
  mp4: 'video',
  question: 'qa',
};

function redirect(location: string, status = 301) {
  return new Response(null, { status, headers: { Location: location } });
}

async function categoryTarget(source: string, id: number) {
  if (!Number.isInteger(id) || id <= 0) return '/';
  const root = await getRootCategory(id);
  const slug = root.slug || SECTION_SLUG_BY_ID[root.id] || PREFIX_FALLBACK[source] || 'model';
  return `/c/${slug}?category=${id}`;
}

export const GET: APIRoute = async ({ params, request }) => {
  const rest = String(params.rest || '').replace(/^\/+/, '');
  const path = `/index/${rest}`;
  const url = new URL(request.url);

  const detail = path.match(/^\/index\/(?:download|article|course|picture|mp4|question)\/show\/id\/(\d+)\.html$/i);
  if (detail) return redirect(`/d/${detail[1]}`);

  const list = path.match(/^\/index\/(download|article|course|picture|mp4|question)\/lists\/category_id\/(\d+)\.html$/i);
  if (list) return redirect(await categoryTarget(list[1].toLowerCase(), Number(list[2])));

  const category = path.match(/^\/index\/(download|article|course|picture|mp4|question)\/category\/id\/(\d+)\.html$/i);
  if (category) return redirect(await categoryTarget(category[1].toLowerCase(), Number(category[2])));

  const idParam = Number(url.searchParams.get('id') || url.searchParams.get('data_id') || 0);
  if (path.includes('/show') && Number.isInteger(idParam) && idParam > 0) {
    return redirect(`/d/${idParam}`);
  }

  return redirect('/');
};
