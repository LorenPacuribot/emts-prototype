"use client";
/**
 * Estimator comparison view against the source job(s). Internal only: the
 * customer sees the new quote and nothing else.
 */
import { GitCompareArrows } from "lucide-react";
import type { RepeatEstimate } from "@/features/types";
import { useDb } from "@/features/lib/store";
import { historicalJob, lineSurface } from "@/features/lib/store/actions/future-estimate";
import { byId, surfaceLabel } from "@/features/lib/selectors";
import { dateLong, money, num } from "@/features/lib/format";
import { roundMoney } from "@/features/lib/rules/rounding";
import { cn } from "@/features/lib/cn";
import { Badge, Banner, CardLabel, Drawer, EmptyState, IdChip, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { InternalOnly } from "./shared";

export function ComparisonDrawer({ rep, open, onOpenChange }: { rep: RepeatEstimate; open: boolean; onOpenChange: (v: boolean) => void }) {
  const db = useDb((d) => d);
  const jobIds = Array.from(new Set(rep.lines.map((l) => l.sourceJobId).filter(Boolean))) as string[];
  const jobs = jobIds.map((id) => historicalJob(db, id)).filter(Boolean) as NonNullable<ReturnType<typeof historicalJob>>[];
  const oldSurfaceIds = Array.from(new Set(jobs.flatMap((j) => Object.keys(j.linePrices))));
  const newSurfaceIds = rep.lines.map((l) => l.surfaceId);
  const removed = oldSurfaceIds.filter((id) => !newSurfaceIds.includes(id));
  const added = rep.lines.filter((l) => !oldSurfaceIds.includes(l.surfaceId));
  const oldPrice = (surfaceId: string) => jobs.find((j) => j.linePrices[surfaceId] !== undefined)?.linePrices[surfaceId];
  const oldTotal = roundMoney(oldSurfaceIds.reduce((s, id) => s + (oldPrice(id) ?? 0), 0));
  const newTotal = roundMoney(rep.lines.reduce((s, l) => s + (l.price ?? 0), 0));
  const diff = roundMoney(newTotal - oldTotal);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Comparison view"
      subtitle={<span className="flex flex-wrap items-center gap-2">{rep.id} against {jobIds.join(", ") || "no source job"} <InternalOnly /></span>}
    >
      {jobs.length === 0 ? (
        <EmptyState icon={<GitCompareArrows />} title="No source job to compare against." body="Lines copied from customer-reported history have no old job price." />
      ) : (
        <>
          <Banner tone="info" title="Internal only">Historical prices and these notes never appear on the customer quote or its PDF.</Banner>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Old job(s)" value={money(oldTotal)} />
            <Stat label="New quote" value={money(newTotal)} />
            <Stat label="Difference" value={`${diff >= 0 ? "+" : ""}${money(diff)}`} tone={diff >= 0 ? "text-green-700" : "text-red-600"} />
          </div>
          <div className="space-y-1 text-xs text-gray-500">
            {jobs.map((j) => (
              <div key={j.id} className="flex flex-wrap items-center gap-2">
                <IdChip tone="blue">{j.id}</IdChip> {j.name} · completed {dateLong(j.completedAt)}
                {j.discountPct && <Badge tone="amber">{j.discountPct}% discount then (not carried forward)</Badge>}
              </div>
            ))}
          </div>

          <div>
            <CardLabel className="mb-2">Surfaces</CardLabel>
            <Table>
              <THead>
                <tr>
                  <TH>Surface</TH>
                  <TH>Change</TH>
                  <TH className="text-right">Recorded sq ft</TH>
                  <TH className="text-right">New sq ft</TH>
                  <TH className="text-right">Old price</TH>
                  <TH className="text-right">New price</TH>
                  <TH className="text-right">Difference</TH>
                </tr>
              </THead>
              <tbody>
                {rep.lines.map((l) => {
                  const { surface } = lineSurface(db, l);
                  const op = oldPrice(l.surfaceId);
                  const d = op !== undefined && l.price !== undefined ? roundMoney(l.price - op) : undefined;
                  const mDiff = surface ? l.sqft - surface.areaSqft : 0;
                  return (
                    <TR key={l.id}>
                      <TD>{surfaceLabel(db, l.surfaceId)}</TD>
                      <TD>{added.includes(l) ? <Badge tone="green">Added</Badge> : <Badge tone="gray">Carried</Badge>}</TD>
                      <TD className="text-right">{surface ? num(surface.areaSqft) : "—"}</TD>
                      <TD className={cn("text-right", mDiff !== 0 && "font-semibold text-amber-700")}>{num(l.sqft)}{mDiff !== 0 && ` (${mDiff > 0 ? "+" : ""}${mDiff})`}</TD>
                      <TD className="text-right">{money(op)}</TD>
                      <TD className="text-right">{l.price !== undefined ? money(l.price) : <span className="italic text-gray-500">Not priced</span>}</TD>
                      <TD className={cn("text-right", d !== undefined && (d >= 0 ? "text-green-700" : "text-red-600"))}>{d !== undefined ? `${d >= 0 ? "+" : ""}${money(d)}` : "—"}</TD>
                    </TR>
                  );
                })}
                {removed.map((id) => (
                  <TR key={id} className="bg-red-50/40">
                    <TD className="line-through">{surfaceLabel(db, id)}</TD>
                    <TD><Badge tone="red">Removed{byId(db.surfaces, id)?.removedAt ? " (surface replaced)" : ""}</Badge></TD>
                    <TD className="text-right">{num(byId(db.surfaces, id)?.areaSqft ?? 0)}</TD>
                    <TD className="text-right">—</TD>
                    <TD className="text-right">{money(oldPrice(id))}</TD>
                    <TD className="text-right">—</TD>
                    <TD className="text-right text-red-600">−{money(oldPrice(id))}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}
    </Drawer>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="text-xxs font-bold uppercase tracking-[0.12em] text-gray-500">{label}</div>
      <div className={cn("mt-1 font-display text-base font-bold text-ink", tone)}>{value}</div>
    </div>
  );
}
