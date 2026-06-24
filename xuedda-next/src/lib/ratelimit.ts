const buckets = new Map<string, { count: number; reset: number }>();

export function clientIp(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'local'
  );
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const hit = buckets.get(key);
  if (!hit || hit.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  hit.count += 1;
  return { ok: hit.count <= limit, remaining: Math.max(0, limit - hit.count), reset: hit.reset };
}
