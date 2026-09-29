import { requireSupplierAccess } from '@/features/lib/integrations/supplier-access';

export async function GET(req: Request) {
  const denied = requireSupplierAccess(req);
  if (denied) return denied;
  return Response.redirect(new URL('/settings/suppliers', req.url), 303);
}
