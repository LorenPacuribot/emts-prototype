"use client";
/** Small pieces shared by the Service screens. */
import type { ReactNode } from "react";
import { AlertOctagon, BanIcon, EyeOff, Flag } from "lucide-react";
import type { Database, RepaintAlert } from "@/features/types";
import { byId, currentOwner } from "@/features/lib/selectors";
import { AppLink } from "@/features/lib/navigation";
import { Badge } from "@/features/components/ui";
import type { Suppression } from "@/features/lib/rules/alerts";
import { propertyHref } from "@/features/lib/hrefs";

export function PropertyCell({ db, propertyId, sub }: { db: Database; propertyId: string; sub?: ReactNode }) {
  const p = byId(db.properties, propertyId);
  const owner = p ? currentOwner(db, p) : undefined;
  return (
    <div className="min-w-0">
      <AppLink href={propertyHref(propertyId)} className="font-semibold text-ink hover:text-brand" onClick={(e) => e.stopPropagation()}>
        {p?.address ?? propertyId}
      </AppLink>
      <div className="text-[11px] text-slate-500">
        {propertyId} · {p?.city} · {owner?.name ?? "—"}
        {sub}
      </div>
    </div>
  );
}

export const NOTICE_LABEL: Record<RepaintAlert["noticeBasis"], string> = {
  commercial: "Commercial · 9 mo",
  exterior: "Exterior · 6 mo",
  interior: "Interior · 3 mo",
};

export function NoticeBadge({ basis }: { basis: RepaintAlert["noticeBasis"] }) {
  return <Badge tone={basis === "commercial" ? "indigo" : basis === "exterior" ? "blue" : "gray"}>{NOTICE_LABEL[basis]}</Badge>;
}

export function SuppressionBadge({ s }: { s?: Suppression }) {
  if (!s) return <span className="text-[11.5px] text-slate-400">None</span>;
  return <Badge tone="gray" icon={<EyeOff className="h-3 w-3" />}>{s.label}</Badge>;
}

export function OptOutBadge() {
  return <Badge tone="dark" icon={<BanIcon className="h-3 w-3" />}>Opted out</Badge>;
}

export function EscalationBadge({ escalated, age, daysLeft }: { escalated: boolean; age: number; daysLeft?: number }) {
  if (escalated) return <Badge tone="red" icon={<Flag className="h-3 w-3" />}>Escalated · day {age}</Badge>;
  if (daysLeft !== undefined && daysLeft <= 3) return <Badge tone="amber" icon={<AlertOctagon className="h-3 w-3" />}>{daysLeft} day{daysLeft === 1 ? "" : "s"} to escalation</Badge>;
  return <span className="text-[11.5px] text-slate-500">{daysLeft !== undefined ? `${daysLeft} days left` : "—"}</span>;
}

export function Section({ title, icon, children, right }: { title: string; icon?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-xl border border-line p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-600">
          {icon && <span className="text-brand [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
          {title}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Convert an ISO date to the yyyy-mm-dd value of an <input type="date">. */
export function toInputDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
