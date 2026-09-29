import { describe, expect, it } from 'vitest';
import { requireSupplierAccess } from './supplier-access';

const env = { SUPPLIER_ADMIN_PASSWORD: 'test-only-long-password-1234567890' };
const authorization = `Basic ${Buffer.from(`supplier-admin:${env.SUPPLIER_ADMIN_PASSWORD}`).toString('base64')}`;
describe('supplier server access', () => {
  it('fails closed without configuration or credentials', () => {
    expect(requireSupplierAccess(new Request('https://app.test/api/suppliers/S/orders'), {})?.status).toBe(503);
    expect(requireSupplierAccess(new Request('https://app.test/api/suppliers/S/orders'), env)?.status).toBe(401);
  });
  it('allows configured credentials on HTTPS and refuses cross-origin requests', () => {
    expect(requireSupplierAccess(new Request('https://app.test/api/suppliers/S/orders', { headers: { authorization } }), env)).toBeUndefined();
    expect(requireSupplierAccess(new Request('https://app.test/api/suppliers/S/orders', { headers: { authorization, origin: 'https://evil.test' } }), env)?.status).toBe(403);
    expect(requireSupplierAccess(new Request('http://app.test/api/suppliers/S/orders', { headers: { authorization } }), env)?.status).toBe(403);
  });
});
