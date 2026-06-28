import { db } from './db';

// Lightweight admin operation log. Table is created lazily so no migration is
// needed; logging is fail-safe (never throws into the caller's request).

let ensured = false;
async function ensure() {
  if (ensured) return;
  await db.query(`CREATE TABLE IF NOT EXISTS admin_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin VARCHAR(64) DEFAULT '',
    action VARCHAR(32) DEFAULT '',
    target_type VARCHAR(32) DEFAULT '',
    target_id INT DEFAULT 0,
    title VARCHAR(255) DEFAULT '',
    detail VARCHAR(500) DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  ensured = true;
}

export async function logAction(e: {
  admin?: string | null;
  action: string;
  targetType?: string;
  targetId?: number;
  title?: string;
  detail?: string;
}) {
  try {
    await ensure();
    await db.query(
      'INSERT INTO admin_log (admin,action,target_type,target_id,title,detail) VALUES (?,?,?,?,?,?)',
      [
        String(e.admin || 'admin').slice(0, 64),
        String(e.action || '').slice(0, 32),
        String(e.targetType || '').slice(0, 32),
        Number(e.targetId || 0),
        String(e.title || '').slice(0, 255),
        String(e.detail || '').slice(0, 500),
      ],
    );
  } catch {
    // logging must never break the main action
  }
}

export interface LogFilters {
  date?: string;
  action?: string;
  q?: string;
}

function cleanFilter(value: unknown, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}

export async function listLogs(page: number, limit: number, filters: LogFilters = {}) {
  await ensure();
  const where: string[] = [];
  const params: any[] = [];

  const date = cleanFilter(filters.date, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    where.push('created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(date, date);
  }

  const action = cleanFilter(filters.action, 32);
  if (action && action !== 'all') {
    where.push('action = ?');
    params.push(action);
  }

  const q = cleanFilter(filters.q, 120);
  if (q) {
    const like = `%${q}%`;
    where.push('(title LIKE ? OR detail LIKE ? OR admin LIKE ? OR target_type LIKE ?)');
    params.push(like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[cnt]] = await db.query<any[]>(`SELECT COUNT(*) n FROM admin_log ${whereSql}`, params);
  const [rows] = await db.query<any[]>(
    `SELECT id,admin,action,target_type,target_id,title,detail,created_at FROM admin_log ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  return { rows, total: Number(cnt?.n || 0) };
}
