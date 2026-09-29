"use client";
/**
 * Components 18.1 and 18.2 — demand table with coverage source, waste,
 * packing and the line adjustment control.
 */
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, CircleSlash, Clock, Pencil, SlidersHorizontal } from "lucide-react";
import type { MaterialCalcSnapshot } from "@/features/types";
import { act, useCurrentUser } from "@/features/lib/store";
import { proposeAdjustment, setCoverageOverride, setWasteOverride } from "@/features/lib/store/actions/materials";
import { money, num } from "@/features/lib/format";
import { adjustmentNeedsApproval, formatPacks, PACK_LABEL } from "@/features/lib/rules/materials";
import { COVERAGE_LABEL, CONDITION_LABEL, packsCost, type DemandLine } from "@/features/lib/rules/procurement";
import { toast } from "@/features/lib/toast";
import { Badge, Banner, Button, Field, Input, KV, Modal, Swatch, Table, TD, TH, THead, TR, Textarea, Tooltip } from "@/features/components/ui";
import { cn } from "@/features/lib/cn";
import { procurementPerms } from "@/features/components/features/procurement/shared";
import { useErr } from "@/features/components/features/procurement/order-modals";

const g2 = (n: number) => n.toFixed(2);

export function DemandTable({ lines, snapshot, stale, readOnly }: { lines: DemandLine[]; snapshot?: MaterialCalcSnapshot; stale: boolean; readOnly: boolean }) {
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [adjust, setAdjust] = useState<DemandLine>();
  const [rate, setRate] = useState<DemandLine>();
  const [waste, setWaste] = useState<DemandLine>();

  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH className="w-8" />
            <TH>Product</TH>
            <TH>Color · sheen</TH>
            <TH className="text-right"><span className="ml-auto block max-w-[70px] whitespace-normal">Area with coats</span></TH>
            <TH>Coverage</TH>
            <TH className="text-right"><span className="ml-auto block max-w-[70px] whitespace-normal">Paint needed</span></TH>
            <TH>Waste</TH>
            <TH className="text-right"><span className="ml-auto block max-w-[70px] whitespace-normal">With waste</span></TH>
            <TH><span className="block max-w-[70px] whitespace-normal">Selected packs</span></TH>
            <TH className="text-right">Excess</TH>
            {perms.seePrices && <TH className="text-right"><span className="ml-auto block max-w-[70px] whitespace-normal">Current cost</span></TH>}
            <TH>Line</TH>
          </tr>
        </THead>
        <tbody>
          {lines.map((l) => {
            const prev = snapshot?.lines.find((s) => s.specId === l.specId);
            const blocked = l.blocked.length > 0;
            const expanded = open[l.specId];
            return (
              <Fragment key={l.specId}>
                <TR className={cn(blocked && "bg-red-50/30")}>
                  <TD className={cn("border-l-2", blocked ? "border-l-red-400" : "border-l-transparent")}>
                    <button onClick={() => setOpen({ ...open, [l.specId]: !expanded })} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label={expanded ? "Collapse line" : "Expand line"} aria-expanded={!!expanded}>
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </TD>
                  <TD>
                    <div className="max-w-[150px] font-semibold leading-snug text-ink">{l.spec.product ?? <span className="italic text-red-500">No product</span>}</div>
                    <div className="text-xs text-gray-400">{l.specId}{l.spec.productLine ? ` · ${l.spec.productLine}` : ""}</div>
                  </TD>
                  <TD>
                    <span className="flex max-w-[150px] items-start gap-2 leading-snug"><Swatch hex={l.hex} size="sm" className="mt-0.5" /> <span>{l.colourName}</span></span>
                    <div className="text-xs text-gray-400">{l.colourNumber} · {l.spec.sheen ?? "No sheen"}</div>
                  </TD>
                  <TD className="text-right tabular-nums">{num(l.coatSqft)}<div className="text-xs text-gray-400">{l.parts.length} surf. · {num(l.measuredSqft)} × {l.coats}</div></TD>
                  <TD>
                    <button onClick={() => setRate(l)} className="text-left">
                      <span className="tabular-nums font-medium text-ink">{l.rate || "—"}</span> <span className="text-gray-400">sq ft/gal</span>
                      <div className="mt-0.5 flex flex-col items-start gap-0.5"><Badge tone={l.source === "override" ? "purple" : l.source === "field_rate" ? "blue" : "gray"}>{COVERAGE_LABEL[l.source]}</Badge>{l.conditionRates.map((c) => <Badge key={c.condition} tone="amber">{CONDITION_LABEL[c.condition]} {c.rate}</Badge>)}</div>
                    </button>
                  </TD>
                  <TD className="text-right tabular-nums">{g2(l.baseNeedGal)}</TD>
                  <TD>
                    <Tooltip content={l.wasteOverride ? `Override: ${l.wasteOverride.reason}` : "Highest matching allowance only — never added together"}>
                      <button onClick={() => !readOnly && perms.requestOrder && setWaste(l)} className="tabular-nums">
                        {Math.round(l.waste * 100)}%{l.wasteOverride && <Badge tone="purple" className="ml-1">Override</Badge>}
                      </button>
                    </Tooltip>
                  </TD>
                  <TD className="text-right tabular-nums">
                    <span className="font-semibold text-ink">{g2(l.needGal)}</span>
                    {l.adjustment && <div className="text-xs text-purple-700">adjusted from {g2(l.calculatedNeedGal)}</div>}
                    {stale && prev && prev.adjustedNeedGal !== l.calculatedNeedGal && <div className="text-xs text-amber-700">was {g2(prev.adjustedNeedGal)}</div>}
                  </TD>
                  <TD>{blocked ? <span className="text-gray-400">—</span> : <div className="max-w-[120px] leading-snug">{formatPacks(l.packs.packs)}</div>}</TD>
                  <TD className="text-right tabular-nums">{blocked ? "—" : g2(l.packs.excessGal)}</TD>
                  {perms.seePrices && <TD className="text-right tabular-nums">{blocked || !l.catalog ? "—" : money(packsCost(l.packs.packs, l.catalog.cost))}</TD>}
                  <TD>
                    {blocked ? (
                      <Tooltip content={l.blocked.join(" · ")}>
                        <span className="inline-flex cursor-help items-center gap-1 whitespace-nowrap font-semibold text-red-600"><CircleSlash className="h-3.5 w-3.5" /> Blocked</span>
                      </Tooltip>
                    ) : l.pendingAdjustment ? (
                      <Badge tone="amber" icon={<Clock className="h-3 w-3" />}>Adjustment pending</Badge>
                    ) : !readOnly && perms.requestOrder ? (
                      <Button size="sm" onClick={() => setAdjust(l)}><SlidersHorizontal className="h-3.5 w-3.5" /> Adjust</Button>
                    ) : (
                      <Badge tone="green">Orderable</Badge>
                    )}
                  </TD>
                </TR>
                {expanded && (
                  <tr className="border-b border-line bg-gray-50/60">
                    <td colSpan={perms.seePrices ? 12 : 11} className="px-4 py-3">
                      <div className="text-xxs font-bold uppercase tracking-[0.12em] text-gray-400">Measured area, coats and the rate used per surface</div>
                      <table className="mt-2 w-full text-xs">
                        <thead>
                          <tr className="text-left text-xxs uppercase tracking-wider text-gray-400">
                            <th className="py-1 pr-3">Surface</th><th className="py-1 pr-3">Condition</th><th className="py-1 pr-3 text-right">Measured</th><th className="py-1 pr-3 text-right">Coats</th><th className="py-1 pr-3 text-right">Area with coats</th><th className="py-1 pr-3 text-right">Rate</th><th className="py-1 pr-3">Source</th><th className="py-1 text-right">Paint needed (exact)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {l.parts.map((p) => (
                            <tr key={p.surfaceId} className={p.rate <= 0 ? "text-red-600" : "text-gray-700"}>
                              <td className="py-1 pr-3">{p.areaName} · {p.name}</td>
                              <td className="py-1 pr-3">{CONDITION_LABEL[p.condition]}</td>
                              <td className="py-1 pr-3 text-right tabular-nums">{num(p.sqft)} sq ft</td>
                              <td className="py-1 pr-3 text-right">{l.coats}</td>
                              <td className="py-1 pr-3 text-right tabular-nums">{num(p.coatSqft)}</td>
                              <td className="py-1 pr-3 text-right tabular-nums">{p.rate || "—"}</td>
                              <td className="py-1 pr-3">{p.source === "missing" ? "No matching coverage rule" : p.source === "condition_rule" ? `${CONDITION_LABEL[p.condition]} rule` : COVERAGE_LABEL[p.source]}</td>
                              <td className="py-1 text-right font-mono tabular-nums">{p.baseNeedGal.toFixed(6)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
                        <span>Base {l.baseNeedGal.toFixed(6)} × (1 + {Math.round(l.waste * 100)}%) = {l.unroundedNeedGal.toFixed(6)} → rounded once to <strong>{l.calculatedNeedGal.toFixed(3)}</strong> gal</span>
                        <span>Openings over 20 sq ft are already deducted from measured area.</span>
                        {!blocked && <span>Packs: {l.packs.packs.map((p) => `${p.count} × ${PACK_LABEL[p.size]}`).join(" + ")} = {l.packs.totalGal} gal, leftover {l.packs.excessGal.toFixed(3)} gal</span>}
                      </div>
                      {l.adjustment && <div className="mt-1 text-xs text-purple-700">Adjustment {l.adjustment.id}: {l.adjustment.baselineGal.toFixed(3)} → {l.adjustment.proposedGal.toFixed(3)} gal ({(l.adjustment.pct * 100).toFixed(1)}%). “{l.adjustment.note}”</div>}
                      {blocked && <Banner tone="danger" className="mt-2" title="Blocked from ordering">{l.blocked.map((b) => <div key={b}>{b}</div>)}</Banner>}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </Table>
      <AdjustModal key={adjust?.specId} line={adjust} onClose={() => setAdjust(undefined)} canSelfApprove={perms.approveAdjust} />
      <RateModal key={`r${rate?.specId}`} line={rate} onClose={() => setRate(undefined)} canEdit={perms.editCatalog && !readOnly} />
      <WasteModal key={`w${waste?.specId}`} line={waste} onClose={() => setWaste(undefined)} />
    </>
  );
}

function AdjustModal({ line, onClose, canSelfApprove }: { line?: DemandLine; onClose: () => void; canSelfApprove: boolean }) {
  const [qty, setQty] = useState(line ? line.needGal.toFixed(3) : "");
  const [note, setNote] = useState("");
  const { run, e } = useErr();
  const proposed = Number(qty);
  const check = line && qty !== "" ? adjustmentNeedsApproval(line.unroundedNeedGal, proposed) : undefined;
  const save = () => {
    if (!line) return;
    const res = act(proposeAdjustment, line.jobId, line.specId, qty === "" ? NaN : proposed, note);
    if (run(res)) {
      const pending = (res as { value?: string }).value === "pending_approval";
      toast.success(pending ? "Sent for approval" : "Adjustment applied", pending ? "It takes effect once the owner or office manager approves it." : undefined);
      onClose();
    }
  };
  return (
    <Modal open={!!line} onOpenChange={(v) => !v && onClose()} title={`Adjust ${line?.specId ?? ""}`} description="Estimators may adjust from −10% to +10% of the unrounded calculated demand, with a note. Larger changes, or any addition to a zero baseline, need owner or office manager approval."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{check?.needsApproval && !canSelfApprove ? "Request approval" : "Apply adjustment"}</Button></>}>
      {line && (
        <div className="space-y-4">
          <KV items={[["Baseline (unrounded)", `${line.unroundedNeedGal.toFixed(6)} gal`], ["Calculated (rounded)", `${line.calculatedNeedGal.toFixed(3)} gal`], ["Self-approved band", `${(line.unroundedNeedGal * 0.9).toFixed(3)} – ${(line.unroundedNeedGal * 1.1).toFixed(3)} gal`]]} />
          <Field label="Proposed quantity (gal)" required error={e("proposed")}>
            <Input type="number" step="0.001" min="0" value={qty} onChange={(ev) => setQty(ev.target.value)} invalid={!!e("proposed")} />
          </Field>
          {check && (
            <Banner tone={check.needsApproval ? "warn" : "success"}>
              {Number.isFinite(check.pct) ? `${check.pct >= 0 ? "+" : ""}${(check.pct * 100).toFixed(1)}% against the baseline. ` : "Addition to a zero baseline. "}
              {check.needsApproval ? (canSelfApprove ? "Outside ±10% — you can approve this yourself." : "Outside ±10% — owner or office manager approval is required before it takes effect.") : "Within ±10% — applies straight away."}
            </Banner>
          )}
          <Field label="Note" required error={e("note")}>
            <Textarea value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Why does this line need a different quantity?" invalid={!!e("note")} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

function RateModal({ line, onClose, canEdit }: { line?: DemandLine; onClose: () => void; canEdit: boolean }) {
  const [rate, setRate] = useState("");
  const [reason, setReason] = useState("");
  const { run, e } = useErr();
  const save = (clear = false) => {
    if (!line) return;
    if (run(act(setCoverageOverride, line.jobId, line.specId, clear ? null : Number(rate), reason))) {
      toast.success(clear ? "Override removed" : "Project override set", "Recalculate to accept the new figures.");
      onClose();
    }
  };
  return (
    <Modal open={!!line} onOpenChange={(v) => !v && onClose()} title={`Coverage record · ${line?.spec.product ?? ""}`} description="Precedence: project override, then the contractor's proven field rate, then the manufacturer spread rate."
      footer={canEdit ? <><Button onClick={onClose}>Close</Button>{line?.source === "override" && <Button onClick={() => save(true)}>Remove override</Button>}<Button variant="primary" onClick={() => save()}><Pencil className="h-3.5 w-3.5" /> Set project override</Button></> : <Button onClick={onClose}>Close</Button>}>
      {line && (
        <div className="space-y-4">
          <KV items={[
            ["In use", `${line.rate} sq ft/gal — ${COVERAGE_LABEL[line.source]}`],
            ["Manufacturer rate", line.catalog ? `${line.catalog.spreadRate} sq ft/gal` : "—"],
            ["Field rate", line.catalog?.fieldRate ? `${line.catalog.fieldRate} sq ft/gal` : "Not recorded"],
            ["Condition rules", line.catalog?.conditionRates && Object.keys(line.catalog.conditionRates).length ? Object.entries(line.catalog.conditionRates).map(([k, v]) => `${CONDITION_LABEL[k as keyof typeof CONDITION_LABEL]} ${v}`).join(", ") : "None — non-sound surfaces are flagged"],
          ]} />
          {canEdit ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Override rate (sq ft/gal)" required error={e("rate")}><Input type="number" value={rate} onChange={(ev) => setRate(ev.target.value)} invalid={!!e("rate")} /></Field>
              <Field label="Reason" required error={e("reason")}><Input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. Chalky siding, test patch" invalid={!!e("reason")} /></Field>
            </div>
          ) : <p className="text-xs text-gray-500">Read-only for your role. The office manager or owner sets project overrides.</p>}
        </div>
      )}
    </Modal>
  );
}

function WasteModal({ line, onClose }: { line?: DemandLine; onClose: () => void }) {
  const [pct, setPct] = useState(line ? String(Math.round(line.waste * 100)) : "");
  const [reason, setReason] = useState("");
  const { run, e } = useErr();
  const save = (clear = false) => {
    if (!line) return;
    if (run(act(setWasteOverride, line.jobId, line.specId, clear ? null : Number(pct) / 100, reason))) {
      toast.success(clear ? "Waste override removed" : "Waste overridden", "Recalculate to accept the new figures.");
      onClose();
    }
  };
  return (
    <Modal open={!!line} onOpenChange={(v) => !v && onClose()} title={`Waste allowance · ${line?.specId ?? ""}`} description="Rule: 5% interior repaint, 10% exterior or spray, 15% rough surface. Only the highest match applies."
      footer={<><Button onClick={onClose}>Cancel</Button>{line?.wasteOverride && <Button onClick={() => save(true)}>Remove override</Button>}<Button variant="primary" onClick={() => save()}>Save override</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Waste %" required error={e("pct")}><Input type="number" value={pct} onChange={(ev) => setPct(ev.target.value)} invalid={!!e("pct")} /></Field>
        <Field label="Reason" required error={e("reason")}><Input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Required for any override" invalid={!!e("reason")} /></Field>
      </div>
    </Modal>
  );
}
