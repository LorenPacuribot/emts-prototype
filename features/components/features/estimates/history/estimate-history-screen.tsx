"use client";
/**
 * Estimate History — live route /estimates/[id]/history
 * (features/(main)/estimates/history/templates/index.tsx).
 *
 * Existing: one card per history entry, newest first, with trigger label,
 * "Amendment #N", status, actor, total (old total struck through) and the
 * expandable change list.
 * NEW (feature 24): change-order events appear in the same timeline, so the
 * contract's full story (amendments and change orders) reads in one place.
 */
import { useState } from "react";
import { CheckCircle2, Clock, Eye, FilePlus2, FileDiff, History, PencilLine, Send, Sparkles, XCircle } from "lucide-react";
import type { EstimateHistoryEntry } from "@/features/types";
import { useDb } from "@/features/lib/store";
import { useParam, AppLink } from "@/features/lib/navigation";
import { byId } from "@/features/lib/selectors";
import { estimateHref } from "@/features/lib/hrefs";
import { money } from "@/features/lib/format";
import { ESTIMATE_STATUS_LABEL, ESTIMATE_STATUS_TONE } from "@/features/lib/rules/estimate-lifecycle";
import { coPricing, jobChangeOrders } from "@/features/lib/store/actions/change-orders";
import { Screen } from "@/features/components/layout/screen";
import { EmptyState, NewBadge, StatusPill } from "@/features/components/ui";

/** Live TRIGGER labels (estimates/history/lib/constants.ts), plus the NEW change-order triggers. */
const TRIGGER: Record<string, { label: string; icon: React.ReactNode; isNew?: boolean }> = {
  CREATED: { label: "Estimate created", icon: <Sparkles /> },
  UPDATED: { label: "Estimate updated", icon: <PencilLine /> },
  SENT: { label: "Sent to customer", icon: <Send /> },
  VIEWED: { label: "Viewed by customer", icon: <Eye /> },
  ACCEPTED: { label: "Accepted by customer", icon: <CheckCircle2 /> },
  DECLINED: { label: "Declined by customer", icon: <XCircle /> },
  AMENDMENT_OPENED: { label: "Amendment opened", icon: <PencilLine /> },
  SENT_FOR_REAPPROVAL: { label: "Sent for re-approval", icon: <Send /> },
  MANUAL_APPROVED: { label: "Manually approved", icon: <CheckCircle2 /> },
  EXPIRED: { label: "Expired", icon: <Clock /> },
  CHANGE_ORDER_CREATED: { label: "Change order created", icon: <FilePlus2 />, isNew: true },
  CHANGE_ORDER_SENT: { label: "Change order sent", icon: <Send />, isNew: true },
  CHANGE_ORDER_APPROVED: { label: "Change order approved", icon: <FileDiff />, isNew: true },
  CHANGE_ORDER_REJECTED: { label: "Change order rejected", icon: <XCircle />, isNew: true },
};

export function EstimateHistoryScreen() {
  const id = useParam("id");
  const db = useDb((d) => d);
  const estimate = byId(db.estimates, id);
  const job = estimate?.jobId ? byId(db.jobs, estimate.jobId) : undefined;

  const entries: (EstimateHistoryEntry & { coId?: string })[] = [...db.estimateHistory.filter((h) => h.estimateId === id)];
  // NEW (feature 24): change-order events, from the change-order records.
  for (const co of job ? jobChangeOrders(db, job.id) : []) {
    const total = coPricing(db, co).total;
    const base = { estimateId: id!, amendmentNumber: estimate?.amendmentNumber ?? 0, status: estimate!.status, grandTotal: total, changes: [], coId: co.id };
    entries.push({ ...base, id: `${co.id}-c`, trigger: "CHANGE_ORDER_CREATED", performedBy: "ORG_USER", userId: co.createdBy, createdAt: co.createdAt });
    if (co.sentAt) entries.push({ ...base, id: `${co.id}-s`, trigger: "CHANGE_ORDER_SENT", performedBy: "ORG_USER", userId: co.createdBy, createdAt: co.sentAt });
    if (co.decidedAt && co.status === "approved") entries.push({ ...base, id: `${co.id}-a`, trigger: "CHANGE_ORDER_APPROVED", performedBy: "CLIENT", customerName: co.signer, createdAt: co.decidedAt });
    if (co.rejection) entries.push({ ...base, id: `${co.id}-r`, trigger: "CHANGE_ORDER_REJECTED", performedBy: "CLIENT", customerName: co.rejection.signer, createdAt: co.rejection.at });
  }
  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Screen crumbs={[{ label: "Estimates", href: "/estimates" }, ...(estimate ? [{ label: estimate.id, href: estimateHref(estimate.id) }] : []), { label: "Estimate History" }]} bare>
      <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-extrabold text-gray-900">{estimate?.title ?? "Estimate History"}</h1>
          {estimate && <AppLink href={estimateHref(estimate.id)} className="text-sm font-semibold text-primary-700 hover:underline">← Back to estimate</AppLink>}
        </div>
        {entries.length === 0 ? (
          <EmptyState icon={<History />} title="No history yet" body="Changes to this estimate will show up here." />
        ) : (
          <div className="space-y-4">
            {entries.map((e) => (
              <HistoryCard key={e.id} entry={e} />
            ))}
          </div>
        )}
      </div>
    </Screen>
  );
}

function HistoryCard({ entry: e }: { entry: EstimateHistoryEntry & { coId?: string } }) {
  const db = useDb((d) => d);
  const [open, setOpen] = useState(false);
  const t = TRIGGER[e.trigger] ?? { label: e.trigger, icon: <History /> };
  const actor = e.performedBy === "ORG_USER" ? byId(db.users, e.userId)?.name ?? "Team member" : e.performedBy === "CLIENT" ? e.customerName ?? "Customer" : "System";
  return (
    <div className={`flex gap-4 rounded-xl border bg-white p-4 ${t.isNew ? "border-green-200" : "border-gray-200"}`}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 [&>svg]:h-4 [&>svg]:w-4">{t.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-gray-900">{t.label}</span>
            {t.isNew && <NewBadge feature={24} />}
            {e.coId && <span className="rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-xs font-bold text-blue-700">{e.coId}</span>}
            {e.amendmentNumber > 0 && !e.coId && <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">Amendment #{e.amendmentNumber}</span>}
            {!e.coId && <StatusPill tone={ESTIMATE_STATUS_TONE[e.status]}>{ESTIMATE_STATUS_LABEL[e.status]}</StatusPill>}
          </div>
          <span className="text-xs text-gray-400">{new Date(e.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-gray-500">{actor}</span>
          <span className="font-semibold text-gray-900">
            {e.preAmendmentTotal !== undefined && e.preAmendmentTotal !== e.grandTotal && <span className="mr-2 text-gray-400 line-through">{money(e.preAmendmentTotal, { cents: true })}</span>}
            {e.coId ? `CO total ${money(e.grandTotal, { cents: true })}` : money(e.grandTotal, { cents: true })}
          </span>
        </div>
        {e.changes.length > 0 && (
          <div className="mt-2">
            <button onClick={() => setOpen(!open)} className="text-xs font-bold text-primary-700 hover:underline">
              {open ? "Hide changes" : `View ${e.changes.length} change${e.changes.length === 1 ? "" : "s"}`}
            </button>
            {open && (
              <ul className="mt-2 space-y-1 text-sm">
                {e.changes.map((c, i) => (
                  <li key={i} className={c.type === "item_added" ? "text-green-700" : c.type === "item_removed" ? "text-red-600" : "text-gray-700"}>
                    {c.type === "item_added" ? `+ Added ${c.entity} "${c.entityLabel}"` : c.type === "item_removed" ? `Removed ${c.entity} "${c.entityLabel}"` : (
                      <>
                        {c.field === "grandTotal" ? "Total" : c.field}: <span className="line-through">{typeof c.from === "number" ? money(c.from, { cents: true }) : String(c.from)}</span> → {typeof c.to === "number" ? money(c.to, { cents: true }) : String(c.to)}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
