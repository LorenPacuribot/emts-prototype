'use client';

/*
  "Assign Crew" modal. Pick crew members (team members marked isCrew), set each
  one's role and hours on this job, and see how booked they already are over
  the job's dates (hours on other overlapping jobs vs. their weekly capacity).
  Used by the job detail Crew card and the Job Scheduling details panel.
*/
import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/display';
import { Checkbox, Input, NativeSelect } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import type { CrewAssignment, Job } from '@/lib/types';
import { cn, fullName } from '@/lib/utils';
import { useJobActions } from './useJobActions';
import { jobDays, memberBookedHours, memberCapacity, round1, weekDays } from '@/components/scheduling/schedule-utils';

export const CREW_ROLES = ['Crew Lead', 'Painter', 'Helper'];

export function CrewModal({ job, open, onOpenChange }: { job: Job; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { items: team } = useCollection('team');
  const { items: jobs } = useCollection('jobs');
  const { setCrew } = useJobActions();
  const { toast } = useToast();
  const [draft, setDraft] = useState<CrewAssignment[]>([]);

  useEffect(() => {
    if (open) setDraft(job.crew.map((c) => ({ ...c })));
  }, [open, job.crew]);

  const crewPool = team.filter((t) => t.isCrew && t.status !== 'Inactive');
  // Unscheduled jobs have no dates, so we measure against the current week.
  const days = useMemo(() => (job.startDate ? jobDays(job) : weekDays(new Date())), [job]);

  const toggle = (memberId: string, role: string) =>
    setDraft((d) => (d.some((c) => c.memberId === memberId) ? d.filter((c) => c.memberId !== memberId) : [...d, { memberId, role, hours: 8 }]));
  const patch = (memberId: string, p: Partial<CrewAssignment>) => setDraft((d) => d.map((c) => (c.memberId === memberId ? { ...c, ...p } : c)));

  const totalHours = round1(draft.reduce((s, c) => s + c.hours, 0));

  const save = () => {
    if (!setCrew(job.id, draft, `Crew updated (${draft.length} member${draft.length === 1 ? '' : 's'})`)) return;
    toast('Crew saved');
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Assign Crew"
      description={`${job.jobNumber} · ${job.title}${job.startDate ? '' : ' — not scheduled yet, availability shown for this week'}`}
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="flex gap-6">
            <div>
              <span className="block text-xxs font-bold uppercase tracking-wider text-gray-500">Total man hours</span>
              <span className="text-xl font-black text-primary-600">{totalHours}h</span>
            </div>
            <div>
              <span className="block text-xxs font-bold uppercase tracking-wider text-gray-500">Crew size</span>
              <span className="text-xl font-black text-gray-900">{draft.length}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save}>Save crew</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {crewPool.map((m) => {
            const booked = memberBookedHours(jobs, m.id, days, job.id);
            const cap = memberCapacity(m, days.length);
            const left = round1(cap - booked);
            const checked = draft.some((c) => c.memberId === m.id);
            return (
              <div key={m.id} className={cn('flex items-center gap-3 rounded-xl border p-3', checked ? 'border-primary-300 bg-primary-50/40' : 'border-gray-200')}>
                <Checkbox checked={checked} onChange={() => toggle(m.id, m.role === 'Crew Lead' ? 'Crew Lead' : 'Painter')} />
                <Avatar name={fullName(m)} color={m.color} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800">{fullName(m)}</div>
                  <div className="truncate text-xs text-gray-500">{m.role}{m.status === 'Invited' ? ' · Invited' : ''}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black tabular-nums text-gray-900">{booked}<span className="font-bold text-gray-500">/{cap}h</span></div>
                  <div className={cn('text-xs font-bold', left <= 0 ? 'text-red-500' : 'text-green-600')}>{left <= 0 ? 'Fully booked' : `${left}h left`}</div>
                </div>
              </div>
            );
          })}
          {crewPool.length === 0 && <p className="text-sm text-gray-500">No crew members yet. Mark team members as crew in Settings → Team & Access.</p>}
        </div>

        {draft.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-gray-500">Role & hours on this job</div>
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {draft.map((c) => {
                const m = team.find((t) => t.id === c.memberId);
                const booked = memberBookedHours(jobs, c.memberId, days, job.id);
                const cap = m ? memberCapacity(m, days.length) : 0;
                const over = booked + c.hours > cap;
                return (
                  <div key={c.memberId} className="flex flex-wrap items-center gap-3 p-3">
                    <Avatar name={fullName(m)} color={m?.color} size="sm" />
                    <div className="min-w-[140px] flex-1 text-sm font-bold text-gray-900">{fullName(m)}</div>
                    <div className="w-36">
                      <NativeSelect value={c.role} onChange={(e) => patch(c.memberId, { role: e.target.value })} className="h-9">
                        {CREW_ROLES.map((r) => <option key={r}>{r}</option>)}
                      </NativeSelect>
                    </div>
                    <div className="w-28">
                      <Input type="number" min={0} value={c.hours} suffix="hrs" invalid={over} className="h-9"
                        onChange={(e) => patch(c.memberId, { hours: Math.max(0, Number(e.target.value) || 0) })} />
                    </div>
                    <div className={cn('w-40 text-xs font-medium', over ? 'text-amber-600' : 'text-gray-500')}>
                      {over ? `Over capacity by ${round1(booked + c.hours - cap)}h` : `Available ${round1(cap - booked)} hours`}
                    </div>
                    <button onClick={() => toggle(c.memberId, c.role)} aria-label={`Remove ${fullName(m)}`} className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
