import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { fail, ok, readJson } from '../../../lib/api';

export const GET: APIRoute = async ({ url }) => {
  const q = String(url.searchParams.get('q') || '').trim();
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)));
  const where = q ? 'WHERE title LIKE ? OR summary LIKE ?' : '';
  const params = q ? [`%${q}%`, `%${q}%`] : [];
  const [rows] = await db.query<any[]>(
    `SELECT id,title,category_id,cover_url,price_money,just_vip,is_show,created_at FROM xuedda.contents ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  const [[total]] = await db.query<any[]>(`SELECT COUNT(*) n FROM xuedda.contents ${where}`, params);
  return ok({ rows, total: Number(total?.n || 0), page, limit });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<any>(request);
  const title = String(body.title || '').trim();
  if (!title) return fail('标题不能为空');
  const meta = JSON.stringify({ file_type: body.fileType || '', file_size: body.size || '' });
  const [res] = await db.query<any>(
    `INSERT INTO xuedda.contents
     (type,category_id,title,summary,cover_url,body,keywords,file_url,extract_pass,price_money,just_vip,is_show,meta,created_at)
     VALUES ('download',?,?,?,?,?,?,?,?,?,?,?, ?, NOW())`,
    [
      Number(body.category_id || 0),
      title,
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
    ],
  );
  return ok({ id: Number(res.insertId) });
};
