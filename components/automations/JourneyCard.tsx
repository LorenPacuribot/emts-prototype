'use client';

/*
  Journey card (spec 6.9) on lead, estimate, job, work order and invoice
  pages: where is this job, and what happens next? Shows the journey, the
  steps done, the next step and what it waits for, and any problem with a
  Fix link. Pause keeps its place; Stop ends every waiting run for this
  record and its linked records.

  Also here, until the backend has them: the estimator's "Ready to send"
  flag on estimates (backend gap 3) and the customer's contact preferences
  (backend gap 6).
*/
import { useState } from 'react';
import { CheckCircle2, Pause, Play, Route, Square } from 'lucide-react';
import type { PipelineModule } from '@/lib/automations/types';
import { recordJourney } from '@/lib/automations/engine';
import { recordOf } from '@/lib/automations/records';
import { pauseJourneyFor, resumeJourneyFor, setConsent, setEstimateReady, startJourney, stopJourneyFor, useAuto } from '@/lib/automations/store';
import { useDb as useFeatureDb } from '@/features/lib/store';
import { AppLink } from '@/features/lib/navigation';
import { toast } from '@/features/lib/toast';
import { Badge, Button, Checkbox, Modal, RowMenu, Select } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { usePerms } from './hooks';
import { relTime, useConfirm } from './shared';

export function JourneyCard({ type, id, className }: { type: PipelineModule; id: string; className?: string }) {
  const s = useAuto((x) => x);
  const fdb = useFeatureDb((d) => d);
  const perms = usePerms();
  const { confirm, dialog } = useConfirm();
  const [start, setStart] = useState(false);
  const [jid, setJid] = useState('');
  if (!perms.view) return null;
  const rec = recordOf(fdb, type, id, new Date());
  if (!rec) return null;
  const j = recordJourney(s, fdb, type, id, new Date());
  const consent = rec.customerId ? s.consent[rec.customerId] ?? {} : undefined;
  const customer = fdb.customers.find((c) => c.id === rec.customerId);
  const isEstimate = type === 'ESTIMATE';
  const ready = isEstimate && !!s.readyEstimates[id];
  const active = j.runs.some((r) => r.status === 'WAITING' || r.status === 'WAITING_FOR_REVIEW');
  return (
    <div className={cn('rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800', className)} aria-label="Journey">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Route className="h-5 w-5 text-primary-600" />
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Journey</div>
            <div className="font-bold text-gray-900 dark:text-white">{j.journeyName ?? (j.runs.length ? 'Automations' : 'No journey')}</div>
          </div>
          {j.isPaused && <Badge tone="gray">Paused</Badge>}
        </div>
        {perms.manage && (j.runs.length > 0) && (
          <RowMenu label="Journey actions" items={[
            j.isPaused
              ? { label: 'Resume journey for this job', icon: <Play />, onSelect: () => { resumeJourneyFor(type, id); toast.success('Journey resumed', 'It carries on from the next step.'); } }
              : { label: 'Pause journey for this job', icon: <Pause />, onSelect: () => { pauseJourneyFor(type, id); toast.success('Journey paused', 'It keeps its place.'); } },
            { label: 'Stop journey for this job', icon: <Square />, danger: true, disabled: !active && !j.isPaused, onSelect: () => confirm({ title: 'Stop the journey for this job?', body: 'Every waiting run for this record and its linked records ends. Nothing more is sent for it.', label: 'Stop', onConfirm: () => { stopJourneyFor(type, id); toast.success('Journey stopped'); } }) },
          ]} />
        )}
      </div>

      {j.runs.length === 0 ? (
        perms.manage && s.journeys.length > 0 ? <Button size="sm" onClick={() => setStart(true)}>Start a journey</Button> : <p className="text-sm text-gray-500">No automation has run for this record yet.</p>
      ) : (
        <div className="space-y-3">
          {j.done.length > 0 && (
            <ol className="space-y-1">
              {j.done.slice(-5).map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /><span className="min-w-0"><span className="text-gray-800 dark:text-gray-100">{d.title}</span> <span className="text-xs text-gray-500">{relTime(d.at)}</span></span></li>
              ))}
            </ol>
          )}
          {j.next ? (
            <p className="text-sm"><span className="font-bold">Next: {j.next.title.replace(/^./, (x) => x.toLowerCase())}.</span> <span className="text-gray-600 dark:text-gray-300">{j.next.waitingFor}</span>
              {j.next.reviewId && perms.review && <AppLink href={`/automations?tab=review&item=${j.next.reviewId}`} className="ml-1 font-semibold text-primary-700 hover:underline">Review</AppLink>}
            </p>
          ) : <p className="text-sm text-gray-500">Nothing is waiting.</p>}
          {j.problems.map((p) => (
            <p key={p.runId} className="text-sm text-red-700">{p.message} <AppLink href={`/automations/${p.automationId}`} className="font-semibold underline">Fix</AppLink></p>
          ))}
        </div>
      )}

      {isEstimate && perms.manage && (
        <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-700">
          <Checkbox checked={ready} onCheckedChange={(v) => { setEstimateReady(id, v); toast.success(v ? 'Marked ready to send' : 'No longer marked ready'); }} label={<span className="text-sm font-semibold">Estimator: measured and ready to send</span>} />
          <p className="ml-6 text-xs text-gray-500">Starts "Send estimate" automations. (Kept in Automations until the backend has this flag.)</p>
        </div>
      )}

      {customer && consent && (
        <details className="mt-4 border-t border-gray-100 pt-3 text-sm dark:border-gray-700">
          <summary className="cursor-pointer font-semibold text-gray-700 dark:text-gray-200">Contact preferences: {customer.name}</summary>
          <div className="mt-2 space-y-1.5">
            <Checkbox checked={!!consent.doNotEmail} disabled={!perms.manage} onCheckedChange={(v) => setConsent(customer.id, { doNotEmail: v })} label="Do not email" />
            <Checkbox checked={!!consent.doNotText} disabled={!perms.manage} onCheckedChange={(v) => setConsent(customer.id, { doNotText: v })} label="Do not text" />
            <Checkbox checked={!!consent.textStopAt} disabled={!perms.manage} onCheckedChange={(v) => setConsent(customer.id, { textStopAt: v ? new Date().toISOString() : undefined })} label="Replied STOP to a text" />
            <p className="text-xs text-gray-500">Automations never message a customer on a channel they opted out of.</p>
          </div>
        </details>
      )}

      <Modal open={start} onOpenChange={setStart} title="Start a journey"
        footer={<><Button onClick={() => setStart(false)}>Cancel</Button><Button variant="primary" disabled={!jid} onClick={() => {
          const r = startJourney(jid, type, id);
          if (!r.ok) return toast.error('Not started', r.error);
          toast[r.value ? 'success' : 'info'](r.value ? 'Journey started' : 'Nothing to start yet', r.value ? `${r.value} automation${r.value === 1 ? '' : 's'} started for this record.` : 'No switched-on automation in that journey starts at this stage. It will pick up when the record moves on.');
          setStart(false);
        }}>Start</Button></>}>
        <Select aria-label="Journey" value={jid} onChange={(e) => setJid(e.target.value)}>
          <option value="">Choose a journey…</option>{s.journeys.map((x) => <option key={x.id} value={x.id}>{x.name}{x.isEnabled ? '' : ' (off)'}</option>)}
        </Select>
      </Modal>
      {dialog}
    </div>
  );
}
