import { describe, expect, it } from 'vitest';
import type { Job, TeamMember } from '@/lib/types';
import { calendarSegments, moveShifts, scheduleDraft, datedShiftCrew } from '@/components/scheduling/shift-draft';
import { memberDayHours, workingJobDays } from '@/components/scheduling/schedule-utils';
import { scheduleError } from '@/lib/scheduling';

const job: Job = { id: 'j', jobNumber: 'J1', title: 'Paint', customerId: '', address: '', status: 'Scheduled', startDate: '2026-09-21', endDate: '2026-09-30', startTime: '08:00', endTime: '17:00', estimatedHours: 100, value: 0, createdAt: '', breaks: [], notes: [], history: [],
  shifts: [{ id: 'a', name: 'Shift 1', startDate: '2026-09-21', endDate: '2026-09-23', startTime: '08:00', endTime: '17:00', memberIds: ['m'], dailyHours: { '2026-09-22': null, '2026-09-23': { startTime: '08:00', endTime: '12:00' } } }, { id: 'b', name: 'Shift 2', startDate: '2026-09-30', endDate: '2026-09-30', startTime: '08:00', endTime: '17:00', memberIds: ['m'] }],
  crew: [{ memberId: 'm', role: 'Painter', shiftId: 'a', date: '2026-09-21', hours: 8 }, { memberId: 'm', role: 'Painter', shiftId: 'a', date: '2026-09-23', hours: 4 }, { memberId: 'm', role: 'Painter', shiftId: 'b', date: '2026-09-30', hours: 8 }] };
const team = [{ id: 'm', firstName: 'Alex', lastName: '', capacityHours: 40, status: 'Active' }] as TeamMember[];

describe('shift based schedules', () => {
  it('keeps gaps off the calendar and out of assigned hours', () => {
    expect(workingJobDays(job)).toEqual(['2026-09-21', '2026-09-23', '2026-09-30']);
    expect(calendarSegments([job]).map((s) => [s.startDate, s.endDate])).toEqual([['2026-09-21', '2026-09-21'], ['2026-09-23', '2026-09-23'], ['2026-09-30', '2026-09-30']]);
    expect(memberDayHours(job, 'm', '2026-09-22')).toBe(0);
  });
  it('moves only selected shifts, including overrides and dated hours', () => {
    const moved = moveShifts(job, ['a'], 1);
    expect(moved.startDate).toBe('2026-09-22');
    expect(moved.shifts![0]!.dailyHours!['2026-09-23']).toBeNull();
    expect(moved.crew[0]!.date).toBe('2026-09-22');
    expect(moved.shifts![1]).toEqual(job.shifts![1]);
    expect(job.startDate).toBe('2026-09-21');
  });
  it('validates the daily override instead of just the default window', () => {
    expect(scheduleError(job, [], team)).toBeUndefined();
    const invalid = structuredClone(job);
    invalid.crew[1]!.hours = 5;
    expect(scheduleError(invalid, [], team)).toContain('4.00 hours');
  });
  it('preserves legacy hours when opening and editing a schedule', () => {
    const legacy = { ...job, endDate: '2026-09-22', shifts: undefined, crew: [{ memberId: 'm', role: 'Painter', hours: 12 }] };
    const draft = scheduleDraft(legacy);
    expect(datedShiftCrew(draft, draft.shifts![0]!).map((c) => c.hours)).toEqual([6, 6]);
    expect(legacy.crew[0]).not.toHaveProperty('shiftId');
  });
  it('moves an entire draft without mutating the saved job', () => {
    const draft = scheduleDraft(job, '2026-09-28');
    expect(draft.shifts![0]!.startDate).toBe('2026-09-28');
    expect(draft.crew[2]!.date).toBe('2026-10-07');
    expect(job.crew[2]!.date).toBe('2026-09-30');
  });
});
