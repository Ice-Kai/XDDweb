import fs from 'node:fs';
import mysql from 'mysql2/promise';

function loadEnv(file = '.env') {
  const env = {};
  if (!fs.existsSync(file)) return { ...process.env };
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return { ...env, ...process.env };
}

function dbPrefix(name) {
  const clean = String(name || '').replace(/`/g, '').replace(/[^a-zA-Z0-9_$]/g, '');
  return clean ? `\`${clean}\`.` : '';
}

async function indexExists(conn, tableSchema, tableName, indexName) {
  const [rows] = await conn.query(
    `SELECT 1
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND index_name = ?
     LIMIT 1`,
    [tableName, indexName],
  );
  if (rows[0]) return true;
  if (!tableSchema) return false;
  const [prefixedRows] = await conn.query(
    `SELECT 1
     FROM information_schema.statistics
     WHERE table_schema = ?
       AND table_name = ?
       AND index_name = ?
     LIMIT 1`,
    [tableSchema, tableName, indexName],
  );
  return Boolean(prefixedRows[0]);
}

const env = loadEnv();
const conn = await mysql.createConnection({
  host: env.DB_HOST || '127.0.0.1',
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER || 'root',
  password: env.DB_PASSWORD || '',
  database: env.DB_NAME || 'xuedda',
  charset: 'utf8mb4',
});

try {
  const appDb = String(env.APP_DB_NAME || '').trim();
  const app = dbPrefix(appDb);
  const tableName = 'logs';
  const fullTable = `${app}\`${tableName}\``;
  const indexName = 'idx_download_quota';
  const exists = await indexExists(conn, appDb, tableName, indexName);
  if (exists) {
    console.log(`${indexName} already exists`);
  } else {
    await conn.query(
      `ALTER TABLE ${fullTable}
       ADD INDEX ${indexName} (kind, member_id, created_at, content_id)`,
    );
    console.log(`${indexName} created`);
  }
} finally {
  await conn.end();
}
