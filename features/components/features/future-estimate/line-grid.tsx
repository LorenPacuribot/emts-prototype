"use client";
/**
 * Copied line grid (Wireframe). Each line keeps its source job and source
 * application. Prior actual usage is reference only: the new quantity is
 * never filled from it. Every line must be reconfirmed before issue.
 */
import { useEffect, useState } from "react";
import { ArrowRightLeft, CircleSlash, ClipboardCheck, Info, Trash2 } from "lucide-react";
import type { RepeatEstimate, RepeatEstimateLine } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { decideReplacement, lineSurface, removeRepeatLine, repPricing, setLineReconfirmed, updateRepeatLine, type LinePatch } from "@/features/lib/store/actions/future-estimate";
import { CONDITION_LABEL, PREP_LABEL, reconfirmGaps } from "@/features/lib/rules/future-estimate";
import { can } from "@/features/lib/permissions";
import { money, num } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { catalogFor } from "@/features/lib/selectors";
import { Badge, Button, ConfirmDialog, EmptyState, Input, RowMenu, Select, Swatch, Switch, Table, TD, TH, THead, TR, Tooltip } from "@/features/components/ui";
import { SourceChip, UnverifiedBadge } from "./shared";

export function LineGrid({ rep, readOnly, onPropose, onAddSurfaces }: { rep: RepeatEstimate; readOnly: boolean; onPropose: (line: RepeatEstimateLine) => void; onAddSurfaces: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const pricing = repPricing(db, rep);
  const [removing, setRemoving] = useState<RepeatEstimateLine>();

  if (rep.lines.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardCheck />}
        title="No surfaces on this estimate."
        body="Choose surfaces from prior jobs to copy them in."
        action={!readOnly && <Button variant="primary" onClick={onAddSurfaces}>Select Surfaces</Button>}
      />
    );
  }

  const patch = (line: RepeatEstimateLine, p: LinePatch) => act(updateRepeatLine, rep.id, line.id, p);

  return (
    <>
      <p className="mb-3 flex items-start gap-1.5 text-xs text-gray-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Copied lines carry surfaces, measurements, colors, products, sheen and coats only. No approval or completion state comes across from the source job.
      </p>
      <Table>
        <THead>
          <tr>
            <TH>Surface</TH>
            <TH className="text-right">Measure</TH>
            <TH>Color</TH>
            <TH>Product · Sheen · Coats</TH>
            <TH>Source</TH>
            <TH className="text-right">Prior actual (ref)</TH>
            <TH>New qty (gal)</TH>
            <TH>Preparation</TH>
            <TH>Current condition</TH>
            <TH>Price</TH>
            <TH>Reconfirmed</TH>
            <TH />
          </tr>
        </THead>
        <tbody>
          {rep.lines.map((line) => {
            const { surface, area } = lineSurface(db, line);
            const lp = pricing.lines.find((p) => p.line.id === line.id)!;
            const gaps = reconfirmGaps(line);
            const cat = catalogFor(db, line.product);
            const rp = line.replacement;
            const canDecide = rp?.status === "proposed" && can(user, rp.approver === "office" ? "repeat.approveReplacementOffice" : "repeat.approveReplacementOwner");
            return (
              <TR key={line.id} className={cn(line.reconfirmed && "bg-green-50/40")}>
                <TD className="min-w-40">
                  <div className="font-semibold text-ink">{surface?.name}</div>
                  <div className="text-xs text-gray-500">{area?.name} · {area?.kind === "exterior" ? "Exterior" : "Interior"}</div>
                  {line.unverified && <div className="mt-1"><UnverifiedBadge note={line.sourceNote} /></div>}
                  {line.specOnly && <div className="mt-1"><Badge tone="purple">Specification only</Badge></div>}
                </TD>
                <TD className="min-w-32">
                  <NumInput value={line.sqft} disabled={readOnly} step={1} ariaLabel={`Measurement for ${surface?.name}`} onCommit={(v) => v !== undefined && patch(line, { sqft: v })} />
                  <div className="mt-0.5 text-xs text-gray-500">
                    sq ft{surface && surface.areaSqft !== line.sqft ? ` · recorded ${num(surface.areaSqft)}` : " · as recorded"}
                  </div>
                </TD>
                <TD className="min-w-40">
                  <div className="flex items-center gap-2">
                    <Swatch hex={line.hex} size="sm" />
                    <span>{line.colourLabel}</span>
                  </div>
                  {line.tintFormula && <div className="mt-0.5 text-xs text-gray-500">Tint {line.tintFormula} (store review)</div>}
                </TD>
                <TD className="min-w-48">
                  <div>{line.product}</div>
                  <div className="text-xs text-gray-500">{line.sheen} · {line.coats} coat{line.coats === 1 ? "" : "s"}</div>
                  {cat?.discontinued && !rp && <Badge tone="red" icon={<CircleSlash className="h-3 w-3" />} className="mt-1">Discontinued</Badge>}
                  {!cat && <Badge tone="amber" className="mt-1">No current catalog price</Badge>}
                  {rp && (
                    <div className="mt-1 space-y-1">
                      <Badge tone={rp.status === "approved" ? "green" : rp.status === "rejected" ? "red" : "amber"}>
                        {rp.status === "approved" ? `Replaced (was ${rp.oldProduct})` : rp.status === "rejected" ? "Replacement rejected" : `→ ${rp.newProduct} · ${rp.approver === "office" ? "office" : "owner"} approval`}
                      </Badge>
                      {rp.document === "ChangeOrder" && <div className="max-w-56 text-xs font-medium text-red-700">Needs a priced change order signed by the customer before ordering.</div>}
                      {canDecide && !readOnly && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="success" className="h-6 px-2 text-xs" onClick={() => act(decideReplacement, rep.id, line.id, true).ok && toast.success("Replacement approved", "Reconfirm the line at the new product.")}>Approve</Button>
                          <Button size="sm" variant="danger" className="h-6 px-2 text-xs" onClick={() => act(decideReplacement, rep.id, line.id, false).ok && toast.success("Replacement rejected")}>Reject</Button>
                        </div>
                      )}
                    </div>
                  )}
                </TD>
                <TD><SourceChip jobId={line.sourceJobId} appId={line.sourceApplicationId} /></TD>
                <TD className="text-right">
                  {line.priorActualGal !== undefined || line.priorActualHours !== undefined ? (
                    <Tooltip content="Reference only. It never fills the new quantity or hours.">
                      <span className="inline-flex cursor-help flex-col items-end gap-0.5">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{line.priorActualGal !== undefined ? `${line.priorActualGal} gal used` : "Gallons not recorded"}</span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{line.priorActualHours !== undefined ? `${line.priorActualHours} h labor` : "Hours not recorded"}</span>
                      </span>
                    </Tooltip>
                  ) : (
                    <span className="text-xs italic text-gray-500">Not recorded</span>
                  )}
                </TD>
                <TD className="min-w-28">
                  <NumInput value={line.newQtyGal} disabled={readOnly} placeholder="Enter" step={0.25} ariaLabel={`New quantity for ${surface?.name}`} invalid={gaps.includes("quantity") && !readOnly} onCommit={(v) => patch(line, { newQtyGal: v })} />
                </TD>
                <TD className="min-w-40">
                  <Select value={line.prep ?? ""} disabled={readOnly} invalid={gaps.includes("preparation") && !readOnly} aria-label="Preparation" className="h-9" onChange={(e) => patch(line, { prep: (e.target.value || undefined) as RepeatEstimateLine["prep"] })}>
                    <option value="">Choose…</option>
                    {Object.entries(PREP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </TD>
                <TD className="min-w-32">
                  <Select value={line.condition ?? ""} disabled={readOnly} invalid={gaps.includes("condition") && !readOnly} aria-label="Current condition" className="h-9" onChange={(e) => patch(line, { condition: (e.target.value || undefined) as RepeatEstimateLine["condition"] })}>
                    <option value="">Observe…</option>
                    {Object.entries(CONDITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </TD>
                <TD className="min-w-36">
                  <NumInput value={line.price} disabled={readOnly} placeholder="$ price" step={1} ariaLabel={`Price for ${surface?.name}`} invalid={gaps.includes("price") && !readOnly} onCommit={(v) => patch(line, { price: v })} />
                  {!readOnly && lp.basis > 0 && line.price !== lp.basis && (
                    <button className="mt-1 block text-xs font-semibold text-brand hover:underline" onClick={() => patch(line, { price: lp.basis })}>
                      {lp.basisSource === "previous" ? "Use last time's price" : "Use current basis"} {money(lp.basis)}
                    </button>
                  )}
                  {lp.suggested.missingMaterialPrice && <div className="mt-0.5 text-xs text-amber-700">Material not priced</div>}
                </TD>
                <TD>
                  <Tooltip content={gaps.length ? `Enter ${gaps.join(", ")} first` : line.reconfirmed ? "Reconfirmed" : "Reconfirm quantity, preparation, condition and price"}>
                    <span>
                      <Switch
                        checked={line.reconfirmed}
                        disabled={readOnly}
                        onCheckedChange={(v) => {
                          const res = act(setLineReconfirmed, rep.id, line.id, v);
                          if (res.ok && v) toast.success("Line reconfirmed", `${area?.name} ${surface?.name}`);
                        }}
                        label={<span className={cn("text-xs font-semibold", line.reconfirmed ? "text-green-700" : "text-gray-500")}>{line.reconfirmed ? "Yes" : "No"}</span>}
                      />
                    </span>
                  </Tooltip>
                </TD>
                <TD>
                  {!readOnly && (
                    <RowMenu
                      items={[
                        { label: "Propose replacement product", icon: <ArrowRightLeft />, onSelect: () => onPropose(line), disabled: rp?.status === "proposed", reason: "A proposal is awaiting approval" },
                        { label: "Remove line", icon: <Trash2 />, danger: true, onSelect: () => setRemoving(line) },
                      ]}
                    />
                  )}
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(undefined)}
        title="Remove this line?"
        body={removing && `${lineSurface(db, removing).surface?.name} will be taken off ${rep.id}. You can select it again from history.`}
        confirmLabel="Remove line"
        onConfirm={() => removing && act(removeRepeatLine, rep.id, removing.id).ok && toast.success("Line removed")}
      />
    </>
  );
}

/** Number input that commits on blur or Enter, so partial typing ("1.") is not lost. */
function NumInput({ value, onCommit, disabled, placeholder, step, ariaLabel, invalid }: {
  value?: number;
  onCommit: (v: number | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
  step?: number;
  ariaLabel: string;
  invalid?: boolean;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => setText(value === undefined ? "" : String(value)), [value]);
  const commit = () => {
    const v = text.trim() === "" ? undefined : Number(text);
    if (v !== undefined && (Number.isNaN(v) || v < 0)) {
      toast.error("Enter a positive number");
      setText(value === undefined ? "" : String(value));
      return;
    }
    if (v !== value) onCommit(v);
  };
  return (
    <Input
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      invalid={invalid}
      className="h-9 w-28"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
