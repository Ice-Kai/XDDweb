import type { APIRoute } from 'astro';
import { db } from '../../../../lib/db';
import { ok, fail, readJson } from '../../../../lib/api';

// User detail: member record + download history + login time.
export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!id) return fail('用户不存在', 404);

  const [rows] = await db.query<any[]>(
    `SELECT id, user_name, email, nickname, level, integral, exp_time, create_time, update_time,
            last_login_time, all_sign_num, last_sign_num, user_type
     FROM legacy.lz_member WHERE id = ? LIMIT 1`,
    [id],
  );
  const user = rows[0];
  if (!user) return fail('用户不存在', 404);

  // Download history (legacy log). Best-effort resolve title from old lz_download.
  const [logs] = await db.query<any[]>(
    `SELECT l.data_id, l.model, l.create_time, d.title
     FROM legacy.lz_download_log l
     LEFT JOIN legacy.lz_download d ON d.id = l.data_id
     WHERE l.member_id = ?
     ORDER BY l.create_time DESC LIMIT 100`,
    [id],
  );

  return ok({ user, logs });
};

// Update points / membership. Only specific fields, single row — never bulk.
export const PATCH: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (!id) return fail('用户不存在', 404);

  const body = await readJson<{ integral?: unknown; level?: unknown; exp_time?: unknown }>(request);
  const fields: string[] = [];
  const vals: any[] = [];
  if (body.integral !== undefined) { fields.push('integral = ?'); vals.push(Math.max(0, Math.trunc(Number(body.integral) || 0))); }
  if (body.level !== undefined) { fields.push('level = ?'); vals.push(Math.max(0, Math.min(3, Math.trunc(Number(body.level) || 0)))); }
  if (body.exp_time !== undefined) { fields.push('exp_time = ?'); vals.push(Math.max(0, Math.trunc(Number(body.exp_time) || 0))); }
  if (!fields.length) return fail('没有要更新的字段', 400);

  vals.push(id);
  await db.query(`UPDATE legacy.lz_member SET ${fields.join(', ')}, update_time = NOW() WHERE id = ? LIMIT 1`, vals);
  return ok({ id });
};
