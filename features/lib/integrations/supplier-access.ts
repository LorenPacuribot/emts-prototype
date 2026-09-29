import { createHash, timingSafeEqual } from 'node:crypto';

/** Server-only access gate. The demo role selector never grants supplier access. */
export function requireSupplierAccess(req: Request, env: Record<string, string | undefined> = process.env): Response | undefined {
  const password = env.SUPPLIER_ADMIN_PASSWORD;
  if (!password || password.length < 24) return Response.json({ ok: false, error: 'Live supplier access requires a server-configured SUPPLIER_ADMIN_PASSWORD of at least 24 characters.' }, { status: 503 });
  const url = new URL(req.url);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    return Response.json({ ok: false, error: 'Supplier access requires HTTPS.' }, { status: 403 });
  }
  if (req.headers.get('sec-fetch-site') === 'cross-site' || (req.headers.get('origin') && req.headers.get('origin') !== url.origin)) {
    return Response.json({ ok: false, error: 'Cross-origin supplier access is forbidden.' }, { status: 403 });
  }
  const expected = Buffer.from(`supplier-admin:${password}`).toString('base64');
  const given = req.headers.get('authorization') ?? '';
  const hash = (s: string) => createHash('sha256').update(s).digest();
  if (!timingSafeEqual(hash(given), hash(`Basic ${expected}`))) {
    return Response.json({ ok: false, error: 'Sign in through Supplier access before using live connections.' }, { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Estimate Master suppliers", charset="UTF-8"', 'Cache-Control': 'no-store' } });
  }
}
