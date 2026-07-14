import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}

const env = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'));
const sql = await readFile(new URL('../db/ai-credits.sql', import.meta.url), 'utf8');
const conn = await mysql.createConnection({
  host: env.DB_HOST || '127.0.0.1',
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER || 'root',
  password: env.DB_PASSWORD || '',
  database: env.DB_NAME || 'xuedda',
  charset: 'utf8mb4',
  multipleStatements: true,
});

try {
  await conn.query(sql);
  console.log('AI credits schema applied.');
} finally {
  await conn.end();
}
