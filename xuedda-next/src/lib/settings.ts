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

export interface AiHeroData {
  image: string;
  tag: string;
  titleL1: string;
  titleL2: string;
  sub: string;
  btn1: { text: string; href: string };
  btn2: { text: string; href: string };
}

export interface HeroPanelData {
  image: string;
  tag: string;
  titleL1: string;
  titleL2: string;
  sub: string;
  btn1: { text: string; href: string };
  btn2: { text: string; href: string };
  kind?: string;
}

export const DEFAULT_HERO_PANELS: HeroPanelData[] = [
  {
    image: '/hero/hero-ai-p2.webp',
    tag: 'XDESIGN AI STUDIO · AI 生图正式上线',
    titleL1: 'AI 生图新功能',
    titleL2: '现在就能体验',
    sub: '多模型生图 · 参考图创作 · 生成记录自动保存',
    btn1: { text: '立即体验 AI 生图', href: '/ai-studio/' },
    btn2: { text: '注册领取 100 积分', href: '/member/register' },
    kind: 'ai',
  },
  {
    image: '/hero/hero-1.jpg',
    tag: '薛大大推荐 · D5 RENDER 全套教程',
    titleL1: '从入门到拟真',
    titleL2: '实战项目教学',
    sub: 'Photorealistic · Systematic · Project-based',
    btn1: { text: '立即进入课程', href: '/c/video' },
    btn2: { text: '浏览资源库', href: '/c/model' },
    kind: 'course',
  },
  {
    image: '/hero/hero-2.jpg',
    tag: 'XUEDDA · 网站内容上新',
    titleL1: '薛大大网站上新',
    titleL2: '新资源每天持续更新',
    sub: '建筑 · 室内 · 景观 · 工装模型与设计素材',
    btn1: { text: '查看最新上架', href: '/c/model' },
    btn2: { text: '进入资源目录', href: '/search' },
    kind: 'new',
  },
  {
    image: '/hero/hero-3.jpg',
    tag: 'XDESIGN RESOURCE LIBRARY',
    titleL1: '设计资源持续更新',
    titleL2: '找模型与素材更直接',
    sub: 'SU 模型 · 平面素材 · 软件参数 · 视频教程',
    btn1: { text: '浏览模型素材', href: '/c/model' },
    btn2: { text: '观看视频教程', href: '/c/video' },
    kind: 'resource',
  },
];

export const DEFAULT_AI_HERO: AiHeroData = {
  image: '/hero/hero-ai-cover.webp',
  tag: 'XDESIGN AI STUDIO · AI 生图正式上线',
  titleL1: 'AI 生图新功能',
  titleL2: '现在就能体验',
  sub: '多模型生图 · 参考图创作 · 生成记录自动保存',
  btn1: { text: '立即体验 AI 生图', href: '/ai-studio/' },
  btn2: { text: '注册领取 100 积分', href: '/member/register' },
};

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
