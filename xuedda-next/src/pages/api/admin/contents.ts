import type { APIRoute } from 'astro';
import { db, legacyPrefix, appPrefix } from '../../../lib/db';
import { fail, ok, readJson } from '../../../lib/api';
import { logAction } from '../../../lib/adminlog';

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

function normalizePath(value: unknown, max = 700) {
  const text = cleanText(value, max).replace(/\\/g, '/');
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  return text.replace(/^public\//i, '').replace(/^\/?/, '/');
}

function normalizeFormat(value: unknown, fallback = 'SU') {
  const raw = cleanText(value, 60).toUpperCase();
  if (['SU', 'SKP'].includes(raw)) return 'SU';
  if (['MAX', '3DSMAX', '3D MAX', '3DS MAX'].includes(raw)) return 'MAX';
  if (['PSD', 'PS', 'PHOTOSHOP'].includes(raw)) return 'PSD';
  if (['D5', 'COURSE', 'VIDEO'].includes(raw)) return 'D5';
  if (['CAD', 'DWG', 'AUTOCAD'].includes(raw)) return 'CAD';
  if (['TEXT', 'COPY', 'PROMPT'].includes(raw)) return 'TEXT';
  return raw || fallback;
}

function defaultFileType(format: string) {
  if (format === 'MAX') return 'MAX 模型';
  if (format === 'PSD') return 'PSD 素材';
  if (format === 'TEXT') return '文案参考';
  if (format === 'D5') return 'D5 教程';
  if (format === 'CAD') return 'CAD 图纸';
  return 'SKP 模型';
}

function normalizeAssetKind(value: unknown, format: string) {
  if (format === 'PSD') return 'texture';
  if (format === 'TEXT') return 'text';
  if (format === 'D5') return 'tutorial';
  if (format === 'CAD') return 'software';
  const raw = cleanText(value, 60);
  return ['model', 'texture', 'software', 'tutorial', 'text', 'article'].includes(raw) ? raw : 'model';
}

function pickContentPayload(body: any) {
  const modelFormat = normalizeFormat(body.modelFormat ?? body.model_format);
  const assetKind = normalizeAssetKind(body.assetKind ?? body.asset_kind, modelFormat);
  const fileType = cleanText(body.fileType ?? body.file_type, 60) || defaultFileType(modelFormat);
  return {
    categoryId: toInt(body.category_id),
    title: cleanText(body.title, 255),
    summary: cleanText(body.summary, 500),
    coverUrl: normalizePath(body.cover_url, 500),
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
      asset_kind: assetKind,
      model_format: modelFormat,
      file_type: fileType,
      file_size: cleanText(body.size, 60),
      hide_extract_pass: (body.hideExtractPass ?? body.hide_extract_pass) ? 1 : 0,
    }),
  };
}

async function categoryPath(categoryId: number) {
  const names: string[] = [];
  let cursor = Number(categoryId || 0);
  let guard = 0;
  while (cursor > 0 && guard++ < 12) {
    const [rows] = await db.query<any[]>(`SELECT id,parent_id,name FROM ${legacyPrefix}lz_category WHERE id = ? LIMIT 1`, [cursor]);
    const row = rows[0];
    if (!row) break;
    names.unshift(String(row.name || `栏目 ${cursor}`));
    cursor = Number(row.parent_id || 0);
  }
  return names.join(' / ');
}

function payloadMeta(payload: ReturnType<typeof pickContentPayload>) {
  try {
    return JSON.parse(payload.meta || '{}') as Record<string, any>;
  } catch {
    return {};
  }
}

async function contentLogDetail(payload: ReturnType<typeof pickContentPayload>) {
  const meta = payloadMeta(payload);
  const path = await categoryPath(payload.categoryId);
  return [
    path ? `栏目：${path}` : `栏目：${payload.categoryId}`,
    meta.model_format ? `类型：${meta.model_format}` : '',
    meta.file_type ? `文件：${meta.file_type}` : '',
    meta.file_size ? `大小：${meta.file_size}` : '',
    payload.coverUrl ? '封面已填' : '无封面',
    payload.fileUrl ? '链接已填' : '无链接',
  ].filter(Boolean).join(' · ');
}

export const GET: APIRoute = async ({ url }) => {
  const q = cleanText(url.searchParams.get('q'), 120);
  const categoryId = toInt(url.searchParams.get('category_id'));
  const status = cleanText(url.searchParams.get('status') || 'all', 20);
  const orderKey = cleanText(url.searchParams.get('order') || 'newest', 20);
  const page = Math.max(1, toInt(url.searchParams.get('page'), 1));
  const limit = Math.min(100, Math.max(1, toInt(url.searchParams.get('limit'), 20)));

  const field = cleanText(url.searchParams.get('field') || 'all', 12); // all|title|summary|keywords
  const format = normalizeFormat(url.searchParams.get('format') || '', '');   // 模型格式 SU/MAX/D5/CAD/TEXT/OTHER

  const where: string[] = [];
  const params: any[] = [];
  if (q) {
    const like = `%${q}%`;
    if (field === 'title') { where.push('c.title LIKE ?'); params.push(like); }
    else if (field === 'summary') { where.push('c.summary LIKE ?'); params.push(like); }
    else if (field === 'keywords') { where.push('c.keywords LIKE ?'); params.push(like); }
    else { where.push('(c.title LIKE ? OR c.summary LIKE ? OR c.keywords LIKE ?)'); params.push(like, like, like); }
  }
  if (format) {
    where.push("JSON_VALID(c.meta) = 1 AND UPPER(JSON_UNQUOTE(JSON_EXTRACT(c.meta, '$.model_format'))) = ?");
    params.push(format);
  }
  if (categoryId > 0) {
    // 含所有子孙栏目：资源大多挂在叶子栏目上，选父栏目要能看到其下全部资源
    const [cats] = await db.query<any[]>(`SELECT id, parent_id FROM ${legacyPrefix}lz_category`);
    const childrenOf = new Map<number, number[]>();
    for (const r of cats) {
      const p = Number(r.parent_id) || 0;
      (childrenOf.get(p) || childrenOf.set(p, []).get(p))!.push(Number(r.id));
    }
    const ids = [categoryId];
    const queue = [categoryId];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const ch of childrenOf.get(cur) || []) { ids.push(ch); queue.push(ch); }
    }
    where.push(`c.category_id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
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
     FROM ${appPrefix}contents c
     LEFT JOIN ${legacyPrefix}lz_category cat ON cat.id = c.category_id
     ${whereSql}
     ORDER BY ${orderSql}
     LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  const [[total]] = await db.query<any[]>(`SELECT COUNT(*) n FROM ${appPrefix}contents c ${whereSql}`, params);
  return ok({ rows, total: Number(total?.n || 0), page, limit });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const payload = pickContentPayload(await readJson<any>(request));
  if (!payload.title) return fail('标题不能为空');
  if (!payload.categoryId) return fail('请选择所属栏目');
  if (!payload.fileUrl) return fail('请填写下载链接');

  const [res] = await db.query<any>(
    `INSERT INTO ${appPrefix}contents
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
  await logAction({ admin: (locals as any).admin?.name, action: 'create', targetType: 'content', targetId: Number(res.insertId), title: payload.title, detail: await contentLogDetail(payload) });
  return ok({ id: Number(res.insertId) });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const body = await readJson<any>(request);
  const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => toInt(id)).filter((id: number) => id > 0) : [];
  if (!ids.length) return fail('请选择资源');

  const placeholders = ids.map(() => '?').join(',');
  if (body.action === 'move') {
    const categoryId = toInt(body.category_id);
    if (!categoryId) return fail('请选择目标栏目');
    await db.query(`UPDATE ${appPrefix}contents SET category_id=?, updated_at=NOW() WHERE id IN (${placeholders})`, [categoryId, ...ids]);
    await logAction({ admin: (locals as any).admin?.name, action: 'move', targetType: 'content', title: `批量移动 ${ids.length} 条资源`, detail: `目标栏目：${await categoryPath(categoryId) || categoryId}` });
    return ok({ updated: ids.length });
  }

  if (body.action === 'hide') {
    await db.query(`UPDATE ${appPrefix}contents SET is_show=0, updated_at=NOW() WHERE id IN (${placeholders})`, ids);
    await logAction({ admin: (locals as any).admin?.name, action: 'hide', targetType: 'content', title: `批量隐藏 ${ids.length} 条资源`, detail: `资源 ID：${ids.slice(0, 20).join(', ')}${ids.length > 20 ? '...' : ''}` });
    return ok({ updated: ids.length });
  }

  if (body.action === 'show') {
    await db.query(`UPDATE ${appPrefix}contents SET is_show=1, updated_at=NOW() WHERE id IN (${placeholders})`, ids);
    await logAction({ admin: (locals as any).admin?.name, action: 'show', targetType: 'content', title: `批量显示 ${ids.length} 条资源`, detail: `资源 ID：${ids.slice(0, 20).join(', ')}${ids.length > 20 ? '...' : ''}` });
    return ok({ updated: ids.length });
  }

  if (body.action === 'type') {
    const modelFormat = normalizeFormat(body.model_format ?? body.modelFormat, '');
    if (!modelFormat) return fail('请选择目标素材类型');
    const assetKind = normalizeAssetKind(body.asset_kind ?? body.assetKind, modelFormat);
    const fileType = cleanText(body.file_type ?? body.fileType, 60) || defaultFileType(modelFormat);
    await db.query(
      `UPDATE ${appPrefix}contents
       SET meta = JSON_SET(
             CASE WHEN JSON_VALID(meta) THEN meta ELSE JSON_OBJECT() END,
             '$.asset_kind', ?,
             '$.model_format', ?,
             '$.file_type', ?
           ),
           updated_at=NOW()
       WHERE id IN (${placeholders})`,
      [assetKind, modelFormat, fileType, ...ids],
    );
    await logAction({ admin: (locals as any).admin?.name, action: 'batch', targetType: 'content', title: `批量改类型 ${ids.length} 条资源`, detail: `类型：${modelFormat} / ${fileType}；资源 ID：${ids.slice(0, 20).join(', ')}${ids.length > 20 ? '...' : ''}` });
    return ok({ updated: ids.length, model_format: modelFormat, asset_kind: assetKind, file_type: fileType });
  }

  if (body.action === 'delete') {
    await db.query(`DELETE FROM ${appPrefix}contents WHERE id IN (${placeholders})`, ids);
    await logAction({ admin: (locals as any).admin?.name, action: 'delete', targetType: 'content', title: `批量删除 ${ids.length} 条资源`, detail: `资源 ID：${ids.slice(0, 20).join(', ')}${ids.length > 20 ? '...' : ''}` });
    return ok({ deleted: ids.length });
  }

  return fail('不支持的批量操作');
};
