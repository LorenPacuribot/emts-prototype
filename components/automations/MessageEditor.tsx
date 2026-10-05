'use client';

/*
  Message editor (spec 6.11), opened as a side panel from the Messages tab
  and from the Building blocks panel, so the user never leaves the board.
  New messages start from the message guide or a sample. A live preview
  fills the message with a real recent customer. Texts show the character
  and text-part counter, counting the "Reply STOP" line the system adds.
  Saving a message that deployed automations use asks for approval; until
  then they keep sending the old version.
*/
import { useEffect, useMemo, useState } from 'react';
import { History, Send } from 'lucide-react';
import type { MessageCategory, MessageVersion } from '@/lib/automations/types';
import { ALL_VARIABLES } from '@/lib/automations/registry';
import { GUIDE_TIPS, MESSAGE_GUIDE_EMAIL, MESSAGE_GUIDE_SMS, SAMPLE_MESSAGES, fillVariables, optOutLine, smsParts, type SampleMessage } from '@/lib/automations/messages';
import { validateMessage } from '@/lib/automations/validation';
import { deployAutomations, getAutomationState, useAuto } from '@/lib/automations/store';
import { allRecords } from '@/lib/automations/records';
import { variableValues } from '@/lib/automations/executors';
import { useDb as useFeatureDb } from '@/features/lib/store';
import { toast } from '@/features/lib/toast';
import { Badge, Banner, Button, Checkbox, Drawer, Field, Input, Modal, Select } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { fromSample, useLibrary, useMessageActions, useOrg, usePerms, type MessageInput } from './hooks';
import { VariableText } from './StepSettings';
import { relTime } from './shared';

/** Stable empty list: a selector must not return a new array each time. */
const NO_VERSIONS: MessageVersion[] = [];

export function MessageEditor({ open, messageId, channel: initialChannel, start, onClose, onSaved }: {
  open: boolean;
  messageId?: string;
  channel?: 'EMAIL' | 'SMS';
  /** Prefill (Duplicate). */
  start?: MessageInput;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const library = useLibrary();
  const existing = library.find((m) => m.id === messageId);
  const versions = useAuto((s) => (messageId ? s.messageVersions[messageId] : undefined)) ?? NO_VERSIONS;
  const { orgName, reviewLink } = useOrg();
  const { manage, user, deploy } = usePerms();
  const actions = useMessageActions();
  const fdb = useFeatureDb((d) => d);
  const [draft, setDraft] = useState<MessageInput | undefined>();
  const [touched, setTouched] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [approval, setApproval] = useState<{ ids: string[]; name: string }>();
  const [ticked, setTicked] = useState(false);
  const [customerId, setCustomerId] = useState('');

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setShowHistory(false);
    if (existing) setDraft({ name: existing.name, channel: existing.channel, subject: existing.subject, body: existing.body, category: existing.category });
    else if (start) setDraft(start);
    else setDraft(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, messageId]);

  const customers = useMemo(() => fdb.customers.filter((c) => !c.leadOnly && !c.personalDataDeleted).slice(-12).reverse(), [fdb.customers]);
  const previewValues = useMemo(() => {
    const cid = customerId || customers[0]?.id;
    const rec = allRecords(fdb, new Date()).filter((r) => r.customerId === cid).sort((a, b) => ['INVOICE', 'JOB', 'WORK_ORDER', 'ESTIMATE', 'LEAD'].indexOf(a.type) - ['INVOICE', 'JOB', 'WORK_ORDER', 'ESTIMATE', 'LEAD'].indexOf(b.type))[0];
    return rec ? variableValues(fdb, rec, { orgName, reviewLink, now: new Date() }) : { orgName, customerName: 'Jane Smith', firstName: 'Jane' };
  }, [fdb, customerId, customers, orgName, reviewLink]);

  const others = library.filter((m) => m.id !== messageId).map((m) => m.name);
  const problems = draft ? validateMessage(draft, { otherNames: others, orgName, variables: ALL_VARIABLES }) : [];
  const err = (w: string) => (touched ? problems.find((p) => p.where === w)?.message : undefined);
  const readOnly = !manage;

  const save = () => {
    if (!draft) return;
    setTouched(true);
    if (problems.length) return;
    if (existing) {
      const r = actions.update(existing.id, draft);
      if (r.needsApproval.length) { setApproval({ ids: r.needsApproval, name: draft.name }); return; }
      toast.success('Message saved');
      onSaved?.(existing.id);
    } else {
      const id = actions.create(draft);
      toast.success('Message added', 'It is ready to drag onto a stage.');
      onSaved?.(id);
    }
    onClose();
  };

  const parts = draft?.channel === 'SMS' ? smsParts(draft.body, orgName) : undefined;

  const chooser = (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 font-bold">Start from the message guide</h3>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDraft({ ...fromSample(MESSAGE_GUIDE_EMAIL), name: '', channel: 'EMAIL' })}>Email guide</Button>
          <Button onClick={() => setDraft({ ...fromSample(MESSAGE_GUIDE_SMS), name: '', channel: 'SMS' })}>Text guide</Button>
        </div>
      </div>
      <div>
        <h3 className="mb-2 font-bold">Start from a sample</h3>
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
          {SAMPLE_MESSAGES.filter((s) => !initialChannel || s.channel === initialChannel).map((s: SampleMessage) => (
            <li key={s.id}>
              <button type="button" onClick={() => setDraft(fromSample(s))} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700">
                <Badge tone={s.channel === 'SMS' ? 'indigo' : 'gray'}>{s.channel === 'SMS' ? 'SMS' : 'Email'}</Badge>
                <span className="min-w-0"><span className="block text-sm font-semibold">{s.name}</span><span className="block truncate text-xs text-gray-500">{s.body.split('\n').find((l) => l.trim())}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <>
      <Drawer open={open} onOpenChange={(o) => !o && onClose()} width="max-w-5xl" title={existing ? `Edit message: ${existing.name}` : 'New message'}
        subtitle={existing ? `Version ${existing.version}${existing.updatedAt ? ` · last saved ${relTime(existing.updatedAt)} by ${existing.updatedBy}` : ''}` : 'Messages here also show in Settings › Automated Messages and SMS Templates.'}
        footer={draft ? <>
          {existing && <Button onClick={() => setShowHistory((v) => !v)}><History className="h-4 w-4" /> History</Button>}
          <Button onClick={() => toast.success('Test sent', `${draft.channel === 'SMS' ? 'Text' : 'Email'} "${draft.name || 'Untitled'}" sent to you (${user.email}). Sandbox: recorded, not delivered.`)}><Send className="h-4 w-4" /> Send me a test</Button>
          <Button onClick={onClose}>Cancel</Button>
          {!readOnly && <Button variant="primary" onClick={save}>Save</Button>}
        </> : <Button onClick={onClose}>Cancel</Button>}>
        {!draft ? chooser : (
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-4">
              {draft.body.includes('[') && draft.body.includes(']') && (
                <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                  <div className="mb-1 font-semibold">Tips</div>
                  <ul className="list-disc space-y-0.5 pl-4">{GUIDE_TIPS.map((t) => <li key={t}>{t}</li>)}</ul>
                </div>
              )}
              <Field label="Name" htmlFor="me-name" required error={err('name')}>
                <Input id="me-name" value={draft.name} disabled={readOnly} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Deposit reminder" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Channel" htmlFor="me-channel" hint={existing ? "A saved message keeps its channel." : undefined}>
                  <div className="inline-flex rounded-xl bg-gray-100 p-1 dark:bg-gray-900" role="radiogroup" aria-label="Channel">
                    {(['EMAIL', 'SMS'] as const).map((c) => (
                      <button key={c} type="button" role="radio" aria-checked={draft.channel === c} disabled={!!existing || readOnly} onClick={() => setDraft({ ...draft, channel: c })}
                        className={cn('h-8 rounded-lg px-3 text-sm font-semibold', draft.channel === c ? 'bg-white shadow-sm dark:bg-gray-700' : 'text-gray-500')}>{c === 'EMAIL' ? 'Email' : 'SMS'}</button>
                    ))}
                  </div>
                </Field>
                <Field label="Send queue group" htmlFor="me-cat" hint="Replies go first, then estimates and invoices, then reminders, then everything else.">
                  <Select id="me-cat" value={draft.category ?? 'OTHER'} disabled={readOnly} onChange={(e) => setDraft({ ...draft, category: e.target.value as MessageCategory })}>
                    <option value="REPLY">Reply to something the customer did</option>
                    <option value="REMINDER">Reminder</option>
                    <option value="OTHER">Everything else</option>
                  </Select>
                </Field>
              </div>
              {draft.channel === 'EMAIL' && (
                <Field label="Subject" htmlFor="me-subject" required error={err('subject')}>
                  <Input id="me-subject" value={draft.subject ?? ''} disabled={readOnly} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                </Field>
              )}
              <Field label="Message" htmlFor="me-body" required error={err('body')}>
                <VariableText id="me-body" multiline rows={draft.channel === 'SMS' ? 4 : 12} value={draft.body} onChange={(v) => setDraft({ ...draft, body: v })} variables={ALL_VARIABLES} invalid={!!err('body')} disabled={readOnly} />
              </Field>
              {parts && <p className={cn('text-xs', parts.chars > 480 ? 'text-red-600' : 'text-gray-500')}>{parts.chars} / {parts.parts === 1 ? 160 : 480} · {parts.parts} {parts.parts === 1 ? 'text' : 'texts'}</p>}
              {draft.channel === 'EMAIL' && <p className="text-xs text-gray-500">Your email header and footer (Settings › Automated Messages) are added when it is sent.</p>}
              {showHistory && (
                <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                  <h3 className="mb-2 font-bold">History</h3>
                  {versions.length === 0 ? <p className="text-sm text-gray-500">No earlier versions yet.</p> : (
                    <ul className="space-y-2">
                      {[...versions].reverse().map((v) => (
                        <li key={v.version} className="flex items-start justify-between gap-2 text-sm">
                          <span><span className="font-semibold">Version {v.version}</span> · {relTime(v.savedAt)} by {v.savedBy}<span className="block truncate text-xs text-gray-500">{v.body.split('\n').find((l) => l.trim())}</span></span>
                          {!readOnly && <Button size="xs" onClick={() => setDraft({ ...draft, name: v.name, subject: v.subject, body: v.body })}>Restore</Button>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-gray-500">Restoring fills the editor. Press Save to keep it as a new version.</p>
                </div>
              )}
            </div>
            <div>
              <Field label="Preview with" htmlFor="me-cust">
                <Select id="me-cust" value={customerId || customers[0]?.id || ''} onChange={(e) => setCustomerId(e.target.value)}>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                {draft.channel === 'EMAIL' ? (
                  <>
                    <div className="border-b border-gray-100 pb-2 text-sm font-bold dark:border-gray-700">{fillVariables(draft.subject ?? '', previewValues) || 'No subject'}</div>
                    <div className="whitespace-pre-wrap pt-3 text-sm text-gray-800 dark:text-gray-100">{fillVariables(draft.body, previewValues)}</div>
                  </>
                ) : (
                  <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary-600 px-3 py-2 text-sm text-white">
                    {fillVariables(draft.body, previewValues)}<span className="opacity-60">{optOutLine(orgName)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Drawer>
      <Modal open={!!approval} onOpenChange={(o) => { if (!o) { setApproval(undefined); setTicked(false); toast.info('Saved. Waiting for approval', 'Deployed automations keep sending the old version until someone approves.'); onClose(); } }}
        title="Approve this change?"
        footer={<>
          <Button onClick={() => { setApproval(undefined); setTicked(false); toast.info('Saved. Waiting for approval', 'Deployed automations keep sending the old version until someone approves.'); onClose(); }}>Later</Button>
          <Button variant="primary" disabled={!ticked || !deploy} onClick={() => {
            const r = deployAutomations(approval!.ids, true);
            if (!r.ok) return toast.error('Not approved', r.error);
            toast.success('Change approved', 'The deployed automations send the new version from now on.');
            setApproval(undefined); setTicked(false); onClose();
          }}>Approve</Button>
        </>}>
        <p className="text-sm">This message is used in {approval?.ids.length} deployed {approval?.ids.length === 1 ? 'automation' : 'automations'}. Your change needs approval before {approval?.ids.length === 1 ? 'it uses' : 'they use'} it.</p>
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-600">{approval?.ids.map((id) => <li key={id}>{getAutomationState().automations.find((a) => a.id === id)?.name}</li>)}</ul>
        <div className="mt-3"><Checkbox checked={ticked} onCheckedChange={setTicked} label={<span className="font-semibold">I approve these steps running automatically</span>} /></div>
        {!deploy && <Banner tone="warn" className="mt-3">Only people who can deploy automations can approve this. It stays waiting until they do.</Banner>}
      </Modal>
    </>
  );
}

