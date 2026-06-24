import { defineMiddleware } from 'astro/middleware';
import { ADMIN_COOKIE, cookieValue, verifyAdminToken } from './lib/auth';
import { fail } from './lib/api';

export const onRequest = defineMiddleware(async (context, next) => {
  const token = cookieValue(context.request.headers, ADMIN_COOKIE);
  context.locals.admin = verifyAdminToken(token);

  const path = new URL(context.request.url).pathname;
  if (path.startsWith('/api/admin') && path !== '/api/admin/login') {
    if (!context.locals.admin) return fail('请先登录后台', 401);
  }

  return next();
});
