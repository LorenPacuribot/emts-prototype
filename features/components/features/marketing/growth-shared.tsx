"use client";
/** Shared pieces for the campaign and growth screens (patent §34 part 2). */
import { useState, type ReactNode } from "react";
import type { CampaignStatus } from "@/features/types/marketing-growth";
import type { ReportTable } from "@/features/lib/rules/marketing-growth";
import { CAMPAIGN_STATUS_LABEL } from "@/features/lib/rules/marketing-growth";
import { money } from "@/features/lib/format";
import { Badge, Button, Card, ConfirmDialog, Table, TD, TH, THead, Tooltip, TR, type ButtonProps } from "@/features/components/ui";
import type { Tone } from "@/features/components/ui/badge";

export const cents = (n?: number) => money(n, { cents: true });
export const pct = (r?: number) => (r === undefined ? "—" : `${Math.round(r * 100)}%`);

/** 44px tap targets on phones; normal density from the small breakpoint up. */
export const TAP = "max-sm:min-h-11";
/** The same for every control inside a block (forms in modals). */
export const TAP_SCOPE = "max-sm:[&_button]:min-h-11 max-sm:[&_input]:min-h-11 max-sm:[&_select]:min-h-11";

const STATUS_TONE: Record<CampaignStatus, Tone> = { draft: "gray", active: "green", paused: "amber", completed: "blue" };

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{CAMPAIGN_STATUS_LABEL[status]}</Badge>;
}

/** A button that stays visible when not allowed, disabled, with the reason in a tooltip. */
export function GatedButton({ allowed, reason, children, className, ...rest }: ButtonProps & { allowed: boolean; reason: string }) {
  if (allowed) return <Button className={`${TAP} ${className ?? ""}`} {...rest}>{children}</Button>;
  return (
    <Tooltip content={reason}>
      <span tabIndex={0} className="inline-flex" aria-label={reason}>
        <Button {...rest} className={`${TAP} ${className ?? ""}`} disabled onClick={undefined}>{children}</Button>
      </span>
    </Tooltip>
  );
}

/** Section heading inside a drawer or card. */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="text-xxs font-bold uppercase tracking-[0.12em] text-gray-400">{children}</div>
      {right}
    </div>
  );
}

const MONEY_COLUMNS = new Set(["Budget", "Spend", "Revenue", "Amount"]);

/** Renders a rules ReportTable. Money columns show as $1,234.50; wide tables scroll in their own box. */
export function ReportTableCard({ table, empty }: { table: ReportTable; empty: string }) {
  return (
    <Card className="p-0">
      <div className="border-b border-line px-4 py-3 font-display text-sm font-bold text-ink">{table.title}</div>
      {table.rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs italic text-gray-400">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="rounded-none border-0">
            <THead><tr>{table.columns.map((c, i) => <TH key={c} className={i > 0 ? "text-right" : ""}>{c}</TH>)}</tr></THead>
            <tbody>
              {table.rows.map((r, i) => (
                <TR key={i}>
                  {r.map((v, j) => (
                    <TD key={j} className={j === 0 ? "min-w-40 font-semibold text-ink" : "whitespace-nowrap text-right tabular-nums"}>
                      {typeof v === "number" && MONEY_COLUMNS.has(table.columns[j]!) ? cents(v) : v}
                    </TD>
                  ))}
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  );
}

/** Rating as words and stars, never colour alone. */
export function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink" aria-label={`${rating} out of 5 stars`}>
      <span aria-hidden className="tracking-tight text-amber-500">{"★".repeat(rating)}<span className="text-gray-300">{"★".repeat(5 - rating)}</span></span>
      {rating} of 5
    </span>
  );
}

/** A confirmation that lists what will change before anything reaches customers or other records. */
export type Confirm = { title: string; body: ReactNode; label: string; tone?: "danger" | "primary"; run: () => void };

export function useConfirm() {
  const [confirm, setConfirm] = useState<Confirm>();
  const dialog = (
    <ConfirmDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(undefined)} title={confirm?.title ?? ""} body={confirm?.body} confirmLabel={confirm?.label} tone={confirm?.tone ?? "primary"} onConfirm={() => { confirm?.run(); setConfirm(undefined); }} />
  );
  return { setConfirm, dialog };
}

/** Field error lookup for the { field, message } error returned by a store action. */
export type FieldErr = { field?: string; message: string };
export const errFor = (err: FieldErr | undefined, k: string) => (err?.field === k ? err.message : undefined);
