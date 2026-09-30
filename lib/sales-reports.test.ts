import { beforeAll, describe, expect, it } from 'vitest';
import { createSeed } from '@/features/data/seed';
import { useStore } from '@/features/lib/store';
import { createInitialDatabase } from './sampleData';
import { applyOps, resetBridge, runSync } from './bridge/sync';
import { estimateTotals, versionSnapshot } from './calculations';
import { migrateEstimateVersions } from './migrate';
import type { Database, Estimate, EstimateVersion } from './types';
import { entriesMismatch, estimatesLog, jobsSold, monthlyStats } from '@/components/reports/data';
import { computeDashboard } from '@/components/dashboard/metrics';

/*
  The report checks from the 30 Sep call (RP): an amendment books only its
  difference, in the month it was re-approved.
*/

const ALL = { start: '', end: '' };

/** The replica data as the app loads it: core records come across the bridge. */
function loaded(): Database {
  resetBridge();
  useStore.setState({ db: createSeed('2026-06-10T15:00:00.000Z'), currentUserId: 'U-OFFICE' });
  const db = createInitialDatabase();
  return applyOps(db, runSync(db, { baseline: true }));
}

let db: Database;
let e: Estimate;
beforeAll(() => {
  db = loaded();
  e = soldEstimate(db);
});
const month = (m: string) => ({ start: `2026-${m}-01`, end: `2026-${m}-31` });

/** A sold estimate with a job, and its lines scaled so the pre-tax total is `total`. */
function soldEstimate(db: Database) {
  const e = db.collections.estimates.find((x) => x.status === 'Approved' && x.jobId && db.collections.jobs.some((j) => j.id === x.jobId))!;
  return e;
}

/** Re-prices the estimate to `total` (one extra line) and records the amendment's versions. */
function amend(e: Estimate, total: number, reapprovedAt: string, extraHours = 0): Estimate {
  const current = estimateTotals(e).taxable;
  const next: Estimate = {
    ...e,
    lineItems: [...e.lineItems, { ...e.lineItems[0]!, id: `${e.id}_amend_${reapprovedAt}`, description: 'Amendment line', total: total - current, laborHours: extraHours, optional: false }],
    approvedAt: reapprovedAt,
  };
  const snap = versionSnapshot(next);
  const last = e.versions.reduce((m, v) => Math.max(m, v.version), 0);
  const vs: EstimateVersion[] = (['Draft', 'Sent', 'Approved'] as const).map((status, i) => ({
    version: last + i + 1, date: reapprovedAt, total: estimateTotals(next).total, status, changedBy: 'Test', note: status, ...snap,
  }));
  return { ...next, versions: [...e.versions, ...vs] };
}

function withEstimate(db: Database, e: Estimate): Database {
  return { ...db, collections: { ...db.collections, estimates: db.collections.estimates.map((x) => (x.id === e.id ? e : x)) } };
}

describe('sales entries in reports', () => {
  const soldMonth = () => e.approvedAt!.slice(5, 7);
  const original = () => estimateTotals(e).taxable;

  it('seeded sold estimates add up (no flag)', () => {
    expect(db.collections.estimates.filter(entriesMismatch)).toEqual([]);
  });

  it('an increase books the difference in the month of re-approval', () => {
    const after = withEstimate(db, amend(e, original() + 50, '2026-10-02T10:00:00Z', 2));
    const rows = estimatesLog(after, ALL, [], e.estimateNumber).rows.filter((r) => r.estimateId === e.id);
    expect(rows.map((r) => r.entry?.label)).toEqual(['Original', 'Amendment 1']);
    expect(rows.every((r) => r.groupSize === 2 && r.estimateNumber === e.estimateNumber)).toBe(true);

    const sum = (range: { start: string; end: string }) =>
      estimatesLog(after, range, [], e.estimateNumber).rows.filter((r) => r.estimateId === e.id).reduce((s, r) => s + r.amount, 0);
    expect(sum(month(soldMonth()))).toBeCloseTo(original(), 2);
    expect(sum(month('10'))).toBeCloseTo(50, 2);

    const oct = jobsSold(after, month('10')).totals;
    expect(oct.amendments).toBeCloseTo(50, 2);
    expect(oct.newSales).toBe(0);
    const stats = monthlyStats(after, 2026);
    expect(stats[9]!.actualSold).toBeCloseTo(50, 2);
    expect(stats[9]!.jobsSold).toBe(0);
  });

  it('a paint colour change only adds no row', () => {
    const renamed: Estimate = {
      ...e,
      lineItems: e.lineItems.map((l, i) => (i === 0 ? { ...l, paintName: 'Renamed colour' } : l)),
    };
    const last = e.versions.reduce((m, v) => Math.max(m, v.version), 0);
    const snap = versionSnapshot(renamed);
    const again = { ...renamed, versions: [...e.versions, { version: last + 1, date: '2026-10-02T10:00:00Z', total: estimateTotals(renamed).total, status: 'Approved' as const, changedBy: 'Test', note: 'Re-approved', ...snap }] };
    const rows = estimatesLog(withEstimate(db, again), ALL, [], e.estimateNumber).rows.filter((r) => r.estimateId === e.id);
    expect(rows).toHaveLength(1);
  });

  it('a drop books a negative row in the month of re-approval and leaves the earlier month alone', () => {
    const before = jobsSold(db, month(soldMonth())).totals.amount;
    const after = withEstimate(db, amend(e, original() - 300, '2026-10-05T10:00:00Z'));
    expect(jobsSold(after, month(soldMonth())).totals.amount).toBeCloseTo(before, 2);
    const oct = estimatesLog(after, month('10'), [], e.estimateNumber).rows.filter((r) => r.estimateId === e.id);
    expect(oct).toHaveLength(1);
    expect(oct[0]!.amount).toBeCloseTo(-300, 2);
  });

  it('dashboard estimate counts and win rate are unchanged by an amendment (RP-M5)', () => {
    const after = withEstimate(db, amend(e, original() + 50, '2026-10-02T10:00:00Z'));
    const period = { preset: 'all_time' as const };
    const a = computeDashboard(db, period);
    const b = computeDashboard(after, period);
    expect(b.estimateStatus.total).toBe(a.estimateStatus.total);
    expect(b.winRate.accepted).toBe(a.winRate.accepted);
    expect(b.winRate.total).toBe(a.winRate.total);
    expect(b.winRate.winRate).toBe(a.winRate.winRate);
    // Money moves by the amendment only.
    expect(b.revenue.total - a.revenue.total).toBeCloseTo(50, 2);
  });
});

describe('estimate version migration (RP-M6)', () => {

  it('adds the approval an estimate approved elsewhere never recorded', () => {
    const bare: Estimate = { ...e, versions: e.versions.filter((v) => v.status !== 'Approved') };
    const next = migrateEstimateVersions(bare);
    const approved = next.versions.filter((v) => v.status === 'Approved');
    expect(approved).toHaveLength(1);
    expect(approved[0]!.date).toBe(e.approvedAt);
    expect(entriesMismatch(next)).toBe(false);
  });

  it('fills in the snapshot on an old approved version', () => {
    const old: Estimate = { ...e, versions: e.versions.map(({ preTaxTotal: _p, laborHours: _h, lines: _l, ...v }) => v) };
    const next = migrateEstimateVersions(old);
    expect(next.versions.at(-1)!.preTaxTotal).toBe(estimateTotals(e).taxable);
    expect(migrateEstimateVersions(next)).toBe(next);
  });

  it('records a re-approval that changed the total, on its date', () => {
    const amended = amend(e, estimateTotals(e).taxable + 50, '2026-10-02T10:00:00Z');
    const lost: Estimate = { ...amended, versions: e.versions };
    const next = migrateEstimateVersions(lost);
    expect(next.versions.at(-1)).toMatchObject({ status: 'Approved', date: '2026-10-02T10:00:00Z' });
    expect(entriesMismatch(next)).toBe(false);
  });

  it('leaves estimates already up to date alone', () => {
    expect(migrateEstimateVersions(e)).toBe(e);
  });
});

describe('amendment through the prototype screens', () => {
  it('records the re-approval as a version, so reports book only the difference', async () => {
    const { act, getDb } = await import('@/features/lib/store');
    const { amendEstimate, sendForReapproval, acceptEstimateByToken } = await import('@/features/lib/store/actions/estimates');
    const { produce } = await import('immer');
    const { can } = await import('@/features/lib/permissions');
    const { amendBlockedReason } = await import('@/features/lib/rules/estimate-lifecycle');
    let replica = loaded();
    const p = getDb();
    useStore.setState({ currentUserId: p.users.find((u) => can(u, 'estimate.amend'))!.id });
    // A sold estimate whose work has not started, so Amend is allowed.
    const sold = replica.collections.estimates.find((x) => {
      const pe = p.estimates.find((y) => y.id === x.id);
      const wo = p.workOrders.find((w) => w.jobId === pe?.jobId);
      return x.status === 'Approved' && pe && p.jobs.some((j) => j.id === pe.jobId) && !amendBlockedReason(pe, wo?.status);
    })!;
    const before = estimateTotals(sold).taxable;

    // Amend Estimate (feature 24) on the prototype side.
    const opened = act(amendEstimate, sold.id);
    expect(opened.ok ? "" : (opened as { error: string }).error).toBe("");
    replica = applyOps(replica, runSync(replica));
    expect(replica.collections.estimates.find((x) => x.id === sold.id)!.status).toBe('Draft');

    // The estimator adds $50 of scope on the estimate page.
    replica = produce(replica, (d) => {
      const x = d.collections.estimates.find((y) => y.id === sold.id)!;
      x.extras.push({ id: 'AMEND-50', name: 'Extra closet', quantity: 1, unitPrice: 50 });
    });
    replica = applyOps(replica, runSync(replica));

    expect(act(sendForReapproval, sold.id).ok).toBe(true);
    const token = getDb().estimates.find((x) => x.id === sold.id)!.publicToken!;
    expect(act(acceptEstimateByToken, token, { signatureName: 'Customer', signed: true }).ok).toBe(true);
    replica = applyOps(replica, runSync(replica));

    const after = replica.collections.estimates.find((x) => x.id === sold.id)!;
    expect(after.status).toBe('Approved');
    const rows = estimatesLog(replica, ALL, [], after.estimateNumber).rows.filter((r) => r.estimateId === sold.id);
    expect(rows.map((r) => r.entry?.label)).toEqual(['Original', 'Amendment 1']);
    expect(rows[0]!.amount).toBeCloseTo(before, 2);
    expect(rows[1]!.amount).toBeCloseTo(estimateTotals(after).taxable - before, 2);
    expect(entriesMismatch(after)).toBe(false);
  });
});
