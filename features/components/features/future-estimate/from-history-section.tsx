"use client";
/**
 * NEW (feature 28) — "From history" section on Estimate Details, shown when
 * the estimate was started from a service location's paint history.
 *
 * Copied lines with reference actuals and reconfirmation, the inspection
 * gate, the pricing basis (keep or update), the customer clause, the
 * comparison view and the quote print. The live toolbar's "Send" issues the
 * quote once the blockers listed here are cleared.
 */
import { useState } from "react";
import { ClipboardCheck, FileText, GitCompareArrows, History, Layers, Printer, Send } from "lucide-react";
import type { Estimate, RepeatEstimate } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { addRepeatLines, issueBlockers, linkExistingRecord, repGate, repPricing, setQuoteClause } from "@/features/lib/store/actions/future-estimate";
import { refreshHistoryScope } from "@/features/lib/store/actions/history-estimate";
import { DIFFERING_CONDITIONS_CLAUSE } from "@/features/lib/rules/future-estimate";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { money } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { Banner, Button, Card, CardLabel, Checkbox, EstimateSection, Modal, NewBadge, SectionHeader, Stat, StatStrip } from "@/features/components/ui";
import { SurfaceSelector } from "./surface-selector";
import { LineGrid } from "./line-grid";
import { InspectionModal, InspectionPanel } from "./inspection";
import { PricingPanel } from "./pricing-panel";
import { ComparisonDrawer } from "./comparison-drawer";
import { QuotePrintModal } from "./quote-print";
import { ReplacementModal } from "./replacement-modal";
import { OwnershipBanner, WarningStrip } from "./shared";

export function FromHistorySection({ estimate, rep }: { estimate: Estimate; rep: RepeatEstimate }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const property = byId(db.properties, rep.propertyId)!;
  const readOnly = !can(user, "repeat.build") || rep.status !== "draft" || estimate.status !== "DRAFT";
  const { gate } = repGate(db, rep);
  const pricing = repPricing(db, rep);
  const blockers = rep.status === "draft" ? issueBlockers(db, rep) : [];
  const reconfirmed = rep.lines.filter((l) => l.reconfirmed).length;
  const [selectOpen, setSelectOpen] = useState(false);
  const [adding, setAdding] = useState<string[]>([]);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [proposeFor, setProposeFor] = useState<(typeof rep.lines)[number]>();

  return (
    <EstimateSection id="section-from-history" isNew>
      <SectionHeader
        icon={<History />}
        title="From history"
        badge={<NewBadge feature={28} />}
        subtitle={`Copied from ${Array.from(new Set(rep.lines.map((l) => l.sourceJobId ?? "customer-reported history"))).join(", ") || "—"} (${rep.id}). Reference actuals, inspection and pricing basis for this repeat estimate.`}
        right={
          <>
            {!readOnly && <Button size="sm" onClick={() => { setAdding([]); setSelectOpen(true); }}><Layers className="h-4 w-4" /> Select Surfaces</Button>}
            {!readOnly && <Button size="sm" onClick={() => setInspectOpen(true)} data-tour="record-inspection"><ClipboardCheck className="h-4 w-4" /> Record Inspection</Button>}
            <Button size="sm" onClick={() => setCompareOpen(true)}><GitCompareArrows className="h-4 w-4" /> Comparison View</Button>
            <Button size="sm" onClick={() => setPrintOpen(true)}><Printer className="h-4 w-4" /> Quote PDF</Button>
          </>
        }
      />

      <WarningStrip db={db} property={property} rep={rep} onLink={(k, ref) => act(linkExistingRecord, property.id, k, ref)} />
      <OwnershipBanner db={db} property={property} />

      <StatStrip className="mb-4">
        <Stat label="Copied lines" value={rep.lines.length} hint={`${new Set(rep.lines.map((l) => l.sourceJobId ?? l.sourceApplicationId)).size} source(s)`} />
        <Stat label="Reconfirmed" value={`${reconfirmed} of ${rep.lines.length}`} tone={reconfirmed === rep.lines.length && rep.lines.length ? "good" : "warn"} />
        <Stat label="Inspection" value={gate.met ? "Met" : "Required"} tone={gate.met ? "good" : "danger"} />
        <Stat label="Quote total" value={money(pricing.totals.total)} hint="incl. current tax" tone="brand" />
        <Stat label="Validity" value="30 days" hint="from Send" />
      </StatStrip>

      <div className="space-y-4">
        <Card className="p-5" data-tour="copied-lines">
          <CardLabel icon={<Layers />}>Copied lines · prior actuals for reference</CardLabel>
          <div className="mt-3">
            <LineGrid rep={rep} readOnly={readOnly} onPropose={setProposeFor} onAddSurfaces={() => { setAdding([]); setSelectOpen(true); }} />
          </div>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <div className="space-y-4">
            <Card className="p-5">
              <CardLabel icon={<FileText />}>Customer quote clause</CardLabel>
              <div className="mt-3 space-y-2">
                <Checkbox checked={!!rep.clauseIncluded} disabled={readOnly} onCheckedChange={(v) => act(setQuoteClause, rep.id, v)} label={<span className="font-semibold">Include the differing-conditions clause (required)</span>} />
                <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">{DIFFERING_CONDITIONS_CLAUSE}</p>
              </div>
            </Card>
            {rep.status === "draft" && (
              <Card className="p-5">
                <CardLabel icon={<Send />}>Before this estimate can be sent</CardLabel>
                {blockers.length === 0 ? (
                  <Banner tone="success" className="mt-3" title="Ready to send">Inspection recorded, every line reconfirmed and the clause included. Use Send in the toolbar.</Banner>
                ) : (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-red-700">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                )}
              </Card>
            )}
            {rep.status === "issued" && <Banner tone="success" title={`Sent ${rep.issuedAt?.slice(0, 10)}`}>The repeat record is issued with this estimate. Source-job links stay on every line.</Banner>}
          </div>
          <div className="space-y-4">
            <div data-tour="inspection-panel"><InspectionPanel rep={rep} readOnly={readOnly} onRecord={() => setInspectOpen(true)} /></div>
            <PricingPanel rep={rep} property={property} readOnly={readOnly} />
          </div>
        </div>
      </div>

      <Modal open={selectOpen} onOpenChange={setSelectOpen} size="xl" title="Select surfaces" description="Add more surfaces from any prior job at this address. Nothing is preselected."
        footer={<>
          <Button onClick={() => setSelectOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={adding.length === 0} onClick={() => {
            const res = act(addRepeatLines, rep.id, adding);
            if (res.ok) {
              act(refreshHistoryScope, estimate.id);
              toast.success(`${res.value} line${res.value === 1 ? "" : "s"} copied`, "Added to Area & Line Items. Reconfirm them before sending.");
              setSelectOpen(false);
            }
          }}>Copy {adding.length || ""} to estimate</Button>
        </>}>
        <SurfaceSelector db={db} property={property} selected={adding} onChange={setAdding} lockedSurfaceIds={rep.lines.map((l) => l.surfaceId)} />
      </Modal>
      {inspectOpen && <InspectionModal rep={rep} open={inspectOpen} onOpenChange={setInspectOpen} />}
      <ComparisonDrawer rep={rep} open={compareOpen} onOpenChange={setCompareOpen} />
      <QuotePrintModal rep={rep} open={printOpen} onOpenChange={setPrintOpen} />
      <ReplacementModal rep={rep} line={proposeFor} onClose={() => setProposeFor(undefined)} />
    </EstimateSection>
  );
}
