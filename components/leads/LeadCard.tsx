'use client';

/*
  One lead on the pipeline board. Clicking the card opens the lead.
  It can be dragged to another column. On hover it shows the archive and
  "move to next stage" buttons (live: features/(main)/leads/listings/components/lead-card.tsx).
*/
import React from 'react';
import Link from 'next/link';
import { AlertTriangle, Archive, ArrowRight, Calendar, FileText, GripVertical, Mail, MapPin, Phone } from 'lucide-react';
import type { Estimate, Lead, TeamMember } from '@/lib/types';
import { cn, longDate } from '@/lib/utils';
import { LEAD_LIFECYCLE, NEXT_STAGE_MAP, canArchiveLeadStatus, formatPhone, time12, timeAgo } from './leadHelpers';
import { FollowUpLockNote, LeadSourceChip } from './leadFeatures';

export function LeadCard({
  lead, estimate, estimator, draggable = true, dragging, followUpId, onDragStart, onArchive, onAdvance,
}: {
  lead: Lead;
  estimate?: Estimate;
  estimator?: TeamMember;
  draggable?: boolean;
  dragging?: boolean;
  /** NEW (29): the open repaint follow-up that sets this lead's stage (no drag, no move buttons). */
  followUpId?: string;
  onDragStart?: (e: React.DragEvent, id: string) => void;
  onArchive?: (lead: Lead) => void;
  onAdvance?: (lead: Lead) => void;
}) {
  const lifecycle = LEAD_LIFECYCLE[lead.status];
  const next = followUpId ? null : NEXT_STAGE_MAP[lead.status];
  const chip = 'inline-flex items-center rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600';

  return (
    <div
      draggable={draggable && !followUpId}
      onDragStart={(e) => onDragStart?.(e, lead.id)}
      className={cn(
        'group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:border-primary-300 hover:shadow-md active:cursor-grabbing',
        dragging && 'opacity-50',
      )}
    >
      {/* Whole card is a link; buttons sit above it with z-20. */}
      <Link href={`/leads/${lead.id}`} className="absolute inset-0 z-10 rounded-xl" aria-label={`Open ${lead.firstName} ${lead.lastName}`} />

      <div className="absolute right-4 top-4 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100">
        <GripVertical className="h-4 w-4" />
      </div>

      <div className="mb-3">
        <div className="mb-1 truncate pr-5 font-heading text-sm font-bold leading-tight text-gray-900">
          {lead.firstName} {lead.lastName}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="flex min-w-0 items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.city}, {lead.state}</span>
          </span>
          <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide', lifecycle.color)}>{lifecycle.label}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="whitespace-nowrap text-[9px] font-bold text-gray-700">{lead.leadNumber}</span>
          {estimate && (
            <Link
              href={`/estimates/${estimate.id}`}
              onClick={(e) => e.stopPropagation()}
              title="View Estimate"
              className="relative z-20 inline-flex items-center whitespace-nowrap rounded border border-primary-100 bg-primary-50 px-2 py-0.5 text-[9px] font-medium text-primary-700 hover:bg-primary-100"
            >
              <FileText className="mr-1 h-3 w-3" />
              {estimate.estimateNumber}
            </Link>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <span className={chip}><Calendar className="mr-1 h-3 w-3 text-gray-400" />{longDate(lead.date)}</span>
        <LeadSourceChip lead={lead} className="text-[9px]" fallback={<span className={chip}>{lead.leadSource}</span>} />
        <span className={chip}>{timeAgo(lead.date)}</span>
      </div>

      {lead.appointment ? (
        <Link
          href="/calendar"
          onClick={(e) => e.stopPropagation()}
          title="View on Calendar"
          className="relative z-20 mb-4 inline-flex items-center gap-1.5 rounded-md border border-primary-100 bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
        >
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          {longDate(lead.appointment.date).replace(/, \d{4}$/, '')}, {time12(lead.appointment.time)}
          {estimator && ` with ${estimator.firstName} ${estimator.lastName}`}
        </Link>
      ) : lead.status === 'Scheduled' ? (
        <div
          title="Won't appear on the Calendar until scheduled with an estimator."
          className="relative z-20 mb-4 inline-flex cursor-help items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-800"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> No estimator assigned
        </div>
      ) : null}

      {followUpId && <FollowUpLockNote fu={{ id: followUpId }} compact className="mb-3" />}

      <div className="relative z-20 flex items-center justify-between border-t border-gray-100 pt-3">
        <div className="flex gap-1">
          <a
            href={lead.phone ? `tel:${lead.phone}` : undefined}
            title={formatPhone(lead.phone)}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
          >
            <Phone className="h-4 w-4" />
          </a>
          <a
            href={lead.email ? `mailto:${lead.email}` : undefined}
            title={lead.email}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
          >
            <Mail className="h-4 w-4" />
          </a>
        </div>
        <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {canArchiveLeadStatus(lead.status) && !followUpId && (
            <button
              type="button"
              title="Archive Lead"
              onClick={(e) => { e.stopPropagation(); onArchive?.(lead); }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <Archive className="h-4 w-4" />
            </button>
          )}
          {next && (
            <button
              type="button"
              title={`Move to ${next}`}
              onClick={(e) => { e.stopPropagation(); onAdvance?.(lead); }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
