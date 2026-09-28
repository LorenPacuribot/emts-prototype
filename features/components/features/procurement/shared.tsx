"use client";
/** Small pieces shared by the Materials tab (18) and the Procurement screens (19). */
import type { ReactNode } from "react";
import { AlarmClock, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { PurchaseOrder, User } from "@/features/types";
import { can } from "@/features/lib/permissions";
import { PO_STATUS } from "@/features/lib/status";
import { aggregateStatus } from "@/features/lib/rules/procurement";
import { ackClock } from "@/features/lib/rules/dates";
import { Badge } from "@/features/components/ui";
import { cn } from "@/features/lib/cn";

export function procurementPerms(user: User) {
  return {
    seePrices: can(user, "materials.seePrices"),
    seeAccount: can(user, "supplier.seeAccount"),
    submit: can(user, "supplier.submit"),
    setup: can(user, "supplier.setup"),
    receive: can(user, "po.receive"),
    generate: can(user, "po.generate"),
    requestOrder: can(user, "materials.approveDemand"),
    approveAdjust: can(user, "materials.approveAdjustment"),
    approveOver: can(user, "po.approveOverReceipt"),
    confirmShelf: can(user, "materials.confirmShelf"),
    editCatalog: can(user, "catalog.edit"),
    isOwner: user.role === "owner",
    isOfficeOrOwner: user.role === "owner" || user.role === "office_manager",
  };
}

export function PoStatusBadge({ po }: { po: PurchaseOrder }) {
  const s = PO_STATUS[aggregateStatus(po)] ?? PO_STATUS.draft;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function minutesLabel(m: number): string {
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${h}h ${String(mm).padStart(2, "0")}m`;
}

/** Four-working-hour acknowledgment clock chip. */
export function AckClockChip({ po, nowIso }: { po: PurchaseOrder; nowIso: string }) {
  if (po.ackAt) return <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Acknowledged</span>;
  const since = po.resentAt ?? po.sentAt;
  if (po.status !== "sent" || !since) return <span className="text-slate-400">—</span>;
  const c = ackClock(since, nowIso);
  return c.overdue ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-bold text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> Overdue</span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-slate-700"><AlarmClock className="h-3.5 w-3.5 text-brand" /> {minutesLabel(c.remainingMinutes)} left</span>
  );
}

export function receivedOf(po: PurchaseOrder) {
  const ordered = po.lines.reduce((a, l) => a + l.gallons - l.cancelledGal, 0);
  const received = po.lines.reduce((a, l) => a + l.receivedGal, 0);
  return { ordered, received };
}

/** Progress bar for received vs ordered. */
export function ReceivedBar({ po }: { po: PurchaseOrder }) {
  const { ordered, received } = receivedOf(po);
  const pct = ordered > 0 ? Math.min(100, (received / ordered) * 100) : 0;
  return (
    <div className="min-w-[110px]">
      <div className="text-[12px] tabular-nums text-slate-700">{received.toFixed(2)} / {ordered.toFixed(2)} gal</div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-500" : "bg-slate-200")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Cell({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className="mt-0.5 text-[12.5px] text-slate-700">{children}</div>
    </div>
  );
}

/** Today as yyyy-mm-dd for date inputs. */
export function todayInput(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local datetime-local value. */
export function nowInput(iso: string) {
  const d = new Date(iso);
  return `${todayInput(iso)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Date input (yyyy-mm-dd) to ISO at local noon, so day arithmetic is stable. */
export function dateInputToIso(v: string) {
  if (!v) return "";
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}
