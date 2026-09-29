import { beforeEach, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { createSeed } from '@/features/data/seed';
import { getDb, useStore } from '@/features/lib/store';
import { createInitialDatabase } from '@/lib/sampleData';
import { applyOps, resetBridge, runSync } from './sync';
import { dayOf } from './map';
import { estimateTotals } from '@/lib/calculations';
import { acceptEstimateByToken, markEstimateApproved } from '@/features/lib/store/actions/estimates';

beforeEach(() => {
  resetBridge();
  useStore.setState({ db: createSeed('2026-06-10T15:00:00.000Z'), currentUserId: 'U-OFFICE' });
});

const initial = () => {
  const db = createInitialDatabase();
  return applyOps(db, runSync(db, { baseline: true }));
};

describe('scope bridge', () => {
  it('supports optional selections through the token page and synchronizes the signed quote back', () => {
    let replica = initial();
    const estimate = replica.collections.estimates.find((e) => e.status === 'Draft' && e.lineItems.length && !getDb().estimates.find((p) => p.id === e.id)?.repeatEstimateId)!;
    replica = produce(replica, (d) => {
      const e = d.collections.estimates.find((e) => e.id === estimate.id)!;
      e.lineItems.push({ ...e.lineItems[0]!, id: 'TOKEN-OPTION', optional: true, total: 80, laborHours: 2.5 });
    });
    replica = applyOps(replica, runSync(replica));
    useStore.setState(({ db }) => ({ db: produce(db, (d) => {
      const e = d.estimates.find((e) => e.id === estimate.id)!;
      e.status = 'SENT';
      const result = acceptEstimateByToken(d, d.users[0]!, e.publicToken!, { signatureName: 'Customer', signed: true, selectedOptionalIds: ['TOKEN-OPTION'] });
      if (!result.ok) throw new Error(result.error);
    }) }));
    replica = applyOps(replica, runSync(replica));
    const accepted = replica.collections.estimates.find((e) => e.id === estimate.id)!;
    expect(accepted.lineItems.find((l) => l.id === 'TOKEN-OPTION')?.selected).toBe(true);
    expect(accepted.status).toBe('Approved');
    expect(estimateTotals(accepted).total).toBe(getDb().estimates.find((e) => e.id === estimate.id)!.total);
    // A second pass must not silently undo the customer's accepted selection.
    const next = applyOps(replica, runSync(replica));
    expect(next.collections.estimates.find((e) => e.id === estimate.id)?.lineItems).toEqual(accepted.lineItems);
  });
  it('keeps optional pricing out of production and uses saved pricing on approval', () => {
    let replica = initial();
    const estimate = replica.collections.estimates.find((e) => e.status === 'Draft' && e.lineItems.length && !getDb().estimates.find((p) => p.id === e.id)?.repeatEstimateId)!;
    replica = produce(replica, (d) => {
      const e = d.collections.estimates.find((e) => e.id === estimate.id)!;
      e.lineItems[0]!.total = 123;
      e.lineItems.push({ ...e.lineItems[0]!, id: 'OPTION', total: 77, optional: true });
      e.extras = [];
      e.discountType = 'none';
      e.taxRate = 0;
    });
    replica = applyOps(replica, runSync(replica));
    const e = replica.collections.estimates.find((e) => e.id === estimate.id)!;
    expect(estimateTotals(e).optionalSubtotal).toBe(77);
    useStore.setState(({ db }) => ({ db: produce(db, (d) => {
      const result = markEstimateApproved(d, d.users.find((u) => u.role === 'owner')!, estimate.id);
      if (!result.ok) throw new Error(result.error);
      expect(result.ok).toBe(true);
    }) }));
    const accepted = getDb().estimates.find((e) => e.id === estimate.id)!;
    const job = getDb().jobs.find((j) => j.id === accepted.jobId)!;
    expect(job.contractValue).toBe(estimateTotals(e).total);
    expect(job.surfaceIds).not.toContain('OPTION');
  });

  it('accepts selected optional scope from a sent quote without changing its other pricing', () => {
    let replica = initial();
    const estimate = replica.collections.estimates.find((e) => e.status === 'Draft' && e.lineItems.length)!;
    replica = produce(replica, (d) => {
      const e = d.collections.estimates.find((e) => e.id === estimate.id)!;
      e.lineItems.push({ ...e.lineItems[0]!, id: 'SELECTED-OPTION', total: 77, optional: true });
    });
    replica = applyOps(replica, runSync(replica));
    useStore.setState(({ db }) => ({ db: produce(db, (d) => { d.estimates.find((e) => e.id === estimate.id)!.status = 'SENT'; }) }));
    replica = applyOps(replica, runSync(replica));
    replica = produce(replica, (d) => {
      const e = d.collections.estimates.find((e) => e.id === estimate.id)!;
      e.lineItems.find((l) => l.id === 'SELECTED-OPTION')!.selected = true;
      e.status = 'Approved';
      e.signature = { name: 'Customer', date: '2026-06-10' };
    });
    replica = applyOps(replica, runSync(replica));
    const accepted = getDb().estimates.find((e) => e.id === estimate.id)!;
    expect(accepted.status).toBe('ACCEPTED');
    expect(getDb().jobs.find((j) => j.id === accepted.jobId)!.surfaceIds).toContain('SELECTED-OPTION');
    expect(accepted.total).toBe(estimateTotals(replica.collections.estimates.find((e) => e.id === estimate.id)!).total);
  });

  it('does not interpret linear feet as coating square feet', () => {
    let replica = initial();
    const estimate = replica.collections.estimates.find((e) => e.status === 'Draft' && e.lineItems.length)!;
    replica = produce(replica, (d) => {
      const line = d.collections.estimates.find((e) => e.id === estimate.id)!.lineItems[0]!;
      line.unit = 'lnft'; line.quantity = 100;
    });
    runSync(replica);
    expect(getDb().surfaces.find((s) => s.id === estimate.lineItems[0]!.id)).toMatchObject({ areaSqft: 0, measuredQuantity: 100, measurementUnit: 'lnft' });
  });
  it('preserves fractional quantities and propagates renamed surfaces', () => {
    let replica = initial();
    const estimate = replica.collections.estimates.find((e) => e.status === 'Draft' && e.lineItems.length)!;
    expect(estimate).toBeDefined();
    const lineId = estimate.lineItems[0]!.id;
    replica = produce(replica, (d) => {
      const line = d.collections.estimates.find((e) => e.id === estimate.id)!.lineItems[0]!;
      line.quantity = 0.25;
      line.description = 'North wall section';
    });
    replica = applyOps(replica, runSync(replica));
    expect(getDb().surfaces.find((s) => s.id === lineId)).toMatchObject({ areaSqft: 0.25, name: 'North wall section' });
    replica = produce(replica, (d) => {
      d.collections.estimates.find((e) => e.id === estimate.id)!.lineItems[0]!.description = 'South wall section';
    });
    runSync(replica);
    expect(getDb().surfaces.find((s) => s.id === lineId)?.name).toBe('South wall section');
  });

  it('removes deleted surfaces from active paint specifications while retaining property history', () => {
    let replica = initial();
    const estimate = replica.collections.estimates.find((e) => e.status === 'Draft' && e.lineItems.length)!;
    const featureEstimate = getDb().estimates.find((e) => e.id === estimate.id)!;
    const lineId = estimate.lineItems[0]!.id;
    useStore.setState(({ db }) => ({ db: produce(db, (d) => {
      const template = d.specs[0]!;
      d.specs.push({ ...template, id: 'SPEC-BRIDGE-TEST', jobId: featureEstimate.jobId!, surfaceIds: [lineId] });
    }) }));
    replica = produce(replica, (d) => {
      const e = d.collections.estimates.find((e) => e.id === estimate.id)!;
      e.lineItems = e.lineItems.filter((l) => l.id !== lineId);
    });
    runSync(replica);
    expect(getDb().specs.find((s) => s.id === 'SPEC-BRIDGE-TEST')?.surfaceIds).toEqual([]);
    expect(getDb().surfaces.some((s) => s.id === lineId)).toBe(true);
  });
});

describe('calendar bridge', () => {
  it('preserves date-only values without interpreting them as UTC instants', () => {
    expect(dayOf('2026-06-10')).toBe('2026-06-10');
    expect(dayOf('invalid')).toBeUndefined();
    expect(dayOf()).toBeUndefined();
  });

  it('updates appointment duration and removes cancelled generated events only', () => {
    let replica = initial();
    const event = replica.collections.events.find((e) => e.leadId && e.id === `ev-${e.leadId}`)!;
    expect(event).toBeDefined();
    useStore.setState(({ db }) => ({ db: produce(db, (d) => {
      const lead = d.leads.find((l) => l.id === event.leadId)!;
      lead.durationMin = (lead.durationMin ?? 60) + 30;
    }) }));
    replica = applyOps(replica, runSync(replica));
    expect(replica.collections.events.find((e) => e.id === event.id)?.endTime).not.toBe(event.endTime);
    const manualIds = replica.collections.events.filter((e) => e.id !== `ev-${e.leadId}`).map((e) => e.id);
    useStore.setState(({ db }) => ({ db: produce(db, (d) => {
      d.leads.find((l) => l.id === event.leadId)!.scheduledAt = undefined;
    }) }));
    replica = applyOps(replica, runSync(replica));
    expect(replica.collections.events.some((e) => e.id === event.id)).toBe(false);
    expect(manualIds.every((id) => replica.collections.events.some((e) => e.id === id))).toBe(true);
  });
});

describe('invoice bridge', () => {
  it('reverses deleted payments without leaving stale job deposits', () => {
    let replica = initial();
    const invoice = replica.collections.invoices.find((i) => i.status === 'Draft' && !i.payments.length)!;
    const before = getDb().jobs.find((j) => j.id === invoice.jobId)!.depositsCollected;
    replica = produce(replica, (d) => { d.collections.invoices.find((i) => i.id === invoice.id)!.payments.push({ id: 'PAY-CORRECT', amount: 1, method: 'Cash', date: '2026-06-10' }); });
    replica = applyOps(replica, runSync(replica));
    expect(getDb().jobs.find((j) => j.id === invoice.jobId)!.depositsCollected).toBe(before + 1);
    replica = produce(replica, (d) => { d.collections.invoices.find((i) => i.id === invoice.id)!.payments = []; });
    replica = applyOps(replica, runSync(replica));
    expect(getDb().jobs.find((j) => j.id === invoice.jobId)!.depositsCollected).toBe(before);
    expect(getDb().financeRecords.some((r) => r.invoiceId === invoice.id && r.type === 'payment' && r.amount === -1)).toBe(true);
  });
  it('does not mark an invoice paid when the submitted payment is rejected', () => {
    let replica = initial();
    const invoice = replica.collections.invoices.find((i) => i.status === 'Draft' && !i.payments.length)!;
    expect(invoice).toBeDefined();
    replica = produce(replica, (d) => {
      const inv = d.collections.invoices.find((i) => i.id === invoice.id)!;
      inv.payments.push({ id: 'REJECTED-PAY', date: '2026-06-10', amount: 1e9, method: 'Cash' });
      inv.status = 'Paid';
    });
    replica = applyOps(replica, runSync(replica));
    expect(getDb().invoices.find((i) => i.id === invoice.id)?.status).toBe('draft');
    expect(replica.collections.invoices.find((i) => i.id === invoice.id)).toMatchObject({ status: 'Draft', payments: [] });
  });
});
