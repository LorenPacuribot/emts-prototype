'use client';

/*
  Crew schedule notifications (30 Sep call, JS).

  Saving, moving or cancelling a shift sends nothing (JS-M1): a toast says
  the crew has not been told, with "Notify now". Each person's last-told
  schedule is kept per job (JS-M2, scheduleNotifySnapshots); a job that
  differs shows "Changes not sent" on its bar. "Unsent changes (N)" opens the
  Notify crew modal (JS-M3). "Send updates" logs one Schedule Update per
  ticked person, sandbox only, and moves their snapshots (JS-M4).

  Complete version: Send Email from the Edit Schedule panel (JS-C1), the
  modal straight after Bulk Reschedule (JS-C2), Automatic mode from Settings >
  Automated Messages (JS-C3), Delivered / Not delivered per person (JS-C4),
  Email and Text chips (JS-C5), and an English / Español preview (JS-C6).

  The rules are in features/lib/rules/schedule-notify.ts.
*/
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { BellRing, ChevronDown, Eye, Mail, MessageSquare, Send } from 'lucide-react';
import { useCollection, useCurrentUser, useLogActivity, useSingleton } from '@/lib/store';
import type { ScheduleMessageLog, TeamMember } from '@/lib/types';
import { cn, fullName, uid } from '@/lib/utils';
import { Badge, Button, Checkbox, EmptyState, Modal, NewBadge, PillTabs, VersionBadge, FeatureGate } from '@/features/components/ui';
import { toast } from '@/features/lib/toast';
import { useIsOn } from '@/features/lib/feature-visibility';
import {
  describeView, markNotified, messageText, peopleWaiting, scheduleLogText, scheduleUpdateMessage, unsentJobIds,
  type NotifyLang, type PersonChange, type ScheduleMessage,
} from '@/features/lib/rules/schedule-notify';

export const CREW_TEMPLATE_ID = 'am_crew_schedule';

type Channel = 'email' | 'sms';

/* ---------- Modal state (opened from toasts, the header, the shift panel and Bulk Reschedule) ---------- */

interface NotifyModalState {
  open: boolean;
  /** Only changes on these jobs (JS-C1 one job, JS-C2 the jobs just moved). */
  jobIds?: string[];
  title?: string;
  /** Jobs saved while the crew template is Automatic (JS-C3): sent once the save lands. */
  autoJobIds: string[];
  show: (o?: { jobIds?: string[]; title?: string }) => void;
  hide: () => void;
  queueAuto: (jobIds: string[]) => void;
  clearAuto: () => void;
}

export const useNotifyModal = create<NotifyModalState>((set) => ({
  open: false,
  autoJobIds: [],
  show: (o) => set({ open: true, jobIds: o?.jobIds, title: o?.title }),
  hide: () => set({ open: false, jobIds: undefined, title: undefined }),
  queueAuto: (jobIds) => set((s) => ({ autoJobIds: [...new Set([...s.autoJobIds, ...jobIds])] })),
  clearAuto: () => set({ autoJobIds: [] }),
}));

/* ---------- Data and sending ---------- */

const validEmail = (v?: string) => !!v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const validPhone = (v?: string) => (v ?? '').replace(/\D/g, '').length >= 10;

export function useCrewNotify() {
  const { items: jobs } = useCollection('jobs');
  const { items: team } = useCollection('team');
  const snapshots = useCollection('scheduleNotifySnapshots');
  const messages = useCollection('scheduleMessages');
  const { items: templates } = useCollection('automatedMessages');
  const me = useCurrentUser();
  const log = useLogActivity();
  const template = templates.find((t) => t.id === CREW_TEMPLATE_ID);
  const [bp] = useSingleton('businessProfile');

  const unsent = useMemo(() => unsentJobIds(jobs, snapshots.items), [jobs, snapshots.items]);
  const waiting = (jobIds?: string[]) => peopleWaiting(jobs, snapshots.items, jobIds);
  const member = (id: string) => team.find((t) => t.id === id);

  const messageFor = (m: TeamMember | undefined, changes: PersonChange[], lang: NotifyLang): ScheduleMessage =>
    scheduleUpdateMessage(m?.firstName || 'there', changes, { lang, subject: template?.subject, company: bp.companyName, addressOf: (id) => jobs.find((j) => j.id === id)?.address });

  /** Logs one Schedule Update per person and channel, then moves the snapshots of everyone reached. */
  const send = (rows: { memberId: string; channels: Channel[] }[], opts: { lang?: NotifyLang; jobIds?: string[]; skipped?: string[] } = {}) => {
    const lang = opts.lang ?? 'en';
    const at = new Date().toISOString();
    let snaps = snapshots.items;
    const logs: ScheduleMessageLog[] = [];
    for (const row of rows) {
      const m = member(row.memberId);
      const changes = waiting(opts.jobIds).find((p) => p.memberId === row.memberId)?.changes ?? [];
      if (!m || !changes.length) continue;
      const msg = messageFor(m, changes, lang);
      const mine: ScheduleMessageLog[] = row.channels.flatMap((channel) => {
        const to = channel === 'email' ? m.email : m.phone;
        if (!to) return [];
        const ok = channel === 'email' ? validEmail(to) : validPhone(to);
        return [{
          id: uid('sm'), memberId: m.id, channel, to, subject: msg.subject, body: messageText(msg), lang, jobIds: changes.map((c) => c.jobId), at,
          sentBy: fullName(me), sandbox: true as const, delivery: ok ? 'delivered' as const : 'not_delivered' as const,
          error: ok ? undefined : channel === 'email' ? 'The address is not a valid email.' : 'The number is not a valid mobile number.',
        }];
      });
      logs.push(...mine);
      // Their pills clear once the update reached them.
      const name = fullName(m);
      if (mine.some((x) => x.delivery === 'delivered')) {
        snaps = markNotified(snaps, m.id, jobs, at, opts.jobIds);
        log(scheduleLogText.sent(name, fullName(me), [...new Set(changes.map((c) => c.jobNumber))]), 'job', changes[0]!.jobId);
      }
      for (const f of mine.filter((x) => x.delivery === 'not_delivered')) log(scheduleLogText.failed(name, f.error ?? 'Unknown error.'), 'job', changes[0]!.jobId);
    }
    // Tab 4: people the scheduler unticked keep their marker; the log says so.
    for (const id of opts.skipped ?? []) {
      const m = member(id);
      const changes = waiting(opts.jobIds).find((p) => p.memberId === id)?.changes ?? [];
      if (m && changes.length) log(scheduleLogText.skipped(fullName(m), fullName(me), [...new Set(changes.map((c) => c.jobNumber))]), 'job', changes[0]!.jobId);
    }
    if (logs.length) {
      snapshots.setAll(snaps);
      messages.setAll([...logs, ...messages.items]);
    }
    return logs;
  };

  return { jobs, team, template, unsent, waiting, member, messageFor, send, messages: messages.items };
}

/* ---------- After a save (JS-M1, JS-C3) ---------- */

/** Call after saving, moving or cancelling a schedule. Tells the office the crew was not notified. */
export function useScheduleSaved() {
  const { items: templates } = useCollection('automatedMessages');
  const minimal = useIsOn({ featureKey: 'js' });
  const complete = useIsOn({ featureKey: 'js', part: 'complete' });
  return (jobIds: string[]) => {
    // Job scheduling emails switched off in New Features: a plain confirmation.
    if (!minimal) {
      toast.success('Schedule saved.');
      return;
    }
    const t = templates.find((x) => x.id === CREW_TEMPLATE_ID);
    if (complete && t?.isActive && t.mode === 'automatic') {
      useNotifyModal.getState().queueAuto(jobIds);
      return;
    }
    toast.info('Saved. The crew has not been notified.', undefined, { label: 'Notify now', onClick: () => useNotifyModal.getState().show() });
  };
}

/* ---------- Pill on job bars (JS-M2) ---------- */

const UnsentContext = createContext<Set<string>>(new Set());

/** Wrap the boards so each job bar knows whether its changes were sent. */
export function UnsentJobsProvider({ children }: { children: React.ReactNode }) {
  const { unsent } = useCrewNotify();
  return <UnsentContext.Provider value={unsent}>{children}</UnsentContext.Provider>;
}

export function ChangesNotSentPill({ jobId, className }: { jobId: string; className?: string }) {
  const unsent = useContext(UnsentContext);
  const on = useIsOn({ item: 'JS-M2' });
  if (!on || !unsent.has(jobId)) return null;
  return (
    <span
      title="The crew has not been told about the latest changes to this job."
      className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-white px-1.5 py-px text-xxs font-bold leading-4 text-gray-800 shadow-sm', className)}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-orange-500" aria-hidden />
      Changes not sent
    </span>
  );
}

/* ---------- Header button (JS-M3) ---------- */

export function UnsentChangesButton() {
  const { waiting } = useCrewNotify();
  const on = useIsOn({ item: 'JS-M3' });
  const n = waiting().length;
  if (!on || !n) return null;
  return (
    <Button variant="primary" data-tour="js-unsent" onClick={() => useNotifyModal.getState().show()}>
      <BellRing className="h-4 w-4" /> Unsent changes ({n}) <VersionBadge item="JS-M3" />
    </Button>
  );
}

/* ---------- The modal (JS-M3, JS-M4, JS-C4, JS-C5) ---------- */

interface Choice { ticked: boolean; channels: Channel[] }

/** Mounted once (FeatureShell), so "Notify now" works from any page. */
export function NotifyCrewHost() {
  const state = useNotifyModal();
  const n = useCrewNotify();
  // JS-C3: Automatic mode sends once the saved schedule has landed in the store.
  useEffect(() => {
    if (!state.autoJobIds.length) return;
    const ids = state.autoJobIds;
    state.clearAuto();
    const rows = n.waiting(ids).map((p) => ({ memberId: p.memberId, channels: ['email' as Channel] }));
    const logs = n.send(rows, { jobIds: ids });
    const people = new Set(logs.filter((x) => x.delivery === 'delivered').map((x) => x.memberId)).size;
    toast.success('Saved. The crew was notified.', people ? `Schedule update sent by email to ${people} ${people === 1 ? 'person' : 'people'} (sandbox).` : 'Nobody on these jobs has an email on file.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.autoJobIds, n.jobs]);
  if (!state.open) return null;
  return <NotifyCrewModal key={`${state.title ?? ''}${(state.jobIds ?? []).join(',')}`} jobIds={state.jobIds} title={state.title} onClose={state.hide} />;
}

function NotifyCrewModal({ jobIds, title, onClose }: { jobIds?: string[]; title?: string; onClose: () => void }) {
  const n = useCrewNotify();
  const complete = useIsOn({ featureKey: 'js', part: 'complete' });
  const people = n.waiting(jobIds);
  const hasEmail = (m?: TeamMember) => !!m?.email;
  const hasPhone = (m?: TeamMember) => !!m?.phone;
  const defaultChannels = (m?: TeamMember): Channel[] => (hasEmail(m) ? ['email'] : complete && hasPhone(m) ? ['sms'] : []);
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(people.map((p) => { const ch = defaultChannels(n.member(p.memberId)); return [p.memberId, { ticked: ch.length > 0, channels: ch }]; })),
  );
  const [openRow, setOpenRow] = useState<string>();
  const [preview, setPreview] = useState(false);
  // JS-C6: the language picked in the preview is the one sent.
  const [lang, setLang] = useState<NotifyLang>('en');
  const [results, setResults] = useState<ScheduleMessageLog[]>();

  const reachable = (id: string) => (choices[id]?.channels.length ?? 0) > 0;
  const ticked = people.filter((p) => choices[p.memberId]?.ticked && reachable(p.memberId));
  const setChoice = (id: string, patch: Partial<Choice>) => setChoices((c) => ({ ...c, [id]: { ...c[id]!, ...patch } }));
  const toggleChannel = (id: string, ch: Channel) => {
    const cur = choices[id]!.channels;
    const next = cur.includes(ch) ? cur.filter((x) => x !== ch) : [...cur, ch];
    setChoice(id, { channels: next, ticked: next.length > 0 });
  };

  const sendNow = () => {
    const skipped = people.filter((p) => !ticked.includes(p)).map((p) => p.memberId);
    const logs = n.send(ticked.map((p) => ({ memberId: p.memberId, channels: choices[p.memberId]!.channels })), { jobIds, lang: complete ? lang : 'en', skipped });
    const count = new Set(logs.map((x) => x.memberId)).size;
    if (complete) {
      setResults(logs); // JS-C4: show Delivered / Not delivered per person.
      return;
    }
    // JS-C1: one job (Send Email) uses tab 4's toast, "Update sent to {N} people."
    toast.success(jobIds?.length === 1 ? `Update sent to ${count} ${count === 1 ? 'person' : 'people'}.` : `Schedule updates sent to ${count} ${count === 1 ? 'person' : 'people'}`, 'Sandbox: logged in the prototype, nothing was delivered.');
    onClose();
  };

  const heading = title ?? 'Notify crew about schedule changes';
  const description = (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      One email per person lists their new, changed and removed jobs. Sandbox: nothing leaves the prototype.
      <VersionBadge item="JS-M3" />
    </span>
  );

  if (results) {
    const byPerson = [...new Set(results.map((r) => r.memberId))];
    return (
      <Modal open onOpenChange={(v) => !v && onClose()} title="Schedule updates sent" size="lg" description={<span className="inline-flex items-center gap-1.5">Sandbox results per person <VersionBadge item="JS-C4" /></span>}
        footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {byPerson.map((id) => (
            <li key={id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <b className="mr-auto text-gray-900">{fullName(n.member(id))}</b>
              {results.filter((r) => r.memberId === id).map((r) => (
                <Badge key={r.id} tone={r.delivery === 'delivered' ? 'green' : 'red'}>
                  {r.channel === 'email' ? 'Email' : 'Text'}: {r.delivery === 'delivered' ? 'Delivered' : 'Not delivered'}
                </Badge>
              ))}
            </li>
          ))}
          {!byPerson.length && <li className="px-4 py-6 text-center text-sm text-gray-500">Nothing was sent.</li>}
        </ul>
        {results.some((r) => r.delivery === 'not_delivered') && <p className="mt-3 text-xs text-gray-500">People not reached keep &quot;Changes not sent&quot; until an update reaches them.</p>}
      </Modal>
    );
  }

  return (
    <>
      <Modal
        open={!preview}
        onOpenChange={(v) => !v && onClose()}
        title={heading}
        description={description}
        size="lg"
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Not now</Button>
            <Button variant="secondary" disabled={!ticked.length} onClick={() => setPreview(true)}><Eye className="h-4 w-4" /> Preview email</Button>
            <Button variant="primary" disabled={!ticked.length} onClick={sendNow}><Send className="h-4 w-4" /> Send updates{ticked.length ? ` (${ticked.length})` : ''}</Button>
          </div>
        }
      >
        {!people.length ? (
          <EmptyState title="Everyone is up to date" body="No crew member has schedule changes waiting." />
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-gray-500">{people.length} {people.length === 1 ? 'person' : 'people'} affected</span>
              <span className="flex gap-3">
                <button className="font-bold text-primary-700 hover:underline" onClick={() => setChoices((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { ...v, ticked: v.channels.length > 0 }])))}>Select all</button>
                <button className="font-bold text-primary-700 hover:underline" onClick={() => setChoices((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { ...v, ticked: false }])))}>Clear all</button>
              </span>
            </div>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {people.map((p) => {
                const m = n.member(p.memberId);
                const c = choices[p.memberId] ?? { ticked: false, channels: [] };
                const noEmail = !hasEmail(m);
                const unreachable = noEmail && !(complete && hasPhone(m));
                const expanded = openRow === p.memberId;
                return (
                  <li key={p.memberId} className={cn('px-4 py-3', unreachable && 'bg-gray-50 text-gray-400')}>
                    <div className="flex flex-wrap items-center gap-3">
                      <Checkbox checked={c.ticked} disabled={unreachable} onCheckedChange={(v) => setChoice(p.memberId, { ticked: v && c.channels.length > 0 })} label={<b className={cn('text-sm', unreachable ? 'text-gray-400' : 'text-gray-900')}>{fullName(m)}</b>} />
                      {noEmail && <span className="text-xs italic text-gray-500">No email on file</span>}
                      <FeatureGate item="JS-C5">
                        <span className="flex items-center gap-1.5">
                          <ChannelChip on={c.channels.includes('email')} disabled={noEmail} icon={<Mail className="h-3 w-3" />} label="Email" onClick={() => toggleChannel(p.memberId, 'email')} />
                          <ChannelChip on={c.channels.includes('sms')} disabled={!hasPhone(m)} icon={<MessageSquare className="h-3 w-3" />} label="Text" onClick={() => toggleChannel(p.memberId, 'sms')} />
                          <VersionBadge item="JS-C5" />
                        </span>
                      </FeatureGate>
                      <button onClick={() => setOpenRow(expanded ? undefined : p.memberId)} aria-expanded={expanded} className="ml-auto flex items-center gap-1 text-xs font-bold text-gray-600 hover:text-gray-900">
                        {p.changes.length} {p.changes.length === 1 ? 'job' : 'jobs'} changed
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
                      </button>
                    </div>
                    {expanded && <ChangeList changes={p.changes} />}
                  </li>
                );
              })}
            </ul>
            <FeatureGate item="JS-C5">
              {people.some((p) => choices[p.memberId]?.channels.includes('sms')) && (
                <p className="mt-3 text-xs text-amber-700">Text: sandbox only. Needs state texting rules before go-live.</p>
              )}
            </FeatureGate>
          </>
        )}
      </Modal>
      {preview && (
        <PreviewModal
          people={ticked.map((p) => ({ memberId: p.memberId, changes: p.changes }))}
          onBack={() => setPreview(false)}
          lang={lang}
          setLang={setLang}
        />
      )}
    </>
  );
}

function ChannelChip({ on, disabled, icon, label, onClick }: { on: boolean; disabled?: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold',
        on ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-500',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      {icon} {label}
    </button>
  );
}

/** Old dates struck through beside the new ones. */
function ChangeList({ changes }: { changes: PersonChange[] }) {
  return (
    <ul className="mt-2 space-y-1.5 rounded-lg bg-gray-50 p-3 text-xs">
      {changes.map((c) => (
        <li key={c.jobId} className="flex flex-wrap items-baseline gap-x-2">
          <b className="text-gray-900">{c.title} ({c.jobNumber})</b>
          {c.kind === 'new' && <><Badge tone="green">New</Badge><span className="text-gray-700">{describeView(c.after!)}</span></>}
          {c.kind === 'changed' && <><s className="text-gray-400">{describeView(c.before!)}</s><span className="text-gray-400">→</span><span className="font-semibold text-gray-900">{describeView(c.after!)}</span></>}
          {c.kind === 'removed' && <><Badge tone="red">Removed</Badge><s className="text-gray-400">{describeView(c.before!)}</s></>}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Preview (JS-M4, JS-C6) ---------- */

function PreviewModal({ people, onBack, lang, setLang }: { people: { memberId: string; changes: PersonChange[] }[]; onBack: () => void; lang: NotifyLang; setLang: (l: NotifyLang) => void }) {
  const n = useCrewNotify();
  const complete = useIsOn({ featureKey: 'js', part: 'complete' });
  const [who, setWho] = useState(people[0]?.memberId ?? '');
  const person = people.find((p) => p.memberId === who) ?? people[0];
  const m = n.member(person?.memberId ?? '');
  const msg = person ? n.messageFor(m, person.changes, complete ? lang : 'en') : undefined;
  return (
    <Modal open onOpenChange={(v) => !v && onBack()} title="Preview email" size="lg" description={<span className="inline-flex items-center gap-1.5">Schedule Update <VersionBadge item="JS-M4" /></span>}
      footer={<Button variant="secondary" onClick={onBack}>Back</Button>}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {people.length > 1 && (
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Preview for" className="h-9 rounded-lg border border-gray-200 px-2 text-sm">
            {people.map((p) => <option key={p.memberId} value={p.memberId}>{fullName(n.member(p.memberId))}</option>)}
          </select>
        )}
        <FeatureGate item="JS-C6">
          <span className="flex items-center gap-2">
            <PillTabs kind="segment" options={[{ value: 'en', label: 'English' }, { value: 'es', label: 'Español' }]} value={lang} onChange={(v) => setLang(v as NotifyLang)} />
            <VersionBadge item="JS-C6" />
          </span>
        </FeatureGate>
      </div>
      {msg && (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm">
            <div><span className="text-gray-500">To:</span> <b>{m?.email || m?.phone || 'No contact on file'}</b></div>
            <div><span className="text-gray-500">Subject:</span> <b>{msg.subject}</b></div>
          </div>
          <div className="space-y-3 px-5 py-4 text-sm text-gray-800">
            <p>{msg.greeting}</p>
            <p>{msg.intro}</p>
            {msg.sections.map((s) => (
              <div key={s.kind}>
                <div className="mb-1 font-heading text-sm font-bold text-gray-900">{s.title}</div>
                <ul className="space-y-1">
                  {s.lines.map((l) => (
                    <li key={l.job}>
                      <b>{l.job}</b>:{' '}
                      {/* D7: old dates crossed through beside the new ones. */}
                      {l.was && <><s className="text-gray-500" aria-label={`${msg.wasLabel} ${l.was}`}>{l.was}</s>{' → '}</>}
                      {s.kind === 'removed' ? <s className="text-gray-500">{l.when}</s> : l.when}
                      {l.address && <span className="text-gray-500">, {l.address}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p>{msg.outro}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Title of the modal that opens straight after Bulk Reschedule (JS-C2). */
export function movedJobsTitle(count: number) {
  return `${count} ${count === 1 ? 'job' : 'jobs'} moved. Notify the crew?`;
}
