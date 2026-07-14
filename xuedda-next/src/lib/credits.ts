import crypto from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { db, legacyPrefix } from './db';

// Legacy task fallback only. New tasks use the model-specific price table.
export const AI_GENERATION_COST = 15;
export const NEW_MEMBER_WELCOME_CREDITS = 100;

export async function grantWelcomeCredits(conn: PoolConnection, memberId: number) {
  const [members] = await conn.query<any[]>(
    `SELECT integral FROM ${legacyPrefix}lz_member WHERE id = ? LIMIT 1 FOR UPDATE`,
    [memberId],
  );
  if (!members[0]) throw new Error('用户不存在');

  const current = Math.max(0, Number(members[0].integral || 0));
  const balance = current + NEW_MEMBER_WELCOME_CREDITS;
  const [insert] = await conn.query<any>(
    `INSERT IGNORE INTO xdd_credit_ledger
      (member_id,amount,balance_after,kind,reference_type,reference_id,description)
     VALUES (?,?,?,?,?,?,?)`,
    [
      memberId,
      NEW_MEMBER_WELCOME_CREDITS,
      balance,
      'signup_bonus',
      'member',
      String(memberId),
      `新用户注册赠送 ${NEW_MEMBER_WELCOME_CREDITS} 积分`,
    ],
  );

  // The unique ledger reference makes retries and OAuth callback replays idempotent.
  if (Number(insert.affectedRows || 0) < 1) return current;
  await conn.query(
    `UPDATE ${legacyPrefix}lz_member SET integral = ?, update_time = NOW() WHERE id = ?`,
    [balance, memberId],
  );
  return balance;
}

function codeHash(code: string) {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

export function normalizeRedeemCode(input: unknown) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 80);
}

export async function creditBalance(memberId: number) {
  const [rows] = await db.query<any[]>(
    `SELECT integral FROM ${legacyPrefix}lz_member WHERE id = ? LIMIT 1`,
    [memberId],
  );
  return Math.max(0, Number(rows[0]?.integral || 0));
}

export async function getCreditOverview(memberId: number) {
  const [ledger] = await db.query<any[]>(
    `SELECT amount,balance_after,kind,description,created_at
     FROM xdd_credit_ledger WHERE member_id = ? ORDER BY id DESC LIMIT 50`,
    [memberId],
  );
  return { balance: await creditBalance(memberId), ledger };
}

export async function listCreditProducts() {
  const [rows] = await db.query<any[]>(
    `SELECT id,name,credits,price,description FROM xdd_credit_products
     WHERE is_active = 1 ORDER BY sort ASC,id ASC`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    credits: Number(row.credits),
    price: Number(row.price),
    description: String(row.description || ''),
  }));
}

export async function createCreditCodes(productId: number, quantity: number) {
  const count = Math.max(1, Math.min(500, Math.trunc(quantity || 0)));
  const [products] = await db.query<any[]>(
    `SELECT id,name,credits FROM xdd_credit_products WHERE id=? AND is_active=1 LIMIT 1`,
    [productId],
  );
  const product = products[0];
  if (!product) throw new Error('积分商品不存在或已下架');

  const conn = await db.getConnection();
  const codes: string[] = [];
  try {
    await conn.beginTransaction();
    for (let index = 0; index < count; index += 1) {
      const code = `XD-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      codes.push(code);
      await conn.query(
        `INSERT INTO xdd_credit_codes (product_id,code_hash,code_hint,credits)
         VALUES (?,?,?,?)`,
        [product.id, codeHash(code), code.slice(-6), Number(product.credits)],
      );
    }
    await conn.commit();
    return {
      product: { id: Number(product.id), name: String(product.name), credits: Number(product.credits) },
      codes,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function redeemCreditCode(memberId: number, rawCode: unknown) {
  const code = normalizeRedeemCode(rawCode);
  if (code.length < 8) throw new Error('请输入完整的卡密');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [codes] = await conn.query<any[]>(
      `SELECT id,credits,status FROM xdd_credit_codes WHERE code_hash = ? LIMIT 1 FOR UPDATE`,
      [codeHash(code)],
    );
    const row = codes[0];
    if (!row) throw new Error('卡密无效');
    if (Number(row.status) !== 0) throw new Error('该卡密已使用或已停用');
    const credits = Math.max(1, Number(row.credits || 0));
    const [members] = await conn.query<any[]>(
      `SELECT integral FROM ${legacyPrefix}lz_member WHERE id = ? LIMIT 1 FOR UPDATE`,
      [memberId],
    );
    if (!members[0]) throw new Error('用户不存在');
    const balance = Math.max(0, Number(members[0].integral || 0)) + credits;
    await conn.query(`UPDATE ${legacyPrefix}lz_member SET integral = ?, update_time = NOW() WHERE id = ?`, [balance, memberId]);
    await conn.query(`UPDATE xdd_credit_codes SET status=1,redeemed_by=?,redeemed_at=NOW() WHERE id=?`, [memberId, row.id]);
    await conn.query(
      `INSERT INTO xdd_credit_ledger (member_id,amount,balance_after,kind,reference_type,reference_id,description)
       VALUES (?,?,?,?,?,?,?)`,
      [memberId, credits, balance, 'redeem', 'credit_code', String(row.id), `兑换卡密，到账 ${credits} 积分`],
    );
    await conn.commit();
    return { credits, balance };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function reserveGenerationCredits(memberId: number, requestId: string, cost = AI_GENERATION_COST) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [members] = await conn.query<any[]>(
      `SELECT integral FROM ${legacyPrefix}lz_member WHERE id = ? LIMIT 1 FOR UPDATE`,
      [memberId],
    );
    const member = members[0];
    if (!member) throw new Error('用户不存在');
    const balance = Math.max(0, Number(member.integral || 0));
    if (balance < cost) throw new Error(`积分不足，本次生图需要 ${cost} 积分，当前仅有 ${balance} 积分`);
    const remaining = balance - cost;
    await conn.query(`UPDATE ${legacyPrefix}lz_member SET integral=?,update_time=NOW() WHERE id=?`, [remaining, memberId]);
    await conn.query(
      `INSERT INTO xdd_credit_ledger (member_id,amount,balance_after,kind,reference_type,reference_id,description)
       VALUES (?,?,?,?,?,?,?)`,
      [memberId, -cost, remaining, 'generation', 'ai_generation', requestId, `AI 生图消耗 ${cost} 积分`],
    );
    await conn.commit();
    return { cost, balance: remaining };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function refundGenerationCredits(memberId: number, requestId: string, cost: number, reason: string) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [ledger] = await conn.query<any[]>(
      `SELECT id FROM xdd_credit_ledger WHERE member_id=? AND kind='refund' AND reference_type='ai_generation' AND reference_id=? LIMIT 1 FOR UPDATE`,
      [memberId, requestId],
    );
    if (ledger[0]) { await conn.commit(); return; }
    const [members] = await conn.query<any[]>(
      `SELECT integral FROM ${legacyPrefix}lz_member WHERE id=? LIMIT 1 FOR UPDATE`,
      [memberId],
    );
    const balance = Math.max(0, Number(members[0]?.integral || 0)) + cost;
    await conn.query(`UPDATE ${legacyPrefix}lz_member SET integral=?,update_time=NOW() WHERE id=?`, [balance, memberId]);
    await conn.query(
      `INSERT INTO xdd_credit_ledger (member_id,amount,balance_after,kind,reference_type,reference_id,description)
       VALUES (?,?,?,?,?,?,?)`,
      [memberId, cost, balance, 'refund', 'ai_generation', requestId, `AI 生图失败退回 ${cost} 积分：${reason.slice(0, 120)}`],
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
