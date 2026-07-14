import type { APIRoute } from 'astro';
import { fail, ok, readJson } from '../../../lib/api';
import { createCreditCodes, listCreditProducts } from '../../../lib/credits';
import { db } from '../../../lib/db';
import { logAction } from '../../../lib/adminlog';

function numberInRange(value: unknown, min: number, max: number, fallback = min) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

export const GET: APIRoute = async () => {
  const [products, stats, orderSummary, generationSummary, recentOrders, recentGenerations] = await Promise.all([
    listCreditProducts(),
    db.query<any[]>(`SELECT status,COUNT(*) AS count FROM xdd_credit_codes GROUP BY status`).then(([rows]) => rows),
    db.query<any[]>(`
      SELECT
        COUNT(CASE WHEN status='paid' THEN 1 END) AS paid_orders,
        COALESCE(SUM(CASE WHEN status='paid' THEN amount_fen ELSE 0 END),0) AS paid_amount_fen,
        COUNT(CASE WHEN status='paid' AND DATE(paid_at)=CURDATE() THEN 1 END) AS today_orders,
        COALESCE(SUM(CASE WHEN status='paid' AND DATE(paid_at)=CURDATE() THEN amount_fen ELSE 0 END),0) AS today_amount_fen
      FROM xdd_credit_orders
    `).then(([rows]) => rows[0] || {}),
    db.query<any[]>(`
      SELECT
        COUNT(*) AS total_generations,
        COUNT(CASE WHEN status='completed' THEN 1 END) AS completed_generations,
        COUNT(CASE WHEN status='failed' THEN 1 END) AS failed_generations,
        COUNT(CASE WHEN status='processing' THEN 1 END) AS processing_generations,
        COALESCE(SUM(CASE WHEN status='completed' THEN credit_cost ELSE 0 END),0) AS consumed_credits,
        COUNT(CASE WHEN DATE(created_at)=CURDATE() THEN 1 END) AS today_generations
      FROM xdd_ai_generations
    `).then(([rows]) => rows[0] || {}),
    db.query<any[]>(`SELECT order_sn,member_id,product_name,credits,amount_fen,status,paid_at,created_at FROM xdd_credit_orders ORDER BY id DESC LIMIT 30`).then(([rows]) => rows),
    db.query<any[]>(`SELECT request_id,member_id,provider_model,credit_cost,status,error_message,created_at,completed_at FROM xdd_ai_generations ORDER BY id DESC LIMIT 30`).then(([rows]) => rows),
  ]);
  return ok({ products, stats, orderSummary, generationSummary, recentOrders, recentGenerations });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await readJson<any>(request);
  if (body.action !== 'generate_codes') return fail('不支持的操作');
  try {
    const result = await createCreditCodes(numberInRange(body.product_id, 1, 999999), numberInRange(body.quantity, 1, 500));
    await logAction({
      admin: (locals as any).admin?.name,
      action: 'create', targetType: 'credit_code',
      title: `生成 ${result.codes.length} 张积分卡密`,
      detail: `${result.product.name} / 每张 ${result.product.credits} 积分`,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '生成卡密失败');
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const body = await readJson<any>(request);
  const id = numberInRange(body.id, 1, 999999999);
  const name = String(body.name || '').trim().slice(0, 120);
  if (!name) return fail('商品名称不能为空');
  const credits = numberInRange(body.credits, 1, 1_000_000);
  const price = Math.max(0, Math.min(99999, Number(body.price) || 0));
  await db.query(
    `INSERT INTO xdd_credit_products (id,name,credits,price,description,is_active,sort)
     VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE name=VALUES(name),credits=VALUES(credits),price=VALUES(price),description=VALUES(description),is_active=VALUES(is_active),sort=VALUES(sort)`,
    [id, name, credits, price, String(body.description || '').trim().slice(0, 255), body.is_active === false ? 0 : 1, numberInRange(body.sort, 0, 9999, 0)],
  );
  await logAction({ admin: (locals as any).admin?.name, action: 'update', targetType: 'credit_product', targetId: id, title: name, detail: `${credits} 积分 / ¥${price}` });
  return ok({ id });
};
