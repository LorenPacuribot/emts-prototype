/** Live connection health for one supplier. Reports only whether secrets are set, never their values. */
import { connectionStatus } from "@/features/lib/integrations/supplier-server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return Response.json(connectionStatus(id));
}
