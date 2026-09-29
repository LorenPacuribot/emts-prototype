/**
 * Email / SMS connector (features/lib/integrations/messaging-server.ts).
 *
 * GET  -> which channels are live or sandbox (never the endpoints' secrets).
 * POST -> send one message: { channel, to, subject?, body, tag? }.
 *
 * A channel with no endpoint configured runs in SANDBOX: the message stays in
 * this server's memory and nothing is delivered, so the demo can send freely.
 * A LIVE channel delivers real email or SMS, so it needs the server
 * administrator sign-in (SUPPLIER_ADMIN_PASSWORD, Settings > Suppliers) and
 * cannot be used as an open relay. Every request must come from this app's own
 * pages and is rate limited per client.
 */
import { channelStatus, clientIp, messagingStatus, rateLimiter, sameOrigin, sendMessage, validateSend } from '@/features/lib/integrations/messaging-server';
import { requireSupplierAccess } from '@/features/lib/integrations/supplier-access';

const limit = rateLimiter(30, 60_000);

export async function GET() {
  return Response.json(messagingStatus(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ ok: false, error: 'Cross-site requests are not accepted.' }, { status: 403 });
  const rl = limit(clientIp(req));
  if (!rl.ok) return Response.json({ ok: false, error: 'Too many messages. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
  const body = await req.json().catch(() => undefined);
  const checked = validateSend(body);
  if ('error' in checked) return Response.json({ ok: false, error: checked.error }, { status: 400 });
  if (channelStatus(checked.req.channel).live) {
    const denied = requireSupplierAccess(req);
    if (denied) return denied;
  }
  const result = await sendMessage(checked.req);
  return Response.json(result, { status: result.ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } });
}
