'use client';

/*
  Settings > Automated Messages. Left: list of email templates. Right: editor
  for the selected template (subject, body shown between the shared email
  header and footer, available variables, active switch). Below: the
  "Email Header & Footer" layout used by every outbound email.

  Templates live in the `automatedMessages` collection. The header and footer
  are stored on the `businessProfile` singleton (emailHeader / emailFooter).
  Clicking a variable chip inserts it where the cursor was last placed.

  30 Sep call, Complete version:
  - JS-C3: Mode (Automatic or Manual) per template.
  - CRM-C3: tie a template to a trigger (Estimate accepted, Estimate declined,
    Estimate no-show, Job complete). It shows "Ask me first" until an Owner or
    Admin approves it; then its messages send without asking. Any edit to the
    template removes the approval. Messages that wait appear in Marketing ›
    Automations › Waiting for approval.
*/
import React, { useRef, useState } from 'react';
import { Code2, Mail, RotateCcw, Save } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Field, Input, Label, Switch, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useCollection, useCurrentUser, useSingleton } from '@/lib/store';
import type { AutomationTrigger } from '@/lib/types';
import { approvalLabel, canApproveAutomation, TRIGGER_LABEL } from '@/lib/automation';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { NativeSelect } from '@/components/ui/form';
import { fullName } from '@/lib/utils';
import { formatPhone, TemplateListItem, VariablesBox } from './ui';
import { cn } from '@/lib/utils';
import { NewBadge, VersionBadge, FeatureGate } from '@/features/components/ui';
import { useIsOn } from '@/features/lib/feature-visibility';

/** Inserts text at the cursor of an input/textarea and returns the new value. */
export function insertAt(el: HTMLInputElement | HTMLTextAreaElement | null, value: string, text: string) {
  if (!el) return value + text;
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const next = value.slice(0, start) + text + value.slice(end);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + text.length, start + text.length);
  });
  return next;
}

export function AutomatedMessagesView() {
  const { items: all, update } = useCollection('automatedMessages');
  // The crew schedule email (JS-M4) shows while Job scheduling emails is on (New Features).
  const jsOn = useIsOn({ item: 'JS-M4' });
  const items = all.filter((t) => t.id !== 'am_crew_schedule' || jsOn);
  const { toast } = useToast();
  const [activeState, setActiveId] = useState(items[0]?.id ?? '');
  const activeId = items.some((t) => t.id === activeState) ? activeState : items[0]?.id ?? '';
  const active = items.find((t) => t.id === activeId);
  const [subject, setSubject] = useState(active?.subject ?? '');
  const [body, setBody] = useState(active?.body ?? '');
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocus = useRef<'subject' | 'body'>('body');
  const [bp] = useSingleton('businessProfile');
  const me = useCurrentUser();
  const [approving, setApproving] = useState(false);

  /** CRM-C3: any edit to a rule removes its approval. */
  const edit = (patch: Parameters<typeof update>[1], what: string) => {
    if (!active) return;
    update(active.id, { ...patch, approval: undefined });
    toast(active.approval ? `${what} Approval removed: messages will ask first again.` : what);
  };

  const select = (id: string) => {
    const t = items.find((x) => x.id === id);
    setActiveId(id);
    setSubject(t?.subject ?? '');
    setBody(t?.body ?? '');
  };

  const dirty = !!active && (subject !== (active.subject ?? '') || body !== active.body);

  const save = () => {
    if (!active) return;
    if (!subject.trim()) return toast('Email subject is required', 'error');
    if (!body.trim()) return toast('Message body is required', 'error');
    edit({ subject, body }, 'Email template updated successfully.');
  };

  const insert = (v: string) => {
    if (lastFocus.current === 'subject') setSubject((s) => insertAt(subjectRef.current, s, v));
    else setBody((b) => insertAt(bodyRef.current, b, v));
  };

  return (
    <SettingsPage wide title="Automated Messages" subtitle="Customize the default email and SMS templates sent to clients.">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-4 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-2">
          {items.length === 0 && <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">No email templates.</p>}
          {items.map((t) => (
            <TemplateListItem key={t.id} active={t.id === activeId} icon={<Mail />} title={t.name} subtitle={t.subject ?? ''} onClick={() => select(t.id)} badge={t.id === 'am_crew_schedule' ? <VersionBadge item="JS-M4" /> : undefined} />
          ))}
        </div>

        <div className="lg:col-span-8">
          {active ? (
            <div className="flex h-full flex-col rounded-2xl bg-white p-6 shadow-lg md:p-7">
              <div className="mb-6 flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
                <h3 className="font-heading text-lg font-bold text-gray-900">{active.name}</h3>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <FeatureGate item="JS-C3">
                    {/* JS-C3: Automatic sends when the trigger happens; Manual waits for someone to send it. */}
                    <span className="flex items-center gap-2 text-xs font-medium text-gray-500">
                      Mode
                      <span className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5" role="radiogroup" aria-label="Sending mode">
                        {(['automatic', 'manual'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={(active.mode ?? 'automatic') === m}
                            onClick={() => edit({ mode: m }, `${active.name}: ${m === 'automatic' ? 'sends automatically.' : 'waits for someone to send it.'}`)}
                            className={cn('rounded-md px-2.5 py-1 text-xs font-bold capitalize', (active.mode ?? 'automatic') === m ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-900')}
                          >
                            {m}
                          </button>
                        ))}
                      </span>
                      <VersionBadge item="JS-C3" />
                    </span>
                  </FeatureGate>
                  <span className="flex items-center gap-2 text-xs font-medium text-gray-500">
                    {active.isActive ? 'Active' : 'Paused'}
                    <Switch
                      checked={active.isActive}
                      onChange={(v) => {
                        update(active.id, { isActive: v });
                        toast(`${active.name} ${v ? 'enabled' : 'paused'}`);
                      }}
                      label="Template active"
                    />
                  </span>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xxs font-bold uppercase tracking-wider text-gray-500">Template</span>
                </div>
              </div>
              <FeatureGate item="CRM-C3">
                {/* CRM-C3: trigger and approval */}
                <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                    Trigger
                    <NativeSelect
                      value={active.ruleTrigger ?? ''}
                      onChange={(e) => edit({ ruleTrigger: (e.target.value || undefined) as AutomationTrigger | undefined }, 'Trigger updated.')}
                      className="h-9 w-48 normal-case"
                    >
                      <option value="">None</option>
                      {(Object.keys(TRIGGER_LABEL) as AutomationTrigger[]).map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
                    </NativeSelect>
                  </label>
                  {active.ruleTrigger && (
                    <>
                      <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold', active.approval ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-800')}>
                        {approvalLabel(active.approval)}
                      </span>
                      {!active.approval && canApproveAutomation(me.role) && (
                        <Button size="sm" onClick={() => setApproving(true)}>Approve automation</Button>
                      )}
                    </>
                  )}
                  <span className="ml-auto flex items-center gap-1.5"><VersionBadge item="CRM-C3" /></span>
                </div>
              </FeatureGate>
              <div className="flex-1 space-y-6">
                <Field label="Email Subject">
                  <Input ref={subjectRef} value={subject} onFocus={() => (lastFocus.current = 'subject')} onChange={(e) => setSubject(e.target.value)} onClear={() => setSubject('')} />
                </Field>
                <div>
                  <Label>Message Body</Label>
                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    {bp.emailHeader && <div className="select-none whitespace-pre-wrap border-b border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm font-bold text-gray-500">{bp.emailHeader}</div>}
                    <textarea
                      ref={bodyRef}
                      value={body}
                      placeholder="Enter message body..."
                      onFocus={() => (lastFocus.current = 'body')}
                      onChange={(e) => setBody(e.target.value)}
                      className="block min-h-[220px] w-full resize-y border-0 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-0"
                    />
                    {bp.emailFooter && <div className="select-none whitespace-pre-wrap border-t border-gray-200 bg-gray-50 px-5 py-4 text-xs text-gray-500">{bp.emailFooter}</div>}
                  </div>
                </div>
                <VariablesBox
                  variables={active.availableVariables ?? []}
                  onInsert={insert}
                  hint="Copy and paste these codes into your subject or body. They will be automatically replaced with actual data when sending."
                />
              </div>
              <div className="mt-6 flex justify-end border-t border-gray-100 pt-4">
                <Button onClick={save} disabled={!dirty} icon={<Save className="h-4 w-4" />}>Save Changes</Button>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[300px] items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-500">Select a template to edit</div>
          )}
        </div>
      </div>

      <EmailLayoutSection />
      {active && (
        <ConfirmDialog
          open={approving}
          onOpenChange={setApproving}
          title="Approve automation"
          confirmLabel="Approve"
          variant="primary"
          message={
            <div className="space-y-3 text-sm">
              <p><b>When:</b> {active.ruleTrigger ? TRIGGER_LABEL[active.ruleTrigger] : '—'}</p>
              <p><b>Message:</b> {active.subject}</p>
              <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-gray-600">{active.body}</p>
              <p>Messages from this rule will send without asking. Approve?</p>
            </div>
          }
          onConfirm={() => {
            update(active.id, { approval: { byId: me.id, by: fullName(me), at: new Date().toISOString() } });
            toast(`${active.name} approved. Its messages send without asking.`);
          }}
        />
      )}
    </SettingsPage>
  );
}

/** Email Header & Footer editor. "HTML Editor" switches the box to a monospace source view. */
function EmailLayoutSection() {
  const [bp, setBp] = useSingleton('businessProfile');
  const { toast } = useToast();
  const defaults = {
    header: bp.companyName,
    footer: `Best regards,\n${bp.companyName}\n${formatPhone(bp.phone)} | ${bp.email}\n${bp.street}, ${bp.city}, ${bp.state}, ${bp.zip}`,
  };
  const [header, setHeader] = useState(bp.emailHeader ?? defaults.header);
  const [footer, setFooter] = useState(bp.emailFooter ?? defaults.footer);
  const [html, setHtml] = useState({ header: false, footer: false });

  const box = (key: 'header' | 'footer', label: string, value: string, set: (v: string) => void) => (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Label className="mb-0">{label}</Label>
        <span className="flex items-center gap-2 text-xs font-bold text-gray-600">
          <Switch checked={html[key]} onChange={(v) => setHtml((h) => ({ ...h, [key]: v }))} label={`${label} HTML editor`} />
          <Code2 className="h-3.5 w-3.5" /> HTML Editor
        </span>
      </div>
      <Textarea
        value={value}
        onChange={(e) => set(e.target.value)}
        rows={key === 'header' ? 3 : 5}
        className={html[key] ? 'bg-gray-900 font-mono text-xs text-green-300' : key === 'header' ? 'text-center font-bold' : 'text-sm'}
      />
    </div>
  );

  return (
    <div className="mt-12">
      <h3 className="font-heading text-xl font-bold text-gray-900">Email Header &amp; Footer</h3>
      <p className="mb-5 text-sm text-gray-500">Customize the header and footer that appear in all outbound emails.</p>
      <div className="space-y-6 rounded-2xl bg-white p-6 shadow-lg">
        {box('header', 'Email Header', header, setHeader)}
        {box('footer', 'Email Footer', footer, setFooter)}
        <div className="flex items-center justify-between border-t border-gray-100 pt-5">
          <Button
            variant="secondary"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={() => {
              setHeader(defaults.header);
              setFooter(defaults.footer);
              setBp({ emailHeader: defaults.header, emailFooter: defaults.footer });
              toast('Email layout reset to defaults');
            }}
          >
            Reset to Defaults
          </Button>
          <Button
            icon={<Save className="h-4 w-4" />}
            onClick={() => {
              setBp({ emailHeader: header, emailFooter: footer });
              toast('Email layout updated successfully');
            }}
          >
            Save Layout
          </Button>
        </div>
      </div>
    </div>
  );
}
