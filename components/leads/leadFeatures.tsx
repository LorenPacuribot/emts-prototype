'use client';

/*
  NEW feature glue for the replica lead screens (features 29 and 34).
  Prototype data is read by record id (a replica lead has the same id as its
  prototype twin); every mutation goes through the prototype actions and the
  bridge carries it to the replica store.

  - Repaint alert source badge (29) for the board card, table and detail header.
  - Follow-up lock (29, D5): while an open repaint follow-up drives a lead,
    its stage can't be moved by hand. followUpLockFor() is checked up front
    by the board, the table, the status bar and useLeadActions.
  - RepaintFollowUpHost: the NEW Repaint Follow-Up card on /leads/[id].
*/
import React from 'react';
import { BellRing } from 'lucide-react';
import type { Lead } from '@/lib/types';
import type { Database as PDatabase, FollowUp } from '@/features/types';
import { getDb, useDb } from '@/features/lib/store';
import { byId } from '@/features/lib/selectors';
import { drivingFollowUp } from '@/features/lib/store/actions/leads';
import { NewBadge } from '@/features/components/ui';
import { useIsOn } from '@/features/lib/feature-visibility';
import { RepaintFollowUpCard } from '@/features/components/features/leads/details/repaint-follow-up-card';
import { cn } from '@/lib/utils';

/** The open follow-up that sets this lead's stage, if any. */
export function followUpLockFor(db: PDatabase, leadId: string): FollowUp | undefined {
  return drivingFollowUp(db, { id: leadId });
}

/** Non-reactive check for event handlers. */
export function currentFollowUpLock(leadId: string): FollowUp | undefined {
  return followUpLockFor(getDb(), leadId);
}

export const followUpLockMessage = (fu: Pick<FollowUp, 'id'>) =>
  `This lead follows repaint follow-up ${fu.id}. Record the call or close the follow-up to move it.`;

/** Reactive lookup: leadId -> driving follow-up (the whole prototype db is a stable selector). */
export function useFollowUpLocks() {
  const db = useDb((d) => d);
  return (leadId: string) => followUpLockFor(db, leadId);
}

/** True when the lead came from a repaint alert (prototype source, or the bridged replica label). */
export function useIsRepaintLead(lead: Pick<Lead, 'id' | 'leadSource'>) {
  const db = useDb((d) => d);
  const p = byId(db.leads, lead.id);
  return p ? p.source === 'repaint_alert' : lead.leadSource === 'Repaint Alert';
}

/** NEW (29) "Repaint alert" source chip. Renders `fallback` for any other source. */
export function LeadSourceChip({ lead, className, fallback }: { lead: Pick<Lead, 'id' | 'leadSource'>; className?: string; fallback: React.ReactNode }) {
  const repaint = useIsRepaintLead(lead);
  const on = useIsOn({ feature: 29 });
  if (!repaint || !on) return <>{fallback}</>;
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded border border-primary-200 bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-800', className)}>
      <BellRing className="h-3 w-3" /> Repaint alert <NewBadge feature={29} />
    </span>
  );
}

/** Small note under the card / status bar while a follow-up drives the lead. */
export function FollowUpLockNote({ fu, className, compact }: { fu: Pick<FollowUp, 'id'>; className?: string; compact?: boolean }) {
  const on = useIsOn({ feature: 29 });
  if (!on) return null;
  if (compact) {
    return (
      <div className={cn('flex items-center gap-1.5 rounded-md border border-primary-100 bg-primary-50/60 px-2 py-1 text-xs text-primary-800', className)}>
        <BellRing className="h-3 w-3 shrink-0" /> Stage follows repaint follow-up {fu.id}
      </div>
    );
  }
  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-xs text-primary-800', className)}>
      <BellRing className="h-3.5 w-3.5" /> The stage follows repaint follow-up {fu.id}. <NewBadge feature={29} />
    </div>
  );
}

/** NEW (29) Repaint Follow-Up card, for a lead whose prototype twin has a follow-up. */
export function RepaintFollowUpHost({ leadId }: { leadId: string }) {
  const db = useDb((d) => d);
  const lead = byId(db.leads, leadId);
  const on = useIsOn({ feature: 29 });
  if (!on || !lead || !db.followUps.some((f) => f.leadId === leadId)) return null;
  return <RepaintFollowUpCard lead={lead} />;
}
