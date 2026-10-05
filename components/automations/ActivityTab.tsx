'use client';

/*
  Activity tab (spec 6.7): did it run, and if not, why? Runs newest first;
  a row opens to show each step with a one-line result in plain words. A
  failed run has "Try again" (the once-only rules stop anything happening
  twice). The Sending card shows this month's emails and texts against the
  plan, and what waits in the queue.
*/
import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Mail, RotateCcw, X } from 'lucide-react';
import type { AutomationModule, RunStatus } from '@/lib/automations/types';
import { MODULE_LABEL, PIPELINES } from '@/lib/automations/registry';
import { recordHref } from '@/lib/automations/records';
import { dismiss, retry, useAuto } from '@/lib/automations/store';
import { capacityCheck } from '@/lib/automations/executors';
import { AppLink } from '@/features/lib/navigation';
import { toast } from '@/features/lib/toast';
import { Badge, Button, Input, Select } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { usePerms } from './hooks';
import { CARD, EmptyNote, RunBadge, relTime } from './shared';

function SendingCard() {
  const s = useAuto((x) => x);
  const now = new Date();
  const queue = (ch: 'email' | 'sms') => s.runs.filter((r) => r.status === 'WAITING' && r.waitingFor?.startsWith('Waiting in the send queue') && (ch === 'sms') === (r.definition[r.cursor]?.type === 'SEND_TEXT')).length;
  const row = (ch: 'email' | 'sms', label: string) => {
    const c = capacityCheck(s, ch, now);
    const pct = c.limit ? Math.min(100, Math.round((c.usedThisMonth / c.limit) * 100)) : 0;
    return (
      <div>
        <div className="flex justify-between text-sm"><span className="font-semibold">{label}</span><span>{c.usedThisMonth.toLocaleString()}{c.limit ? ` of ${c.limit.toLocaleString()}` : ''} this month</span></div>
        {c.limit ? <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700"><div className={cn('h-1.5 rounded-full', pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-primary-500')} style={{ width: `${pct}%` }} /></div> : null}
        <div className="mt-0.5 text-xs text-gray-500">{queue(ch)} waiting in the queue</div>
      </div>
    );
  };
  return (
    <div className={cn(CARD, 'p-4')}>
      <div className="mb-2 flex items-center gap-2 font-bold"><Mail className="h-4 w-4" /> Sending</div>
      {!s.settings.sending.provider && <p className="mb-2 text-xs font-semibold text-amber-700">Sending provider not set up. Messages are recorded, not delivered.</p>}
      <div className="grid gap-3 sm:grid-cols-2">{row('email', 'Emails')}{row('sms', 'Texts')}</div>
    </div>
  );
}

export function ActivityTab({ initialAutomation, initialRun }: { initialAutomation?: string; initialRun?: string }) {
  const runs = useAuto((s) => s.runs);
  const automations = useAuto((s) => s.automations);
  const journeys = useAuto((s) => s.journeys);
  const perms = usePerms();
  const [automation, setAutomation] = useState(initialAutomation ?? '');
  const [journey, setJourney] = useState('');
  const [module, setModule] = useState('');
  const [status, setStatus] = useState<'' | RunStatus>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<string | undefined>(initialRun);
  const rows = useMemo(() => runs.filter((r) => (!automation || r.automationId === automation) && (!journey || r.journeyId === journey) && (!module || r.recordType === module)
    && (!status || r.status === status) && (!from || r.startedAt.slice(0, 10) >= from) && (!to || r.startedAt.slice(0, 10) <= to)).slice(0, 200), [runs, automation, journey, module, status, from, to]);
  return (
    <div className="space-y-4">
      <SendingCard />
      <div className="flex flex-wrap items-end gap-2">
        <Select aria-label="Automation" className="w-52" value={automation} onChange={(e) => setAutomation(e.target.value)}>
          <option value="">All automations</option>{automations.map((a) => <option key={a.id} value={a.id}>{a.name}{a.isDeleted ? ' (deleted)' : ''}</option>)}
        </Select>
        <Select aria-label="Journey" className="w-44" value={journey} onChange={(e) => setJourney(e.target.value)}>
          <option value="">All journeys</option>{journeys.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
        </Select>
        <Select aria-label="Module" className="w-40" value={module} onChange={(e) => setModule(e.target.value)}>
          <option value="">All modules</option>{PIPELINES.map((p) => <option key={p} value={p}>{MODULE_LABEL[p as AutomationModule]}</option>)}
        </Select>
        <Select aria-label="Status" className="w-44" value={status} onChange={(e) => setStatus(e.target.value as RunStatus | '')}>
          <option value="">All statuses</option><option value="DONE">Done</option><option value="WAITING">Waiting</option><option value="WAITING_FOR_REVIEW">Waiting for review</option><option value="FAILED">Failed</option><option value="SKIPPED">Skipped</option>
        </Select>
        <label className="text-xs text-gray-500">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></label>
        <label className="text-xs text-gray-500">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></label>
      </div>
      {rows.length === 0 ? <EmptyNote>Nothing has run yet. Runs show here as soon as a deployed automation starts.</EmptyNote> : (
        <ul className={cn(CARD, 'divide-y divide-gray-100 dark:divide-gray-700')}>
          {rows.map((r) => {
            const a = automations.find((x) => x.id === r.automationId);
            const isOpen = open === r.id;
            return (
              <Fragment key={r.id}>
                <li>
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <button type="button" onClick={() => setOpen(isOpen ? undefined : r.id)} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                      {isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
                      <span className="min-w-0">
                        <span className="block font-semibold text-gray-900 dark:text-white">{a?.name ?? r.automationName}{(r.automationDeleted || a?.isDeleted) && ' (deleted)'}{r.journeyName && <span className="ml-2 font-normal text-gray-500">· {r.journeyName}</span>}</span>
                        <span className="block text-xs text-gray-500">{relTime(r.startedAt)}{r.waitingFor && (r.status === 'WAITING' || r.status === 'WAITING_FOR_REVIEW') ? ` · ${r.waitingFor}` : ''}</span>
                      </span>
                    </button>
                    <AppLink href={recordHref(r.recordType, r.recordId)} className="text-sm font-semibold text-primary-700 hover:underline">{r.recordLabel}</AppLink>
                    <RunBadge status={r.status} paused={!!r.pausedAt} />
                    {r.status === 'FAILED' && perms.manage && (
                      <>
                        <Button size="sm" onClick={() => { const x = retry(r.id); if (x.ok) toast.success('Trying again'); else toast.error('Not retried', x.error); }}><RotateCcw className="h-3.5 w-3.5" /> Try again</Button>
                        <Button size="sm" variant="ghost" onClick={() => dismiss(r.id)} aria-label="Dismiss"><X className="h-3.5 w-3.5" /></Button>
                      </>
                    )}
                  </div>
                  {isOpen && (
                    <ol className="space-y-1.5 border-t border-gray-100 bg-gray-50/60 px-10 py-3 dark:border-gray-700 dark:bg-gray-900/40">
                      {r.steps.map((st, i) => (
                        <li key={st.stepId} className="flex flex-wrap items-start gap-2 text-sm">
                          <span className="w-5 text-right text-xs font-bold text-gray-400">{i + 1}</span>
                          <span className="font-semibold">{st.title}</span>
                          <RunBadge status={st.status} />
                          <span className={cn('min-w-0 flex-1', st.status === 'FAILED' ? 'text-red-700' : 'text-gray-600 dark:text-gray-300')}>{st.message}{st.at ? <span className="ml-1 text-xs text-gray-400">{relTime(st.at)}</span> : null}</span>
                          {st.createdRecordId && <Badge tone="green">{st.createdRecordId}</Badge>}
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
}
