import { db, legacyPrefix, appPrefix } from './db';

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
  isMenu?: boolean;
  sort?: number;
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
  texture: { id: 91, name: '平面素材', en: 'GRAPHIC MATERIAL', type: 'download' },
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

export const SOFTWARE_GROUPS = [
  { key: 'modeling', name: '建模软件' },
  { key: 'renderer', name: '渲染器' },
  { key: 'graphic', name: '平面软件' },
  { key: 'other', name: '其他软件' },
] as const;

export type SoftwareGroupKey = typeof SOFTWARE_GROUPS[number]['key'];

const SOFTWARE_GENERIC_LABELS = new Set([
  '软件',
  '插件',
  '参数',
  '模板',
  '渲染器',
  '材质',
  '教程',
  '素材',
  '资产库',
  '材质资产库',
  '快捷键模板',
]);

function softwareGroupForText(raw: string): SoftwareGroupKey {
  const text = String(raw || '').toLowerCase().replace(/\s+/g, '');
  if (/(vray|v-ray|vary|enscape|lumion|corona|d5|renderer|render|渲染|渲染器)/i.test(text)) return 'renderer';
  if (/(adobe|photoshop|ps|illustrator|indesign|cdr|coreldraw|office|ppt|excel|word|平面|后期|图像|图片|排版)/i.test(text)) return 'graphic';
  if (/(sketchup|sketch|su|cad|autocad|天正|rhino|revit|3ds|max|3dmax|c4d|cinema|maya|blender|layout|建模|模型)/i.test(text)) return 'modeling';
  return 'other';
}

function explicitSoftwareGroupKey(name: string): SoftwareGroupKey | null {
  const text = String(name || '').toLowerCase().replace(/\s+/g, '');
  if (/(建模软件|寤烘ā杞欢)/.test(text)) return 'modeling';
  if (/^(渲染器|娓叉煋鍣?)$/.test(text)) return 'renderer';
  if (/(平面软件|骞抽潰杞欢)/.test(text)) return 'graphic';
  if (/(其他软件|鍏朵粬杞欢)/.test(text)) return 'other';
  return null;
}

export function groupSoftwareCategories(tree: CatNode[]) {
  const explicit = new Map<SoftwareGroupKey, CatNode>();
  for (const node of tree || []) {
    if (!node || node.isMenu === false) continue;
    const key = explicitSoftwareGroupKey(node.name);
    if (key && !explicit.has(key)) explicit.set(key, node);
  }
  if (explicit.size) {
    return SOFTWARE_GROUPS.map((group) => {
      const node = explicit.get(group.key);
      return {
        ...group,
        children: (node?.children || []).filter((child) => child.isMenu !== false),
      };
    }).filter((group) => group.children.length);
  }

  const buckets = new Map<SoftwareGroupKey, CatNode[]>(
    SOFTWARE_GROUPS.map((group) => [group.key, []]),
  );
  const seen = new Set<number>();

  const add = (key: SoftwareGroupKey, node: CatNode) => {
    const id = Number(node.id);
    if (!Number.isFinite(id) || seen.has(id) || node.isMenu === false) return;
    seen.add(id);
    buckets.get(key)?.push(node);
  };

  const walk = (nodes: CatNode[], parents: CatNode[] = []) => {
    for (const node of nodes || []) {
      if (!node || node.isMenu === false) continue;
      const children = (node.children || []).filter((child) => child.isMenu !== false);
      const name = String(node.name || '').trim();
      const fullPath = [...parents.map((item) => item.name), name].join(' ');
      const byName = softwareGroupForText(name);
      const byPath = softwareGroupForText(fullPath);
      const key = byName !== 'other' ? byName : byPath;
      const isTop = parents.length === 0;
      const isGenericLeaf = parents.length > 0 && !children.length && SOFTWARE_GENERIC_LABELS.has(name.toLowerCase());
      const isSpecific = byName !== 'other' || byPath !== 'other';

      if (!isGenericLeaf && (isTop || children.length > 0 || isSpecific)) add(key, node);
      walk(children, [...parents, node]);
    }
  };

  walk(tree);

  return SOFTWARE_GROUPS.map((group) => ({
    ...group,
    children: buckets.get(group.key) || [],
  })).filter((group) => group.children.length);
}

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
  assetKinds?: string[];
  modelFormat?: string;
  includeUnformatted?: boolean;
  excludeModelFormat?: string;
  q?: string;
  sort?: 'newest' | 'popular' | 'downloads';
  limit?: number;
  offset?: number;
}

type ContentRow = Record<string, any>;

function isMissingCategoryTable(error: unknown) {
  const anyErr = error as { code?: string; message?: string };
  return anyErr?.code === 'ER_NO_SUCH_TABLE' && String(anyErr.message || '').includes('lz_category');
}

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
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  const match = compact.match(/^(\d+(?:\.\d+)?)(KB|MB|GB|K|M|G)?$/);
  if (!match) return raw.replace(/\b(kb|mb|gb)\b/gi, (unit) => unit.toUpperCase());
  const unitMap: Record<string, string> = { K: 'KB', M: 'MB', G: 'GB', KB: 'KB', MB: 'MB', GB: 'GB' };
  return `${match[1]} ${unitMap[match[2] || 'MB']}`;
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
    let rows: any[] = [];
    try {
      [rows] = await db.query<any[]>(
        `SELECT id FROM ${legacyPrefix}lz_category WHERE parent_id IN (${ids.map(() => '?').join(',')})`,
        ids,
      );
    } catch (error) {
      if (isMissingCategoryTable(error)) return [...seen];
      throw error;
    }
    frontier = rows.map((r) => Number(r.id));
  }
  return [...seen];
}

export async function getCategoryTree(rootId: number): Promise<CatNode[]> {
  let rows: any[] = [];
  try {
    [rows] = await db.query<any[]>(
      `SELECT id,parent_id,name,is_menu,sort FROM ${legacyPrefix}lz_category WHERE parent_id = ? ORDER BY sort ASC, id ASC`,
      [rootId],
    );
  } catch (error) {
    if (isMissingCategoryTable(error)) return [];
    throw error;
  }
  const out: CatNode[] = [];
  for (const row of rows) {
    out.push({
      id: Number(row.id),
      name: String(row.name || ''),
      isMenu: Number(row.is_menu ?? 1) !== 0,
      sort: Number(row.sort || 0),
      children: await getCategoryTree(Number(row.id)),
    });
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
    where.push("JSON_VALID(meta) = 1 AND JSON_UNQUOTE(JSON_EXTRACT(meta, '$.asset_kind')) = ?");
    params.push(opts.assetKind);
  }
  if (opts.assetKinds?.length) {
    const kinds = opts.assetKinds.map((item) => String(item || '').trim()).filter(Boolean);
    if (kinds.length) {
      where.push(`JSON_VALID(meta) = 1 AND JSON_UNQUOTE(JSON_EXTRACT(meta, '$.asset_kind')) IN (${kinds.map(() => '?').join(',')})`);
      params.push(...kinds);
    }
  }

  if (opts.modelFormat) {
    const modelFormat = String(opts.modelFormat).toUpperCase();
    if (opts.includeUnformatted) {
      where.push(`(
        (JSON_VALID(meta) = 1 AND UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(meta, '$.model_format')), '')) = ?)
        OR meta IS NULL
        OR CAST(meta AS CHAR) = ''
        OR JSON_VALID(meta) = 0
        OR (JSON_VALID(meta) = 1 AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(meta, '$.model_format')), '') = '')
      )`);
    } else {
      where.push("JSON_VALID(meta) = 1 AND UPPER(JSON_UNQUOTE(JSON_EXTRACT(meta, '$.model_format'))) = ?");
    }
    params.push(modelFormat);
  }

  if (opts.excludeModelFormat) {
    where.push("(meta IS NULL OR CAST(meta AS CHAR) = '' OR JSON_VALID(meta) = 0 OR UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(meta, '$.model_format')), '')) <> ?)");
    params.push(String(opts.excludeModelFormat).toUpperCase());
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
    `SELECT * FROM ${appPrefix}contents WHERE ${where.sql} ORDER BY ${orderBy(opts.sort)} LIMIT ? OFFSET ?`,
    [...where.params, limit, offset],
  );
  return rows.map(toDownload);
}

export async function countDownloads(opts: DownloadQuery = {}) {
  const where = await buildWhere(opts);
  const [[row]] = await db.query<any[]>(`SELECT COUNT(*) n FROM ${appPrefix}contents WHERE ${where.sql}`, where.params);
  return Number(row?.n || 0);
}

export async function getLatestDownloads(opts: { rootCategoryId?: number; limit?: number } = {}) {
  return getDownloads({ rootCategoryId: opts.rootCategoryId, limit: opts.limit ?? 5, sort: 'newest' });
}

export async function getHotDownloads(limit = 8) {
  return getDownloads({ limit, sort: 'popular' });
}

export async function getSiteStats() {
  const [[resources]] = await db.query<any[]>(`SELECT COUNT(*) n FROM ${appPrefix}contents WHERE is_show = 1`);
  const [[today]] = await db.query<any[]>(`SELECT COUNT(*) n FROM ${appPrefix}contents WHERE DATE(created_at)=CURDATE() AND is_show = 1`);
  let categoryCount = 0;
  try {
    const [[categories]] = await db.query<any[]>(`SELECT COUNT(*) n FROM ${legacyPrefix}lz_category`);
    categoryCount = Number(categories?.n || 0);
  } catch (error) {
    if (!isMissingCategoryTable(error)) throw error;
  }
  const [[members]] = await db.query<any[]>(`SELECT COUNT(*) n FROM ${legacyPrefix}lz_member`);
  const [[feedback]] = await db.query<any[]>(`SELECT COUNT(*) n FROM ${appPrefix}feedback`);
  return {
    resources: Number(resources?.n || 0),
    today: Number(today?.n || 0),
    categories: categoryCount,
    members: Number(members?.n || 0),
    feedback: Number(feedback?.n || 0),
  };
}

export async function getDownloadById(id: number) {
  if (!Number.isInteger(Number(id))) return null;
  const [rows] = await db.query<any[]>(`SELECT * FROM ${appPrefix}contents WHERE id = ? AND is_show = 1 LIMIT 1`, [id]);
  return rows[0] ? toDownload(rows[0]) : null;
}

export const DAILY_DOWNLOAD_LIMIT = 30;

export async function getMemberDailyDownloadCount(memberId: number) {
  const uid = Number(memberId);
  if (!Number.isInteger(uid) || uid <= 0) return 0;
  const [[usage]] = await db.query<any[]>(
    `SELECT COUNT(DISTINCT content_id) AS n
     FROM ${appPrefix}logs
     WHERE kind = 'download'
       AND member_id = ?
       AND created_at >= CURDATE()
       AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
    [uid],
  );
  return Math.max(0, Number(usage?.n || 0));
}

export async function getMemberDailyDownloadUsage(memberId: number, contentId: number) {
  const uid = Number(memberId);
  const id = Number(contentId);
  if (!Number.isInteger(uid) || uid <= 0 || !Number.isInteger(id) || id <= 0) {
    return { count: 0, alreadyDownloaded: false, limit: DAILY_DOWNLOAD_LIMIT };
  }
  const [[usage]] = await db.query<any[]>(
    `SELECT
       COUNT(DISTINCT content_id) AS n,
       MAX(CASE WHEN content_id = ? THEN 1 ELSE 0 END) AS already
     FROM ${appPrefix}logs
     WHERE kind = 'download'
       AND member_id = ?
       AND created_at >= CURDATE()
       AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
    [id, uid],
  );
  return {
    count: Number(usage?.n || 0),
    alreadyDownloaded: Boolean(Number(usage?.already || 0)),
    limit: DAILY_DOWNLOAD_LIMIT,
  };
}

export async function recordMemberDownload(memberId: number, item: Pick<DownloadItem, 'id' | 'title'>, alreadyChecked = false) {
  const id = Number(item.id);
  const uid = Number(memberId);
  if (!Number.isInteger(id) || !Number.isInteger(uid) || id <= 0 || uid <= 0) return;
  if (!alreadyChecked) {
    const usage = await getMemberDailyDownloadUsage(uid, id);
    if (usage.alreadyDownloaded) return;
  }
  const [res] = await db.query<any>(
    `INSERT INTO ${appPrefix}logs (kind,member_id,content_type,content_id,remark,created_at)
     SELECT ?,?,?,?,?,NOW()
     FROM DUAL
     WHERE NOT EXISTS (
       SELECT 1
       FROM ${appPrefix}logs
       WHERE kind = 'download'
         AND member_id = ?
         AND content_id = ?
         AND created_at >= CURDATE()
         AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
       LIMIT 1
     )`,
    ['download', uid, 'download', id, String(item.title || '').slice(0, 255), uid, id],
  );
  if (Number(res?.affectedRows || 0) > 0) {
    await db.query(`UPDATE ${appPrefix}contents SET download_num = download_num + 1 WHERE id = ?`, [id]);
  }
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
     FROM ${appPrefix}logs l
     LEFT JOIN ${appPrefix}contents c ON c.id = l.content_id
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
    const [[row]] = await db.query<any[]>(`SELECT id,parent_id,name FROM ${legacyPrefix}lz_category WHERE id = ? LIMIT 1`, [cur]);
    if (!row) break;
    if (Number(row.parent_id) === 0) {
      return { id: Number(row.id), name: String(row.name || ''), slug: SECTION_SLUG_BY_ID[Number(row.id)] || '' };
    }
    cur = Number(row.parent_id);
  }
  return { id, name: await getCategoryName(id), slug: SECTION_SLUG_BY_ID[id] || '' };
}

export async function getCategoryName(id: number) {
  const [[row]] = await db.query<any[]>(`SELECT name FROM ${legacyPrefix}lz_category WHERE id = ? LIMIT 1`, [id]);
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
  const normalized = cover.replace(/\\/g, '/').replace(/^public\//i, '');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}
