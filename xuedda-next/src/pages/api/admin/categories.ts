import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { fail, ok, readJson } from '../../../lib/api';

const CONTENT_TYPES = new Set(['download', 'article', 'picture', 'link', 'video', 'mp4', 'question', 'course', 'page']);

const MODEL_BY_TYPE: Record<string, number> = {
  page: 1,
  article: 2,
  picture: 3,
  link: 4,
  download: 5,
  video: 6,
  mp4: 7,
  question: 8,
  course: 9,
};

function toPositiveInt(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function toInt(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toSort(value: unknown, fallback = 20) {
  return Math.max(0, Math.min(255, toInt(value, fallback)));
}

function cleanText(value: unknown, max = 255) {
  return String(value ?? '').trim().slice(0, max);
}

function contentTypeToModelId(type: unknown) {
  const contentType = cleanText(type || 'download', 20);
  return MODEL_BY_TYPE[CONTENT_TYPES.has(contentType) ? contentType : 'download'];
}

export const GET: APIRoute = async () => {
  const [rows] = await db.query<any[]>(
    `SELECT
       c.id,c.parent_id,c.model_id,c.name,c.image_url,c.description,c.is_menu,c.sort,
       c.meta_keywords,c.meta_description,c.url,c.is_cover,
       m.name AS model_name,m.tablename AS content_type,
       (SELECT COUNT(*) FROM legacy.lz_category child WHERE child.parent_id = c.id) AS child_count,
       (SELECT COUNT(*) FROM xuedda.contents x WHERE x.category_id = c.id) AS content_count
     FROM legacy.lz_category c
     LEFT JOIN legacy.lz_model m ON m.id = c.model_id
     ORDER BY c.parent_id ASC,c.sort ASC,c.id ASC`,
  );
  return ok({ rows });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<any>(request);
  const name = cleanText(body.name, 100);
  if (!name) return fail('栏目名称不能为空');

  const parentId = toInt(body.parent_id);
  const modelId = body.model_id != null ? toInt(body.model_id, 5) : contentTypeToModelId(body.content_type);

  const [res] = await db.query<any>(
    `INSERT INTO legacy.lz_category
       (parent_id,model_id,name,image_url,description,is_menu,sort,meta_keywords,meta_description,index_template,list_template,show_template,url,is_cover)
     VALUES
       (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      parentId,
      modelId,
      name,
      cleanText(body.image_url || body.cover_url, 500),
      cleanText(body.description, 500),
      body.is_menu == null ? 1 : Number(body.is_menu ? 1 : 0),
      toSort(body.sort),
      cleanText(body.keywords || body.meta_keywords, 255),
      cleanText(body.meta_description, 500),
      cleanText(body.index_template, 100),
      cleanText(body.list_template, 100),
      cleanText(body.show_template, 100),
      cleanText(body.url || body.slug, 200),
      body.is_cover == null ? 1 : Number(body.is_cover ? 1 : 0),
    ],
  );
  return ok({ id: Number(res.insertId) });
};

export const PATCH: APIRoute = async ({ request }) => {
  const body = await readJson<any>(request);

  if (Array.isArray(body.sorts)) {
    const values = body.sorts
      .map((item: any) => [toSort(item.sort), toPositiveInt(item.id)])
      .filter((item: number[]) => item[1] > 0);
    for (const [sort, id] of values) {
      await db.query('UPDATE legacy.lz_category SET sort = ? WHERE id = ?', [sort, id]);
    }
    return ok({ updated: values.length });
  }

  const id = toPositiveInt(body.id);
  if (!id) return fail('栏目 ID 不正确', 400);
  const name = cleanText(body.name, 100);
  if (!name) return fail('栏目名称不能为空');

  const parentId = toInt(body.parent_id);
  if (parentId === id) return fail('上级栏目不能是自己');

  if (parentId > 0) {
    const [children] = await db.query<any[]>('SELECT id,parent_id FROM legacy.lz_category');
    let cursor = parentId;
    const parentMap = new Map(children.map((row) => [Number(row.id), Number(row.parent_id)]));
    while (cursor > 0) {
      if (cursor === id) return fail('上级栏目不能是当前栏目的下级栏目');
      cursor = parentMap.get(cursor) || 0;
    }
  }

  await db.query(
    `UPDATE legacy.lz_category SET
       parent_id=?, model_id=?, name=?, image_url=?, description=?, is_menu=?, sort=?,
       meta_keywords=?, meta_description=?, url=?, is_cover=?
     WHERE id=?`,
    [
      parentId,
      body.model_id != null ? toInt(body.model_id, 5) : contentTypeToModelId(body.content_type),
      name,
      cleanText(body.image_url || body.cover_url, 500),
      cleanText(body.description, 500),
      body.is_menu == null ? 1 : Number(body.is_menu ? 1 : 0),
      toSort(body.sort),
      cleanText(body.keywords || body.meta_keywords, 255),
      cleanText(body.meta_description, 500),
      cleanText(body.url || body.slug, 200),
      body.is_cover == null ? 1 : Number(body.is_cover ? 1 : 0),
      id,
    ],
  );
  return ok();
};

export const DELETE: APIRoute = async ({ request }) => {
  const body = await readJson<any>(request);
  const id = toPositiveInt(body.id);
  if (!id) return fail('栏目 ID 不正确', 400);

  const [[child]] = await db.query<any[]>('SELECT COUNT(*) n FROM legacy.lz_category WHERE parent_id = ?', [id]);
  if (Number(child?.n || 0) > 0) return fail('请先删除或移动该栏目下的子栏目');

  const [[content]] = await db.query<any[]>('SELECT COUNT(*) n FROM xuedda.contents WHERE category_id = ?', [id]);
  if (Number(content?.n || 0) > 0) return fail(`该栏目下还有 ${content.n} 条资源，请先移动或删除资源`);

  await db.query('DELETE FROM legacy.lz_category WHERE id = ?', [id]);
  return ok();
};
