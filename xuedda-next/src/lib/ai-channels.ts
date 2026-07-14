import crypto from 'node:crypto';
import { db } from './db';

const env = {
  ...(import.meta.env as Record<string, string | undefined>),
  ...(typeof process !== 'undefined' ? process.env : {}),
};

export type AiChannel = {
  id: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  keyHint: string;
  enabled: boolean;
  priority: number;
};

type ChannelRow = {
  id: number;
  name: string;
  base_url: string;
  api_key_encrypted: string;
  key_hint: string;
  is_enabled: number;
  priority: number;
  created_at?: string;
  updated_at?: string;
};

let schemaReady: Promise<void> | null = null;

export function ensureAiChannelSchema() {
  if (!schemaReady) {
    schemaReady = db.query(`
      CREATE TABLE IF NOT EXISTS xdd_ai_channels (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        base_url VARCHAR(500) NOT NULL,
        api_key_encrypted TEXT NOT NULL,
        key_hint VARCHAR(24) NOT NULL DEFAULT '',
        is_enabled TINYINT NOT NULL DEFAULT 1,
        priority INT NOT NULL DEFAULT 100,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_enabled_priority (is_enabled,priority,id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).then(() => undefined);
  }
  return schemaReady;
}

function encryptionKey() {
  const material = String(env.AI_CHANNEL_ENCRYPTION_KEY || env.HASH_ADMIN_PASSWORD || env.ADMIN_PASSWORD || '').trim();
  if (!material) throw new Error('服务器缺少 AI_CHANNEL_ENCRYPTION_KEY，暂时不能保存 API 密钥。');
  return crypto.createHash('sha256').update(material).digest();
}

function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decrypt(value: string) {
  const [iv, tag, payload] = value.split('.');
  if (!iv || !tag || !payload) throw new Error('API 密钥数据格式无效。');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(payload, 'base64url')), decipher.final()]).toString('utf8');
}

function cleanBaseUrl(value: unknown) {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(url)) throw new Error('中转网址必须使用 https://。');
  return url.slice(0, 500);
}

function keyHint(value: string) {
  return value.length <= 8 ? '••••' : `${value.slice(0, 3)}••••${value.slice(-4)}`;
}

export async function listAiChannels(includeSecrets = false) {
  await ensureAiChannelSchema();
  const [rows] = await db.query<ChannelRow[]>(`SELECT * FROM xdd_ai_channels ORDER BY priority ASC,id ASC`);
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    baseUrl: row.base_url,
    apiKey: includeSecrets ? decrypt(row.api_key_encrypted) : '',
    keyHint: row.key_hint,
    enabled: Boolean(row.is_enabled),
    priority: Number(row.priority || 100),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }));
}

export async function activeAiChannels(): Promise<AiChannel[]> {
  const stored = (await listAiChannels(true)).filter((row) => row.enabled && row.apiKey);
  const urls = [env.IMAGE_PROXY_BASE_URLS, env.IMAGE_PROXY_BASE_URL]
    .filter(Boolean).join('\n').split(/[\n,;]+/).map((value) => value.trim().replace(/\/+$/, '')).filter(Boolean);
  const keys = [...new Set([env.IMAGE_PROXY_API_KEYS, env.IMAGE_PROXY_API_KEY]
    .filter(Boolean).join('\n').split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean))];
  const baseUrl = urls[0] || '';
  const seen = new Set(stored.map((channel) => `${channel.baseUrl}\n${channel.apiKey}`));
  const fallback = keys
    .map((apiKey, index) => ({ id: -(index + 1), name: `环境变量渠道 ${index + 1}`, baseUrl, apiKey, keyHint: keyHint(apiKey), enabled: true, priority: 1000 + index }))
    .filter((channel) => channel.baseUrl && !seen.has(`${channel.baseUrl}\n${channel.apiKey}`));
  return [...stored, ...fallback];
}

export async function saveAiChannel(input: Record<string, unknown>) {
  await ensureAiChannelSchema();
  const id = Math.max(0, Math.trunc(Number(input.id || 0)));
  const name = String(input.name || '').trim().slice(0, 100);
  const baseUrl = cleanBaseUrl(input.baseUrl);
  const apiKey = String(input.apiKey || '').trim();
  const priority = Math.max(0, Math.min(9999, Math.trunc(Number(input.priority || 100))));
  const enabled = input.enabled === false ? 0 : 1;
  if (!name) throw new Error('请填写渠道名称。');
  if (!id && !apiKey) throw new Error('新增渠道必须填写 API 密钥。');
  if (id) {
    if (apiKey) {
      await db.query(`UPDATE xdd_ai_channels SET name=?,base_url=?,api_key_encrypted=?,key_hint=?,is_enabled=?,priority=? WHERE id=?`, [name, baseUrl, encrypt(apiKey), keyHint(apiKey), enabled, priority, id]);
    } else {
      await db.query(`UPDATE xdd_ai_channels SET name=?,base_url=?,is_enabled=?,priority=? WHERE id=?`, [name, baseUrl, enabled, priority, id]);
    }
    return id;
  }
  const [result] = await db.query<any>(`INSERT INTO xdd_ai_channels (name,base_url,api_key_encrypted,key_hint,is_enabled,priority) VALUES (?,?,?,?,?,?)`, [name, baseUrl, encrypt(apiKey), keyHint(apiKey), enabled, priority]);
  return Number(result.insertId);
}

export async function deleteAiChannel(id: number) {
  await ensureAiChannelSchema();
  await db.query(`DELETE FROM xdd_ai_channels WHERE id=?`, [id]);
}
