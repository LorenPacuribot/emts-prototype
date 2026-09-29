import { describe, expect, it } from 'vitest';
import { createSeed } from '@/features/data/seed';
import { recordInvoicePayment, reconcileInvoicePayments } from '@/features/lib/store/actions/invoices';

function fixture() {
  const db = createSeed('2026-06-10T15:00:00.000Z');
  const inv = db.invoices[0]!;
  inv.status = 'sent';
  inv.amount = 10;
  inv.payments = [];
  const job = db.jobs.find((j) => j.id === inv.jobId)!;
  job.depositsCollected = 0;
  db.financeRecords = db.financeRecords.filter((r) => r.invoiceId !== inv.id);
  return { db, inv, job, actor: db.users.find((u) => u.role === 'owner')! };
}

describe('payment validation and precision', () => {
  it('reverses payment deletion across balances and preserves an accounting adjustment', () => {
    const { db, inv, job, actor } = fixture();
    expect(recordInvoicePayment(db, actor, inv.id, { amount: 5, method: 'cash' }).ok).toBe(true);
    expect(reconcileInvoicePayments(db, actor, inv.id, [], 'Duplicate receipt').ok).toBe(true);
    expect(job.depositsCollected).toBe(0);
    expect(inv.payments).toEqual([]);
    expect(db.financeRecords.find((r) => r.ref === `${inv.id}-CORRECTION`)?.amount).toBe(-5);
    expect(db.financeRecords.find((r) => r.type === 'invoice' && r.invoiceId === inv.id)?.amountPaid).toBe(0);
  });
  it('validates a correction atomically and allows a corrected amount', () => {
    const { db, inv, job, actor } = fixture();
    recordInvoicePayment(db, actor, inv.id, { amount: 5, method: 'cash' });
    const before = structuredClone(db);
    expect(reconcileInvoicePayments(db, actor, inv.id, [{ ...inv.payments![0]!, amount: 11 }], 'Correct amount').ok).toBe(false);
    expect(db).toEqual(before);
    expect(reconcileInvoicePayments(db, actor, inv.id, [{ ...inv.payments![0]!, amount: 3 }], 'Correct amount').ok).toBe(true);
    expect(job.depositsCollected).toBe(3);
  });
  it.each([0, -1, NaN, Infinity, 0.001, 10.005])('rejects invalid or rounded overpayments (%s) without mutations', (amount) => {
    const { db, inv, actor } = fixture();
    const before = structuredClone(db);
    expect(recordInvoicePayment(db, actor, inv.id, { amount, method: 'cash' }).ok).toBe(false);
    expect(db).toEqual(before);
  });

  it('uses the same rounded cents for the invoice, job and accounting records', () => {
    const { db, inv, job, actor } = fixture();
    for (let i = 0; i < 3; i++) {
      expect(recordInvoicePayment(db, actor, inv.id, { amount: 0.015, method: 'cash' }).ok).toBe(true);
    }
    expect(inv.payments?.map((p) => p.amount)).toEqual([0.02, 0.02, 0.02]);
    expect(job.depositsCollected).toBe(0.06);
    expect(db.financeRecords.find((r) => r.type === 'invoice' && r.invoiceId === inv.id)?.amountPaid).toBe(0.06);
    expect(inv.status).toBe('partial');
  });

  it('allows a final one-cent payment', () => {
    const { db, inv, actor } = fixture();
    inv.amount = 0.01;
    expect(recordInvoicePayment(db, actor, inv.id, { amount: 0.01, method: 'cash' }).ok).toBe(true);
    expect(inv.status).toBe('paid');
  });
});
