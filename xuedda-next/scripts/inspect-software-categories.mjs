import fs from 'node:fs';
import mysql from 'mysql2/promise';

function loadEnv(file = '.env') {
  const env = {};
  if (!fs.existsSync(file)) return env;
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

const env = loadEnv();
const conn = await mysql.createConnection({
  host: env.DB_HOST || '127.0.0.1',
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER || 'root',
  password: env.DB_PASSWORD || '',
  database: env.DB_NAME || 'xuedda',
  charset: 'utf8mb4',
  dateStrings: true,
});

const legacy = dbPrefix(env.LEGACY_DB_NAME);
const app = dbPrefix(env.APP_DB_NAME);
const rootId = Number(process.argv[2] || 88);

const [cats] = await conn.query(
  `SELECT id,parent_id,name,sort,is_menu FROM ${legacy}lz_category ORDER BY parent_id,sort,id`,
);
const [counts] = await conn.query(
  `SELECT category_id,COUNT(*) n FROM ${app}contents GROUP BY category_id`,
);
await conn.end();

const countMap = new Map(counts.map((row) => [Number(row.category_id), Number(row.n || 0)]));
const byParent = new Map();
for (const cat of cats) {
  const pid = Number(cat.parent_id || 0);
  if (!byParent.has(pid)) byParent.set(pid, []);
  byParent.get(pid).push(cat);
}

function print(id, depth = 0) {
  const kids = byParent.get(id) || [];
  for (const row of kids) {
    const prefix = '  '.repeat(depth);
    console.log(`${prefix}${row.id}\tpid=${row.parent_id}\tsort=${row.sort}\tshow=${row.is_menu}\tcount=${countMap.get(Number(row.id)) || 0}\t${row.name}`);
    print(Number(row.id), depth + 1);
  }
}

const root = cats.find((row) => Number(row.id) === rootId);
console.log(`${rootId}\t${root?.name || '(missing)'}`);
print(rootId);
