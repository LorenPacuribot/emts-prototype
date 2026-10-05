'use client';

/*
  Builder toolbar (live: details/components/project-toolbar.tsx).
  Left: editable project name, then one row of chips (EST number, status,
  lead, the feature chips and the save state).
  Right: one action row, in the live order: secondary buttons, then the one
  primary action, then the ⋮ menu. At most three buttons show (Draft keeps
  its four, as in the live app); extra secondary actions move to the top of
  the ⋮ menu with the same handler and label.
  NEW (features 24, 3): the page passes feature slots (f): Amend Estimate and
  + Create Change Order (useApprovedEstimateActions, rule D4), the feature
  chips and the customer page link. A blocked Amend is a line under the chips
  and a disabled ⋮ item, not a disabled button.
*/
import React, { useLayoutEffect, useRef } from 'react';
import Link from 'next/link';
import { Briefcase, CheckCircle2, Copy, Edit2, ExternalLink, Eye, FilePlus2, Hash, History, Lock, MoreVertical, PencilLine, Printer, Save, Send, Trash2, Users, XCircle } from 'lucide-react';
import type { Estimate, Lead } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { DropdownMenu, type MenuItem } from '@/components/ui/menu';
import { EstimateStatusBadge } from './StatusBadge';
import { isOpen } from './estimate-utils';
import type { ApprovedEstimateActionState } from './FeatureSections';

export interface ToolbarActions {
  onTitle: (v: string) => void;
  onSave: () => void;
  onEdit: () => void;
  onSend: () => void;
  onApprove: () => void;
  onDecline: () => void;
  onConvert: () => void;
  onPreview: () => void;
  onPrint: () => void;
  onClientView: () => void;
  onHistory: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** NEW feature slots (see FeatureSections.tsx): Amend / Change Order state, chips and menu items. */
export interface ToolbarFeatures {
  /** Amend Estimate and + Create Change Order for an approved estimate. */
  approved?: ApprovedEstimateActionState;
  chips?: React.ReactNode;
  menu?: MenuItem[];
  /** e.g. 'Send for Re-approval' while an amendment is open. */
  sendLabel?: string;
  /** An open amendment is re-sent, not marked approved. */
  hideApprove?: boolean;
  /** An amendment is being edited: only Save and Send for Re-approval show. */
  amending?: boolean;
  /** Set = Send is disabled and this explains why and how to fix it (e.g. the customer has no email). */
  sendDisabledReason?: string;
}

/** Shared chip shape (EST number, status, lead, Color Card, amendment, delivery). */
export const TOOLBAR_CHIP = 'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-bold';

/** amendBlockedReason in plain words for the line under the chips (the rule's text is unchanged). */
function plainAmendReason(reason: string) {
  return reason.startsWith('Work has started') ? 'Work has started, so the signed scope is locked. Use a change order for any changes.' : reason;
}

type Action = { key: string; label: string; icon: React.ReactNode; onClick: () => void; title?: string; tour?: string; rank: number };

export function EstimateToolbar({
  estimate: e, lead, readOnly, canEdit, dirty, saving = false, lastSavedAt, a, f = {},
}: { estimate: Estimate; lead?: Lead; readOnly: boolean; canEdit: boolean; dirty: boolean; saving?: boolean; lastSavedAt?: Date; a: ToolbarActions; f?: ToolbarFeatures }) {
  const ap = f.approved;
  const amendBlocked = !!(ap?.showAmend && ap.amendBlock);
  const draft = e.status === 'Draft' && !f.amending;

  // Secondary actions in their natural order. Rank decides which stay visible
  // (lowest first) when there are more than two; the rest go to the ⋮ menu.
  const secondary: Action[] = [
    ...(readOnly && canEdit ? [{ key: 'edit', label: 'Edit', icon: <Edit2 className="h-4 w-4" />, onClick: a.onEdit, rank: 4 }] : []),
    ...(!readOnly ? [{ key: 'save', label: 'Save', icon: <Save className="h-5 w-5" />, onClick: a.onSave, rank: draft || f.amending ? 0 : 4 }] : []),
    { key: 'preview', label: 'Client Preview', icon: <Eye className="h-5 w-5" />, onClick: a.onPreview, title: 'Generate the customer presentation from this estimate', rank: f.amending ? 9 : 1 },
    ...(isOpen(e.status) && !f.hideApprove ? [{ key: 'approve', label: 'Mark Approved', icon: <CheckCircle2 className="h-5 w-5" />, onClick: a.onApprove, title: 'Mark as approved without sending to the client', rank: 2 }] : []),
    ...(ap?.showAmend && !ap.amendBlock ? [{ key: 'amend', label: 'Amend Estimate', icon: <PencilLine className="h-4 w-4" />, onClick: ap.openAmend, title: 'Open this accepted estimate for editing', tour: 'amend-button', rank: 2 }] : []),
    ...(ap?.showCo ? [{ key: 'co', label: 'Create Change Order', icon: <FilePlus2 className="h-4 w-4" />, onClick: ap.onCreateChangeOrder, tour: 'create-change-order', rank: 3 }] : []),
  ];
  const limit = draft ? secondary.length : f.amending ? 1 : 2;
  const keep = new Set([...secondary].sort((x, y) => x.rank - y.rank).slice(0, limit).map((s) => s.key));
  const visible = secondary.filter((s) => keep.has(s.key));
  const overflow = secondary.filter((s) => !keep.has(s.key)).sort((x, y) => x.rank - y.rank);

  const menu: MenuItem[] = [
    ...overflow.map((s) => ({ label: s.label, icon: s.icon, onClick: s.onClick })),
    ...(amendBlocked ? [{ label: 'Amend Estimate', icon: <PencilLine />, onClick: () => undefined, disabled: true, hint: plainAmendReason(ap!.amendBlock!) }] : []),
    { label: 'Download PDF', icon: <Printer />, onClick: a.onPrint, separatorBefore: overflow.length > 0 || amendBlocked },
    { label: 'Open Customer View', icon: <ExternalLink />, onClick: a.onClientView },
    { label: 'History', icon: <History />, onClick: a.onHistory },
    ...(f.menu ?? []),
    { label: 'Duplicate', icon: <Copy />, onClick: a.onDuplicate },
    ...(isOpen(e.status) ? [{ label: 'Mark Declined', icon: <XCircle />, onClick: a.onDecline, separatorBefore: true }] : []),
    { label: 'Delete', icon: <Trash2 />, danger: true, disabled: !!e.jobId, onClick: a.onDelete, separatorBefore: !isOpen(e.status) },
  ];

  return (
    <div className="mb-6 flex flex-col gap-4 md:mb-8 xl:flex-row xl:items-start xl:justify-between print:hidden" data-tour="estimate-toolbar">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="group">
          <label htmlFor="project-name" className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
            Project Name
            {!readOnly && <span className="text-xs font-medium normal-case tracking-normal text-gray-300 opacity-50 group-hover:opacity-100 md:text-xs">(Click to edit)</span>}
          </label>
          <div className="relative w-full">
            <TitleField value={e.title} readOnly={readOnly} onChange={a.onTitle} />
            {!readOnly && <Edit2 className="pointer-events-none absolute right-0 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-300 opacity-0 group-hover:opacity-100" />}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
          <span className={`${TOOLBAR_CHIP} border-gray-200 bg-white font-mono text-gray-600 shadow-sm`}>
            <Hash className="h-3.5 w-3.5 text-gray-500" />
            {e.estimateNumber}
          </span>
          {f.amending ? (
            // While an amendment is open the estimate is a draft again; say what is going on.
            <span className={`${TOOLBAR_CHIP} border-amber-200 bg-amber-50 text-amber-700`}>
              <PencilLine className="h-3.5 w-3.5" /> Editing Amendment
            </span>
          ) : (
            <EstimateStatusBadge status={e.status} size="md" className="h-8 shrink-0 whitespace-nowrap py-0" />
          )}
          {lead && (
            <Link href={`/leads/${lead.id}`} className={`${TOOLBAR_CHIP} border-blue-100 bg-blue-50 uppercase tracking-wide text-blue-700 hover:bg-blue-100`} title="View Lead">
              <Users className="h-3.5 w-3.5" />
              {lead.leadNumber}
            </Link>
          )}
          {f.chips}
          {saving ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-amber-600" aria-live="polite">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
              Saving…
            </span>
          ) : dirty ? (
            <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-amber-600">Unsaved changes</span>
          ) : lastSavedAt ? (
            <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-gray-500" aria-live="polite">
              Saved {lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
          ) : null}
        </div>
        {amendBlocked && (
          <p data-tour="amend-button" className="flex items-center gap-2 text-sm text-gray-600">
            <Lock className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
            {plainAmendReason(ap!.amendBlock!)}
          </p>
        )}
        {f.amending && <p className="text-sm text-gray-600">The customer isn&apos;t notified until you send for re-approval.</p>}
      </div>

      {/* Secondary buttons, then the one primary, then ⋮ (the live order). */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 xl:mt-7">
        {visible.map((s) => (
          <Button key={s.key} variant="secondary" onClick={s.onClick} icon={s.icon} title={s.title} data-tour={s.tour}>
            {s.label}
          </Button>
        ))}
        {isOpen(e.status) && (
          <span title={f.sendDisabledReason} className="inline-flex">
            <Button
              onClick={a.onSend}
              icon={<Send className="h-5 w-5" />}
              data-tour="send-estimate"
              disabled={!!f.sendDisabledReason}
              aria-describedby={f.sendDisabledReason ? 'toolbar-send-disabled-reason' : undefined}
            >
              {f.sendLabel ?? (e.status === 'Draft' ? 'Send' : 'Resend')}
            </Button>
            {f.sendDisabledReason && <span id="toolbar-send-disabled-reason" className="sr-only">{f.sendDisabledReason}</span>}
          </span>
        )}
        {e.status === 'Approved' &&
          (e.jobId ? (
            <Link href={`/jobs/${e.jobId}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary-600 bg-primary-600 px-4 text-sm font-semibold text-white shadow-md hover:bg-primary-700">
              <Briefcase className="h-5 w-5" /> View Job
            </Link>
          ) : (
            <Button onClick={a.onConvert} icon={<Briefcase className="h-5 w-5" />}>Convert to Job</Button>
          ))}
        <DropdownMenu
          items={menu}
          trigger={
            <button type="button" aria-label="More actions" data-tour="estimate-menu" className="rounded-lg border border-gray-200 bg-white p-2.5 text-gray-600 shadow-sm hover:bg-gray-50">
              <MoreVertical className="h-5 w-5" />
            </button>
          }
        />
      </div>
      {ap?.confirmDialog}
    </div>
  );
}

/**
 * Project name (H2, V3). A one-line textarea that grows with its text; Enter
 * finishes editing like the old input. On desktop (xl) it stays on one line,
 * and the actions move under the title below xl instead of squeezing it.
 */
function TitleField({ value, readOnly, onChange }: { value: string; readOnly?: boolean; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      id="project-name"
      rows={1}
      value={value}
      disabled={readOnly}
      title={value}
      onChange={(ev) => onChange(ev.target.value.replace(/\n/g, ' '))}
      onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ev.currentTarget.blur(); } }}
      placeholder="Enter Project Name"
      className="block w-full resize-none overflow-hidden border-b-2 border-transparent bg-transparent px-0 py-1 pr-7 font-heading text-2xl font-extrabold leading-tight text-balance text-gray-900 outline-none transition-all placeholder:text-gray-300 hover:border-gray-300 focus:border-primary-400 disabled:cursor-default disabled:hover:border-transparent md:text-3xl lg:text-4xl xl:whitespace-nowrap"
    />
  );
}
