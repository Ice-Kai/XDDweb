// 与 db/schema.sql 对应的核心类型
export interface Category {
  id: number;
  parent_id: number;
  content_type: string;
  name: string;
  slug: string;
  cover_url: string;
  is_menu: number;
  sort: number;
  children?: Category[];
}

export interface Content {
  id: number;
  type: string;
  category_id: number;
  title: string;
  slug: string;
  summary: string;
  cover_url: string;
  price_integral: number;
  price_money: number;
  just_vip: number;
  hits: number;
  download_num: number;
  is_top: number;
  is_recommend: number;
  created_at: string;
}

export const MEMBER_LEVELS = ['普通会员', '月卡会员', '季卡会员', '年卡会员'] as const;
