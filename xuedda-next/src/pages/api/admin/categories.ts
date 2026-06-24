import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { ok } from '../../../lib/api';

export const GET: APIRoute = async () => {
  const [rows] = await db.query<any[]>('SELECT id,parent_id,name FROM legacy.lz_category ORDER BY parent_id,sort,id');
  return ok({ rows });
};
