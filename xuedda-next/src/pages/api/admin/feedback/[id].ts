import type { APIRoute } from 'astro';
import { db, appPrefix } from '../../../../lib/db';
import { fail, ok, readJson } from '../../../../lib/api';

function feedbackId(value: string | undefined) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = feedbackId(params.id);
  if (!id) return fail('反馈 ID 不正确', 400);

  const body = await readJson<{ reply?: string }>(request);
  const reply = String(body.reply || '').trim().slice(0, 4000);
  if (!reply) return fail('回复内容不能为空');

  await db.query(`UPDATE ${appPrefix}feedback SET reply = ?, replied_at = NOW() WHERE id = ?`, [reply, id]);
  return ok();
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = feedbackId(params.id);
  if (!id) return fail('反馈 ID 不正确', 400);

  await db.query(`UPDATE ${appPrefix}feedback SET reply = NULL, replied_at = NULL WHERE id = ?`, [id]);
  return ok();
};
