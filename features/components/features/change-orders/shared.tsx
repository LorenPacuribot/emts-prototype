"use client";
/** Small display helpers shared by the change-order screens (feature 24). */
import type { ReactNode } from "react";
import type { ChangeOrder, Database } from "@/features/types";
import { Badge } from "@/features/components/ui";
import { CO_DOWNSTREAM, CO_STATUS, CO_TYPE } from "@/features/lib/status";
import { date, money } from "@/features/lib/format";
import { now } from "@/features/lib/clock";
import { writtenConfirmationStatus, BILLING_LABEL } from "@/features/lib/rules/change-orders";
import { coLinkState, currentLink, coVersion } from "@/features/lib/store/actions/change-orders";

export const TYPE_HELP: Record<string, string> = {
  addition: "New scope on top of the signed contract, e.g. an added room.",
  deleted_room: "A room or elevation taken out of the signed scope.",
  credit: "Money back to the customer for scope removed.",
  quantity_reduction: "Less of something already in scope (fewer coats, smaller area).",
  product_substitution: "A different brand, product line or sheen. Priced even at zero.",
  no_cost_colour_change: "A color change on a signed job. The app checks whether a color re-approval is enough.",
};

export function StatusBadge({ co, stack }: { co: ChangeOrder; stack?: boolean }) {
  const s = CO_STATUS[co.status];
  return (
    <span className={stack ? "inline-flex flex-col items-start gap-1" : "inline-flex flex-wrap items-center gap-1"}>
      <Badge tone={s.tone}>{s.label}</Badge>
      {co.emergency && <EmergencyBadge co={co} />}
    </span>
  );
}

export function EmergencyBadge({ co }: { co: ChangeOrder }) {
  if (!co.emergency) return null;
  const s = writtenConfirmationStatus(co.emergency.verbalAt, co.emergency.writtenConfirmedAt, now());
  if (s.state === "confirmed") return <Badge tone="green">Emergency · confirmed</Badge>;
  if (s.state === "overdue") return <Badge tone="red" className="max-w-28 whitespace-normal">Emergency · overdue</Badge>;
  return <Badge tone="amber" className="max-w-28 whitespace-normal">Emergency · due {new Date(`${s.dueDay}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</Badge>;
}

export function TypeBadge({ type }: { type: string }) {
  return <Badge tone={CO_TYPE[type].tone}>{CO_TYPE[type].label}</Badge>;
}

export function DownstreamBadge({ state }: { state: string }) {
  return <Badge tone={CO_DOWNSTREAM[state].tone}>{CO_DOWNSTREAM[state].label}</Badge>;
}

/** "Approval state" column: the customer's side of the approval. */
export function approvalStateLabel(co: ChangeOrder): { label: string; tone: "gray" | "blue" | "green" | "amber" | "red" } {
  const link = currentLink(co);
  switch (co.status) {
    case "draft":
      return { label: co.returnedToDraft ? "Returned to draft" : "Not submitted", tone: co.returnedToDraft ? "amber" : "gray" };
    case "pending_internal":
      return { label: "Awaiting owner", tone: "amber" };
    case "ready_to_send":
      return { label: co.recipientVerified ? "Owner OK · ready" : "Recipient not verified", tone: co.recipientVerified ? "blue" : "amber" };
    case "sent": {
      const st = link ? coLinkState(co, link, now()) : "active";
      if (st === "expired") return { label: "Link expired", tone: "amber" };
      if (st === "undeliverable") return { label: "Undeliverable", tone: "red" };
      if (st === "signer_changed") return { label: "New link required", tone: "amber" };
      return { label: `Awaiting v${coVersion(co)}`, tone: "blue" };
    }
    case "approved":
    case "disputed":
      return { label: co.evidence?.channel === "verbal" ? "Verbal (emergency)" : `Signed · ${co.evidence?.channel ?? co.channel ?? "portal"}`, tone: "green" };
    case "rejected":
      return { label: "Rejected", tone: "red" };
  }
}

export function billingStateLabel(co: ChangeOrder, canPrice: boolean): ReactNode {
  const st = co.downstream.billing;
  if (st === "failed") return <Badge tone="red">Billing failed</Badge>;
  if (co.billing) return <span className="text-xs">{BILLING_LABEL[co.billing.mode].split(" (")[0]}{co.billing.docId ? ` · ${co.billing.docId}` : ""}{canPrice && co.billing.mode !== "none" ? ` · ${money(co.billing.amount)}` : ""}</span>;
  if (co.emergency && !co.emergency.writtenConfirmedAt && co.status === "approved") return <Badge tone="amber">Deferred</Badge>;
  return <span className="text-gray-400">—</span>;
}

export function coHref(db: Database, co: ChangeOrder) {
  const estimateId = db.jobs.find((j) => j.id === co.jobId)?.estimateId;
  return `/estimates/${encodeURIComponent(estimateId ?? "")}?co=${encodeURIComponent(co.id)}#section-change-orders`;
}

export function Section({ title, icon, right, children, className }: { title: string; icon?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line p-4 ${className ?? ""}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xxs font-bold uppercase tracking-[0.14em] text-gray-600">
          {icon && <span className="text-brand [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
          {title}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
