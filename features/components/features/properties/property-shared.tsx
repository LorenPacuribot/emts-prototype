"use client";
/** Small pieces shared by the property record screens (features 25 and 26). */
import type { ReactNode } from "react";
import { BadgeCheck, CircleHelp } from "lucide-react";
import type { Application, Database, OwnershipPeriod, Property } from "@/features/types";
import { byId } from "@/features/lib/selectors";
import { dateLong } from "@/features/lib/format";
import { nowDate } from "@/features/lib/clock";
import { Badge } from "@/features/components/ui";

export function periodLabel(db: Database, o: OwnershipPeriod) {
  const c = byId(db.customers, o.customerId);
  return `${c?.name ?? "Unknown owner"} · ${dateLong(o.start)} – ${o.end ? dateLong(o.end) : "present"}`;
}

export function isFirstPeriod(p: Property, periodId: string) {
  return p.ownership[0]?.id === periodId;
}

/** Colour + number, or "Unknown". */
export function colourText(a: Pick<Application, "colourName" | "colourNumber">) {
  return a.colourName === "Unknown" ? "Unknown" : `${a.colourName} ${a.colourNumber}`;
}

export function VerificationBadge({ app }: { app: Pick<Application, "verification"> }) {
  return app.verification === "confirmed" ? (
    <Badge tone="green" icon={<BadgeCheck className="h-3 w-3" />}>Confirmed</Badge>
  ) : (
    <Badge tone="amber" icon={<CircleHelp className="h-3 w-3" />}>Unverified</Badge>
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

export function NotRecorded({ text = "Not recorded" }: { text?: string }) {
  return <span className="italic text-slate-400">{text}</span>;
}

/** Input value for a date field from an ISO string. */
export function toDateInput(iso?: string) {
  return iso ? iso.slice(0, 10) : "";
}

/** ISO string at local noon from a yyyy-mm-dd input (avoids time-zone day shifts). */
export function fromDateInput(v: string) {
  if (!v) return undefined;
  const [y, m, d] = v.split("-").map(Number);
  const noon = new Date(y, m - 1, d, 12, 0, 0);
  const current = nowDate();
  // Today's date should never read as "in the future" before noon.
  if (noon > current && noon.toDateString() === current.toDateString()) return current.toISOString();
  return noon.toISOString();
}

export function todayInput() {
  const d = nowDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
