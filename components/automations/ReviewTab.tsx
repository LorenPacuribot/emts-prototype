'use client';

/*
  Waiting for review (spec 6.8): only steps marked "Ask me first". A row
  opens a full preview filled with real data, with Approve, Change and
  approve (edits this one item only) and Skip (with a reason, and whether
  the journey continues or stops). Rows older than 24 hours turn amber.
*/
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { ReviewItem } from '@/lib/automations/types';
import { MODULE_LABEL } from '@/lib/automations/registry';
import { recordHref } from '@/lib/automations/records';
import { laterStepsDepend } from '@/lib/automations/engine';
import { approveReviewItem, skipReviewItem, useAuto } from '@/lib/automations/store';
import { useDb as useFeatureDb } from '@/features/lib/store';
import { AppLink } from '@/features/lib/navigation';
import { toast } from '@/features/lib/toast';
import { Badge, Banner, Button, Field, Input, Modal, Select, Textarea } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { usePerms } from './hooks';
import { CARD, EmptyNote, ago } from './shared';

const KIND: Record<ReviewItem['kind'], string> = { CUSTOMER_EMAIL: 'Email to customer', CUSTOMER_SMS: 'Text to customer', SEND_ESTIMATE: 'Send estimate', SEND_INVOICE: 'Send invoice', BUSINESS_STEP: 'Business step' };
const REASONS = ['Not needed', 'Already done', 'Wrong customer', 'Other'];

export function ReviewModal({ id, onClose }: { id?: string; onClose: () => void }) {
  const item = useAuto((s) => s.reviews.find((r) => r.id === id));
  const run = useAuto((s) => s.runs.find((r) => r.id === item?.runId));
  const { review } = usePerms();
  const [mode, setMode] = useState<'view' | 'change' | 'skip'>('view');
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [reason, setReason] = useState('');
  if (!item) return null;
  const p = item.preview as { summary?: string; to?: string; customerName?: string; subject?: string; body?: string; record?: string; automation?: string };
  const step = run?.definition.find((d) => d.id === item.stepId);
  const isBooking = step?.type === 'BOOK_SCHEDULE';
  const isMessage = typeof p.body === 'string';
  const stops = run ? laterStepsDepend(run, item.stepId) : false;
  const close = () => { setMode('view'); setEdits({}); setReason(''); onClose(); };
  const approve = (withEdits?: Record<string, unknown>) => {
    const r = approveReviewItem(item.id, withEdits);
    if (!r.ok) return toast.error('Not approved', r.error);
    toast.success('Approved', 'The step runs now.');
    close();
  };
  const skip = () => {
    const r = skipReviewItem(item.id, reason);
    if (!r.ok) return toast.error('Not skipped', r.error);
    toast.success('Skipped', stops ? 'The journey stopped for this record.' : 'The journey carries on.');
    close();
  };
  return (
    <Modal open onOpenChange={(o) => !o && close()} size="lg" title={item.title} description={`${p.automation ?? ''} · ${p.record ?? ''}`}
      footer={item.status !== 'WAITING' ? <Button onClick={close}>Close</Button> : !review ? <><span className="mr-auto text-xs text-gray-500">Only reviewers can decide.</span><Button onClick={close}>Close</Button></> : mode === 'skip' ? <>
        <Button onClick={() => setMode('view')}>Back</Button><Button variant="danger-solid" disabled={!reason} onClick={skip}>Skip</Button>
      </> : mode === 'change' ? <>
        <Button onClick={() => setMode('view')}>Back</Button><Button variant="primary" onClick={() => approve(edits)}>Approve with changes</Button>
      </> : <>
        <Button variant="danger" onClick={() => setMode('skip')}>Skip</Button>
        {(isMessage || isBooking) && <Button onClick={() => setMode('change')}>Change and approve</Button>}
        <Button variant="primary" onClick={() => approve()}>Approve</Button>
      </>}>
      {item.status !== 'WAITING' && <Banner tone="info" className="mb-3">{item.status === 'APPROVED' ? 'Already approved.' : `Skipped: ${item.skipReason}`}</Banner>}
      {mode === 'view' && (
        isMessage ? (
          <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
            <div className="text-xs text-gray-500">To {p.customerName} ({p.to ?? 'no address'})</div>
            {p.subject && <div className="mt-1 font-bold">{p.subject}</div>}
            <div className="mt-2 whitespace-pre-wrap text-sm">{p.body}</div>
          </div>
        ) : <p className="text-sm">{p.summary}</p>
      )}
      {mode === 'change' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">This changes this one item only. The automation stays the same.</p>
          {isBooking ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start date" htmlFor="rv-start"><Input id="rv-start" type="date" onChange={(e) => setEdits((x) => ({ ...x, startDate: e.target.value }))} /></Field>
              <Field label="End date" htmlFor="rv-end"><Input id="rv-end" type="date" onChange={(e) => setEdits((x) => ({ ...x, endDate: e.target.value }))} /></Field>
            </div>
          ) : (
            <Field label="Message" htmlFor="rv-body"><Textarea id="rv-body" rows={10} defaultValue={p.body} onChange={(e) => setEdits({ overrideBody: e.target.value })} /></Field>
          )}
        </div>
      )}
      {mode === 'skip' && (
        <div className="space-y-3">
          <Field label="Why skip it?" htmlFor="rv-reason" required>
            <Select id="rv-reason" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Choose…</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</Select>
          </Field>
          <Banner tone={stops ? 'warn' : 'info'}>{stops ? 'Later steps depend on this one, so the journey stops for this record.' : 'The journey carries on with the next step.'}</Banner>
        </div>
      )}
    </Modal>
  );
}

export function ReviewTab({ initialItem }: { initialItem?: string }) {
  const reviews = useAuto((s) => s.reviews);
  const automations = useAuto((s) => s.automations);
  const users = useFeatureDb((d) => d.users);
  const customers = useFeatureDb((d) => d.customers);
  const { user } = usePerms();
  const [open, setOpen] = useState<string | undefined>(initialItem);
  const [mine, setMine] = useState(false);
  const [kind, setKind] = useState('');
  const [age, setAge] = useState('');
  const now = Date.now();
  const rows = reviews.filter((r) => r.status === 'WAITING' && (!mine || r.automationCreatedBy === user.id) && (!kind || r.kind === kind)
    && (!age || (age === 'old' ? now - Date.parse(r.createdAt) > 86_400_000 : now - Date.parse(r.createdAt) <= 86_400_000)));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Created by me</label>
        <Select aria-label="Kind" className="w-48" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All kinds</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select aria-label="Age" className="w-48" value={age} onChange={(e) => setAge(e.target.value)}><option value="">Any age</option><option value="new">Under 24 hours</option><option value="old">Over 24 hours</option></Select>
      </div>
      {rows.length === 0 ? <EmptyNote><CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-gray-300" />Nothing is waiting for review. Steps marked "Ask me first" show here.</EmptyNote> : (
        <ul className={cn(CARD, 'divide-y divide-gray-100 dark:divide-gray-700')}>
          {rows.map((r) => {
            const old = now - Date.parse(r.createdAt) > 86_400_000;
            return (
              <li key={r.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', old && 'bg-amber-50 dark:bg-amber-900/20')}>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(r.id)}>
                  <div className="flex flex-wrap items-center gap-2 font-semibold text-gray-900 dark:text-white">{r.title}<Badge tone="gray">{KIND[r.kind]}</Badge></div>
                  <div className="text-xs text-gray-500">{customers.find((c) => c.id === r.customerId)?.name ?? '—'} · {automations.find((a) => a.id === r.automationId)?.name} · by {users.find((u) => u.id === r.automationCreatedBy)?.name ?? '—'} · {MODULE_LABEL[r.recordType]}</div>
                </button>
                <AppLink href={recordHref(r.recordType, r.recordId)} className="text-sm font-semibold text-primary-700 hover:underline">{r.recordId}</AppLink>
                <span className={cn('text-xs', old ? 'font-semibold text-amber-800' : 'text-gray-500')}>Waiting {ago(r.createdAt)}</span>
                <Button size="sm" onClick={() => setOpen(r.id)}>Review</Button>
              </li>
            );
          })}
        </ul>
      )}
      <ReviewModal id={open} onClose={() => setOpen(undefined)} />
    </div>
  );
}
