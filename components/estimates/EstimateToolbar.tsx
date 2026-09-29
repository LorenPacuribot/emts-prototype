'use client';

/*
  Builder toolbar (live: details/components/project-toolbar.tsx).
  Left: editable project name, EST number, status and lead chip.
  Right: the main actions for the current status, plus a kebab with the
  secondary ones (preview, print, client view, history, duplicate, decline,
  delete).
  NEW (features 24, 3): the page passes feature slots (f) for Amend
  Estimate with rule D4, + Create Change Order, the amendment chip and the
  customer page link.
*/
import type React from 'react';
import Link from 'next/link';
import { Briefcase, CheckCircle2, Copy, Edit2, ExternalLink, Eye, Hash, History, MoreVertical, Printer, Save, Send, Trash2, Users, XCircle } from 'lucide-react';
import type { Estimate, Lead } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { DropdownMenu, type MenuItem } from '@/components/ui/menu';
import { EstimateStatusBadge } from './StatusBadge';
import { isOpen } from './estimate-utils';

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

/** NEW feature slots (see FeatureSections.tsx): extra buttons, chips and menu items. */
export interface ToolbarFeatures {
  actions?: React.ReactNode;
  chips?: React.ReactNode;
  menu?: MenuItem[];
  /** e.g. 'Send for Re-approval' while an amendment is open. */
  sendLabel?: string;
  /** An open amendment is re-sent, not marked approved. */
  hideApprove?: boolean;
  /** Set = Send is disabled and this explains why and how to fix it (e.g. the customer has no email). */
  sendDisabledReason?: string;
}

export function EstimateToolbar({
  estimate: e, lead, readOnly, canEdit, dirty, saving = false, lastSavedAt, a, f = {},
}: { estimate: Estimate; lead?: Lead; readOnly: boolean; canEdit: boolean; dirty: boolean; saving?: boolean; lastSavedAt?: Date; a: ToolbarActions; f?: ToolbarFeatures }) {
  const menu: MenuItem[] = [
    { label: 'Download PDF', icon: <Printer />, onClick: a.onPrint },
    { label: 'Open Customer View', icon: <ExternalLink />, onClick: a.onClientView },
    { label: 'History', icon: <History />, onClick: a.onHistory },
    ...(f.menu ?? []),
    { label: 'Duplicate', icon: <Copy />, onClick: a.onDuplicate },
    ...(isOpen(e.status) ? [{ label: 'Mark Declined', icon: <XCircle />, onClick: a.onDecline, separatorBefore: true }] : []),
    { label: 'Delete', icon: <Trash2 />, danger: true, disabled: !!e.jobId, onClick: a.onDelete, separatorBefore: !isOpen(e.status) },
  ];

  return (
    <div className="mb-6 flex flex-col flex-wrap items-start justify-between gap-4 md:mb-8 xl:flex-row xl:items-center xl:gap-6 print:hidden" data-tour="estimate-toolbar">
      <div className="w-full min-w-[300px] flex-1 space-y-2 xl:w-auto">
        <div className="group">
          <label htmlFor="project-name" className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
            Project Name
            {!readOnly && <span className="text-[10px] font-medium normal-case tracking-normal text-gray-300 opacity-50 group-hover:opacity-100 md:text-xs">(Click to edit)</span>}
          </label>
          <div className="relative w-full">
            <input
              id="project-name"
              type="text"
              value={e.title}
              disabled={readOnly}
              onChange={(ev) => a.onTitle(ev.target.value)}
              placeholder="Enter Project Name"
              className="w-full border-b-2 border-transparent bg-transparent px-0 py-1 font-heading text-2xl font-extrabold text-gray-900 outline-none transition-all placeholder:text-gray-300 hover:border-gray-300 focus:border-primary-400 disabled:cursor-default disabled:hover:border-transparent md:text-3xl lg:text-4xl"
            />
            {!readOnly && <Edit2 className="pointer-events-none absolute right-0 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-300 opacity-0 group-hover:opacity-100" />}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-600 shadow-sm">
            <Hash className="h-4 w-4 text-gray-400" />
            <span className="font-mono text-sm font-bold tracking-wide">{e.estimateNumber}</span>
          </div>
          <EstimateStatusBadge status={e.status} size="md" />
          {lead && (
            <Link href={`/leads/${lead.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-blue-700 hover:bg-blue-100" title="View Lead">
              <Users className="h-3.5 w-3.5" />
              {lead.leadNumber}
            </Link>
          )}
          {f.chips}
          {saving ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600" aria-live="polite">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
              Saving…
            </span>
          ) : dirty ? (
            <span className="text-xs font-semibold text-amber-600">Unsaved changes</span>
          ) : lastSavedAt ? (
            <span className="text-xs font-semibold text-gray-500" aria-live="polite">
              Saved {lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
        {readOnly && canEdit && (
          <Button variant="secondary" onClick={a.onEdit} icon={<Edit2 className="h-4 w-4" />}>Edit</Button>
        )}
        {!readOnly && (
          <Button variant="secondary" onClick={a.onSave} icon={<Save className="h-5 w-5" />}>Save</Button>
        )}
        <Button variant="secondary" onClick={a.onPreview} icon={<Eye className="h-5 w-5" />} title="Generate the customer presentation from this estimate">Client Preview</Button>
        {isOpen(e.status) && !f.hideApprove && (
          <Button onClick={a.onApprove} icon={<CheckCircle2 className="h-5 w-5" />} title="Mark as approved without sending to the client">Mark Approved</Button>
        )}
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
        {f.actions}
        <DropdownMenu
          items={menu}
          trigger={
            <button type="button" aria-label="More actions" className="rounded-lg border border-gray-200 bg-white p-2.5 text-gray-600 shadow-sm hover:bg-gray-50">
              <MoreVertical className="h-5 w-5" />
            </button>
          }
        />
      </div>
    </div>
  );
}
