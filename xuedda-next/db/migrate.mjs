// 数据迁移：legacy.lz_download → xuedda.contents（保留原始 id）。
// 运行：node db/migrate.mjs   （需 Docker MySQL 在 127.0.0.1:3306）
// 字段映射见下。会先 TRUNCATE contents（清掉之前的 demo），使其成为旧库的忠实镜像。
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '127.0.0.1', port: 3306, user: 'root', password: 'xuedda_dev_pwd',
  database: 'xuedda', charset: 'utf8mb4', dateStrings: true,
});

console.log('连接成功。读取 legacy.lz_download …');
const [rows] = await conn.query('SELECT * FROM legacy.lz_download');
console.log(`旧库 ${rows.length} 条。`);

await conn.query('SET FOREIGN_KEY_CHECKS=0');
await conn.query('TRUNCATE TABLE xuedda.contents');
console.log('已清空 xuedda.contents，开始迁移 …');

const COLS = `id,type,category_id,title,slug,summary,cover_url,body,keywords,file_url,extract_pass,
  price_integral,price_money,just_vip,index_type_id,index_theme_id,hits,download_num,
  is_top,is_recommend,is_show,sort,meta,created_at,updated_at`;

const toRow = (r) => {
  const meta = JSON.stringify({
    url: r.url || '', demo_url: r.demo_url || '', filename: r.filename || '',
    is_show_enter_btn: r.is_show_enter_btn ?? 1, enter_btn_text: r.enter_btn_text || '',
    is_dynamic: r.is_dynamic ?? 0, legacy: true,
  });
  return [
    r.id, 'download', r.category_id ?? 0, r.title ?? '', '', r.description ?? '',
    r.image_url ?? '', r.content ?? null, r.keywords ?? '', r.file_url ?? '', r.pass ?? '',
    r.integral ?? 0, r.money ?? 0, r.just_vip ?? 0, r.type_id ?? 0, r.theme_id ?? 0,
    r.hits ?? 0, r.download_num ?? 0, r.is_top ?? 0, r.is_recommend ?? 0, r.is_show ?? 1,
    r.sort ?? 0, meta, r.create_time ?? new Date().toISOString().slice(0, 19).replace('T', ' '),
    r.update_time ?? r.create_time ?? null,
  ];
};

const placeholders = '(' + '?,'.repeat(25).slice(0, -1) + ')';
const SQL = `INSERT INTO xuedda.contents (${COLS.replace(/\s+/g, '')}) VALUES ${placeholders}`;

let ok = 0, fail = 0;
const CHUNK = 200;
for (let i = 0; i < rows.length; i += CHUNK) {
  const batch = rows.slice(i, i + CHUNK);
  // 多行批量插入
  const values = batch.map(toRow);
  const multiSql = `INSERT INTO xuedda.contents (${COLS.replace(/\s+/g, '')}) VALUES ` +
    values.map(() => placeholders).join(',');
  try {
    await conn.query(multiSql, values.flat());
    ok += batch.length;
  } catch (e) {
    // 批量失败则逐条插，定位坏行
    for (const v of values) {
      try { await conn.query(SQL, v); ok++; }
      catch (e2) { fail++; console.error('坏行 id=', v[0], e2.message); }
    }
  }
  process.stdout.write(`\r迁移中 ${ok}/${rows.length}`);
}
await conn.query('SET FOREIGN_KEY_CHECKS=1');

console.log(`\n完成：成功 ${ok}，失败 ${fail}。`);
const [[c]] = await conn.query('SELECT COUNT(*) n FROM xuedda.contents');
const [[s]] = await conn.query('SELECT COUNT(*) n FROM xuedda.contents WHERE is_show=1');
console.log(`xuedda.contents 现有 ${c.n} 条（显示 ${s.n}）。`);
await conn.end();
