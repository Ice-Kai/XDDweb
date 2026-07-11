import crypto from 'node:crypto';
import { db, legacyPrefix } from './db';
import { md5 } from './auth';
import { secureCookieSuffix, sessionSecret } from './security';

export interface MemberSession {
  id: number;
  username: string;
  nickname: string;
  level: number;
  integral: number;
  vipExpireAt: string | null;
}

export interface OAuthMemberProfile {
  openid: string;
  nickname?: string;
  avatar?: string;
  sex?: number | string;
}

export const MEMBER_COOKIE = 'xdd_member';

function secret() {
  return sessionSecret();
}

function sanitizeLegacyText(value: unknown, max = 80) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\u{10000}-\u{10FFFF}]/gu, '')
    .trim()
    .slice(0, max);
}

function sign(payload: string) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('hex');
}

export function legacyPassword(password: string) {
  return md5(md5(password));
}

export function createMemberToken(member: MemberSession) {
  const payload = Buffer.from(JSON.stringify({ id: member.id, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyMemberToken(token?: string | null) {
  try {
    if (!token || !token.includes('.')) return 0;
    const [payload, sig] = token.split('.');
    const expected = sign(payload);
    if (sig.length !== expected.length) return 0;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return 0;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return 0;
    return Number(data.id) || 0;
  } catch {
    return 0;
  }
}

export async function getMemberById(id: number): Promise<MemberSession | null> {
  const [rows] = await db.query<any[]>(
    `SELECT id,user_name,email,nickname,level,integral,exp_time FROM ${legacyPrefix}lz_member WHERE id = ? LIMIT 1`,
    [id],
  );
  const m = rows[0];
  if (!m) return null;
  return {
    id: Number(m.id),
    username: String(m.user_name || m.email || `user${m.id}`),
    nickname: String(m.nickname || m.user_name || m.email || `用户${m.id}`),
    level: Number(m.level || 0),
    integral: Number(m.integral || 0),
    vipExpireAt: m.exp_time ? new Date(Number(m.exp_time) * 1000).toISOString() : null,
  };
}

export async function loginMember(username: string, password: string) {
  const [rows] = await db.query<any[]>(
    `SELECT id,password FROM ${legacyPrefix}lz_member WHERE user_name = ? OR email = ? LIMIT 1`,
    [username, username],
  );
  const m = rows[0];
  if (!m || String(m.password).toLowerCase() !== legacyPassword(password).toLowerCase()) return null;
  await db.query(`UPDATE ${legacyPrefix}lz_member SET last_login_time = NOW() WHERE id = ?`, [m.id]);
  return getMemberById(Number(m.id));
}

export async function findMemberForPasswordReset(identity: string) {
  const value = String(identity || '').trim();
  if (!value) return null;
  const [rows] = await db.query<any[]>(
    `SELECT id,user_name,email,nickname FROM ${legacyPrefix}lz_member WHERE user_name = ? OR email = ? LIMIT 1`,
    [value, value],
  );
  const m = rows[0];
  if (!m) return null;
  return {
    id: Number(m.id),
    username: String(m.user_name || ''),
    email: String(m.email || ''),
    nickname: String(m.nickname || ''),
  };
}

export async function registerMember(username: string, password: string) {
  const [exists] = await db.query<any[]>(
    `SELECT id FROM ${legacyPrefix}lz_member WHERE user_name = ? OR email = ? LIMIT 1`,
    [username, username],
  );
  if (exists[0]) throw new Error('用户名已存在');
  const email = username.includes('@') ? username : '';
  const [res] = await db.query<any>(
    `INSERT INTO ${legacyPrefix}lz_member (user_name,email,password,create_time,update_time,last_login_time,integral,level,user_type) VALUES (?,?,?,NOW(),NOW(),NOW(),0,0,0)`,
    [username, email, legacyPassword(password)],
  );
  return getMemberById(Number(res.insertId));
}

function normalizeSex(value: OAuthMemberProfile['sex']) {
  if (value === '男') return 1;
  if (value === '女') return 2;
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function cleanNickname(provider: 'qq' | 'wechat', openid: string, nickname?: string) {
  const value = sanitizeLegacyText(nickname, 80);
  if (value) return value.slice(0, 80);
  return provider === 'qq' ? `QQ用户${openid.slice(-6)}` : `微信用户${openid.slice(-6)}`;
}

export async function upsertOAuthMember(provider: 'qq' | 'wechat', profile: OAuthMemberProfile) {
  const openid = String(profile.openid || '').trim();
  if (!openid) throw new Error('第三方登录缺少 openid');

  const userType = provider === 'qq' ? 1 : 2;
  const nickname = cleanNickname(provider, openid, profile.nickname);
  const avatar = String(profile.avatar || '').trim().slice(0, 500);
  const sex = normalizeSex(profile.sex);

  const [rows] = await db.query<any[]>(
    `SELECT id FROM ${legacyPrefix}lz_member WHERE openid = ? LIMIT 1`,
    [openid],
  );

  if (rows[0]) {
    await db.query(
      `UPDATE ${legacyPrefix}lz_member
       SET nickname = ?, avatar = ?, sex = ?, user_type = ?, last_login_time = NOW(), update_time = NOW()
       WHERE id = ?`,
      [nickname, avatar, sex, userType, rows[0].id],
    );
    return getMemberById(Number(rows[0].id));
  }

  const username = `${provider}_${openid}`.slice(0, 96);
  const [res] = await db.query<any>(
    `INSERT INTO ${legacyPrefix}lz_member
      (user_name,email,password,nickname,avatar,sex,openid,user_type,create_time,update_time,last_login_time,integral,level)
     VALUES (?,?,?,?,?,?,?,?,NOW(),NOW(),NOW(),0,0)`,
    [username, '', '', nickname, avatar, sex, openid, userType],
  );
  return getMemberById(Number(res.insertId));
}

export function isVip(member: MemberSession | null) {
  if (!member) return false;
  if (member.level > 0) {
    if (!member.vipExpireAt) return true;
    return new Date(member.vipExpireAt).getTime() > Date.now();
  }
  return false;
}

export function setMemberCookie(token: string) {
  return `${MEMBER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secureCookieSuffix()}`;
}

export function clearMemberCookie() {
  return `${MEMBER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookieSuffix()}`;
}

export function clearMemberCookies(hostname?: string | null) {
  const expires = 'Thu, 01 Jan 1970 00:00:00 GMT';
  const suffix = secureCookieSuffix();
  const base = [
    `${MEMBER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=${expires}${suffix}`,
  ];
  const host = String(hostname || '').split(':')[0].trim().toLowerCase();
  if (host && host !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    base.push(`${MEMBER_COOKIE}=; Path=/; Domain=${host}; HttpOnly; SameSite=Lax; Max-Age=0; Expires=${expires}${suffix}`);
    const parts = host.split('.');
    if (parts.length > 2) {
      base.push(`${MEMBER_COOKIE}=; Path=/; Domain=.${parts.slice(-2).join('.')}; HttpOnly; SameSite=Lax; Max-Age=0; Expires=${expires}${suffix}`);
    } else {
      base.push(`${MEMBER_COOKIE}=; Path=/; Domain=.${host}; HttpOnly; SameSite=Lax; Max-Age=0; Expires=${expires}${suffix}`);
    }
  }
  return base;
}
