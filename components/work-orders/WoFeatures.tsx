'use client';

/*
  Feature glue for the work order page (/work-orders/[id]).

  A replica work order that has a prototype twin (same id, see lib/bridge)
  runs the live status flow from the prototype: Confirm Deposit, Schedule,
  Start Job, Log Hours, Mark Complete (closeout). The replica page keeps its
  own layout and embeds the NEW prototype sections from here:
    - status actions + kebab (Create Change Order 24, Closeout 25)
    - header chips (open change orders 24, closeout progress 25)
    - Paint Color Card (3, 18), Materials + Paint Orders (18, 19)
    - Crew Clock + Time Log (22), Field Notes & attachments with
      "Use in marketing" (34)
    - Log Hours modal (22), Edit Schedule modal, closeout drawer (25)
  Every change goes through a prototype action; the bridge carries it over
  to the replica store. A work order without a twin renders none of this.
*/
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as DM from '@radix-ui/react-dropdown-menu';
import {
  BadgeDollarSign, CalendarPlus, CalendarX2, CheckCircle2, ClipboardCheck, FilePlus2, MoreVertical, Pencil, Play, Share2, Timer, Trash2,
} from 'lucide-react';
import type { Database, Job, WorkOrder } from '@/features/types';
import { act, useCurrentUser, useDb } from '@/features/lib/store';
import { byId } from '@/features/lib/selectors';
import { can } from '@/features/lib/permissions';
import { AppLink } from '@/features/lib/navigation';
import { toast } from '@/features/lib/toast';
import { estimateHref } from '@/features/lib/hrefs';
import { markUnscheduled, renderedHoursBySurface, setWorkOrderStatus, WO_STATUS_LABEL } from '@/features/lib/store/actions/work-orders';
import { jobChangeOrders } from '@/features/lib/store/actions/change-orders';
import { closeoutRowsFor } from '@/features/lib/store/actions/property';
import { sendPhotoToMarketing } from '@/features/lib/store/actions/marketing';
import { specForSurface, surfaceHours } from '@/features/lib/rules/estimate';
import { Drawer, NewBadge } from '@/features/components/ui';
import { CloseoutPanel } from '@/features/components/features/closeout/closeout-panel';
import { MaterialsSections } from '@/features/components/features/materials/materials-sections';
import { LogHoursModal } from '@/features/components/features/work-orders/details/log-hours-modal';
import { CrewClockCard, FieldNotesSection, ScheduleModal, TimeLogSection, WoPaintColorCard } from '@/features/components/features/work-orders/details/wo-sections';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WODisplayStatus } from './wo-utils';

export interface WoTwin { db: Database; wo: WorkOrder; job: Job }

/** The prototype work order (and its job) behind a replica work order id, if any. */
export function useWoTwin(id: string | undefined): WoTwin | undefined {
  const db = useDb((d) => d);
  const wo = id ? byId(db.workOrders, id) : undefined;
  const job = wo ? byId(db.jobs, wo.jobId) : undefined;
  return wo && job ? { db, wo, job } : undefined;
}

export const twinStatus = (t: WoTwin) => WO_STATUS_LABEL[t.wo.status] as WODisplayStatus;

/** Header figures, same as the live header: estimate hours, shift hours, rendered hours. */
export function twinHours({ db, wo, job }: WoTwin) {
  const total = job.surfaceIds.map((id) => byId(db.surfaces, id)).filter(Boolean)
    .reduce((a, s) => a + surfaceHours(s!, specForSurface(db, job.id, s!.id)?.coats ?? 2), 0);
  const assigned = wo.shifts.reduce((a, s) => {
    const days = Math.max(1, Math.round((Date.parse(s.endDate) - Date.parse(s.startDate)) / 86400000) + 1);
    const [h1, m1] = s.startTime.split(':').map(Number);
    const [h2, m2] = s.endTime.split(':').map(Number);
    return a + days * s.memberIds.length * (h2 + m2 / 60 - h1 - m1 / 60 - 1);
  }, 0);
  const rendered = Array.from(renderedHoursBySurface(wo).values()).reduce((a, b) => a + b, 0);
  return { total, assigned, rendered };
}

/** Does the current prototype (demo) user hold this permission? */
export function useCan(perm: Parameters<typeof can>[1]) {
  return can(useCurrentUser(), perm);
}

/** Can the current prototype user edit this work order's schedule right now? */
export function useCanSchedule(t: WoTwin | undefined) {
  const user = useCurrentUser();
  return !!t && can(user, 'workOrder.manageSchedule') && t.wo.status !== 'PENDING_DEPOSIT' && t.wo.status !== 'COMPLETED';
}

/* ---------- header chips ---------- */

export function WoTwinChips({ twin }: { twin: WoTwin }) {
  const { db, wo, job } = twin;
  const openCos = jobChangeOrders(db, job.id).filter((c) => !['approved', 'rejected', 'disputed'].includes(c.status));
  const rows = closeoutRowsFor(db, job);
  const confirmed = rows.filter((r) => r.confirmedBy).length;
  return (
    <>
      {openCos.length > 0 && (
        <AppLink href={job.estimateId ? estimateHref(job.estimateId, 'section-change-orders') : '#'}
          className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
          {openCos.length} open change order{openCos.length === 1 ? '' : 's'} <NewBadge feature={24} />
        </AppLink>
      )}
      {wo.status === 'IN_PROGRESS' && (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
          Closeout {confirmed}/{rows.length} surfaces confirmed <NewBadge feature={25} />
        </span>
      )}
    </>
  );
}

/* ---------- status actions + kebab ---------- */

export function WoTwinActions({ twin, onLogHours, onSchedule, onMarkComplete, onEdit }: {
  twin: WoTwin; onLogHours: () => void; onSchedule: () => void; onMarkComplete: () => void; onEdit: () => void;
}) {
  const { wo, job, db } = twin;
  const user = useCurrentUser();
  const router = useRouter();
  const canStatus = can(user, 'workOrder.updateStatus');
  const canSchedule = can(user, 'workOrder.manageSchedule');
  const estimate = job.estimateId ? byId(db.estimates, job.estimateId) : undefined;
  const big = 'h-11 px-5 font-black';

  const status = (to: WorkOrder['status']) => {
    if (act(setWorkOrderStatus, wo.id, to).ok) toast.success(`Status changed to ${WO_STATUS_LABEL[to]}`);
  };

  return (
    <>
      {can(user, 'workOrder.logTime') && (
        <Button variant="secondary" className={big} icon={<Timer className="h-4 w-4" />} onClick={onLogHours} data-tour="log-hours">Log Hours</Button>
      )}
      {wo.status === 'PENDING_DEPOSIT' && canStatus && <Button className={big} icon={<BadgeDollarSign className="h-4 w-4" />} onClick={() => status('UNSCHEDULED')}>Confirm Deposit</Button>}
      {wo.status === 'UNSCHEDULED' && canSchedule && <Button className={big} icon={<CalendarPlus className="h-4 w-4" />} onClick={onSchedule}>Schedule</Button>}
      {wo.status === 'SCHEDULED' && canStatus && <Button className={big} icon={<Play className="h-4 w-4" />} onClick={() => status('IN_PROGRESS')}>Start Job</Button>}
      {wo.status === 'IN_PROGRESS' && canStatus && (
        <Button className={big} icon={<CheckCircle2 className="h-4 w-4" />} onClick={onMarkComplete} data-tour="mark-complete">Mark Complete</Button>
      )}
      <DM.Root modal={false}>
        <DM.Trigger asChild>
          <button type="button" aria-label="More actions" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><MoreVertical className="h-4 w-4" /></button>
        </DM.Trigger>
        <DM.Portal>
          <DM.Content align="end" sideOffset={4} className="z-[150] min-w-[220px] rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
            <Item icon={<Share2 />} onSelect={() => { navigator.clipboard?.writeText(window.location.href).catch(() => {}); toast.success('Link copied to clipboard'); }}>Share Work Order</Item>
            <Item icon={<Pencil />} onSelect={onEdit}>Edit Work Order</Item>
            <Item icon={<CalendarPlus />} onSelect={onSchedule} disabled={!canSchedule || wo.status === 'PENDING_DEPOSIT' || wo.status === 'COMPLETED'}>Edit Schedule</Item>
            <Item icon={<CalendarX2 />} disabled={!canSchedule || wo.status !== 'SCHEDULED'}
              onSelect={() => { if (act(markUnscheduled, wo.id).ok) toast.success('Status changed to Unscheduled'); }}>Mark Unscheduled</Item>
            {estimate && job.contractSigned && can(user, 'co.build') && (
              <Item icon={<FilePlus2 />} onSelect={() => router.push(`${estimateHref(estimate.id)}?newco=1#section-change-orders`)}>Create Change Order <NewBadge feature={24} /></Item>
            )}
            {wo.status === 'IN_PROGRESS' && <Item icon={<ClipboardCheck />} onSelect={onMarkComplete}>Closeout checklist <NewBadge feature={25} /></Item>}
            <DM.Separator className="my-1 h-px bg-gray-100" />
            <Item icon={<Trash2 />} danger disabled>Delete Work Order</Item>
          </DM.Content>
        </DM.Portal>
      </DM.Root>
    </>
  );
}

function Item({ icon, children, onSelect, disabled, danger }: { icon: React.ReactNode; children: React.ReactNode; onSelect?: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <DM.Item disabled={disabled} onSelect={onSelect}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40',
        danger ? 'text-red-600 data-[highlighted]:bg-red-50' : 'text-gray-700 data-[highlighted]:bg-gray-100',
      )}>
      <span className="flex h-4 w-4 items-center [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {children}
    </DM.Item>
  );
}

/* ---------- sections ---------- */

/** Paint Color Card (3, 18) and Materials + Paint Orders (18, 19): placed after the instructions. */
export function WoMaterialSections({ twin }: { twin: WoTwin }) {
  return (
    <>
      <WoPaintColorCard job={twin.job} />
      <MaterialsSections job={twin.job} />
    </>
  );
}

/** Crew Clock + Time Log (22) and Field Notes & attachments with Use in marketing (34). */
export function WoFieldSections({ twin }: { twin: WoTwin }) {
  return (
    <>
      <CrewClockCard wo={twin.wo} job={twin.job} />
      <TimeLogSection wo={twin.wo} job={twin.job} />
      <FieldNotesSection wo={twin.wo} extraAttachmentAction={(attId) => <UseInMarketing wo={twin.wo} attId={attId} />} />
    </>
  );
}

/** NEW (34): copy a site photo into the marketing media library. */
function UseInMarketing({ wo, attId }: { wo: WorkOrder; attId: string }) {
  const user = useCurrentUser();
  const att = wo.attachments.find((a) => a.id === attId);
  if (!att?.fileType.startsWith('image') || !can(user, 'marketing.post')) return null;
  if (att.mediaAssetId) {
    return <AppLink href="/marketing/media" className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700 hover:underline"><Share2 className="h-3 w-3" /> In media library</AppLink>;
  }
  return (
    <button type="button" data-tour="wo-use-in-marketing"
      onClick={() => { const r = act(sendPhotoToMarketing, wo.id, attId); if (r.ok) toast.success('Added to the media library', `${r.value} — check it for identifying details before posting.`); }}
      className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 hover:text-primary-700">
      <Share2 className="h-3 w-3" /> Use in marketing <NewBadge feature={34} />
    </button>
  );
}

/* ---------- dialogs ---------- */

export type WoDialog = 'hours' | 'schedule' | 'closeout' | null;

export function WoTwinDialogs({ twin, open, onClose }: { twin: WoTwin; open: WoDialog; onClose: () => void }) {
  const { wo, job } = twin;
  const set = (v: boolean) => { if (!v) onClose(); };
  return (
    <>
      <LogHoursModal open={open === 'hours'} onOpenChange={set} wo={wo} job={job} />
      <ScheduleModal key={`${wo.id}-${open === 'schedule'}`} open={open === 'schedule'} onOpenChange={set} wo={wo} />
      <Drawer open={open === 'closeout'} onOpenChange={set} width="max-w-4xl"
        title={<span className="inline-flex items-center gap-2">Mark Complete · Closeout <NewBadge feature={25} /></span>} subtitle={`${wo.id} · ${job.name}`}>
        <CloseoutPanel job={job} />
      </Drawer>
    </>
  );
}

/** Local state for the three dialogs. */
export function useWoDialog() {
  return useState<WoDialog>(null);
}
