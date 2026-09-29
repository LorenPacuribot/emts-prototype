'use client';

/*
  Job Scheduling board (reference: features/(main)/job-scheduling/v2/templates).

  Job view: Day / Week / Month calendar of jobs plus the Unscheduled Jobs
  backlog. Crew view: one row per crew member (Board) or per-day hours
  (Hours), with an Availability toggle that shows each member's weekly load
  against capacity. Click a job to open its details panel; drag a job onto a
  day to schedule or move it; Bulk Reschedule shifts many jobs at once.
*/
import { useCallback, useMemo, useState } from 'react';
import { Briefcase, Eye, EyeOff, Users } from 'lucide-react';
import { PageShell } from '@/components/Navigation';
import { NativeSelect } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { ScheduleJobModal } from '@/components/jobs/ScheduleJobModal';
import { CrewModal } from '@/components/jobs/CrewModal';
import { useJobActions } from '@/components/jobs/useJobActions';
import { CrewBoard, CrewHoursGrid, JobBoard, MonthBoard, ScheduleToolbar, UnscheduledPanel, tabCls } from '@/components/scheduling/Boards';
import { BulkRescheduleModal, JobDetailsPanel } from '@/components/scheduling/Panels';
import {
  ACTIVE_JOB_STATUSES, addDays, daysInclusive, defaultDurationDays, jobColor, monthWeeks, stepDate, weekDays, type ScheduleRange,
} from '@/components/scheduling/schedule-utils';
import { useCollection, useLookups } from '@/lib/store';
import type { Job } from '@/lib/types';
import { cn, fullName, shortDate, toISODate } from '@/lib/utils';

type View = 'job' | 'crew';

export default function JobSchedulingPage() {
  const { items: jobs, get } = useCollection('jobs');
  const { items: team } = useCollection('team');
  const look = useLookups();
  const actions = useJobActions();
  const { toast } = useToast();

  const [view, setView] = useState<View>('job');
  const [range, setRange] = useState<ScheduleRange>('week');
  const [crewMode, setCrewMode] = useState<'board' | 'hours'>('board');
  const [availability, setAvailability] = useState(true);
  const [memberFilter, setMemberFilter] = useState('');
  const [refDate, setRefDate] = useState(() => new Date());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scheduleJob, setScheduleJob] = useState<{ id: string; start?: string } | null>(null);
  const [crewJobId, setCrewJobId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  // Crew view lists crew members (active or invited), optionally one member.
  const crew = team.filter((t) => t.isCrew && t.status !== 'Inactive' && (!memberFilter || t.id === memberFilter));
  const boardJobs = useMemo(() => jobs.filter((j) => j.startDate && j.status !== 'Cancelled'), [jobs]);
  const unscheduled = useMemo(() => jobs.filter((j) => !j.startDate && ACTIVE_JOB_STATUSES.includes(j.status)), [jobs]);
  const monthJobs = view === 'crew' && memberFilter ? boardJobs.filter((j) => j.crew.some((c) => c.memberId === memberFilter)) : boardJobs;

  const dayKeys = range === 'day' ? [toISODate(refDate)] : weekDays(refDate);
  const colorOf = useCallback((j: Job) => jobColor(j, look.member), [look]);

  /** Drop on a day: move a scheduled job there (same length) or schedule a backlog job. */
  const handleDrop = (jobId: string, day: string) => {
    const j = get(jobId);
    if (!j || j.status === 'Completed') return;
    if (j.startDate === day) return;
    setScheduleJob({ id: j.id, start: day });
  };

  const selected = selectedId ? get(selectedId) ?? null : null;
  const scheduling = scheduleJob ? get(scheduleJob.id) : undefined;
  const crewJob = crewJobId ? get(crewJobId) : undefined;
  const cancelJob = cancelId ? get(cancelId) : undefined;

  const renderBoard = () => {
    if (range === 'month') {
      return <MonthBoard jobs={monthJobs} weeks={monthWeeks(refDate)} month={refDate.getMonth()} colorOf={colorOf} onSelect={setSelectedId} onDrop={handleDrop} />;
    }
    if (view === 'crew') {
      return crewMode === 'hours' ? (
        <CrewHoursGrid jobs={boardJobs} crew={crew} dayKeys={dayKeys} onSelect={setSelectedId} />
      ) : (
        <CrewBoard jobs={boardJobs} crew={crew} dayKeys={dayKeys} availability={availability} onSelect={setSelectedId} onDrop={handleDrop} />
      );
    }
    return <JobBoard jobs={boardJobs} dayKeys={dayKeys} colorOf={colorOf} onSelect={setSelectedId} onDrop={handleDrop} />;
  };

  const track = 'flex rounded-xl border border-gray-200 bg-gray-100 p-1';

  return (
    <PageShell title="Job Scheduling">
      <div className="mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <h1 className="mb-4 font-heading text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Job Scheduling</h1>
          <p className="text-lg text-gray-500 md:text-xl">Manage staff availability and crew assignments.</p>
        </div>
        <div className={cn(track, 'w-full md:w-auto')}>
          {(['job', 'crew'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={cn('flex flex-1 items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-bold transition-all md:flex-none', view === v ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-900')}>
              {v === 'job' ? <Briefcase className="h-4 w-4" /> : <Users className="h-4 w-4" />} {v === 'job' ? 'Job' : 'Crew'}
            </button>
          ))}
        </div>
      </div>

      <ScheduleToolbar
        range={range}
        onRange={setRange}
        refDate={refDate}
        onStep={(d) => setRefDate((r) => stepDate(r, range, d))}
        onToday={() => setRefDate(new Date())}
        onBulk={() => setBulkOpen(true)}
      />

      {view === 'crew' && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className={track}>
            {(['board', 'hours'] as const).map((m) => (
              <button key={m} type="button" disabled={range === 'month'} onClick={() => setCrewMode(m)} className={cn(tabCls(crewMode === m), range === 'month' && 'opacity-40')}>{m}</button>
            ))}
          </div>
          <div className={track}>
            <button type="button" onClick={() => setAvailability((v) => !v)} title={availability ? 'Hide availability' : 'Show availability'}
              className={cn('flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold', availability ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-900')}>
              {availability ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} Availability
            </button>
          </div>
          <div className="w-56 md:ml-auto">
            <NativeSelect value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} className="h-10">
              <option value="">All members</option>
              {team.filter((t) => t.isCrew).map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}
            </NativeSelect>
          </div>
        </div>
      )}

      {renderBoard()}

      {view === 'job' && <UnscheduledPanel jobs={unscheduled} customerName={(j) => fullName(look.customer(j.customerId))} onSelect={setSelectedId} />}

      <JobDetailsPanel
        job={selected}
        onClose={() => setSelectedId(null)}
        onReschedule={() => { if (selected) { setScheduleJob({ id: selected.id }); setSelectedId(null); } }}
        onManageCrew={() => selected && setCrewJobId(selected.id)}
        onCancel={() => selected && setCancelId(selected.id)}
      />
      {scheduling && <ScheduleJobModal job={scheduling} open onOpenChange={(v) => !v && setScheduleJob(null)} initialStart={scheduleJob?.start} />}
      {crewJob && <CrewModal job={crewJob} open onOpenChange={(v) => !v && setCrewJobId(null)} />}
      <ConfirmDialog
        open={!!cancelJob}
        onOpenChange={(v) => !v && setCancelId(null)}
        title="Cancel Schedule"
        confirmLabel="Cancel schedule"
        message={<>This clears the dates for <b>{cancelJob?.title}</b> and moves it back to the Unscheduled backlog. Crew assignments are kept.</>}
        onConfirm={() => { if (cancelJob) { actions.cancelSchedule(cancelJob.id); toast('Schedule cancelled'); } }}
      />
      <BulkRescheduleModal open={bulkOpen} onOpenChange={setBulkOpen} />
    </PageShell>
  );
}
