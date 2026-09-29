/**
 * Transmit a structured order to the supplier's live endpoint. The endpoint
 * and API key come from the server environment, not the request.
 */
import { transmitOrder, validatePayload } from "@/features/lib/integrations/supplier-server";
import { requireSupplierAccess } from '@/features/lib/integrations/supplier-access';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireSupplierAccess(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => undefined);
  const checked = validatePayload(body, id);
  if ("error" in checked) return Response.json({ ok: false, error: checked.error }, { status: 400 });
  const result = await transmitOrder(id, checked.payload);
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
