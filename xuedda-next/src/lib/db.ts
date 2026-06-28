import mysql from 'mysql2/promise';

const env = {
  ...import.meta.env,
  ...(typeof process !== 'undefined' ? process.env : {}),
};

function escapeIdentifier(value: string) {
  return value.replace(/`/g, '``').replace(/[^a-zA-Z0-9_$]/g, '');
}

const legacyDbName = String(env.LEGACY_DB_NAME || '').trim();
export const legacyPrefix = legacyDbName ? `\`${escapeIdentifier(legacyDbName)}\`.` : '';

const appDbName = String(env.APP_DB_NAME || '').trim();
export const appPrefix = appDbName ? `\`${escapeIdentifier(appDbName)}\`.` : '';

export const db = mysql.createPool({
  host: env.DB_HOST || '127.0.0.1',
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER || 'root',
  password: env.DB_PASSWORD || 'xuedda_dev_pwd',
  database: env.DB_NAME || 'xuedda',
  charset: 'utf8mb4',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: Number(env.DB_POOL_LIMIT || 10),
});

export async function pingDb() {
  const conn = await db.getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}
