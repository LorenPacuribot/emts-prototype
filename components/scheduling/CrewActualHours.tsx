'use client';

/*
  NEW (feature 22, Job Scheduling v2 crew hours): the hours each crew member
  actually clocked on a day (feature prototype time segments), and whether
  that day is approved. Only approved hours count for payroll and job cost.
  A replica member without a prototype employee shows nothing.
*/
import type { Database } from '@/features/types';
import { useDb } from '@/features/lib/store';
import { NewBadge, Tooltip } from '@/features/components/ui';
import { useIsOn } from '@/features/lib/feature-visibility';
import { cn } from '@/lib/utils';

function actualHours(db: Database, memberId: string, day: string) {
  // A team member is the prototype employee itself, or the login user behind it.
  const emp = db.employees.find((e) => e.id === memberId || e.userId === memberId);
  if (!emp) return undefined;
  const segs = db.timeSegments.filter((s) => s.employeeId === emp.id && s.workDate === day && s.end && !s.supersededAt);
  const hours = segs.reduce((a, s) => a + (Date.parse(s.end!) - Date.parse(s.start)) / 3600000, 0);
  const state = db.timeEntries.find((e) => e.employeeId === emp.id && e.workDate === day)?.state;
  return { hours, state, approved: state === 'approved' || state === 'locked' || state === 'paid' };
}

export function CrewActualChip({ memberId, day }: { memberId: string; day: string }) {
  const db = useDb((d) => d);
  const a = actualHours(db, memberId, day);
  const on = useIsOn({ feature: 22 });
  if (!on || !a || a.hours <= 0) return null;
  return (
    <Tooltip content={a.approved ? 'Approved for payroll' : `Clocked, not approved yet (${a.state ?? 'open'})`}>
      <div className={cn('rounded-md border px-2 py-0.5 text-xs font-bold', a.approved ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-600')}>
        {a.approved ? 'Approved' : 'Clocked'} {a.hours.toFixed(1)}h
      </div>
    </Tooltip>
  );
}

/** Strip above the Hours grid naming the new figures. */
export function CrewActualLegend() {
  if (!useIsOn({ feature: 22 })) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3 text-xs text-gray-500">
      <span className="font-bold uppercase tracking-widest text-gray-500">Hours</span>
      <span className="ml-auto inline-flex items-center gap-1.5">Clocked / approved hours per day <NewBadge feature={22} /></span>
    </div>
  );
}
