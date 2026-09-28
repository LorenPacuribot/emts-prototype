/**
 * MOCK SUPPLIER — for development and demos only, not a real supplier.
 *
 * Point SUPPLIER_<ID>_ENDPOINT_URL here to exercise the live HTTP path end to
 * end. It checks the bearer key like a real API would, accepts the order,
 * and queues an "order received" reply in the inbox, which is where a
 * verified call to the signed webhook would put it.
 */
import { envName, pushInbox, validatePayload } from "@/features/lib/integrations/supplier-server";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => undefined)) as { supplierId?: string } | undefined;
  const supplierId = body?.supplierId ?? "";
  const key = process.env[envName(supplierId, "API_KEY")];
  if (!key || req.headers.get("authorization") !== `Bearer ${key}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const checked = validatePayload(body, supplierId);
  if ("error" in checked) return Response.json({ error: checked.error }, { status: 422 });
  const messageId = `MOCK-${checked.payload.poId}`;
  // The mock's "callback": a real supplier would POST this to /api/suppliers/<id>/webhook.
  pushInbox(supplierId, { messageId: `${messageId}-ACK`, poId: checked.payload.poId, kind: "order_received", reference: `${messageId}-CONF` });
  return Response.json({ messageId, accepted: checked.payload.lines.length });
}
