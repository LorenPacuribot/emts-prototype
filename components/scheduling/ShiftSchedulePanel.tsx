'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CalendarClock, CheckCircle2, Crown, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/display';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { useCollection, useLookups } from '@/lib/store';
import { useToast } from '@/components/ui/toast';
import { useDb, act } from '@/features/lib/store';
import { setWorkOrderStatus } from '@/features/lib/store/actions/work-orders';
import { useCan } from '@/components/work-orders/WoFeatures';
import { useJobTwin } from '@/components/jobs/JobFeatures';
import { useJobActions } from '@/components/jobs/useJobActions';
import type { CrewAssignment, Job, JobShift, TeamMember } from '@/lib/types';
import { cn, fullName, uid } from '@/lib/utils';
import { memberDayLoad, scheduleError, requiredHoursChange } from '@/lib/scheduling';
import { assignedTotal, fmtDay, fmtSpan, fmtTime, memberBookedHours, parseKey, round1, shiftWindow, todayKey, weekDays, windowHours, workingShiftDays } from './schedule-utils';
import { boundSchedule, datedShiftCrew, moveShifts, scheduleDraft } from './shift-draft';

const label = 'text-[10px] font-bold uppercase tracking-wide text-gray-400';
const dayLabel = (d: string) => fmtDay(d, { weekday: 'short', month: 'short', day: 'numeric' });

export function ShiftSchedulePanel({ job, onClose, initialStart }: { job: Job; onClose: () => void; initialStart?: string }) {
  const [draft, setDraft] = useState(() => scheduleDraft(job, initialStart));
  const [editing, setEditing] = useState<JobShift | null>(null);
  const [moving, setMoving] = useState(false);
  const { items: jobs } = useCollection('jobs');
  const { items: team } = useCollection('team');
  const look = useLookups();
  const { saveSchedule } = useJobActions();
  const { toast } = useToast();
  const twin = useJobTwin(job.id);
  const canManage = useCan('workOrder.updateStatus');
  const awaitingDeposit = twin?.wo?.status === 'PENDING_DEPOSIT';
  const candidate = boundSchedule(draft);
  const error = scheduleError(candidate, jobs, team);
  const changed = requiredHoursChange(job);
  const shifts = draft.shifts ?? [];
  const apply = () => {
    if (!shifts.length || error || awaitingDeposit) return;
    if (saveSchedule(job.id, { startDate: candidate.startDate!, endDate: candidate.endDate!, startTime: candidate.startTime, endTime: candidate.endTime, shifts, crew: draft.crew })) {
      toast('Schedule updated'); onClose();
    }
  };
  return <Dialog.Root open onOpenChange={(v) => !v && onClose()}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px]" />
    <Dialog.Content onEscapeKeyDown={(e) => { if (editing || moving) e.preventDefault(); }} className="fixed inset-y-0 right-0 z-[71] flex w-full flex-col border-l border-gray-200 bg-white shadow-2xl outline-none sm:w-[440px]">
      <div className="flex items-start gap-3 border-b border-gray-100 p-5">
        <CalendarClock className="h-10 w-10 rounded-xl bg-blue-50 p-2 text-blue-600" />
        <div className="min-w-0 flex-1"><Dialog.Title className="text-lg font-bold">{job.startDate ? 'Edit Schedule' : 'Schedule Job'}</Dialog.Title><Dialog.Description className="truncate text-sm text-gray-500">{job.title} · {fullName(look.customer(job.customerId))} · {job.jobNumber}</Dialog.Description></div>
        <Dialog.Close aria-label="Close schedule" className="p-1 text-gray-400"><X className="h-5 w-5" /></Dialog.Close>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div role="status" className={cn('rounded-xl border p-3 text-sm', error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700')}>{error || <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />No conflicts</span>}</div>
        {awaitingDeposit && <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><p>Confirm the deposit before scheduling this job.</p>{canManage && <Button size="sm" onClick={() => { if (twin?.wo) act(setWorkOrderStatus, twin.wo.id, 'UNSCHEDULED'); }}>Confirm Deposit</Button>}</div>}
        <Button variant="secondary" className="w-full" icon={<CalendarClock className="h-4 w-4" />} disabled={!shifts.length || job.scheduleProtected} onClick={() => setMoving(true)}>Move schedule</Button>
        <div className="space-y-3"><h3 className={label}>Shifts</h3>
          {shifts.map((s) => <div key={s.id} className="space-y-3 rounded-2xl border border-gray-200 p-3">
            <div className="flex items-center justify-between"><h4 className="text-sm font-bold">{s.name || 'Unnamed shift'}</h4><div className="flex gap-2"><button className="flex items-center gap-1 text-xs text-blue-600" onClick={() => setEditing(structuredClone(s))}><Pencil className="h-3.5 w-3.5" />Edit</button><button aria-label={`Delete ${s.name}`} className="p-1 text-gray-400 hover:text-red-600" onClick={() => setDraft(boundSchedule({ ...draft, shifts: shifts.filter((x) => x.id !== s.id), crew: draft.crew.filter((c) => c.shiftId !== s.id) }))}><Trash2 className="h-4 w-4" /></button></div></div>
            <p className="text-sm text-gray-700">{fmtSpan(s.startDate, s.endDate)}</p>
            <div className="flex flex-wrap gap-1.5">{s.memberIds.map((id) => { const m = look.member(id); return <span key={id} className="flex items-center gap-1 rounded-full bg-gray-100 pr-2 text-xs"><Avatar name={fullName(m)} color={m?.color} size="sm" />{m?.firstName}</span>; })}</div>
            <div className="max-h-52 space-y-2 overflow-y-auto">{workingShiftDays(draft, s).map((d) => { const w = shiftWindow(s, d); return <div key={d} className="flex gap-4 text-xs"><span className="w-24 shrink-0 text-gray-500">{dayLabel(d)}</span><span className="text-gray-700">{fmtTime(w.startTime)} – {fmtTime(w.endTime)}</span></div>; })}</div>
          </div>)}
          {!shifts.length && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-gray-500">Add a shift to schedule this job.</p>}
          <Button variant="secondary" className="w-full" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ id: uid('sh'), name: `Shift ${shifts.length + 1}`, startDate: candidate.endDate ?? todayKey(), endDate: candidate.endDate ?? todayKey(), startTime: '08:00', endTime: '17:00', memberIds: [] })}>Add shift</Button>
        </div>
        <div><h3 className={cn(label, 'mb-3')}>Impact</h3><div className="space-y-3 rounded-xl border border-gray-200 p-3"><div className="flex justify-between"><span className={label}>Work order</span><span className="text-xs font-bold">{twin?.wo?.id ?? job.jobNumber}</span></div><div className="flex items-end justify-between"><div><strong className="text-2xl">{job.estimatedHours.toFixed(1)}</strong><div className={label}>Total est. hours</div></div><span className="text-xs text-gray-500"><b className="text-blue-600">{assignedTotal(draft).toFixed(1)}</b> assigned</span></div><div className="h-1.5 overflow-hidden rounded bg-gray-100"><div className="h-full bg-blue-600" style={{ width: `${Math.min(100, job.estimatedHours ? assignedTotal(draft) / job.estimatedHours * 100 : 0)}%` }} /></div><div className="flex justify-between border-t pt-3 text-xs"><span className={label}>Job schedule</span><b>{shifts.length ? fmtSpan(candidate.startDate, candidate.endDate) : 'Not scheduled'}</b></div></div></div>
        {changed && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Estimated hours changed from {changed.from} to {changed.to}. Review the shift assignments.</p>}
      </div>
      <div className="border-t border-gray-100 p-5"><p className="mb-2 text-center text-xs text-gray-400">Saves schedule, hours, and crew on Apply.</p><div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-[2]" disabled={!shifts.length || !!error || awaitingDeposit} onClick={apply}>Apply</Button></div></div>
      {editing && <ShiftEditor job={draft} shift={editing} jobs={jobs} team={team} onClose={() => setEditing(null)} onSave={(shift, crew) => { setDraft(boundSchedule({ ...draft, shifts: shifts.some((s) => s.id === shift.id) ? shifts.map((s) => s.id === shift.id ? shift : s) : [...shifts, shift], crew: [...draft.crew.filter((c) => c.shiftId !== shift.id), ...crew] })); setEditing(null); }} />}
      {moving && <MoveShifts job={draft} onClose={() => setMoving(false)} onMove={(next) => { setDraft(next); setMoving(false); }} />}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

function MoveShifts({ job, onClose, onMove }: { job: Job; onClose: () => void; onMove: (job: Job) => void }) {
  const [direction, setDirection] = useState(1);
  const [count, setCount] = useState(1);
  const [ids, setIds] = useState(job.shifts!.map((s) => s.id));
  const valid = Number.isInteger(count) && count > 0 && count <= 366;
  const proposed = moveShifts(job, ids, valid ? count * direction : 0);
  return <Modal open onOpenChange={(v) => !v && onClose()} title="Move schedule" size="md" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!ids.length || !valid} onClick={() => onMove(proposed)}>Move {count} {count === 1 ? 'day' : 'days'} {direction > 0 ? 'later' : 'earlier'}</Button></>}>
    <div className="mb-6 grid grid-cols-[2fr_1fr] gap-3"><div><div className={cn(label, 'mb-2')}>Direction</div><div className="flex rounded-xl bg-gray-100 p-1">{[-1, 1].map((v) => <button key={v} className={cn('flex-1 rounded-lg p-2 text-sm font-semibold', direction === v ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500')} onClick={() => setDirection(v)}>{v === -1 ? 'Earlier' : 'Later'}</button>)}</div></div><Field label="By (days)"><Input type="number" min={1} max={366} value={count} onChange={(e) => setCount(Number(e.target.value))} /></Field></div>
    <div className="mb-2 flex justify-between"><span className={label}>Shifts</span><span className="text-xs text-gray-400">{ids.length} of {job.shifts!.length} moving</span></div><div className="divide-y rounded-xl border border-gray-200">{job.shifts!.map((s) => { const next = proposed.shifts!.find((x) => x.id === s.id)!; return <div key={s.id} className="flex items-center gap-2 p-3 text-xs"><Checkbox checked={ids.includes(s.id)} onChange={(v) => setIds(v ? [...ids, s.id] : ids.filter((id) => id !== s.id))} /><b className="mr-auto">{s.name}</b><span className={cn('text-gray-400', ids.includes(s.id) && 'line-through')}>{fmtSpan(s.startDate, s.endDate)}</span><span>→</span><b className="text-blue-600">{fmtSpan(next.startDate, next.endDate)}</b></div>; })}</div>
  </Modal>;
}

function ShiftEditor({ job, shift, jobs, team, onClose, onSave }: { job: Job; shift: JobShift; jobs: Job[]; team: TeamMember[]; onClose: () => void; onSave: (s: JobShift, c: CrewAssignment[]) => void }) {
  const [s, setShift] = useState(shift);
  const [crew, setCrew] = useState(() => datedShiftCrew(job, shift));
  const [picking, setPicking] = useState(false);
  const db = useDb((d) => d);
  const logged = db.timeSegments.filter((t) => t.jobId === job.id && t.end && !t.supersededAt).reduce((n, t) => n + (Date.parse(t.end!) - Date.parse(t.start)) / 3600000, 0);
  const days = workingShiftDays(job, s);
  const others = { ...job, crew: job.crew.filter((c) => c.shiftId !== s.id) };
  const candidate = boundSchedule({ ...job, shifts: [...(job.shifts ?? []).filter((x) => x.id !== s.id), s], crew: [...others.crew, ...crew] });
  const error = !days.length ? 'Choose a valid date range with at least one working day.' : scheduleError(candidate, jobs, team);
  const existing = job.shifts?.some((x) => x.id === s.id);
  const total = round1(crew.reduce((n, c) => n + c.hours, 0));
  const loads = [...jobs.filter((j) => j.id !== job.id), others];
  const patch = (p: Partial<JobShift>) => {
    const next = { ...s, ...p };
    const nextDays = workingShiftDays(job, next);
    setShift(next);
    setCrew((old) => next.memberIds.flatMap((memberId) => nextDays.map((date) => old.find((c) => c.memberId === memberId && c.date === date) ?? { memberId, date, shiftId: s.id, hours: 0, role: old.find((c) => c.memberId === memberId)?.role ?? 'Painter' })));
  };
  const setHours = (id: string, date: string, hours: number) => setCrew((old) => old.map((c) => c.memberId === id && c.date === date ? { ...c, hours } : c));
  return <Modal open onOpenChange={(v) => !v && onClose()} title={existing ? 'Edit shift' : 'Add shift'} size="full" className="max-w-[960px]" footer={<div className="flex w-full items-center justify-between"><div className="flex gap-6"><div><div className={label}>Total man hours</div><b className="text-blue-600">{total}h</b></div><div><div className={label}>Crew size</div><b>{s.memberIds.length}</b></div></div><div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!!error} onClick={() => onSave(s, crew)}>Assign shift</Button></div></div>}>
    <div className="space-y-4">
      <div className="grid grid-cols-2 divide-x rounded-xl border border-gray-200 sm:grid-cols-4">{[['Estimated hours', job.estimatedHours.toFixed(1)], ['Assigned', assignedTotal(candidate).toFixed(1)], ['Logged', round1(logged).toFixed(1)], ['Scheduled for', fmtSpan(candidate.startDate, candidate.endDate)]].map(([name, value], i) => <div key={name} className="p-3"><div className={label}>{name}</div><div className={cn('mt-1 text-sm font-bold', i === 1 && 'text-blue-600', i === 2 && 'text-green-600')}>{value}</div></div>)}</div>
      <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[2fr_1fr_1fr]"><div className="col-span-2 sm:col-span-1"><Field label="Shift Name"><Input value={s.name ?? ''} onChange={(e) => patch({ name: e.target.value })} /></Field></div><Field label="Start Date" required><Input type="date" value={s.startDate} onChange={(e) => patch({ startDate: e.target.value })} /></Field><Field label="End Date" required><Input type="date" min={s.startDate} value={s.endDate} onChange={(e) => patch({ endDate: e.target.value })} /></Field></div>
        <div className="grid grid-cols-[1.4fr_1fr_1fr_50px] items-center gap-3"><span className={label}>Default</span><Input aria-label="Default start time" type="time" value={s.startTime} onChange={(e) => patch({ startTime: e.target.value })} /><Input aria-label="Default end time" type="time" value={s.endTime} onChange={(e) => patch({ endTime: e.target.value })} /><span /></div>
        <div className="max-h-44 overflow-y-auto"><div className={cn(label, 'grid grid-cols-[1.4fr_1fr_1fr_50px] gap-3 pb-2')}><span>Day</span><span>Start</span><span>End</span><span>Hours</span></div>{days.map((d) => { const w = shiftWindow(s, d); return <div key={d} className="grid grid-cols-[1.4fr_1fr_1fr_50px] items-center gap-3 border-t border-gray-100 py-1.5"><span className="text-xs text-gray-600">{dayLabel(d)}</span><Input className="h-8 text-xs" aria-label={`Start time ${d}`} type="time" value={w.startTime} onChange={(e) => patch({ dailyHours: { ...s.dailyHours, [d]: { ...w, startTime: e.target.value } } })} /><Input className="h-8 text-xs" aria-label={`End time ${d}`} type="time" value={w.endTime} onChange={(e) => patch({ dailyHours: { ...s.dailyHours, [d]: { ...w, endTime: e.target.value } } })} /><div className="flex items-center gap-1 text-[10px] text-gray-500">{round1(windowHours(w.startTime, w.endTime))}h<button aria-label={`Remove ${d}`} onClick={() => patch({ dailyHours: { ...s.dailyHours, [d]: null } })}><Trash2 className="h-3 w-3" /></button></div></div>; })}</div>
        {Object.entries(s.dailyHours ?? {}).some(([d, v]) => v === null && d >= s.startDate && d <= s.endDate) && <button className="text-xs text-blue-600" onClick={() => patch({ dailyHours: Object.fromEntries(Object.entries(s.dailyHours ?? {}).filter(([, v]) => v !== null)) })}>Restore removed days</button>}
      </div>
      <button className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-left text-sm text-gray-400 hover:border-blue-500" onClick={() => setPicking(true)}>Search to add crew member...</button>
      <div className="overflow-x-auto rounded-xl border border-gray-200"><table className="w-full text-xs"><thead className="bg-gray-50 text-left"><tr><th className="min-w-44 p-3">Crew member</th><th className="min-w-24 p-3">In this shift</th><th className="min-w-28 p-3">Their week*</th>{days.map((d) => <th key={d} className="min-w-32 p-3">{dayLabel(d)}</th>)}</tr></thead><tbody>{s.memberIds.map((id) => { const m = team.find((t) => t.id === id); const memberTotal = round1(crew.filter((c) => c.memberId === id).reduce((n, c) => n + c.hours, 0)); const weekly = memberBookedHours([...jobs.filter((j) => j.id !== job.id), candidate], id, weekDays(parseKey(s.startDate))); return <tr key={id} className="border-t border-gray-200"><td className="p-3"><div className="flex items-center gap-2"><button aria-label={`Remove ${fullName(m)}`} onClick={() => patch({ memberIds: s.memberIds.filter((x) => x !== id) })}><Trash2 className="h-3 w-3 text-gray-400" /></button><Avatar name={fullName(m)} color={m?.color} size="sm" /><div className="whitespace-nowrap"><b>{fullName(m)}</b><p className="text-[10px] text-gray-400">{m?.role}</p></div></div></td><td className="p-3 font-bold">{memberTotal}h</td><td className="p-3"><b>{weekly}/{m?.capacityHours ?? 0}h</b><p className={cn('text-[10px]', weekly > (m?.capacityHours ?? 0) ? 'text-red-600' : 'text-green-600')}>{round1((m?.capacityHours ?? 0) - weekly)}h left</p></td>{days.map((d) => { const hours = crew.find((c) => c.memberId === id && c.date === d)?.hours ?? 0; const load = m ? memberDayLoad(m, d, loads) : undefined; const w = shiftWindow(s, d); return <td key={d} className="p-2"><Input aria-label={`${fullName(m)} hours on ${d}`} type="number" min={0} step={0.5} value={hours} onChange={(e) => setHours(id, d, Math.max(0, Number(e.target.value)))} className="h-8 w-24 text-xs" /><div className={cn('mt-1 text-[9px]', hours > (load?.remaining ?? 0) ? 'text-red-600' : 'text-green-600')}>{load?.reason ?? `${round1((load?.remaining ?? 0) - hours)}h left`}</div><div className="text-[9px] text-gray-500">{fmtTime(w.startTime)}–{fmtTime(w.endTime)}</div></td>; })}</tr>; })}</tbody></table>{!s.memberIds.length && <p className="p-6 text-center text-sm text-gray-400">Add crew members to assign their daily hours.</p>}</div>
      <p className="text-[10px] text-gray-400">* Week of {fmtSpan(weekDays(parseKey(s.startDate || todayKey()))[0])}. All scheduled weeks are checked for conflicts.</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    </div>
    {picking && <CrewPicker team={team} selected={s.memberIds} crew={crew} jobs={[...jobs.filter((j) => j.id !== job.id), candidate]} start={s.startDate} onClose={() => setPicking(false)} onSave={(ids, lead) => {
      const updated = ids.flatMap((memberId) => days.map((date) => {
        const old = crew.find((c) => c.memberId === memberId && c.date === date);
        const m = team.find((t) => t.id === memberId)!;
        const w = shiftWindow(s, date);
        return { memberId, shiftId: s.id, date, role: memberId === lead ? 'Crew Lead' : 'Painter', hours: old?.hours ?? round1(Math.max(0, Math.min(windowHours(w.startTime, w.endTime), memberDayLoad(m, date, loads).remaining))) };
      }));
      setShift({ ...s, memberIds: ids }); setCrew(updated); setPicking(false);
    }} />}
  </Modal>;
}

function CrewPicker({ team, selected, crew, jobs, start, onClose, onSave }: { team: TeamMember[]; selected: string[]; crew: CrewAssignment[]; jobs: Job[]; start: string; onClose: () => void; onSave: (ids: string[], lead?: string) => void }) {
  const [ids, setIds] = useState(selected);
  const [lead, setLead] = useState(crew.find((c) => c.role === 'Crew Lead')?.memberId);
  const [query, setQuery] = useState('');
  const pool = team.filter((m) => m.status !== 'Inactive' && (m.isCrew || ids.includes(m.id)) && fullName(m).toLowerCase().includes(query.toLowerCase()));
  return <Modal open onOpenChange={(v) => !v && onClose()} title="Edit shift" size="full" className="max-w-[960px]" footer={<div className="flex w-full items-center justify-between"><div><div className={label}>Crew size</div><b>{ids.length}</b></div><div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(ids, lead)}>Add</Button></div></div>}>
    <Input autoFocus placeholder="Search to add crew member..." aria-label="Search crew" value={query} onChange={(e) => setQuery(e.target.value)} />
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{[false, true].map((added) => <div key={String(added)} className="min-h-[300px] rounded-xl border border-gray-200 sm:min-h-[420px]"><div className={cn(label, 'flex justify-between border-b border-gray-100 p-3')}><span>{added ? 'Added' : 'Available'}</span><span>{pool.filter((m) => ids.includes(m.id) === added).length}</span></div>{pool.filter((m) => ids.includes(m.id) === added).map((m) => { const used = memberBookedHours(jobs, m.id, weekDays(parseKey(start || todayKey()))); return <div key={m.id} className="flex items-center gap-2 p-3"><Avatar name={fullName(m)} color={m.color} size="sm" /><div className="min-w-0 flex-1"><b className="text-xs">{fullName(m)}</b><p className="text-[10px] text-gray-400">{m.role}</p></div><div className="text-right text-xs"><b>{used}/{m.capacityHours}h</b><p className={cn('text-[9px]', used > m.capacityHours ? 'text-red-600' : 'text-green-600')}>{round1(m.capacityHours - used)}h left</p></div>{added ? <><button aria-label={`Make ${fullName(m)} crew lead`} aria-pressed={lead === m.id} onClick={() => setLead(lead === m.id ? undefined : m.id)} className={cn('p-1.5', lead === m.id ? 'rounded-lg bg-amber-50 text-amber-500' : 'text-gray-300')}><Crown className="h-4 w-4" /></button><button aria-label={`Remove ${fullName(m)}`} onClick={() => { setIds(ids.filter((id) => id !== m.id)); if (lead === m.id) setLead(undefined); }}><X className="h-3 w-3 text-gray-400" /></button></> : <button className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-600" onClick={() => setIds([...ids, m.id])}>+ Add</button>}</div>; })}</div>)}</div>
  </Modal>;
}
