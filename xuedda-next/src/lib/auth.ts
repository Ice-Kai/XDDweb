import crypto from 'node:crypto';
import { db } from './db';
import { secureCookieSuffix, sessionSecret } from './security';

export interface AdminSession {
  id: number;
  username: string;
  name: string;
}

export const ADMIN_COOKIE = 'xdd_admin';

function secret() {
  return sessionSecret();
}

export function md5(input: string) {
  return crypto.createHash('md5').update(input).digest('hex');
}

function sign(payload: string) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('hex');
}

export function createAdminToken(admin: AdminSession) {
  const payload = Buffer.from(JSON.stringify({ ...admin, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminToken(token?: string | null): AdminSession | null {
  try {
    if (!token || !token.includes('.')) return null;
    const [payload, sig] = token.split('.');
    const expected = sign(payload);
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return { id: Number(data.id), username: String(data.username), name: String(data.name || data.username) };
  } catch {
    return null;
  }
}

export async function loginAdmin(username: string, password: string): Promise<AdminSession | null> {
  const [rows] = await db.query<any[]>('SELECT id,username,name,password FROM legacy.lz_admin WHERE username = ? LIMIT 1', [username]);
  const admin = rows[0];
  if (!admin || String(admin.password).toLowerCase() !== md5(password).toLowerCase()) return null;
  return { id: Number(admin.id), username: String(admin.username), name: String(admin.name || admin.username) };
}

export function cookieValue(headers: Headers, name: string) {
  const cookie = headers.get('cookie') || '';
  const part = cookie.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : '';
}

export function setAdminCookie(token: string) {
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${secureCookieSuffix()}`;
}

export function clearAdminCookie() {
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookieSuffix()}`;
}
