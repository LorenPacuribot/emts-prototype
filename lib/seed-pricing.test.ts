/**
 * QA D-05: seeded estimate lines must follow the replica's own line formula,
 * or the first edit to an amendment re-prices them (EST-2026-3 fell from
 * $6,850 to $1,063.13: labour only, because the unit price was 0).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createSeed } from '@/features/data/seed';
import { useStore } from '@/features/lib/store';
import { createInitialDatabase } from '@/lib/sampleData';
import { applyOps, resetBridge, runSync } from '@/lib/bridge/sync';
import { estimateTotals, lineTotal } from '@/lib/calculations';
import { priceLine } from '@/components/estimates/estimate-utils';

beforeEach(() => {
  resetBridge();
  useStore.setState({ db: createSeed('2026-06-10T15:00:00.000Z'), currentUserId: 'U-OWNER' });
});

describe('seeded estimate pricing', () => {
  it('every seeded line reproduces its total, so re-pricing changes nothing', () => {
    let db = createInitialDatabase();
    db = applyOps(db, runSync(db, { baseline: true }));
    const c = db.collections;
    const ctx = { surfaceRates: c.surfaceRates, tiers: c.difficultyTiers, tableColumns: c.tableColumns, paints: c.paintProducts };
    const priced = c.estimates.filter((e) => e.lineItems.length);
    expect(priced.length).toBeGreaterThan(2);
    for (const e of priced) {
      for (const l of e.lineItems) expect(Math.abs(lineTotal(l, e.profitMargin) - l.total), `${e.id} ${l.id}`).toBeLessThan(0.02);
      const repriced = { ...e, lineItems: e.lineItems.map((l) => priceLine(l, { ...ctx, profitMargin: e.profitMargin })) };
      expect(Math.abs(estimateTotals(repriced).total - estimateTotals(e).total), e.id).toBeLessThan(0.05);
    }
  });
});
