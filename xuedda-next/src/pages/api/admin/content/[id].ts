import type { APIRoute } from 'astro';
import { db } from '../../../../lib/db';
import { fail, ok, readJson } from '../../../../lib/api';

export const GET: APIRoute = async ({ params }) => {
  const [rows] = await db.query<any[]>('SELECT * FROM xuedda.contents WHERE id = ? LIMIT 1', [Number(params.id)]);
  if (!rows[0]) return fail('内容不存在', 404);
  return ok({ content: rows[0] });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const body = await readJson<any>(request);
  const meta = JSON.stringify({ file_type: body.fileType || '', file_size: body.size || '' });
  await db.query(
    `UPDATE xuedda.contents SET
      category_id=?, title=?, summary=?, cover_url=?, body=?, keywords=?, file_url=?, extract_pass=?,
      price_money=?, just_vip=?, is_show=?, meta=?
     WHERE id=?`,
    [
      Number(body.category_id || 0),
      String(body.title || ''),
      String(body.summary || ''),
      String(body.cover_url || ''),
      String(body.body || ''),
      String(body.keywords || ''),
      String(body.file_url || ''),
      String(body.extract_pass || ''),
      Number(body.price_money || 0),
      Number(body.just_vip || 0),
      body.is_show == null ? 1 : Number(body.is_show),
      meta,
      Number(params.id),
    ],
  );
  return ok();
};

export const DELETE: APIRoute = async ({ params }) => {
  await db.query('UPDATE xuedda.contents SET is_show = 0 WHERE id = ?', [Number(params.id)]);
  return ok();
};
