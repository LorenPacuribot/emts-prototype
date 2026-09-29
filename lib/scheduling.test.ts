import { describe, expect, it } from 'vitest';
import type { Job, TeamMember } from './types';
import { planReschedule, scheduleError } from './scheduling';

const team = [{ id: 'A', firstName: 'Alex', lastName: 'Painter', capacityHours: 40, status: 'Active' }] as TeamMember[];
const job = (id: string, day: string, hours = 8): Job => ({ id, jobNumber: id, title: id, customerId: 'C', address: '', status: 'Scheduled', startDate: day, endDate: day, startTime: '08:00', endTime: '16:00', crew: [{ memberId: 'A', role: 'Painter', hours }], breaks: [], notes: [], history: [], value: 0, estimatedHours: hours, createdAt: day });

describe('daily capacity and protected rescheduling', () => {
  it('rejects 6 + 6 hours on an eight-hour day and permits 6 + 2', () => {
    const existing = job('old', '2026-10-01', 6);
    expect(scheduleError(job('new', '2026-10-01', 6), [existing], team)).toContain('2.00 hours available');
    expect(scheduleError(job('new', '2026-10-01', 2), [existing], team)).toBeUndefined();
  });
  it('checks individual days, dated assignments and breaks', () => {
    const existing = job('old', '2026-10-01', 8);
    const candidate = { ...job('new', '2026-10-01', 8), endDate: '2026-10-02' };
    expect(scheduleError(candidate, [existing], team)).toBeDefined();
    candidate.crew[0]!.date = '2026-10-02';
    expect(scheduleError(candidate, [existing], team)).toBeUndefined();
    candidate.breaks = [{ id: 'B', startDate: '2026-10-02', endDate: '2026-10-02', reason: 'Rain' }];
    expect(scheduleError(candidate, [existing], team)).toContain('outside');
  });
  it('leapfrogs a protected anchor and reserves capacity for the entire batch', () => {
    const jobs = [job('one', '2026-10-01'), { ...job('anchor', '2026-10-02'), scheduleProtected: true }, job('two', '2026-10-03')];
    const result = planReschedule(jobs, team, jobs.map((j) => j.id), '2026-10-01', 1);
    expect(result.error).toBeUndefined();
    expect(result.jobs.map((j) => [j.id, j.startDate])).toEqual([['one', '2026-10-03'], ['two', '2026-10-04']]);
    expect(jobs[1]!.startDate).toBe('2026-10-02');
  });
  it('returns no partial plan when a job cannot fit its daily window', () => {
    const jobs = [job('one', '2026-10-01'), job('too-long', '2026-10-02', 9)];
    expect(planReschedule(jobs, team, jobs.map((j) => j.id), '2026-10-01', 1)).toMatchObject({ jobs: [], error: expect.any(String) });
  });
  it('moves dated assignments and breaks with the job without changing the source', () => {
    const source = { ...job('dated', '2026-10-01'), endDate: '2026-10-02',
      crew: [{ memberId: 'A', role: 'Painter', hours: 8, date: '2026-10-01' }],
      breaks: [{ id: 'rain', reason: 'Rain', startDate: '2026-10-02', endDate: '2026-10-02' }] };
    const result = planReschedule([source], team, ['dated'], '2026-10-01', 1);
    expect(result.error).toBeUndefined();
    expect(result.jobs[0]!.crew[0]!.date).toBe('2026-10-02');
    expect(result.jobs[0]!.breaks[0]!.startDate).toBe('2026-10-03');
    expect(source.crew[0]!.date).toBe('2026-10-01');
  });
  it('enforces weekly capacity even when each day fits', () => {
    const jobs = Array.from({ length: 5 }, (_, i) => job(String(i), `2026-10-${String(5 + i).padStart(2, '0')}`));
    expect(scheduleError(job('weekend', '2026-10-10'), jobs, team)).toContain('week of');
  });
});
