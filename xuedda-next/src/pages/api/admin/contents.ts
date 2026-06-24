import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { fail, ok, readJson } from '../../../lib/api';

function pickContentPayload(body: any) {
  const title = String(body.title || '').trim().slice(0, 255);
  const meta = JSON.stringify({
    file_type: String(body.fileType || '').trim().slice(0, 60),
    file_size: String(body.size || '').trim().slice(0, 60),
  });

  return {
    categoryId: Number(body.category_id || 0),
    title,
    summary: String(body.summary || '').trim().slice(0, 500),
    coverUrl: String(body.cover_url || '').trim().slice(0, 500),
    body: String(body.body || '').trim(),
    keywords: String(body.keywords || '').trim().slice(0, 255),
    fileUrl: String(body.file_url || '').trim().slice(0, 700),
    extractPass: String(body.extract_pass || '').trim().slice(0, 100),
    priceMoney: Number(body.price_money || 0),
    justVip: body.just_vip ? 1 : 0,
    isShow: body.is_show == null ? 1 : Number(body.is_show ? 1 : 0),
    meta,
  };
}

export const GET: APIRoute = async ({ url }) => {
  const q = String(url.searchParams.get('q') || '').trim();
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)));
  const where = q ? 'WHERE c.title LIKE ? OR c.summary LIKE ? OR c.keywords LIKE ?' : '';
  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];

  const [rows] = await db.query<any[]>(
    `SELECT
       c.id,c.title,c.category_id,c.summary,c.cover_url,c.file_url,c.extract_pass,c.price_money,
       c.just_vip,c.is_show,c.hits,c.download_num,c.meta,c.created_at,c.updated_at,
       cat.name AS category_name
     FROM xuedda.contents c
     LEFT JOIN legacy.lz_category cat ON cat.id = c.category_id
     ${where}
     ORDER BY c.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  const [[total]] = await db.query<any[]>(`SELECT COUNT(*) n FROM xuedda.contents c ${where}`, params);
  return ok({ rows, total: Number(total?.n || 0), page, limit });
};

export const POST: APIRoute = async ({ request }) => {
  const payload = pickContentPayload(await readJson<any>(request));
  if (!payload.title) return fail('标题不能为空');

  const [res] = await db.query<any>(
    `INSERT INTO xuedda.contents
       (type,category_id,title,summary,cover_url,body,keywords,file_url,extract_pass,price_money,just_vip,is_show,meta,created_at,updated_at)
     VALUES
       ('download',?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
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
    ],
  );
  return ok({ id: Number(res.insertId) });
};
