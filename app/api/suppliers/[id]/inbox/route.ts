/** Verified supplier messages since `after`, collected by the app and applied to its orders. */
import { readInbox } from "@/features/lib/integrations/supplier-server";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0) || 0;
  return Response.json(readInbox(id, after));
}
