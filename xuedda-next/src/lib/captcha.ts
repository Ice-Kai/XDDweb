import { createHmac, timingSafeEqual } from 'node:crypto';

const CAPTCHA_TTL_MS = 5 * 60 * 1000;

function secret() {
  return process.env.SESSION_SECRET || import.meta.env.SESSION_SECRET || 'xuedda-dev-secret';
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function createCaptchaChallenge() {
  const a = Math.floor(Math.random() * 8) + 2;
  const b = Math.floor(Math.random() * 8) + 2;
  const answer = String(a + b);
  const expiresAt = Date.now() + CAPTCHA_TTL_MS;
  const nonce = Math.random().toString(36).slice(2, 12);
  const payload = [answer, expiresAt, nonce].join('.');
  const token = Buffer.from(`${payload}.${sign(payload)}`).toString('base64url');

  return {
    question: `${a} + ${b} = ?`,
    token,
    expiresIn: Math.floor(CAPTCHA_TTL_MS / 1000),
  };
}

export function verifyCaptcha(token: string, answer: string) {
  if (!token || !answer) return false;

  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parts = raw.split('.');
    if (parts.length !== 4) return false;

    const [expectedAnswer, expiresAtText, nonce, sig] = parts;
    const payload = [expectedAnswer, expiresAtText, nonce].join('.');
    if (!safeEqual(sign(payload), sig)) return false;

    const expiresAt = Number(expiresAtText);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

    return String(answer).trim() === expectedAnswer;
  } catch {
    return false;
  }
}
