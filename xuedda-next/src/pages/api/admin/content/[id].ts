import type { APIRoute } from 'astro';
import { db, legacyPrefix, appPrefix } from '../../../../lib/db';
import { fail, ok, readJson } from '../../../../lib/api';
import { logAction } from '../../../../lib/adminlog';

function contentId(value: string | undefined) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

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

function normalizeFormat(value: unknown) {
  const raw = cleanText(value, 60).toUpperCase();
  if (['SU', 'SKP'].includes(raw)) return 'SU';
  if (['MAX', '3DSMAX', '3D MAX', '3DS MAX'].includes(raw)) return 'MAX';
  if (['PSD', 'PS', 'PHOTOSHOP'].includes(raw)) return 'PSD';
  if (['D5', 'COURSE', 'VIDEO'].includes(raw)) return 'D5';
  if (['CAD', 'DWG', 'AUTOCAD'].includes(raw)) return 'CAD';
  if (['TEXT', 'COPY', 'PROMPT'].includes(raw)) return 'TEXT';
  return raw || 'SU';
}

function defaultFileType(format: string) {
  if (format === 'MAX') return 'MAX 模型';
  if (format === 'PSD') return 'PSD 素材';
  if (format === 'TEXT') return '文本参考';
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

export const GET: APIRoute = async ({ params }) => {
  const id = contentId(params.id);
  if (!id) return fail('资源 ID 不正确', 400);

  const [rows] = await db.query<any[]>(
    `SELECT c.*, cat.name AS category_name
     FROM ${appPrefix}contents c
     LEFT JOIN ${legacyPrefix}lz_category cat ON cat.id = c.category_id
     WHERE c.id = ?
     LIMIT 1`,
    [id],
  );
  if (!rows[0]) return fail('内容不存在', 404);
  return ok({ content: rows[0] });
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const id = contentId(params.id);
  if (!id) return fail('资源 ID 不正确', 400);

  const payload = pickContentPayload(await readJson<any>(request));
  if (!payload.title) return fail('标题不能为空');
  if (!payload.categoryId) return fail('请选择所属栏目');
  if (!payload.fileUrl) return fail('请填写下载链接');

  await db.query(
    `UPDATE ${appPrefix}contents SET
       category_id=?, title=?, summary=?, cover_url=?, body=?, keywords=?, file_url=?, extract_pass=?,
       price_integral=?, price_money=?, just_vip=?, is_show=?, is_top=?, is_recommend=?, sort=?,
       index_type_id=?, index_theme_id=?, meta=?, updated_at=NOW()
     WHERE id=?`,
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
      id,
    ],
  );
  await logAction({ admin: (locals as any).admin?.name, action: 'update', targetType: 'content', targetId: id, title: payload.title, detail: await contentLogDetail(payload) });
  return ok();
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const id = contentId(params.id);
  if (!id) return fail('资源 ID 不正确', 400);
  await db.query(`UPDATE ${appPrefix}contents SET is_show = 0, updated_at = NOW() WHERE id = ?`, [id]);
  await logAction({ admin: (locals as any).admin?.name, action: 'hide', targetType: 'content', targetId: id, title: `资源 #${id}`, detail: '单条资源已隐藏' });
  return ok();
};
