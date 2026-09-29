"use client";
/** Small pieces shared by the feature 28 screens. */
import type { ReactNode } from "react";
import { AlertTriangle, CircleHelp, ExternalLink, FileClock, PaintBucket, ShieldAlert } from "lucide-react";
import type { Database, Property, RepeatEstimate } from "@/features/types";
import { AppLink } from "@/features/lib/navigation";
import { byId } from "@/features/lib/selectors";
import { dateLong, titleCase } from "@/features/lib/format";
import { now } from "@/features/lib/clock";
import { isQuoteExpired } from "@/features/lib/rules/future-estimate";
import { REPEAT_STATUS } from "@/features/lib/status";
import { openRecords, ownershipContext } from "@/features/lib/store/actions/future-estimate";
import { Badge, Banner, IdChip } from "@/features/components/ui";
import { propertyHref } from "@/features/lib/hrefs";

export function repHref(rep: Pick<RepeatEstimate, "id" | "propertyId">) {
  return propertyHref(rep.propertyId, "new-estimate", `&rep=${encodeURIComponent(rep.id)}`);
}

export function reorderHref(propertyId: string, reorderId?: string) {
  return propertyHref(propertyId, "reorders", reorderId ? `&reorder=${encodeURIComponent(reorderId)}` : "");
}

export function repStatus(rep: RepeatEstimate) {
  if (rep.status === "issued" && isQuoteExpired(rep.validUntil, now())) return REPEAT_STATUS.expired;
  return REPEAT_STATUS[rep.status];
}

export function SourceChip({ jobId, appId }: { jobId?: string; appId: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <IdChip tone="blue">{jobId ?? "No job"}</IdChip>
      <IdChip>{appId}</IdChip>
    </span>
  );
}

export function UnverifiedBadge({ note }: { note?: string }) {
  return (
    <Badge tone="amber" icon={<CircleHelp className="h-3 w-3" />}>
      Unverified{note ? ` · ${note}` : ""}
    </Badge>
  );
}

export function Cell({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xxs font-bold uppercase tracking-[0.12em] text-gray-500">{label}</div>
      <div className="mt-0.5 text-xs text-gray-700">{children}</div>
    </div>
  );
}

/**
 * Warning strip (Wireframe): open repaint estimate or pending reorder at the
 * property, or unverified third-party history in use. Each links to the record.
 */
export function WarningStrip({ db, property, rep, onLink }: { db: Database; property: Property; rep?: RepeatEstimate; onLink?: (kind: "Estimate" | "Reorder", ref: string) => void }) {
  const open = openRecords(db, property.id, rep?.id);
  const unverified = rep?.lines.filter((l) => l.unverified) ?? [];
  const items: ReactNode[] = [];
  for (const r of open.repeatDrafts) {
    items.push(
      <li key={r.id} className="flex flex-wrap items-center gap-1.5">
        <FileClock className="h-3.5 w-3.5" /> Open repaint estimate <strong>{r.id}</strong> (draft, started {dateLong(r.createdAt)}).
        <AppLink href={repHref(r)} onClick={() => onLink?.("Estimate", r.id)} className="inline-flex items-center gap-0.5 font-semibold underline">
          Open it <ExternalLink className="h-3 w-3" />
        </AppLink>
      </li>,
    );
  }
  for (const e of open.openEstimates) {
    items.push(
      <li key={e.id} className="flex flex-wrap items-center gap-1.5">
        <FileClock className="h-3.5 w-3.5" /> Open repaint quote <strong>{e.id}</strong> ({e.status}, valid until {dateLong(e.validUntil)}).
        {e.repeatEstimateId && (
          <AppLink href={repHref({ id: e.repeatEstimateId, propertyId: property.id })} onClick={() => onLink?.("Estimate", e.id)} className="inline-flex items-center gap-0.5 font-semibold underline">
            View quote <ExternalLink className="h-3 w-3" />
          </AppLink>
        )}
      </li>,
    );
  }
  for (const r of open.pendingReorders) {
    const app = byId(db.applications, r.applicationId);
    items.push(
      <li key={r.id} className="flex flex-wrap items-center gap-1.5">
        <PaintBucket className="h-3.5 w-3.5" /> Pending touch-up reorder <strong>{r.id}</strong> ({app?.colourName} {app?.colourNumber}, {r.status}).
        <AppLink href={reorderHref(property.id, r.id)} onClick={() => onLink?.("Reorder", r.id)} className="inline-flex items-center gap-0.5 font-semibold underline">
          Open reorder <ExternalLink className="h-3 w-3" />
        </AppLink>
      </li>,
    );
  }
  for (const l of unverified) {
    items.push(
      <li key={l.id} className="flex flex-wrap items-center gap-1.5">
        <CircleHelp className="h-3.5 w-3.5" /> Unverified third-party history in use: <strong>{l.sourceApplicationId}</strong> ({l.colourLabel}, {l.sourceNote ?? "recorded from customer"}).
        <AppLink href={propertyHref(property.id, "history")} className="inline-flex items-center gap-0.5 font-semibold underline">
          View record <ExternalLink className="h-3 w-3" />
        </AppLink>
      </li>,
    );
  }
  if (items.length === 0) return null;
  return (
    <Banner tone="warn" className="mb-4" title="Check these before quoting">
      <ul className="mt-1 space-y-1">{items}</ul>
    </Banner>
  );
}

/** Ownership restriction (feature 25 rules, applied before any history is shared). */
export function OwnershipBanner({ db, property }: { db: Database; property: Property }) {
  const ctx = ownershipContext(db, property);
  if (!ctx.hasPredecessor) return null;
  const owner = byId(db.customers, ctx.current.customerId);
  if (ctx.hiddenCount === 0 && ctx.specOnlyCount === 0) {
    return (
      <Banner tone="info" className="mb-4" title="Predecessor history shared with consent">
        {owner?.name} is the verified current owner. The previous owner consented to sharing their period's history.
      </Banner>
    );
  }
  return (
    <Banner
      tone={ctx.hiddenCount ? "danger" : "warn"}
      className="mb-4"
      title={ctx.hiddenCount ? "Restricted: prior-owner work is hidden" : "Restricted: prior-owner work is specification only"}
      action={
        <AppLink href={propertyHref(property.id, "ownership")} className="whitespace-nowrap text-xs font-semibold underline">
          Owners & Consent
        </AppLink>
      }
    >
      <span className="inline-flex items-start gap-1">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          This property changed hands on {dateLong(ctx.current.start)}. History is shown only for {owner?.name ?? "the current owner"}'s ownership period.{" "}
          {ctx.hiddenCount > 0 && `${ctx.hiddenCount} earlier application${ctx.hiddenCount === 1 ? " is" : "s are"} hidden because seller consent is ${titleCase(ctx.consent ?? "not_requested").toLowerCase()}. `}
          {ctx.specOnlyCount > 0 && `${ctx.specOnlyCount} earlier application${ctx.specOnlyCount === 1 ? " is" : "s are"} shared as specification only (seller unreachable): no usage, cost or photos. `}
          The seller's live QR link is never reused for the buyer.
        </span>
      </span>
    </Banner>
  );
}

export function InternalOnly({ children = "Internal only — never shown to the customer" }: { children?: ReactNode }) {
  return (
    <Badge tone="dark" icon={<AlertTriangle className="h-3 w-3" />}>
      {children}
    </Badge>
  );
}
