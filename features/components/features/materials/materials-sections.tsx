"use client";
/**
 * NEW (features 18 and 19) — "Materials" and "Paint Orders" sections on the
 * work order (/work-orders/[id]), after the live Paint Color Card.
 *
 * Materials (18): header actions (Recalculate, Preliminary List, Generate
 * Paint Order, Export), calculation summary strip, demand table, quantity
 * states (Rule 2), leftover shelf, consumables and equipment rentals.
 * Paint Orders (19): the job's supplier orders; the drawer holds Select
 * Supplier/Store, Send Order with evidence, statuses and receiving.
 * For an estimator, every price column is absent rather than masked.
 */
import { useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AlertTriangle, Calculator, ChevronDown, ClipboardList, Download, FilePlus2, Printer, RefreshCw, Send } from "lucide-react";
import type { Job } from "@/features/types";
import { act, useCurrentUser, useDb, useStore } from "@/features/lib/store";
import { setPackingStrategy } from "@/features/lib/store/actions/materials";
import { money, num } from "@/features/lib/format";
import { formatPacks } from "@/features/lib/rules/materials";
import { COVERAGE_LABEL, assumptionChanges, isStale, jobDemand, lineState, packsCost } from "@/features/lib/rules/procurement";
import { downloadCsv, printElement } from "@/features/lib/export";
import { toast } from "@/features/lib/toast";
import { Badge, Banner, Button, Card, CardLabel, CardTitle, EmptyState, LiveCard, NewBadge, Select, Stat, StatStrip, Tooltip } from "@/features/components/ui";
import { OrderDrawer } from "@/features/components/features/procurement/order-drawer";
import { useSupplierInbox } from "@/features/lib/integrations/supplier-live";
import { procurementPerms } from "@/features/components/features/procurement/shared";
import { DemandTable } from "./demand-table";
import { QuantityPanel } from "./quantity-panel";
import { ShelfPanel } from "./shelf-panel";
import { ConsumablesPanel, RentalsPanel } from "./allowance-panel";
import { OrderBuilder } from "./order-builder";
import { ApprovalsPanel, JobOrdersPanel, PreliminaryListModal, RecalcModal } from "./side-panels";

export function MaterialsSections({ job }: { job: Job }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  useSupplierInbox();
  const printRef = useRef<HTMLDivElement>(null);
  useStore((s) => s.clockMode);
  const [builder, setBuilder] = useState(false);
  const [builderKey, setBuilderKey] = useState(0);
  const [prelim, setPrelim] = useState(false);
  const [recalc, setRecalc] = useState(false);
  const [openPo, setOpenPo] = useState<string>();

  const lines = jobDemand(db, job.id);
  const snapshot = (db.materialCalcs ?? []).find((c) => c.jobId === job.id);
  const stale = isStale(snapshot, lines);
  const changes = assumptionChanges(db, job.id, lines);
  const orderable = lines.filter((l) => l.blocked.length === 0);
  const blocked = lines.filter((l) => l.blocked.length > 0);
  // Unsigned jobs have no orderable lines; summarise every calculable line instead.
  const summary = orderable.length ? orderable : lines.filter((l) => l.catalog && l.parts.length);
  const sources = Array.from(new Set(summary.map((l) => COVERAGE_LABEL[l.source])));
  const wastes = Array.from(new Set(summary.map((l) => Math.round(l.waste * 100)))).sort((a, b) => a - b);
  const measured = summary.reduce((a, l) => a + l.measuredSqft, 0);
  const coatAdj = summary.reduce((a, l) => a + l.coatSqft, 0);
  const orderableNow = orderable.reduce((a, l) => a + lineState(db, job.id, l.specId, l.needGal).orderableNow, 0);
  const readOnly = !perms.requestOrder;
  const signed = job.contractSigned;
  const canOrder = signed && (perms.generate || perms.requestOrder);
  const strategy = db.procurementSettings?.packingStrategy ?? "least_leftover";

  function exportCsv() {
    downloadCsv(`${job.id}-materials.csv`, [
      ["Spec", "Product", "Colour", "Sheen", "Surfaces", "Measured sq ft", "Coat-adjusted sq ft", "Coverage rate", "Coverage source", "Base need gal", "Waste %", "Adjusted need gal", "Packs", "Excess gal", "Outstanding gal", "Orderable now gal", "Status", ...(perms.seePrices ? ["Current cost"] : [])],
      ...lines.map((l) => {
        const s = lineState(db, job.id, l.specId, l.needGal);
        return [l.specId, l.spec.product, `${l.colourName} ${l.colourNumber}`, l.spec.sheen, l.parts.length, l.measuredSqft, l.coatSqft, l.rate, COVERAGE_LABEL[l.source], l.baseNeedGal.toFixed(3), Math.round(l.waste * 100), l.needGal.toFixed(3),
          l.blocked.length ? "" : formatPacks(l.packs.packs), l.blocked.length ? "" : l.packs.excessGal, s.outstanding, s.orderableNow, l.blocked.length ? `Blocked: ${l.blocked.join("; ")}` : "Orderable",
          ...(perms.seePrices ? [l.catalog && !l.blocked.length ? packsCost(l.packs.packs, l.catalog.cost).toFixed(2) : ""] : [])];
      }),
    ]);
    toast.success("CSV exported", perms.seePrices ? undefined : "Quantities only — no prices are included for your role.");
  }

  return (
    <>
      <LiveCard isNew id="section-materials" data-tour="wo-materials">
      <CardTitle icon={<Calculator />} badge={<NewBadge feature={18} />}
        right={
          <>
            {perms.requestOrder && <Button onClick={() => setRecalc(true)}><RefreshCw className="h-4 w-4" /> Recalculate</Button>}
            <Button onClick={() => setPrelim(true)}><ClipboardList className="h-4 w-4" /> Preliminary List</Button>
            {(perms.generate || perms.requestOrder) && (
              <Tooltip content={!signed ? "Job not signed — preliminary list only" : stale ? "Recalculate first" : perms.generate ? "Generate a priced order" : "Request submission from the office"}>
                <span>
                  <Button variant="primary" disabled={!canOrder || stale} onClick={() => { setBuilderKey((k) => k + 1); setBuilder(true); }}>
                    {perms.generate ? <FilePlus2 className="h-4 w-4" /> : <Send className="h-4 w-4" />} {perms.generate ? "Generate Paint Order" : "Request Order"}
                  </Button>
                </span>
              </Tooltip>
            )}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button><Download className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5" /></Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-xl border border-line bg-white p-1 shadow-xl">
                  <DropdownMenu.Item onSelect={exportCsv} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100"><Download className="h-3.5 w-3.5" /> CSV</DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => printElement(printRef.current, `${job.id} material calculation`)} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100"><Printer className="h-3.5 w-3.5" /> Print / PDF</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </>
        }
      >Materials</CardTitle>
      <p className="-mt-3 mb-4 text-sm text-gray-500">How much paint to buy for this job, given what we already have, and what has been ordered and received.</p>

      {!signed && (
        <Banner tone="info" className="mb-4" title="Draft estimate — preliminary list only">
          This job isn't signed. You can produce a preliminary shopping list; it carries no PO number and can't be sent to a supplier.
        </Banner>
      )}
      {stale && (
        <Banner tone="warn" className="mb-4" title="Scope or rates changed since last calculation. Recalculate to update." action={perms.requestOrder && <Button size="sm" onClick={() => setRecalc(true)}><RefreshCw className="h-3.5 w-3.5" /> Recalculate</Button>}>
          The previous figures stay visible (“was …”) until the new result is accepted. Ordering is paused until then.
        </Banner>
      )}
      {user.role === "crew_lead" && <Banner tone="info" className="mb-4">Crew leads can confirm shelf stock and record receipts. Ordering is done by the office.</Banner>}

      <StatStrip className="mb-4">
        <Stat label="Coverage source in use" value={<span className="text-base">{sources.join(" + ") || "—"}</span>} hint={summary.map((l) => `${l.rate}`).join(" / ") + (summary.length ? " sq ft/gal" : "")} />
        <Stat label="Waste applied" value={wastes.length ? wastes.map((w) => `${w}%`).join(" / ") : "—"} hint="highest match only" />
        <Stat label="Total measured area" value={`${num(measured)} sq ft`} />
        <Stat label="Total coat-adjusted area" value={`${num(coatAdj)} sq ft`} />
        <Stat label="Orderable now" value={`${orderableNow.toFixed(2)} gal`} tone={orderableNow > 0 ? "brand" : "default"} hint={`${orderable.length} of ${lines.length} lines orderable`} />
        {changes.length > 0 && (
          <div className="flex items-center">
            <Tooltip content={
              <div className="space-y-1">
                {changes.map((c) => (
                  <div key={c.specId}>
                    {c.label}: {c.rateChanged && `coverage ${c.approvedRate} → ${c.currentRate} sq ft/gal`}{c.rateChanged && c.costChanged && perms.seePrices && "; "}{c.costChanged && perms.seePrices && `cost ${money(c.approvedCost)} → ${money(c.currentCost)}/gal`}
                  </div>
                ))}
                <div className="opacity-70">The approved estimate still governs the customer price.</div>
              </div>
            }>
              <span><Badge tone="amber" className="whitespace-normal" icon={<AlertTriangle className="h-3 w-3 shrink-0" />}>Coverage or cost changed since estimate approval</Badge></span>
            </Tooltip>
          </div>
        )}
      </StatStrip>

      <div className="space-y-4">
        <div data-tour="materials-approvals" className="empty:hidden">
          <ApprovalsPanel job={job} onViewOrder={setOpenPo} />
        </div>

        <div ref={printRef}><Card className="p-4" data-tour="demand-table">
          <CardLabel icon={<Calculator />} right={
            perms.editCatalog ? (
              <label className="flex items-center gap-2 text-xs text-gray-500">Packing
                <Select className="h-8 w-auto py-0 text-xs" value={strategy} onChange={(e) => act(setPackingStrategy, e.target.value as "least_leftover" | "lowest_price").ok && toast.success("Packing objective changed")}>
                  <option value="least_leftover">Least leftover</option>
                  <option value="lowest_price">Lowest price</option>
                </Select>
              </label>
            ) : <span className="text-xs text-gray-500">Packing: {strategy === "least_leftover" ? "Least leftover" : "Lowest price"}</span>
          }>Measured demand</CardLabel>
          <p className="mt-1 text-xs text-gray-500">Coverage rate, then waste, then container packing — in that order. Full precision is kept; only the adjusted need is rounded, once, to three decimals.</p>
          <div className="mt-3">
            {lines.length === 0 ? (
              <EmptyState icon={<Calculator />} title="No colour specifications yet." body="Add specifications on the Color Card. Demand is calculated from approved specifications and their surfaces." />
            ) : (
              <DemandTable lines={lines} snapshot={snapshot} stale={stale} readOnly={readOnly} />
            )}
          </div>
          {blocked.length > 0 && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50/50 p-3">
              <div className="text-xxs font-bold uppercase tracking-[0.14em] text-red-700">Not orderable ({blocked.length})</div>
              <div className="mt-2 space-y-1 text-xs text-red-900">
                {blocked.map((l) => <div key={l.specId}><strong>{l.specId} · {l.colourName}</strong> — {l.blocked.join("; ")}</div>)}
              </div>
            </div>
          )}
        </Card></div>

        <div data-tour="quantity-panel">
          <QuantityPanel lines={lines} />
        </div>
        <div data-tour="shelf-panel">
          <ShelfPanel lines={lines} readOnly={readOnly && !perms.confirmShelf} />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 [&>*]:min-w-0">
          <ConsumablesPanel job={job} />
          <RentalsPanel job={job} readOnly={readOnly} />
        </div>
      </div>
      </LiveCard>

      <LiveCard isNew id="section-paint-orders" data-tour="wo-paint-orders">
        <CardTitle icon={<Send />} badge={<NewBadge feature={19} />}>Paint Orders</CardTitle>
        <p className="-mt-3 mb-4 text-sm text-gray-500">Supplier orders for this job. Open one to select the supplier and store, send it with evidence, and record acknowledgment, pickup or delivery.</p>
        <JobOrdersPanel job={job} onOpen={setOpenPo} />
      </LiveCard>

      {builder && <OrderBuilder key={builderKey} open={builder} job={job} lines={lines} onClose={() => setBuilder(false)} onViewOrder={(id) => { setBuilder(false); setOpenPo(id); }} />}
      <PreliminaryListModal open={prelim} job={job} lines={lines} onClose={() => setPrelim(false)} />
      <RecalcModal open={recalc} job={job} lines={lines} snapshot={snapshot} onClose={() => setRecalc(false)} />
      <OrderDrawer poId={openPo} onClose={() => setOpenPo(undefined)} />
    </>
  );
}
