import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { fail, ok, readJson } from '../../../lib/api';

const ORDER_MAP: Record<string, string> = {
  newest: 'c.id DESC',
  oldest: 'c.id ASC',
  sort: 'c.sort DESC,c.id DESC',
  hits: 'c.hits DESC,c.id DESC',
  downloads: 'c.download_num DESC,c.id DESC',
};

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

export const GET: APIRoute = async ({ url }) => {
  const q = cleanText(url.searchParams.get('q'), 120);
  const categoryId = toInt(url.searchParams.get('category_id'));
  const status = cleanText(url.searchParams.get('status') || 'all', 20);
  const orderKey = cleanText(url.searchParams.get('order') || 'newest', 20);
  const page = Math.max(1, toInt(url.searchParams.get('page'), 1));
  const limit = Math.min(100, Math.max(1, toInt(url.searchParams.get('limit'), 20)));

  const where: string[] = [];
  const params: any[] = [];
  if (q) {
    where.push('(c.title LIKE ? OR c.summary LIKE ? OR c.keywords LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (categoryId > 0) {
    where.push('c.category_id = ?');
    params.push(categoryId);
  }
  if (status === 'show') where.push('c.is_show = 1');
  if (status === 'hidden') where.push('c.is_show = 0');
  if (status === 'vip') where.push('c.just_vip = 1');
  if (status === 'recommend') where.push('c.is_recommend = 1');
  if (status === 'top') where.push('c.is_top = 1');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = ORDER_MAP[orderKey] || ORDER_MAP.newest;

  const [rows] = await db.query<any[]>(
    `SELECT
       c.id,c.title,c.category_id,c.summary,c.cover_url,c.file_url,c.extract_pass,
       c.price_integral,c.price_money,c.just_vip,c.is_show,c.is_top,c.is_recommend,
       c.sort,c.index_type_id,c.index_theme_id,c.hits,c.download_num,c.meta,c.created_at,c.updated_at,
       cat.name AS category_name
     FROM xuedda.contents c
     LEFT JOIN legacy.lz_category cat ON cat.id = c.category_id
     ${whereSql}
     ORDER BY ${orderSql}
     LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  const [[total]] = await db.query<any[]>(`SELECT COUNT(*) n FROM xuedda.contents c ${whereSql}`, params);
  return ok({ rows, total: Number(total?.n || 0), page, limit });
};

export const POST: APIRoute = async ({ request }) => {
  const payload = pickContentPayload(await readJson<any>(request));
  if (!payload.title) return fail('标题不能为空');

  const [res] = await db.query<any>(
    `INSERT INTO xuedda.contents
       (type,category_id,title,summary,cover_url,body,keywords,file_url,extract_pass,
        price_integral,price_money,just_vip,is_show,is_top,is_recommend,sort,index_type_id,index_theme_id,meta,created_at,updated_at)
     VALUES
       ('download',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
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
    ],
  );
  return ok({ id: Number(res.insertId) });
};

export const PATCH: APIRoute = async ({ request }) => {
  const body = await readJson<any>(request);
  const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => toInt(id)).filter((id: number) => id > 0) : [];
  if (!ids.length) return fail('请选择资源');

  const placeholders = ids.map(() => '?').join(',');
  if (body.action === 'move') {
    const categoryId = toInt(body.category_id);
    if (!categoryId) return fail('请选择目标栏目');
    await db.query(`UPDATE xuedda.contents SET category_id=?, updated_at=NOW() WHERE id IN (${placeholders})`, [categoryId, ...ids]);
    return ok({ updated: ids.length });
  }

  if (body.action === 'hide') {
    await db.query(`UPDATE xuedda.contents SET is_show=0, updated_at=NOW() WHERE id IN (${placeholders})`, ids);
    return ok({ updated: ids.length });
  }

  if (body.action === 'show') {
    await db.query(`UPDATE xuedda.contents SET is_show=1, updated_at=NOW() WHERE id IN (${placeholders})`, ids);
    return ok({ updated: ids.length });
  }

  return fail('不支持的批量操作');
};
