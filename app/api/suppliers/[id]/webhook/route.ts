/**
 * Supplier status webhook. The supplier signs the raw body with the shared
 * secret: header `X-Supplier-Signature: sha256=<hex HMAC>`. Unsigned or
 * mis-signed requests are rejected before anything is read.
 */
import { envName, pushInbox, validateMessage, verifySignature } from "@/features/lib/integrations/supplier-server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const raw = await req.text();
  if (!verifySignature(process.env[envName(id, "WEBHOOK_SECRET")], raw, req.headers.get("x-supplier-signature"))) {
    return Response.json({ ok: false, error: "Invalid or missing signature." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }
  const checked = validateMessage(body);
  if ("error" in checked) return Response.json({ ok: false, error: checked.error }, { status: 400 });
  pushInbox(id, checked.msg);
  return Response.json({ ok: true }, { status: 202 });
}
