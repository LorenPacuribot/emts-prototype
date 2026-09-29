import type { Database, WorkOrder } from '@/features/types';
import type { Job, TeamMember } from '@/lib/types';
import { scheduleError } from '@/lib/scheduling';
import { daysInclusive } from '@/components/scheduling/schedule-utils';

/** Check the actual shifts, including other shifts on the same work order. */
export function shiftCapacityError(db: Database, woId: string, proposed: WorkOrder['shifts'], useSavedAssignments = true): string | undefined {
  const team: TeamMember[] = db.employees.map((e) => ({ id: e.id, firstName: e.name, lastName: '', email: '', phone: '', role: 'Painter', roleId: '', status: e.offboardedAt ? 'Inactive' : 'Active', hourlyRate: 0, capacityHours: 40, color: '', isCrew: true }));
  const minutes = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : NaN;
  const jobs: Job[] = [];
  const toEmployee = (id: string) => db.employees.find((e) => e.id === id || e.userId === id)?.id ?? id;
  for (const wo of db.workOrders.filter((w) => w.status === 'SCHEDULED' || w.status === 'IN_PROGRESS' || w.id === woId)) {
    const saved = db.jobs.find((j) => j.id === wo.jobId)?.crewAssignments;
    const shifts = wo.id === woId ? proposed : wo.shifts;
    if (saved && shifts.length && (wo.id !== woId || useSavedAssignments)) {
      const first = [...shifts].sort((a, b) => a.startDate.localeCompare(b.startDate))[0]!;
      jobs.push({ id: `${wo.id}:allocations`, jobNumber: wo.id, title: '', customerId: '', address: '', status: 'Scheduled',
        startDate: first.startDate, endDate: shifts.map((s) => s.endDate).sort().at(-1), startTime: first.startTime, endTime: first.endTime,
        crew: saved.map((c) => ({ ...c, memberId: toEmployee(c.memberId) })),
        // Hours booked to a named shift are checked against that shift's dates and window.
        shifts: shifts.map((s) => ({ ...s, memberIds: s.memberIds.map(toEmployee) })),
        breaks: [], notes: [], history: [], createdAt: wo.createdAt, value: 0, estimatedHours: 0 });
      continue;
    }
    for (const shift of wo.id === woId ? proposed : wo.shifts) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(shift.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(shift.endDate) || shift.endDate < shift.startDate) return 'Choose valid shift dates.';
      const daily = (minutes(shift.endTime) - minutes(shift.startTime)) / 60;
      if (!(daily > 0)) return 'Choose valid shift start and end times.';
      const days = daysInclusive(shift.startDate, shift.endDate);
      if (!Number.isFinite(days) || days < 1 || days > 3660) return 'Choose a valid shift date range of at most ten years.';
      const memberIds = shift.memberIds.map((id) => db.employees.find((e) => e.id === id || e.userId === id)?.id ?? id);
      jobs.push({ id: `${wo.id}:${shift.id}`, jobNumber: wo.id, title: shift.name ?? '', customerId: '', address: '', status: 'Scheduled', startDate: shift.startDate, endDate: shift.endDate, startTime: shift.startTime, endTime: shift.endTime,
        crew: [...new Set(memberIds)].map((memberId) => ({ memberId, role: 'Painter', hours: daily * days })), breaks: [], notes: [], history: [], createdAt: wo.createdAt, value: 0, estimatedHours: 0 });
    }
  }
  for (const job of jobs.filter((j) => j.id.startsWith(`${woId}:`))) {
    const error = scheduleError(job, jobs, team);
    if (error) return error;
  }
}
