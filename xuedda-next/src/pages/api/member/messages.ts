import type { APIRoute } from 'astro';
import { cookieValue } from '../../../lib/auth';
import { ok } from '../../../lib/api';
import { db, appPrefix } from '../../../lib/db';
import { MEMBER_COOKIE, verifyMemberToken } from '../../../lib/member';

function shortDate(value: unknown) {
  const text = String(value || '').trim();
  return text ? text.slice(0, 10) : '';
}

export const GET: APIRoute = async ({ request }) => {
  const memberId = verifyMemberToken(cookieValue(request.headers, MEMBER_COOKIE));
  if (!memberId) return ok({ logged: false, rows: [] });

  const [rows] = await db.query<any[]>(
    `SELECT id,title,reply,replied_at,created_at
     FROM ${appPrefix}feedback
     WHERE member_id = ? AND reply IS NOT NULL AND reply <> ''
     ORDER BY replied_at DESC, id DESC
     LIMIT 30`,
    [memberId],
  );

  return ok({
    logged: true,
    rows: rows.map((row) => ({
      id: Number(row.id),
      title: row.title ? `反馈已回复：${row.title}` : '你的反馈已回复',
      body: String(row.reply || ''),
      date: shortDate(row.replied_at || row.created_at),
      source: 'feedback',
    })),
  });
};
