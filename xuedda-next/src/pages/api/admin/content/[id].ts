import type { APIRoute } from 'astro';
import { db } from '../../../../lib/db';
import { fail, ok, readJson } from '../../../../lib/api';

function contentId(value: string | undefined) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function toInt(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function cleanText(value: unknown, max = 255) {
  return String(value ?? '').trim().slice(0, max);
}

function pickContentPayload(body: any) {
  return {
    categoryId: toInt(body.category_id),
    title: cleanText(body.title, 255),
    summary: cleanText(body.summary, 500),
    coverUrl: cleanText(body.cover_url, 500),
    body: cleanText(body.body, 100000),
    keywords: cleanText(body.keywords, 255),
    fileUrl: cleanText(body.file_url, 700),
    extractPass: cleanText(body.extract_pass, 100),
    priceIntegral: toInt(body.price_integral),
    priceMoney: Number(body.price_money || 0),
    justVip: body.just_vip ? 1 : 0,
    isShow: body.is_show == null ? 1 : Number(body.is_show ? 1 : 0),
    isTop: body.is_top ? 1 : 0,
    isRecommend: body.is_recommend ? 1 : 0,
    sort: toInt(body.sort),
    indexTypeId: toInt(body.index_type_id),
    indexThemeId: toInt(body.index_theme_id),
    meta: JSON.stringify({
      file_type: cleanText(body.fileType, 60),
      file_size: cleanText(body.size, 60),
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
       price_integral=?, price_money=?, just_vip=?, is_show=?, is_top=?, is_recommend=?, sort=?,
       index_type_id=?, index_theme_id=?, meta=?, updated_at=NOW()
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
      payload.priceIntegral,
      payload.priceMoney,
      payload.justVip,
      payload.isShow,
      payload.isTop,
      payload.isRecommend,
      payload.sort,
      payload.indexTypeId,
      payload.indexThemeId,
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
