import crypto from 'node:crypto';
import { db } from './db';
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

export const MEMBER_COOKIE = 'xdd_member';

function secret() {
  return sessionSecret();
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
  const [rows] = await db.query<any[]>('SELECT id,user_name,email,nickname,level,integral,exp_time FROM legacy.lz_member WHERE id = ? LIMIT 1', [id]);
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
    'SELECT id,password FROM legacy.lz_member WHERE user_name = ? OR email = ? LIMIT 1',
    [username, username],
  );
  const m = rows[0];
  if (!m || String(m.password).toLowerCase() !== legacyPassword(password).toLowerCase()) return null;
  await db.query('UPDATE legacy.lz_member SET last_login_time = NOW() WHERE id = ?', [m.id]);
  return getMemberById(Number(m.id));
}

export async function registerMember(username: string, password: string) {
  const [exists] = await db.query<any[]>('SELECT id FROM legacy.lz_member WHERE user_name = ? OR email = ? LIMIT 1', [username, username]);
  if (exists[0]) throw new Error('用户名已经存在');
  const email = username.includes('@') ? username : '';
  const [res] = await db.query<any>(
    'INSERT INTO legacy.lz_member (user_name,email,password,create_time,update_time,last_login_time,integral,level,user_type) VALUES (?,?,?,NOW(),NOW(),NOW(),0,0,0)',
    [username, email, legacyPassword(password)],
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
