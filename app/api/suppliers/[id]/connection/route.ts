/** Live connection health for one supplier. Reports only whether secrets are set, never their values. */
import { connectionStatus } from "@/features/lib/integrations/supplier-server";
import { requireSupplierAccess } from '@/features/lib/integrations/supplier-access';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireSupplierAccess(_req);
  if (denied) return denied;
  const { id } = await ctx.params;
  return Response.json(connectionStatus(id));
}
