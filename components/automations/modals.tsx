'use client';

/*
  Modals the Automations screens share:
    - DeployModal: readiness check, then everything that will run on its
      own, customer-facing steps first, and the approval tick box. Also used
      to approve a changed customer-facing step (re-approval).
    - TurnOffModal: "5 runs are waiting. Stop them, or let them finish?"
    - DeleteModal: what deleting does, and key jobs that would stop.
    - TestRunModal: play automations against a past record, change nothing.
    - JourneyModal: create or rename a journey.
    - ModuleSettingsModal: sending plan, texting release, working days.
*/
import { useMemo, useState } from 'react';
import { CheckCircle2, Eye, FlaskConical, Rocket } from 'lucide-react';
import type { Automation, PipelineModule } from '@/lib/automations/types';
import { checkReadiness } from '@/lib/automations/readiness';
import { stepDef, boardPlacement, MODULE_LABEL, PIPELINES, RECORD_NOUN, stageLabel } from '@/lib/automations/registry';
import { stepPhrase } from '@/lib/automations/summary';
import { testRun } from '@/lib/automations/engine';
import { allRecords } from '@/lib/automations/records';
import {
  createJourney, deleteAutomations, deployAutomations, getAutomationState, setEnabled, setJourneyEnabled, setSettings, updateJourney, useAuto, waitingRunsFor,
} from '@/lib/automations/store';
import { fillVariables } from '@/lib/automations/messages';
import { getDb as getFeatureDb, useDb as useFeatureDb } from '@/features/lib/store';
import { toast } from '@/features/lib/toast';
import { Banner, Button, Checkbox, Field, Input, Modal, Select, Badge } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { useEngineEnv, useEstimateTemplates, useLibrary, useNames, useOrg, usePerms } from './hooks';
import { ReadinessList, runLabel } from './shared';

/* ---------- Deploy / approve ---------- */

export function DeployModal({ open, ids, journeyId, onClose, onDone }: { open: boolean; ids: string[]; journeyId?: string; onClose: () => void; onDone?: () => void }) {
  const s = useAuto((x) => x);
  const library = useLibrary();
  const names = useNames();
  const templates = useEstimateTemplates();
  const users = useFeatureDb((d) => d.users);
  const { reviewLink, orgName } = useOrg();
  const { deploy } = usePerms();
  const [ticked, setTicked] = useState(false);
  const [preview, setPreview] = useState<string>();
  const list = ids.map((id) => s.automations.find((a) => a.id === id)).filter((a): a is Automation => !!a && !a.isDeleted);
  const readiness = useMemo(() => checkReadiness(list, s, { db: { users }, messages: library, estimateTemplates: templates, reviewLink, all: s.automations }, journeyId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, ids.join(','), s.automations, library, templates, reviewLink, users, journeyId]);
  const reapprove = list.length > 0 && list.every((a) => a.deployedAt);
  const facing = list.flatMap((a) => a.steps.filter((st) => stepDef(st.type)?.customerFacing).map((st) => ({ a, st })));
  const others = list.flatMap((a) => a.steps.filter((st) => !stepDef(st.type)?.customerFacing).map((st) => ({ a, st })));
  const close = () => { setTicked(false); setPreview(undefined); onClose(); };
  const go = () => {
    const r = deployAutomations(ids, ticked);
    if (!r.ok) return toast.error('Not deployed', r.error);
    toast.success(reapprove ? 'Changes approved' : list.length > 1 ? `${list.length} automations deployed` : `${list[0]?.name} deployed`, reapprove ? 'The new version runs from now on.' : 'It runs on its own from now on.');
    close();
    onDone?.();
  };
  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} size="lg" title={reapprove ? 'Approve changes' : 'Deploy automation'}
      description={reapprove ? 'A customer-facing step or message changed. Until you approve, the old version keeps running.' : 'Deploying approves every step below to run on its own. You can mark any step "Ask me first" instead.'}
      footer={<>
        <Button onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={go} disabled={!readiness.ok || !ticked || !deploy}><Rocket className="h-4 w-4" /> {reapprove ? 'Approve' : 'Deploy'}</Button>
      </>}>
      <div className="space-y-5">
        <section>
          <h3 className="mb-2 font-bold text-gray-900 dark:text-white">Readiness check</h3>
          <ReadinessList items={readiness.items} />
          {!readiness.ok && <p className="mt-2 text-sm text-red-700">Fix the items marked with a cross before deploying.</p>}
        </section>
        <section>
          <h3 className="mb-2 font-bold text-gray-900 dark:text-white">Sent to customers without asking</h3>
          {facing.filter(({ st }) => st.mode !== 'ASK').length === 0 ? <p className="text-sm text-gray-500">Nothing is sent to customers without asking.</p> : (
            <ul className="space-y-2">
              {facing.filter(({ st }) => st.mode !== 'ASK').map(({ a, st }) => {
                const m = library.find((x) => x.id === st.config.messageId);
                const key = `${a.id}:${st.id}`;
                return (
                  <li key={key} className="rounded-xl border border-purple-100 bg-purple-50/50 p-3 text-sm dark:border-purple-900 dark:bg-purple-900/20">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><span className="font-semibold">{stepDef(st.type)?.title}</span>{m ? <> · “{m.name}”</> : ' · default text'} <span className="text-gray-500">({a.name})</span></span>
                      {m && <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline" onClick={() => setPreview(preview === key ? undefined : key)}><Eye className="h-3.5 w-3.5" /> Preview</button>}
                    </div>
                    {preview === key && m && (
                      <div className="mt-2 whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                        {m.subject && <div className="mb-1 font-semibold">{fillVariables(m.subject, { orgName, customerName: 'Jane Smith', firstName: 'Jane', projectName: 'Interior repaint' })}</div>}
                        {fillVariables(m.body, { orgName, customerName: 'Jane Smith', firstName: 'Jane', projectName: 'Interior repaint' })}
                        {m.channel === 'SMS' && <span className="text-gray-400"> – {orgName}. Reply STOP to opt out</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {facing.some(({ st }) => st.mode === 'ASK') && <p className="mt-2 text-xs text-gray-500">{facing.filter(({ st }) => st.mode === 'ASK').length} customer step(s) are set to "Ask me first" and wait for review each time.</p>}
        </section>
        <section>
          <h3 className="mb-2 font-bold text-gray-900 dark:text-white">Runs on its own</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-200">
            {others.map(({ a, st }) => <li key={`${a.id}:${st.id}`}>{stepPhrase(st, names).replace(/^./, (x) => x.toUpperCase())}{st.mode === 'ASK' ? ' (asks first)' : ''} <span className="text-gray-500">· {a.name}</span></li>)}
          </ul>
        </section>
        {!deploy && <Banner tone="warn" title="You can't deploy">Only people with "Deploy automations" can approve steps that run on their own.</Banner>}
        <Checkbox checked={ticked} onCheckedChange={setTicked} disabled={!deploy} label={<span className="font-semibold">I approve these steps running automatically</span>} />
        <p className="text-xs text-gray-500">Your approval is saved with your name, the time and a copy of every customer-facing step and message as they are now.</p>
      </div>
    </Modal>
  );
}

/* ---------- Turn off ---------- */

export function TurnOffModal({ open, ids, journeyId, onClose }: { open: boolean; ids: string[]; journeyId?: string; onClose: () => void }) {
  const s = useAuto((x) => x);
  const [choice, setChoice] = useState<'STOP' | 'FINISH'>('STOP');
  const n = waitingRunsFor(s, ids);
  const go = () => {
    const r = journeyId ? setJourneyEnabled(journeyId, false, choice) : setEnabled(ids, false, choice);
    if (!r.ok) return toast.error('Not turned off', r.error);
    toast.success(journeyId ? 'Journey turned off' : ids.length > 1 ? `${ids.length} automations turned off` : 'Automation turned off', n ? (choice === 'STOP' ? `${n} waiting ${n === 1 ? 'run was' : 'runs were'} stopped.` : `${n} waiting ${n === 1 ? 'run' : 'runs'} will finish.`) : undefined);
    onClose();
  };
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={journeyId ? 'Turn off this journey?' : 'Turn off?'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger-solid" onClick={go}>Turn off</Button></>}>
      {n === 0 ? <p className="text-sm text-gray-700">Nothing is waiting. It stops starting new runs. You can turn it on again later.</p> : (
        <div className="space-y-3 text-sm">
          <p>{n} {n === 1 ? 'run is' : 'runs are'} waiting. Stop {n === 1 ? 'it' : 'them'}, or let {n === 1 ? 'it' : 'them'} finish?</p>
          {(['STOP', 'FINISH'] as const).map((c) => (
            <label key={c} className="flex items-start gap-2"><input type="radio" checked={choice === c} onChange={() => setChoice(c)} className="mt-1" />
              <span><span className="font-semibold">{c === 'STOP' ? 'Stop them' : 'Let them finish'}</span><span className="block text-xs text-gray-500">{c === 'STOP' ? 'Waiting steps are marked Skipped. Nothing more is sent.' : 'Runs already started carry on; no new ones start.'}</span></span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ---------- Delete ---------- */

export function keyJobWarnings(list: Automation[], all: Automation[]): string[] {
  const out: string[] = [];
  for (const a of list) {
    if (!a.journeyId) continue;
    const finals = (x: Automation) => x.steps.some((st) => st.type === 'CREATE_INVOICE' && st.config.invoiceType === 'FINAL');
    if (finals(a) && !all.some((x) => x.id !== a.id && !x.isDeleted && x.journeyId === a.journeyId && finals(x))) {
      out.push('This journey will no longer create final invoices. Jobs will wait at Completed until someone does it by hand.');
    }
    const deposits = (x: Automation) => x.steps.some((st) => st.type === 'CREATE_INVOICE' && st.config.invoiceType === 'DEPOSIT');
    if (deposits(a) && !all.some((x) => x.id !== a.id && !x.isDeleted && x.journeyId === a.journeyId && deposits(x))) {
      out.push('This journey will no longer ask for deposits. Accepted estimates will wait for someone to send the deposit invoice.');
    }
  }
  return Array.from(new Set(out));
}

export function DeleteModal({ open, ids, onClose, onDone }: { open: boolean; ids: string[]; onClose: () => void; onDone?: () => void }) {
  const s = useAuto((x) => x);
  const list = ids.map((id) => s.automations.find((a) => a.id === id)).filter((a): a is Automation => !!a);
  const n = waitingRunsFor(s, ids);
  const warnings = keyJobWarnings(list, s.automations);
  const go = () => {
    const r = deleteAutomations(ids);
    if (!r.ok) return toast.error('Not deleted', r.error);
    toast.success(list.length > 1 ? `${list.length} automations deleted` : `${list[0]?.name} deleted`);
    onClose();
    onDone?.();
  };
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={list.length === 1 ? `Delete '${list[0]!.name}'?` : `Delete ${list.length} automations?`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger-solid" onClick={go}>Delete</Button></>}>
      <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
        <p>{list.length === 1 ? 'It will stop now.' : 'They will stop now.'} {n ? `${n} ${n === 1 ? 'run that is' : 'runs that are'} waiting will be stopped.` : ''} Past activity stays in Activity for your records.</p>
        {warnings.map((w) => <Banner key={w} tone="warn">{w}</Banner>)}
      </div>
    </Modal>
  );
}

/* ---------- Test run ---------- */

export function TestRunModal({ open, ids, onClose }: { open: boolean; ids: string[]; onClose: () => void }) {
  const s = useAuto((x) => x);
  const fdb = useFeatureDb((d) => d);
  const envOf = useEngineEnv();
  const names = useNames();
  const list = ids.map((id) => s.automations.find((a) => a.id === id)).filter((a): a is Automation => !!a);
  const pipelines = Array.from(new Set(list.map((a) => boardPlacement(a.trigger).pipeline)));
  const [type, setType] = useState<PipelineModule>(pipelines[0] ?? 'JOB');
  const records = useMemo(() => allRecords(fdb, new Date()).filter((r) => r.type === type).sort((x, y) => (y.createdAt ?? '').localeCompare(x.createdAt ?? '')), [fdb, type]);
  const [recordId, setRecordId] = useState('');
  const [result, setResult] = useState<ReturnType<typeof testRun>>();
  const run = () => {
    if (!recordId) return;
    setResult(testRun(list, getAutomationState(), getFeatureDb(), type, recordId, envOf(), names));
  };
  const close = () => { setResult(undefined); setRecordId(''); onClose(); };
  const tone = { WOULD_RUN: 'green', WOULD_WAIT: 'blue', WOULD_FAIL: 'red', WOULD_SKIP: 'gray' } as const;
  const label = { WOULD_RUN: 'Would run', WOULD_WAIT: 'Would wait', WOULD_FAIL: 'Would fail', WOULD_SKIP: 'Would skip' } as const;
  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} size="lg" title="Test run" description="Plays these automations against a past record's real history. Nothing is created and nothing is sent."
      footer={<><Button onClick={close}>Close</Button><Button variant="primary" disabled={!recordId} onClick={run}><FlaskConical className="h-4 w-4" /> Run test</Button></>}>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Field label="Record type" htmlFor="tr-type">
          <Select id="tr-type" value={type} onChange={(e) => { setType(e.target.value as PipelineModule); setRecordId(''); setResult(undefined); }}>
            {PIPELINES.map((p) => <option key={p} value={p}>{MODULE_LABEL[p]}</option>)}
          </Select>
        </Field>
        <Field label={`Pick a past ${RECORD_NOUN[type]}`} htmlFor="tr-rec" hint="A finished job shows the most.">
          <Select id="tr-rec" value={recordId} onChange={(e) => { setRecordId(e.target.value); setResult(undefined); }}>
            <option value="">Choose…</option>
            {records.map((r) => <option key={r.id} value={r.id}>{r.label} · {stageLabel(r.type, r.stage)}</option>)}
          </Select>
        </Field>
      </div>
      {result && (
        <div className="mt-4">
          <h3 className="mb-2 font-bold">{result.recordLabel}</h3>
          {result.timeline.length === 0 ? <p className="text-sm text-gray-500">Nothing in this record's history would have started these automations.</p> : (
            <ol className="relative space-y-2 border-l border-gray-200 pl-4 dark:border-gray-700">
              {result.timeline.map((t, i) => (
                <li key={i} className="text-sm">
                  <span className={cn('absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full', t.outcome === 'WOULD_FAIL' ? 'bg-red-500' : t.outcome === 'WOULD_RUN' ? 'bg-green-500' : t.outcome === 'WOULD_WAIT' ? 'bg-blue-500' : 'bg-gray-300')} aria-hidden />
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={tone[t.outcome]}>{label[t.outcome]}</Badge><span className="font-semibold">{t.stepTitle}</span><span className="text-xs text-gray-500">{t.automationName} · {new Date(t.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
                  <p className={cn('text-xs', t.outcome === 'WOULD_FAIL' ? 'text-red-700' : 'text-gray-600 dark:text-gray-300')}>{t.message}</p>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 flex items-center gap-1 text-xs text-gray-500"><CheckCircle2 className="h-3.5 w-3.5" /> Nothing was changed.</p>
        </div>
      )}
    </Modal>
  );
}

/* ---------- Journeys ---------- */

export function JourneyModal({ open, journeyId, onClose, onSaved }: { open: boolean; journeyId?: string; onClose: () => void; onSaved?: (id: string) => void }) {
  const journeys = useAuto((s) => s.journeys);
  const j = journeys.find((x) => x.id === journeyId);
  const [name, setName] = useState(j?.name ?? '');
  const [description, setDescription] = useState(j?.description ?? '');
  const err = name.trim().length < 3 ? 'The name needs at least 3 characters.' : name.trim().length > 80 ? 'At most 80 characters.' : journeys.some((x) => x.id !== journeyId && x.name.toLowerCase() === name.trim().toLowerCase()) ? 'Another journey already uses this name.' : undefined;
  const [touched, setTouched] = useState(false);
  const save = () => {
    setTouched(true);
    if (err) return;
    if (journeyId) { const r = updateJourney(journeyId, { name: name.trim(), description }); if (!r.ok) return toast.error('Not saved', r.error); onSaved?.(journeyId); }
    else { const r = createJourney(name, description); if (!r.ok) return toast.error('Not created', r.error); onSaved?.(r.value!); }
    toast.success(journeyId ? 'Journey renamed' : 'Journey created');
    onClose();
  };
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={journeyId ? 'Rename journey' : 'New journey'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Name" htmlFor="jn-name" required error={touched ? err : undefined}><Input id="jn-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard Interior Repaint" /></Field>
        <Field label="Description" htmlFor="jn-desc"><Input id="jn-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/* ---------- Module settings ---------- */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ModuleSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useAuto((s) => s.settings);
  const { manage, user } = usePerms();
  const [draft, setDraft] = useState(settings);
  const lim = (ch: 'email' | 'sms', k: 'perSecond' | 'perDay' | 'perMonth', v: string) =>
    setDraft((d) => ({ ...d, sending: { ...d.sending, [ch]: { ...d.sending[ch], [k]: v === '' ? undefined : Math.max(0, Number(v)) } } }));
  const save = () => {
    const r = setSettings(draft);
    if (!r.ok) return toast.error('Not saved', r.error);
    toast.success('Automation settings saved');
    onClose();
  };
  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) onClose(); else setDraft(settings); }} size="lg" title="Automation settings"
      footer={<><Button onClick={onClose}>Cancel</Button>{manage && <Button variant="primary" onClick={save}>Save</Button>}</>}>
      <div className="space-y-5 text-sm">
        <section>
          <h3 className="mb-1 font-bold">Sending provider plan</h3>
          <p className="mb-2 text-xs text-gray-500">From configuration: the plan limits of the email and text provider. Messages over a limit wait in the queue; none are dropped. Leave blank for no limit.</p>
          <Field label="Provider" htmlFor="ms-provider" hint="Not chosen yet: messages are recorded, not delivered (sandbox).">
            <Input id="ms-provider" disabled={!manage} value={draft.sending.provider ?? ''} placeholder="Not set up" onChange={(e) => setDraft((d) => ({ ...d, sending: { ...d.sending, provider: e.target.value.trim() || null } }))} />
          </Field>
          {(['email', 'sms'] as const).map((ch) => (
            <div key={ch} className="mt-2 grid grid-cols-3 gap-2">
              {(['perSecond', 'perDay', 'perMonth'] as const).map((k) => (
                <Field key={k} label={`${ch === 'email' ? 'Emails' : 'Texts'} ${k === 'perSecond' ? 'per second' : k === 'perDay' ? 'per day' : 'per month'}`} htmlFor={`ms-${ch}-${k}`}>
                  <Input id={`ms-${ch}-${k}`} type="number" min={0} disabled={!manage} value={draft.sending[ch][k] ?? ''} onChange={(e) => lim(ch, k, e.target.value)} />
                </Field>
              ))}
            </div>
          ))}
        </section>
        <section>
          <h3 className="mb-1 font-bold">Texting</h3>
          <Checkbox checked={draft.textingReleased} disabled={!manage || user.role !== 'owner'} onCheckedChange={(v) => setDraft((d) => ({ ...d, textingReleased: v }))}
            label="Texting is released (the written state rules and timezone are supplied)" />
          <p className="mt-1 text-xs text-gray-500">Feature 29: text steps stay locked until the business owner and bookkeeper supply the state rules and timezone. Only the business owner can change this.</p>
        </section>
        <section>
          <h3 className="mb-1 font-bold">Working days</h3>
          <div className="flex flex-wrap gap-1">
            {DAYS.map((d, i) => (
              <button key={d} type="button" disabled={!manage} aria-pressed={draft.workingDays.includes(i)} onClick={() => setDraft((x) => ({ ...x, workingDays: x.workingDays.includes(i) ? x.workingDays.filter((y) => y !== i) : [...x.workingDays, i].sort() }))}
                className={cn('rounded-lg border px-2.5 py-1 text-xs font-semibold', draft.workingDays.includes(i) ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500')}>{d}</button>
            ))}
          </div>
          <Checkbox checked={draft.stuckWorkingDaysOnly} disabled={!manage} onCheckedChange={(v) => setDraft((d) => ({ ...d, stuckWorkingDaysOnly: v }))} label="Stuck alerts count working days only" />
        </section>
        <section>
          <h3 className="mb-1 font-bold">Job scheduling</h3>
          <Checkbox checked={!!draft.flags['new-job-scheduling']} disabled={!manage} onCheckedChange={(v) => setDraft((d) => ({ ...d, flags: { ...d.flags, 'new-job-scheduling': v } }))} label="This business uses the new job scheduling ('Book the schedule' step)" />
        </section>
      </div>
    </Modal>
  );
}

export { runLabel };
