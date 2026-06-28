import { db, appPrefix } from './db';

export interface HeroData {
  slides: string[];
  tag: string;
  titleL1: string;
  titleL2: string;
  sub: string;
  btn1: { text: string; href: string };
  btn2: { text: string; href: string };
}

export const DEFAULT_HERO: HeroData = {
  slides: ['/hero/hero-1.jpg', '/hero/hero-2.jpg', '/hero/hero-3.jpg'],
  tag: '薛大大推荐 · D5 RENDER 全套教程',
  titleL1: '从入门到拟真',
  titleL2: '实战项目教学',
  sub: 'Photorealistic · Systematic · Project-based',
  btn1: { text: '立即进入课程', href: '/c/video' },
  btn2: { text: '浏览资源库', href: '/c/model' },
};

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const [[row]] = await db.query<any[]>(
      `SELECT value FROM ${appPrefix}settings WHERE \`key\` = ? LIMIT 1`,
      [key],
    );
    if (!row || row.value == null || row.value === '') return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return row.value as T;
    }
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  await db.query(
    `INSERT INTO ${appPrefix}settings (\`key\`,\`value\`) VALUES (?,?) ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
    [key, str],
  );
}
