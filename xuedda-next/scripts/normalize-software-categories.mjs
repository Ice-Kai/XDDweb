import fs from 'node:fs';
import mysql from 'mysql2/promise';

function loadEnv(file = '.env') {
  const env = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
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
const rootId = 88;
const dryRun = process.argv.includes('--dry-run');

async function one(sql, params = []) {
  const [rows] = await conn.query(sql, params);
  return rows[0] || null;
}

async function run(sql, params = []) {
  if (dryRun) {
    console.log('[dry]', sql.replace(/\s+/g, ' ').trim(), JSON.stringify(params));
    return;
  }
  await conn.query(sql, params);
}

async function childByName(parentId, name) {
  return one(`SELECT * FROM ${legacy}lz_category WHERE parent_id=? AND name=? LIMIT 1`, [parentId, name]);
}

async function anyById(id) {
  return one(`SELECT * FROM ${legacy}lz_category WHERE id=? LIMIT 1`, [id]);
}

async function createChild(parentId, name, sort) {
  const existing = await childByName(parentId, name);
  if (existing) return Number(existing.id);
  if (dryRun) {
    console.log('[dry] create category', { parentId, name, sort });
    return -Math.floor(Math.random() * 100000);
  }
  const [res] = await conn.query(
    `INSERT INTO ${legacy}lz_category
      (parent_id,model_id,name,image_url,description,is_menu,sort,meta_keywords,meta_description,index_template,list_template,show_template,url,is_cover)
     VALUES
      (?,5,?,'','',1,?,'','','','','','',1)`,
    [parentId, name, sort],
  );
  return Number(res.insertId);
}

async function updateCategory(id, patch) {
  const sets = [];
  const params = [];
  for (const [key, value] of Object.entries(patch)) {
    sets.push(`${key}=?`);
    params.push(value);
  }
  params.push(id);
  await run(`UPDATE ${legacy}lz_category SET ${sets.join(',')} WHERE id=?`, params);
}

async function main() {
  const root = await anyById(rootId);
  if (!root) throw new Error('missing software root category #88');

  await conn.beginTransaction();
  try {
    const backupName = `software_category_backup_${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
    if (!dryRun) {
      await conn.query(`CREATE TABLE IF NOT EXISTS ${legacy}\`${backupName}\` AS SELECT * FROM ${legacy}lz_category WHERE id=? OR parent_id=? OR parent_id IN (SELECT id FROM ${legacy}lz_category WHERE parent_id=?) OR parent_id IN (SELECT id FROM ${legacy}lz_category WHERE parent_id IN (SELECT id FROM ${legacy}lz_category WHERE parent_id=?))`, [rootId, rootId, rootId, rootId]);
      console.log('backup table:', backupName);
    }

    const modelingId = await createChild(rootId, '建模软件', 1);
    const rendererId = await createChild(rootId, '渲染器', 2);
    const graphicId = await createChild(rootId, '平面软件', 3);
    let otherId = Number((await childByName(rootId, '其他软件'))?.id || 0);
    if (!otherId) {
      const utility = await childByName(rootId, '实用软件');
      if (utility) {
        otherId = Number(utility.id);
        await updateCategory(otherId, { name: '其他软件', parent_id: rootId, sort: 4, is_menu: 1 });
      } else {
        otherId = await createChild(rootId, '其他软件', 4);
      }
    }

    const moves = [
      [232, modelingId, 1, 'CAD'],
      [235, modelingId, 2, '天正'],
      [212, modelingId, 3, 'MAX'],
      [215, modelingId, 4, 'Rhino'],
      [226, modelingId, 5, 'Revit'],
      [222, modelingId, 6, 'Sketchup'],
      [229, rendererId, 1, 'Enscape'],
      [95, rendererId, 2, 'Lumion'],
      [319, rendererId, 3, 'VRAY'],
      [238, rendererId, 4, '其他渲染器'],
      [219, graphicId, 1, 'Adobe合集'],
      [101, graphicId, 2, 'Office'],
      [239, otherId, 1, '实用软件'],
    ];

    for (const [id, parentId, sort, name] of moves) {
      const row = await anyById(id);
      if (!row) continue;
      await updateCategory(id, { parent_id: parentId, sort, name, is_menu: 1 });
    }

    await updateCategory(modelingId, { parent_id: rootId, sort: 1, name: '建模软件', is_menu: 1 });
    await updateCategory(rendererId, { parent_id: rootId, sort: 2, name: '渲染器', is_menu: 1 });
    await updateCategory(graphicId, { parent_id: rootId, sort: 3, name: '平面软件', is_menu: 1 });
    await updateCategory(otherId, { parent_id: rootId, sort: 4, name: '其他软件', is_menu: 1 });

    if (dryRun) {
      await conn.rollback();
      console.log('DRY_RUN_OK');
    } else {
      await conn.commit();
      console.log('NORMALIZE_OK');
    }
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

await main();
