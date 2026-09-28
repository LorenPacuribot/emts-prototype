"use client";
/** Labels and small pieces shared by the Finance screens (feature 33). */
import type { ExchangeItem, FinanceRecord, FinanceRecordType } from "@/features/types";
import { Badge } from "@/features/components/ui";
import type { Tone } from "@/features/components/ui/badge";

export const RECORD_TYPE: Record<FinanceRecordType, { label: string; tone: Tone }> = {
  invoice: { label: "Invoice", tone: "blue" },
  deposit: { label: "Deposit", tone: "purple" },
  payment: { label: "Payment", tone: "green" },
  bill: { label: "Supplier bill", tone: "amber" },
  credit: { label: "Credit", tone: "pink" },
  check: { label: "Check", tone: "gray" },
  receipt: { label: "Receipt", tone: "gray" },
  refund: { label: "Refund", tone: "pink" },
  card_settlement: { label: "Card settlement", tone: "indigo" },
};

export const EXCHANGE_STATUS: Record<ExchangeItem["status"], { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "gray" },
  sent: { label: "Sent", tone: "blue" },
  accepted: { label: "Accepted", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
};

export function TypeBadge({ type }: { type: FinanceRecordType }) {
  const t = RECORD_TYPE[type];
  return <Badge tone={t.tone}>{t.label}</Badge>;
}

export function RecordFlags({ r }: { r: FinanceRecord }) {
  return (
    <div className="flex flex-wrap gap-1">
      {r.variance && !r.variance.reviewedAt && <Badge tone="amber">QuickBooks variance</Badge>}
      {r.deletedInQbo && !r.deletedInQbo.reviewedAt && <Badge tone="red">Deleted in QuickBooks</Badge>}
      {r.deletedInQbo?.reviewedAt && <Badge tone="gray">Deletion reviewed</Badge>}
      {r.approvalRequest && <Badge tone="amber">Awaiting owner approval</Badge>}
      {r.liability && <Badge tone="purple">Liability until invoiced</Badge>}
      {r.accountCredit ? <Badge tone="pink">Account credit ${r.accountCredit.toFixed(2)}</Badge> : null}
      {r.postedFromClosedPeriod && <Badge tone="indigo">From closed {r.postedFromClosedPeriod}</Badge>}
      {r.match && r.match.unmatchedValue > 0 && <Badge tone="amber">Unmatched ${r.match.unmatchedValue.toFixed(2)}</Badge>}
      {r.allocations?.some((a) => a.overhead) && <Badge tone="gray">Overhead</Badge>}
    </div>
  );
}

/** Always-visible reminder of who owns which fields (33.Q02). */
export function OwnershipLegend() {
  return (
    <div className="grid gap-3 rounded-xl border border-line bg-white p-4 text-[12px] sm:grid-cols-2 [&>*]:min-w-0">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">Owned and edited here</div>
        <p className="mt-1 text-slate-600">Job number, cost code, job allocation, estimate and change-order values, purchase-order lines, material issues.</p>
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700">Returned read-only from QuickBooks</div>
        <p className="mt-1 text-slate-600">Invoice amount and date, payment status, amount and date paid, bill amount and date, credit amount and date, deletion status (a review flag).</p>
      </div>
    </div>
  );
}
