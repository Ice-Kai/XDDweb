import type { APIRoute } from 'astro';
import { db } from '../../../../lib/db';
import { fail, ok, readJson } from '../../../../lib/api';

function contentId(value: string | undefined) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function pickContentPayload(body: any) {
  return {
    categoryId: Number(body.category_id || 0),
    title: String(body.title || '').trim().slice(0, 255),
    summary: String(body.summary || '').trim().slice(0, 500),
    coverUrl: String(body.cover_url || '').trim().slice(0, 500),
    body: String(body.body || '').trim(),
    keywords: String(body.keywords || '').trim().slice(0, 255),
    fileUrl: String(body.file_url || '').trim().slice(0, 700),
    extractPass: String(body.extract_pass || '').trim().slice(0, 100),
    priceMoney: Number(body.price_money || 0),
    justVip: body.just_vip ? 1 : 0,
    isShow: body.is_show == null ? 1 : Number(body.is_show ? 1 : 0),
    meta: JSON.stringify({
      file_type: String(body.fileType || '').trim().slice(0, 60),
      file_size: String(body.size || '').trim().slice(0, 60),
    }),
  };
}

export const GET: APIRoute = async ({ params }) => {
  const id = contentId(params.id);
  if (!id) return fail('资源 ID 不正确', 400);

  const [rows] = await db.query<any[]>(
    `SELECT c.*, cat.name AS category_name
     FROM xuedda.contents c
     LEFT JOIN legacy.lz_category cat ON cat.id = c.category_id
     WHERE c.id = ?
     LIMIT 1`,
    [id],
  );
  if (!rows[0]) return fail('内容不存在', 404);
  return ok({ content: rows[0] });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = contentId(params.id);
  if (!id) return fail('资源 ID 不正确', 400);

  const payload = pickContentPayload(await readJson<any>(request));
  if (!payload.title) return fail('标题不能为空');

  await db.query(
    `UPDATE xuedda.contents SET
       category_id=?, title=?, summary=?, cover_url=?, body=?, keywords=?, file_url=?, extract_pass=?,
       price_money=?, just_vip=?, is_show=?, meta=?, updated_at=NOW()
     WHERE id=?`,
    [
      payload.categoryId,
      payload.title,
      payload.summary,
      payload.coverUrl,
      payload.body,
      payload.keywords,
      payload.fileUrl,
      payload.extractPass,
      payload.priceMoney,
      payload.justVip,
      payload.isShow,
      payload.meta,
      id,
    ],
  );
  return ok();
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = contentId(params.id);
  if (!id) return fail('资源 ID 不正确', 400);
  await db.query('UPDATE xuedda.contents SET is_show = 0, updated_at = NOW() WHERE id = ?', [id]);
  return ok();
};
