import mysql from 'mysql2/promise';

const env = import.meta.env;

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
