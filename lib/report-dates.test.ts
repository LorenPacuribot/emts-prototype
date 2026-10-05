/** QA D-04: report periods use the local day the screens show, not the UTC date. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inDateRange, localDay } from '@/components/reports/data';

const tz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/Chicago'; });
afterAll(() => { process.env.TZ = tz; });

describe('report dates', () => {
  it('books a 7:30 p.m. approval on 30 Sep in September, not October', () => {
    const evening = '2026-10-01T00:30:00.000Z'; // 30 Sep, 7:30 p.m. in Chicago
    expect(localDay(evening)).toBe('2026-09-30');
    expect(inDateRange(evening, { start: '2026-09-01', end: '2026-09-30' })).toBe(true);
    expect(inDateRange(evening, { start: '2026-10-01', end: '2026-10-31' })).toBe(false);
  });

  it('leaves plain dates alone', () => {
    expect(localDay('2026-09-30')).toBe('2026-09-30');
    expect(inDateRange('2026-09-30', { start: '2026-09-30', end: '2026-09-30' })).toBe(true);
  });
});
