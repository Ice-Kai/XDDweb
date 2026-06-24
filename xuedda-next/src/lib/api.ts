export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export function ok(data: Record<string, unknown> = {}) {
  return json({ ok: true, ...data });
}

export function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ ok: false, message, ...extra }, status);
}

export async function readJson<T = any>(request: Request): Promise<T> {
  try {
    return await request.json();
  } catch {
    return {} as T;
  }
}
