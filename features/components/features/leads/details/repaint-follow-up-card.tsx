"use client";
/**
 * NEW (29) — Repaint Follow-Up card on /leads/[id].
 *
 * A qualified repaint alert is worked as this lead (decision D5). The card
 * shows the follow-up's own status, owner, the three-attempt schedule and the
 * surfaces that are due, and opens the follow-up drawer for calls, emails,
 * quote requests and closure. The lead's stage follows the follow-up:
 *   Qualified → New · Contacted → Contacted · Estimate requested → Scheduled
 *   Estimate sent → Pending · Won → Sold · Lost → Lost · Deferred / Do not contact → Archived
 */
import { useState } from "react";
import { BellRing, CalendarClock, ExternalLink, PhoneCall } from "lucide-react";
import type { Lead } from "@/features/types";
import { useDb } from "@/features/lib/store";
import { useIsOn } from "@/features/lib/feature-visibility";
import { byId, surfaceLabel } from "@/features/lib/selectors";
import { followUpSurfaceIds, isClosedFollowUp } from "@/features/lib/rules/alerts";
import { FOLLOWUP_STATUS } from "@/features/lib/status";
import { LIVE_LEAD_STATUS } from "@/features/lib/rules/lead-pipeline";
import { FOLLOW_UP_LEAD_STAGE } from "@/features/lib/store/actions/service";
import { date } from "@/features/lib/format";
import { AppLink } from "@/features/lib/navigation";
import { propertyHref } from "@/features/lib/hrefs";
import { Button, LiveCard, NewBadge, StatusPill } from "@/features/components/ui";
import { FollowUpDrawer } from "@/features/components/features/service/follow-up-drawer";

const TONE: Record<string, "gray" | "blue" | "green" | "amber" | "red" | "purple" | "indigo"> = { indigo: "indigo", blue: "blue", purple: "purple", green: "green", red: "red", amber: "amber", dark: "gray" };

export function RepaintFollowUpCard({ lead }: { lead: Lead }) {
  const db = useDb((d) => d);
  const [open, setOpen] = useState(false);
  const fu = db.followUps.find((f) => f.leadId === lead.id);
  const fromHistoryOn = useIsOn({ feature: 28 });
  if (!fu) return null;
  const meta = FOLLOWUP_STATUS[fu.status];
  const closed = isClosedFollowUp(fu);
  const next = closed ? undefined : fu.attempts.find((a) => !a.actualAt);
  const made = fu.attempts.filter((a) => a.actualAt).length;
  const surfaces = followUpSurfaceIds(db, fu);
  return (
    <LiveCard isNew className="p-6" data-tour="lead-follow-up">
      <div className="mb-5 flex flex-wrap items-center gap-2 text-gray-500">
        <BellRing className="h-4 w-4" />
        <span className="text-xs font-bold uppercase tracking-widest">Repaint Follow-Up</span>
        <NewBadge feature={29} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-bold text-gray-900">{fu.id}</span>
        <StatusPill tone={TONE[meta.tone] ?? "gray"}>{meta.label}</StatusPill>
        <span className="text-xs text-gray-500">→ lead stage {LIVE_LEAD_STATUS[FOLLOW_UP_LEAD_STAGE[fu.status]]}</span>
      </div>
      <dl className="space-y-3 text-sm">
        <Row label="Owner">{byId(db.users, fu.assigneeId)?.name ?? <span className="text-amber-700">Unassigned</span>}</Row>
        <Row label="Attempts">{made} of {fu.attempts.length}{next && <span className="ml-2 inline-flex items-center gap-1 text-xs text-gray-500"><CalendarClock className="h-3 w-3" /> next {date(next.plannedDate)}</span>}</Row>
        <Row label="Alert"><AppLink href={`/repaint-alerts?alert=${fu.alertId}`} className="font-medium text-primary-700 hover:underline">{fu.alertId}</AppLink></Row>
        {fu.estimateId && <Row label="Estimate">{fu.estimateId}</Row>}
        {closed && fu.closedReason && <Row label="Closed">{fu.closedReason}</Row>}
      </dl>
      {surfaces.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-xxs font-bold uppercase tracking-widest text-gray-500">Surfaces due</div>
          <ul className="space-y-1 text-sm text-gray-700">{surfaces.slice(0, 4).map((s) => <li key={s} className="truncate">• {surfaceLabel(db, s)}</li>)}</ul>
          {surfaces.length > 4 && <div className="mt-1 text-xs text-gray-500">+ {surfaces.length - 4} more</div>}
        </div>
      )}
      <p className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">This lead&apos;s stage follows the follow-up. Record calls and close it from the follow-up.</p>
      {!closed && !fu.estimateId && fromHistoryOn && (
        <AppLink href={propertyHref(fu.propertyId, "history", `&newEstimate=1&followUp=${fu.id}`)} className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50">
          New Estimate from History <NewBadge feature={28} />
        </AppLink>
      )}
      <Button variant="primary" className="mt-3 w-full" onClick={() => setOpen(true)}>
        {closed ? <ExternalLink className="h-4 w-4" /> : <PhoneCall className="h-4 w-4" />} {closed ? "View follow-up" : "Work follow-up"}
      </Button>
      <FollowUpDrawer fuId={open ? fu.id : undefined} onClose={() => setOpen(false)} />
    </LiveCard>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xxs font-bold uppercase tracking-widest text-gray-500">{label}</dt>
      <dd className="text-right text-gray-900">{children}</dd>
    </div>
  );
}
