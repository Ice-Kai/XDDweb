import type { APIRoute } from 'astro';
import { db, legacyPrefix, appPrefix } from '../../../lib/db';
import { ok } from '../../../lib/api';

export const GET: APIRoute = async ({ url }) => {
  const q = String(url.searchParams.get('q') || '').trim();
  const status = String(url.searchParams.get('status') || 'all');
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)));

  const clauses: string[] = [];
  const params: any[] = [];
  if (q) {
    clauses.push('(f.title LIKE ? OR f.content LIKE ? OR f.reply LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status === 'open') clauses.push('(f.reply IS NULL OR f.reply = "")');
  if (status === 'replied') clauses.push('(f.reply IS NOT NULL AND f.reply <> "")');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const [rows] = await db.query<any[]>(
     `SELECT
       f.id,f.member_id,f.title,f.content,f.reply,f.replied_at,f.created_at,
       m.user_name AS member_username,
       m.nickname AS member_nickname
     FROM ${appPrefix}feedback f
     LEFT JOIN ${legacyPrefix}lz_member m ON m.id = f.member_id
     ${where}
     ORDER BY f.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  const [[total]] = await db.query<any[]>(`SELECT COUNT(*) n FROM ${appPrefix}feedback f ${where}`, params);
  return ok({ rows, total: Number(total?.n || 0), page, limit });
};
