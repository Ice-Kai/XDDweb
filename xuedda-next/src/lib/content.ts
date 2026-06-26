import { db } from './db';

export interface DownloadItem {
  id: number;
  title: string;
  cover: string;
  file_url: string;
  hits: number;
  download_num: number;
  money: number;
  just_vip: number;
  category_id: number;
  created_at: string;
  pass: string;
  hidePass?: boolean;
  size?: string;
  summary?: string;
  fileType?: string;
  description?: string;
  content?: string;
  autofill?: boolean;
  files?: Array<{ name?: string; url: string; pass?: string; fileSize?: string; provider?: string }>;
}

export interface CatNode {
  id: number;
  name: string;
  children: CatNode[];
  count?: number;
}

export const TOP_CATEGORY = {
  model: 107,
  texture: 91,
  software: 88,
  video: 89,
  news: 2,
  qa: 44,
  other: 339,
} as const;

export const SECTIONS: Record<string, { id: number; name: string; en: string; type: 'download' | 'course' | 'article' }> = {
  model: { id: 107, name: '模型', en: 'SU MODEL', type: 'download' },
  texture: { id: 91, name: '灯光和贴图', en: 'MATERIAL', type: 'download' },
  software: { id: 88, name: '软件和参数', en: 'SOFTWARE', type: 'download' },
  video: { id: 89, name: '视频教程', en: 'COURSE', type: 'course' },
  other: { id: 339, name: '其他相关', en: 'OTHERS', type: 'download' },
  news: { id: 2, name: '网站公告', en: 'NEWS', type: 'article' },
  qa: { id: 44, name: '问答整理', en: 'Q&A', type: 'article' },
};

export const SECTION_SLUG_BY_ID: Record<number, string> = {
  107: 'model',
  91: 'texture',
  88: 'software',
  89: 'video',
  44: 'qa',
  2: 'news',
  339: 'other',
};

export const MODEL_GROUPS: { key: string; name: string; ids: number[] }[] = [
  { key: 'arch', name: '建筑', ids: [108, 342, 348, 349, 288] },
  { key: 'landscape', name: '景观', ids: [252, 125, 112, 109, 113] },
  { key: 'interior', name: '室内', ids: [115, 203, 204, 205, 258, 208, 280, 287, 261, 354, 356, 361, 362, 363, 355, 357, 358, 359, 364, 365, 207, 110, 111, 114] },
];

export const MAX_GROUPS: { key: string; name: string; ids: number[] }[] = [
  { key: 'soft', name: '软件', ids: [212, 237, 222, 229, 95, 232, 219, 101, 215, 226, 319] },
  { key: 'render', name: '渲染器', ids: [229, 95, 319] },
  { key: 'plugin', name: '插件', ids: [237] },
  { key: 'model', name: '模型', ids: [212] },
];

export function modelGroupByKey(key: string) {
  return MODEL_GROUPS.find((g) => g.key === key);
}

export function maxGroupByKey(key: string) {
  return MAX_GROUPS.find((g) => g.key === key);
}

export interface DownloadQuery {
  categoryId?: number;
  categoryIds?: number[];
  rootCategoryId?: number;
  assetKind?: string;
  modelFormat?: string;
  excludeModelFormat?: string;
  q?: string;
  sort?: 'newest' | 'popular' | 'downloads';
  limit?: number;
  offset?: number;
}

type ContentRow = Record<string, any>;

function parseMeta(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, any>;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function normalFileType(row: ContentRow, meta: Record<string, any>) {
  const type = String(meta.file_type || meta.fileType || '').trim();
  if (type) return type;
  const title = String(row.title || '').toLowerCase();
  const modelFormat = String(meta.model_format || meta.modelFormat || '').toUpperCase();
  if (modelFormat === 'PSD' || title.includes('psd')) return 'PSD 素材';
  if (title.includes('max') || row.category_id === 212) return 'MAX 模型';
  if (title.includes('hdr')) return 'HDR 贴图';
  if (title.includes('pbr')) return 'PBR 贴图';
  if ([88, 237, 222, 229, 95, 232, 219, 101, 215, 226, 319].includes(Number(row.category_id))) return '软件 · 参数';
  if ([91, 122, 294, 293, 140, 306, 295, 296, 340].includes(Number(row.category_id))) return '贴图素材';
  if ([89, 124, 150, 336, 128, 299, 300, 118, 120, 301].includes(Number(row.category_id))) return '视频教程';
  return 'SKP 模型';
}

function normalSize(meta: Record<string, any>) {
  const value = meta.file_size || meta.fileSize || meta.size || meta.files?.[0]?.fileSize || meta.files?.[0]?.size || '';
  return value ? String(value) : '';
}

function toDownload(row: ContentRow): DownloadItem {
  const meta = parseMeta(row.meta);
  return {
    id: Number(row.id),
    title: String(row.title || ''),
    cover: String(row.cover_url || ''),
    file_url: String(row.file_url || ''),
    hits: Number(row.hits || 0),
    download_num: Number(row.download_num || 0),
    money: Number(row.price_money || 0),
    just_vip: Number(row.just_vip || 0),
    category_id: Number(row.category_id || 0),
    created_at: row.created_at ? String(row.created_at).slice(0, 10) : '',
    pass: String(row.extract_pass || ''),
    hidePass: Boolean(meta.hide_extract_pass || meta.hideExtractPass),
    size: normalSize(meta),
    summary: String(row.summary || ''),
    description: String(row.summary || ''),
    content: String(row.body || ''),
    fileType: normalFileType(row, meta),
    autofill: true,
    files: Array.isArray(meta.files) ? meta.files : undefined,
  };
}

export async function getDescendantIds(rootId: number): Promise<number[]> {
  const seen = new Set<number>();
  let frontier = [Number(rootId)];
  while (frontier.length) {
    const ids = frontier.filter((id) => Number.isInteger(id) && !seen.has(id));
    if (!ids.length) break;
    ids.forEach((id) => seen.add(id));
    const [rows] = await db.query<any[]>(
      `SELECT id FROM legacy.lz_category WHERE parent_id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    frontier = rows.map((r) => Number(r.id));
  }
  return [...seen];
}

export async function getCategoryTree(rootId: number): Promise<CatNode[]> {
  const [rows] = await db.query<any[]>(
    'SELECT id,parent_id,name FROM legacy.lz_category WHERE parent_id = ? ORDER BY sort ASC, id ASC',
    [rootId],
  );
  const out: CatNode[] = [];
  for (const row of rows) {
    out.push({ id: Number(row.id), name: String(row.name || ''), children: await getCategoryTree(Number(row.id)) });
  }
  return out;
}

function orderBy(sort?: DownloadQuery['sort']) {
  if (sort === 'popular') return 'hits DESC, id DESC';
  if (sort === 'downloads') return 'download_num DESC, id DESC';
  return 'created_at DESC, id DESC';
}

async function buildWhere(opts: DownloadQuery) {
  const where = ['is_show = 1'];
  const params: any[] = [];

  let ids: number[] = [];
  if (opts.categoryIds?.length) ids = opts.categoryIds.map(Number).filter(Number.isInteger);
  else if (opts.categoryId) ids = await getDescendantIds(Number(opts.categoryId));
  else if (opts.rootCategoryId) ids = await getDescendantIds(Number(opts.rootCategoryId));
  if (ids.length) {
    where.push(`category_id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }

  if (opts.assetKind) {
    where.push("JSON_VALID(meta) AND JSON_UNQUOTE(JSON_EXTRACT(meta, '$.asset_kind')) = ?");
    params.push(opts.assetKind);
  }

  if (opts.modelFormat) {
    where.push("JSON_VALID(meta) AND JSON_UNQUOTE(JSON_EXTRACT(meta, '$.model_format')) = ?");
    params.push(opts.modelFormat);
  }

  if (opts.excludeModelFormat) {
    where.push("(NOT JSON_VALID(meta) OR JSON_UNQUOTE(JSON_EXTRACT(meta, '$.model_format')) IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(meta, '$.model_format')) <> ?)");
    params.push(opts.excludeModelFormat);
  }

  const terms = String(opts.q || '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
  for (const term of terms) {
    where.push('(title LIKE ? OR summary LIKE ? OR keywords LIKE ?)');
    const like = `%${term}%`;
    params.push(like, like, like);
  }

  return { sql: where.join(' AND '), params };
}

export async function getDownloads(opts: DownloadQuery = {}) {
  const limit = Math.max(1, Math.min(80, Number(opts.limit || 24)));
  const offset = Math.max(0, Number(opts.offset || 0));
  const where = await buildWhere(opts);
  const [rows] = await db.query<any[]>(
    `SELECT * FROM xuedda.contents WHERE ${where.sql} ORDER BY ${orderBy(opts.sort)} LIMIT ? OFFSET ?`,
    [...where.params, limit, offset],
  );
  return rows.map(toDownload);
}

export async function countDownloads(opts: DownloadQuery = {}) {
  const where = await buildWhere(opts);
  const [[row]] = await db.query<any[]>(`SELECT COUNT(*) n FROM xuedda.contents WHERE ${where.sql}`, where.params);
  return Number(row?.n || 0);
}

export async function getLatestDownloads(opts: { rootCategoryId?: number; limit?: number } = {}) {
  return getDownloads({ rootCategoryId: opts.rootCategoryId, limit: opts.limit ?? 5, sort: 'newest' });
}

export async function getHotDownloads(limit = 8) {
  return getDownloads({ limit, sort: 'popular' });
}

export async function getSiteStats() {
  const [[resources]] = await db.query<any[]>('SELECT COUNT(*) n FROM xuedda.contents WHERE is_show = 1');
  const [[today]] = await db.query<any[]>('SELECT COUNT(*) n FROM xuedda.contents WHERE DATE(created_at)=CURDATE() AND is_show = 1');
  const [[categories]] = await db.query<any[]>('SELECT COUNT(*) n FROM legacy.lz_category');
  const [[members]] = await db.query<any[]>('SELECT COUNT(*) n FROM legacy.lz_member');
  const [[feedback]] = await db.query<any[]>('SELECT COUNT(*) n FROM xuedda.feedback');
  return {
    resources: Number(resources?.n || 0),
    today: Number(today?.n || 0),
    categories: Number(categories?.n || 0),
    members: Number(members?.n || 0),
    feedback: Number(feedback?.n || 0),
  };
}

export async function getDownloadById(id: number) {
  if (!Number.isInteger(Number(id))) return null;
  const [rows] = await db.query<any[]>('SELECT * FROM xuedda.contents WHERE id = ? AND is_show = 1 LIMIT 1', [id]);
  return rows[0] ? toDownload(rows[0]) : null;
}

export async function recordMemberDownload(memberId: number, item: Pick<DownloadItem, 'id' | 'title'>) {
  const id = Number(item.id);
  const uid = Number(memberId);
  if (!Number.isInteger(id) || !Number.isInteger(uid) || id <= 0 || uid <= 0) return;
  await db.query(
    'INSERT INTO xuedda.logs (kind,member_id,content_type,content_id,remark,created_at) VALUES (?,?,?,?,?,NOW())',
    ['download', uid, 'download', id, String(item.title || '').slice(0, 255)],
  );
  await db.query('UPDATE xuedda.contents SET download_num = download_num + 1 WHERE id = ?', [id]);
}

export async function getMemberDownloadLogs(memberId: number, limit = 20) {
  const uid = Number(memberId);
  if (!Number.isInteger(uid) || uid <= 0) return [];
  const cappedLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const [rows] = await db.query<any[]>(
    `SELECT
       l.id,
       l.content_id,
       l.remark,
       l.created_at,
       c.title,
       c.cover_url,
       c.meta
     FROM xuedda.logs l
     LEFT JOIN xuedda.contents c ON c.id = l.content_id
     WHERE l.kind = 'download' AND l.member_id = ?
     ORDER BY l.id DESC
     LIMIT ?`,
    [uid, cappedLimit],
  );
  return rows.map((row) => {
    const meta = parseMeta(row.meta);
    return {
      id: Number(row.id),
      contentId: Number(row.content_id || 0),
      title: String(row.title || row.remark || '资源已下架'),
      cover: coverUrl(String(row.cover_url || '')),
      fileType: normalFileType(row, meta),
      fileSize: normalSize(meta),
      downloadedAt: row.created_at ? String(row.created_at).slice(0, 19).replace('T', ' ') : '',
      available: Boolean(row.title),
    };
  });
}

export async function getRelated(categoryId: number, excludeId: number, limit = 6) {
  const items = await getDownloads({ categoryId, limit: limit + 1 });
  return items.filter((it) => it.id !== excludeId).slice(0, limit);
}

export function sectionByCategoryId(id: number) {
  return Object.values(SECTIONS).find((s) => s.id === id);
}

export async function getRootCategory(id: number) {
  let cur = Number(id);
  for (let i = 0; i < 8; i++) {
    const [[row]] = await db.query<any[]>('SELECT id,parent_id,name FROM legacy.lz_category WHERE id = ? LIMIT 1', [cur]);
    if (!row) break;
    if (Number(row.parent_id) === 0) {
      return { id: Number(row.id), name: String(row.name || ''), slug: SECTION_SLUG_BY_ID[Number(row.id)] || '' };
    }
    cur = Number(row.parent_id);
  }
  return { id, name: await getCategoryName(id), slug: SECTION_SLUG_BY_ID[id] || '' };
}

export async function getCategoryName(id: number) {
  const [[row]] = await db.query<any[]>('SELECT name FROM legacy.lz_category WHERE id = ? LIMIT 1', [id]);
  return row?.name ? String(row.name) : '';
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|form|base)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|form|base)\b[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/((?:href|src)\s*=\s*)("|')\s*javascript:[^"']*\2/gi, '$1$2#$2');
}

export function coverUrl(cover: string): string {
  if (!cover) return '';
  if (/^https?:\/\//i.test(cover)) return cover;
  return cover.startsWith('/') ? cover : `/${cover}`;
}
