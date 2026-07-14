import crypto from 'node:crypto';
import { db, legacyPrefix } from './db';
import { createWechatNativeOrder } from './wechat-pay';

function orderSn() {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  return `XD${stamp}${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

export const CREDIT_EXCHANGE_RATE = 100;
export const CUSTOM_TOPUP_MIN_FEN = 100;
export const CUSTOM_TOPUP_MAX_FEN = 500_000;

type ResolvedCreditProduct = {
  databaseId: number;
  paymentId: string;
  name: string;
  credits: number;
  amountFen: number;
};

async function createResolvedCreditOrder(memberId: number, product: ResolvedCreditProduct, clientIp: string) {
  const { amountFen, credits } = product;
  if (!Number.isSafeInteger(amountFen) || amountFen < 1 || !Number.isSafeInteger(credits) || credits < 1) {
    throw new Error('积分套餐价格配置错误');
  }
  const [pendingRows] = await db.query<any[]>(
    `SELECT COUNT(*) AS total FROM xdd_credit_orders
     WHERE member_id=? AND status='pending' AND expires_at>NOW()`,
    [memberId],
  );
  if (Number(pendingRows[0]?.total || 0) >= 10) {
    throw new Error('待支付订单过多，请完成已有订单或稍后再试');
  }
  const sn = orderSn();
  await db.query(
    `INSERT INTO xdd_credit_orders
      (order_sn,member_id,product_id,product_name,credits,amount_fen,status,expires_at)
     VALUES (?,?,?,?,?,?,'pending',DATE_ADD(NOW(),INTERVAL 15 MINUTE))`,
    [sn, memberId, product.databaseId, product.name, credits, amountFen],
  );
  try {
    const payment = await createWechatNativeOrder({
      orderSn: sn,
      body: `薛大大设计网-${product.name}`,
      amountFen,
      productId: product.paymentId,
      clientIp,
    });
    await db.query(`UPDATE xdd_credit_orders SET code_url=? WHERE order_sn=?`, [payment.codeUrl, sn]);
    return {
      orderSn: sn,
      productName: product.name,
      credits,
      amount: (amountFen / 100).toFixed(2),
      expiresIn: 900,
      ...payment,
    };
  } catch (error) {
    await db.query(`UPDATE xdd_credit_orders SET status='failed' WHERE order_sn=? AND status='pending'`, [sn]);
    throw error;
  }
}

export async function createCreditOrder(memberId: number, productId: number, clientIp: string) {
  const [products] = await db.query<any[]>(
    `SELECT id,name,credits,price FROM xdd_credit_products WHERE id=? AND is_active=1 LIMIT 1`,
    [productId],
  );
  const product = products[0];
  if (!product) throw new Error('积分套餐不存在或已下架');
  return createResolvedCreditOrder(memberId, {
    databaseId: Number(product.id),
    paymentId: `credit_${Number(product.id)}`,
    name: String(product.name),
    credits: Number(product.credits),
    amountFen: Math.round(Number(product.price) * 100),
  }, clientIp);
}

export async function createCustomCreditOrder(memberId: number, amountFen: number, clientIp: string) {
  if (!Number.isSafeInteger(amountFen) || amountFen < CUSTOM_TOPUP_MIN_FEN || amountFen > CUSTOM_TOPUP_MAX_FEN) {
    throw new Error(`自定义充值金额须在 ${CUSTOM_TOPUP_MIN_FEN / 100} 至 ${CUSTOM_TOPUP_MAX_FEN / 100} 元之间`);
  }
  const credits = Math.floor((amountFen * CREDIT_EXCHANGE_RATE) / 100);
  return createResolvedCreditOrder(memberId, {
    databaseId: 0,
    paymentId: `credit_custom_${amountFen}`,
    name: `自定义充值 ${credits} 积分`,
    credits,
    amountFen,
  }, clientIp);
}

export async function getCreditOrder(memberId: number, sn: string) {
  const [rows] = await db.query<any[]>(
    `SELECT order_sn,product_name,credits,amount_fen,status,paid_at,expires_at,created_at
     FROM xdd_credit_orders WHERE order_sn=? AND member_id=? LIMIT 1`,
    [sn, memberId],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.status === 'pending' && new Date(String(row.expires_at)).getTime() < Date.now()) {
    await db.query(`UPDATE xdd_credit_orders SET status='closed' WHERE order_sn=? AND status='pending'`, [sn]);
    row.status = 'closed';
  }
  return {
    orderSn: String(row.order_sn),
    productName: String(row.product_name),
    credits: Number(row.credits),
    amount: (Number(row.amount_fen) / 100).toFixed(2),
    status: String(row.status),
    paidAt: row.paid_at || null,
  };
}

export async function settleWechatCreditOrder(data: Record<string, string>) {
  const sn = String(data.out_trade_no || '');
  const tradeNo = String(data.transaction_id || '');
  const paidFen = Number(data.total_fee || 0);
  if (!sn || !tradeNo || !Number.isSafeInteger(paidFen) || paidFen < 1) throw new Error('支付通知字段不完整');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.query<any[]>(`SELECT * FROM xdd_credit_orders WHERE order_sn=? LIMIT 1 FOR UPDATE`, [sn]);
    const order = orders[0];
    if (!order) throw new Error('订单不存在');
    if (Number(order.amount_fen) !== paidFen) throw new Error('订单金额不匹配');
    if (order.status === 'paid') {
      if (String(order.provider_trade_no) !== tradeNo) throw new Error('支付流水不匹配');
      await conn.commit();
      return { duplicate: true };
    }
    if (order.status !== 'pending') throw new Error('订单状态不允许支付');
    const [members] = await conn.query<any[]>(
      `SELECT integral FROM ${legacyPrefix}lz_member WHERE id=? LIMIT 1 FOR UPDATE`,
      [Number(order.member_id)],
    );
    if (!members[0]) throw new Error('用户不存在');
    const balance = Math.max(0, Number(members[0].integral || 0)) + Number(order.credits);
    await conn.query(`UPDATE ${legacyPrefix}lz_member SET integral=?,update_time=NOW() WHERE id=?`, [balance, Number(order.member_id)]);
    await conn.query(
      `UPDATE xdd_credit_orders SET status='paid',provider_trade_no=?,paid_at=NOW() WHERE id=? AND status='pending'`,
      [tradeNo, Number(order.id)],
    );
    await conn.query(
      `INSERT INTO xdd_credit_ledger
        (member_id,amount,balance_after,kind,reference_type,reference_id,description)
       VALUES (?,?,?,?,?,?,?)`,
      [Number(order.member_id), Number(order.credits), balance, 'purchase', 'credit_order', sn, `微信支付充值 ${Number(order.credits)} 积分`],
    );
    await conn.commit();
    return { duplicate: false };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
