import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { ok } from '../../../lib/api';

// User list / search over the shared legacy.lz_member table (read-only here).
export const GET: APIRoute = async ({ url }) => {
  const q = String(url.searchParams.get('q') || '').trim();
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)));
  // 日期筛选：date=YYYY-MM-DD，field=login(默认,按最后登录)|register(按注册)
  const date = String(url.searchParams.get('date') || '').trim();
  const field = url.searchParams.get('field') === 'register' ? 'create_time' : 'last_login_time';

  const clauses: string[] = [];
  const params: any[] = [];
  if (q) {
    clauses.push('(user_name LIKE ? OR email LIKE ? OR nickname LIKE ? OR id = ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, Number(q) || 0);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    // 范围查询（走索引），含当日 00:00 ~ 次日 00:00
    clauses.push(`(${field} >= ? AND ${field} < DATE_ADD(?, INTERVAL 1 DAY))`);
    params.push(date, date);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const [[cnt]] = await db.query<any[]>(`SELECT COUNT(*) n FROM legacy.lz_member ${where}`, params);
  const [rows] = await db.query<any[]>(
    `SELECT id, user_name, email, nickname, level, integral, exp_time, create_time, last_login_time, user_type
     FROM legacy.lz_member ${where}
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );

  return ok({ rows, total: Number(cnt?.n || 0), page, limit });
};
