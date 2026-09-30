import { beforeEach, describe, expect, it } from 'vitest';
import { createSeed } from '@/features/data/seed';
import { useStore } from '@/features/lib/store';
import { markNotified, peopleWaiting, unsentJobIds } from '@/features/lib/rules/schedule-notify';
import { createInitialDatabase } from './sampleData';
import { applyOps, resetBridge, runSync } from './bridge/sync';
import { withNotifyBaseline } from './schedule-notify';
import { automatedMessages } from './data/settings-config';
import type { Database } from './types';

beforeEach(() => {
  resetBridge();
  useStore.setState({ db: createSeed('2026-06-10T15:00:00.000Z'), currentUserId: 'U-OFFICE' });
});

const loaded = (): Database => {
  const db = createInitialDatabase();
  return withNotifyBaseline(applyOps(db, runSync(db, { baseline: true })));
};

const shift = (iso: string, days: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

describe('crew schedule notifications in the app data', () => {
  it('nothing is unsent after loading, even after another bridge pass', () => {
    const db = loaded();
    const again = applyOps(db, runSync(db));
    expect(peopleWaiting(again.collections.jobs, again.collections.scheduleNotifySnapshots)).toEqual([]);
  });

  it('moving a scheduled job makes it unsent for its crew, and a send clears only who was sent to', () => {
    const db = loaded();
    const job = db.collections.jobs.find((j) => j.startDate && j.crew.length >= 1 && j.status !== 'Completed' && j.status !== 'Cancelled')!;
    const moved = db.collections.jobs.map((j) => (j.id === job.id ? { ...j, startDate: shift(j.startDate!, 2), endDate: shift(j.endDate ?? j.startDate!, 2) } : j));
    const snaps = db.collections.scheduleNotifySnapshots;
    const waiting = peopleWaiting(moved, snaps);
    const crewIds = [...new Set(job.crew.map((c) => c.memberId))].sort();
    expect(waiting.map((p) => p.memberId).sort()).toEqual(crewIds);
    expect(unsentJobIds(moved, snaps).has(job.id)).toBe(true);

    const [first] = crewIds;
    const after = markNotified(snaps, first!, moved, '2026-09-30T10:00:00Z');
    expect(peopleWaiting(moved, after).map((p) => p.memberId)).not.toContain(first);
  });

  it('the crew template is seeded as Manual', () => {
    expect(automatedMessages.find((t) => t.id === 'am_crew_schedule')).toMatchObject({ mode: 'manual', isActive: true });
  });
});

describe('the demo schedule', () => {
  // Seed dates are relative to today, so check every weekday alignment.
  it.each([10, 11, 12, 13, 14, 15, 16])('has no conflicts on any weekday (June %i), so every seeded job can be saved', async (day) => {
    const { scheduleError } = await import('./scheduling');
    resetBridge();
    useStore.setState({ db: createSeed(`2026-06-${day}T15:00:00.000Z`), currentUserId: 'U-OFFICE' });
    const fresh = createInitialDatabase();
    const db = applyOps(fresh, runSync(fresh, { baseline: true }));
    const jobs = db.collections.jobs.filter((j) => j.startDate && j.status !== 'Completed' && j.status !== 'Cancelled');
    expect(jobs.length).toBeGreaterThan(0);
    for (const j of jobs) expect([j.id, scheduleError(j, db.collections.jobs, db.collections.team) ?? 'ok']).toEqual([j.id, 'ok']);
  });
});
