import { defineMiddleware } from 'astro/middleware';
import { ADMIN_COOKIE, cookieValue, verifyAdminToken } from './lib/auth';
import { fail } from './lib/api';
import { requestOriginAllowed } from './lib/security';

export const onRequest = defineMiddleware(async (context, next) => {
  const token = cookieValue(context.request.headers, ADMIN_COOKIE);
  context.locals.admin = verifyAdminToken(token);

  const path = new URL(context.request.url).pathname;
  if (path.startsWith('/api/admin') && path !== '/api/admin/login') {
    if (!context.locals.admin) return fail('请先登录后台', 401);
  }

  if (path.startsWith('/api/admin') && !['GET', 'HEAD', 'OPTIONS'].includes(context.request.method)) {
    if (!requestOriginAllowed(context.request)) return fail('非法请求来源', 403);
  }

  const response = await next();

  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'",
  );

  return response;
});
