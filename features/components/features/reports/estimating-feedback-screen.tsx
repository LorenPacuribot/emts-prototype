"use client";
/**
 * Feature 30 — Estimating Performance Feedback.
 * Menu: Reports > Estimating Feedback
 *
 * One row per surface and product combination and rate. Opening a row shows
 * the evidence, the exclusions with their reasons, the calculation with the
 * real numbers substituted, a one-variable impact preview, the approval
 * panel naming the exact rate record, and the version history. Only the
 * business owner approves; the estimating manager curates and reviews.
 */
import { useState } from "react";
import { CalendarClock, Calculator, ClipboardCopy, Download, Gauge, History, ListChecks, RotateCcw, ShieldCheck, Undo2 } from "lucide-react";
import type { ActionResult, RateRecord } from "@/features/types";
import { act, useCurrentUser, useDb, useStore } from "@/features/lib/store";
import { useParam } from "@/features/lib/navigation";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { dateLong, money } from "@/features/lib/format";
import { downloadCsv } from "@/features/lib/export";
import { toast } from "@/features/lib/toast";
import { MIN_JOBS, PREVIEW_MARKUP, PREVIEW_PRICE_PER_GAL, PREVIEW_WAGE_PER_HOUR, comboLabel, impactPreview, wasteAdjustedGal } from "@/features/lib/rules/feedback";
import {
  allSuggestions, approveRate, completeReview, curatedBy, excludeEvidence, logEvidenceExport, openSuggestion, rateText, rejectRate, reopenSuggestion,
  restoreEvidence, reviewList, rollbackRate, runPreview, runReviewCheck, type Suggestion, type SuggestionStatus,
} from "@/features/lib/store/actions/feedback";
import { userName } from "@/features/lib/store/helpers";
import { PanelHeader as PageHeader } from "@/features/components/features/contacts/details/panel-header";
import { Badge, Banner, Button, Card, CardLabel, EmptyState, Field, Modal, PillTabs, Select, Stat, StatStrip, Table, TD, TH, THead, TR, Textarea } from "@/features/components/ui";
import { ReportsFrame } from "./reports-frame";
import { useCollection } from "@/lib/store";
import { matchingSurfaceRates, scaledRates } from "@/lib/feedback-rates";

/** Moves the Surface Rates matching a productivity record by the same proportion (patent 30). */
function useSurfaceRateUpdate() {
  const rates = useCollection("surfaceRates");
  const preview = (rate: RateRecord) => (rate.kind === "productivity" ? matchingSurfaceRates(rates.items, rate.comboKey) : []);
  const apply = (rate: RateRecord, from: number, to: number, version: number): string => {
    if (rate.kind !== "productivity") return "Coverage is set per product in Settings → Paint Library.";
    const targets = preview(rate);
    if (!from || !to || !targets.length) return "No surface rate matches this combination; update Settings → Surface Rates by hand.";
    const ratio = to / from;
    const pct = Math.round((ratio - 1) * 1000) / 10;
    for (const r of targets) {
      rates.update(r.id, { ...scaledRates(r, ratio), feedback: { rateId: rate.id, version, at: new Date().toISOString(), pct, previous: { rateCoat1: r.rateCoat1, rateCoat2: r.rateCoat2, rateCoat3: r.rateCoat3, rateCoat4: r.rateCoat4 } } });
    }
    return `Surface Rates updated ${pct >= 0 ? "+" : ""}${pct}%: ${targets.map((r) => r.name).join(", ")}.`;
  };
  return { preview, apply };
}

export function EstimatingFeedbackScreen() {
  return (
    <ReportsFrame tab="estimating_feedback">
      <Feedback />
    </ReportsFrame>
  );
}

const STATUS: Record<SuggestionStatus, { label: string; tone: "blue" | "gray" | "amber" | "green" | "purple" }> = {
  suggested: { label: "Suggested", tone: "blue" },
  insufficient: { label: "Insufficient evidence", tone: "gray" },
  suppressed: { label: "Rejected and suppressed", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  disabled: { label: "Coverage disabled", tone: "gray" },
};

const pct = (d: number | null) => (d === null ? "Not applicable" : `${d > 0 ? "+" : ""}${(d * 100).toFixed(2)}%`);
const kindLabel = (r: RateRecord) => (r.kind === "productivity" ? "Productivity" : "Coverage");

/** Tab body without the frame: the replica /reports page hosts it. */
export function Feedback() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [combo, setCombo] = useState("all");
  // Settings › Surface Rates links here with &rate= (NEW, feature 30).
  const [selected, setSelected] = useState(useParam("rate") ?? "RATE-P-A");
  const [history, setHistory] = useState(false);

  if (!can(user, "feedback.view")) {
    return (
      <>
        <PageHeader title="Estimating Feedback" subtitle="Labor production and coating coverage suggestions from completed work." />
        <EmptyState icon={<Gauge />} title="Estimating feedback is for the owner, the office manager and estimators." body="Switch role in the demo bar to see it." />
      </>
    );
  }

  const all = allSuggestions(db);
  const combos = [...new Set(all.map((s) => s.rate.comboKey))];
  const shown = combo === "all" ? all : all.filter((s) => s.rate.comboKey === combo);
  const current = all.find((s) => s.rate.id === selected) ?? shown[0];
  const reviews = reviewList(db);
  const due = reviews.filter((r) => r.state === "due" || r.state === "escalated");

  const select = (id: string) => {
    setSelected(id);
    act(openSuggestion, id);
  };

  const csv = () => {
    if (!current) return;
    const p = current.pool;
    downloadCsv(`evidence-${current.rate.id}.csv`, [
      [`Combination: ${p.label}`], [`Rate record: ${current.rate.id} (${current.rate.kind})`], [`Current: ${current.rate.value}; observed: ${current.observed.toFixed(2)}; eligible jobs: ${p.eligible.length}`],
      ["job", "completed", "status", "reason", "measured_sqft", "application_hours", "prep_hours", "travel_hours", "setup_hours", "rework_hours", "consumed_gal_incl_spills", "spills_gal", "waste_allowance", "coats", "coat_adjusted_sqft", "waste_adjusted_gal"],
      ...[...p.eligible.map((e) => ({ ...e, status: "included", why: "" })), ...p.excluded.map((e) => ({ ...e, status: "excluded", why: e.exclusion!.reason })), ...p.ineligible.map((e) => ({ ...e, status: "ineligible", why: e.check.reason ?? "" }))].map((e) => {
        const c = e.combo;
        return [e.job.id, e.job.completedAt.slice(0, 10), e.status, e.why, c?.measuredSqft, c?.applicationHours, c?.prepHours, c?.travelHours, c?.setupHours, c?.reworkHours, c?.consumedGal, c?.spillsGal, c?.wasteAllowance, c?.coats, c ? c.measuredSqft * c.coats : undefined, c ? wasteAdjustedGal(c).toFixed(4) : undefined];
      }),
    ]);
    act(logEvidenceExport, current.rate.comboKey);
    toast.success("Evidence exported", "Included, excluded and ineligible jobs, each with its reason.");
  };

  return (
    <>
      <PageHeader
        title="Estimating Feedback"
        subtitle="Where estimating assumptions drift from what happens in the field." details="How fast crews cover an area, and how far a gallon goes. Nothing about markup or selling price."
        actions={
          <>
            <Button onClick={csv} disabled={!current}><Download className="h-4 w-4" /> Export Evidence CSV</Button>
            <Button onClick={() => document.getElementById("feedback-reviews")?.scrollIntoView({ behavior: "smooth" })}><ListChecks className="h-4 w-4" /> Review List</Button>
            <Button onClick={() => setHistory(true)} disabled={!current}><History className="h-4 w-4" /> Version History</Button>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Combination">
            <Select value={combo} onChange={(e) => setCombo(e.target.value)} className="w-full sm:w-80">
              <option value="all">All combinations</option>
              {combos.map((k) => <option key={k} value={k}>{comboLabel(k)}</option>)}
            </Select>
          </Field>
          <p className="max-w-xl text-xs text-gray-500">Grouped by surface type, interior or exterior, product tier, application method and condition. A suggestion needs {MIN_JOBS} verified single-combination jobs of at least 400 sq ft, completed in the last 18 months.</p>
        </div>
      </Card>

      <StatStrip className="mb-4">
        <Stat label="Rate records" value={all.length} hint={`${combos.length} combinations`} />
        <Stat label="Awaiting owner" value={all.filter((s) => s.status === "suggested").length} tone="brand" />
        <Stat label="Suppressed" value={all.filter((s) => s.status === "suppressed").length} tone={all.some((s) => s.status === "suppressed") ? "warn" : "default"} />
        <Stat label="Reviews due" value={due.length} tone={due.some((r) => r.state === "escalated") ? "danger" : due.length ? "warn" : "good"} hint="day 90; escalates at day 120" />
      </StatStrip>

      <Banner tone="info" className="mb-4">Suggestions cover labor production and coating coverage only. A previewed financial effect is information for the owner, not a change to commercial policy. Every rate change needs the owner to approve that one rate record.</Banner>

      <Card className="mb-4 p-4" data-tour="feedback-list">
        <CardLabel icon={<Gauge />}>Suggestions</CardLabel>
        <div className="mt-3">
          <Table>
            <THead>
              <tr><TH>Combination</TH><TH>Rate</TH><TH className="text-right">Current</TH><TH className="text-right">Observed</TH><TH className="text-right">Deviation</TH><TH className="text-right">Evidence</TH><TH>Flag</TH><TH>Status</TH></tr>
            </THead>
            <tbody>
              {shown.map((s) => (
                <TR key={s.rate.id} className={`cursor-pointer ${current?.rate.id === s.rate.id ? "bg-brand-soft" : ""}`} onClick={() => select(s.rate.id)}>
                  <TD className="max-w-[240px] whitespace-normal font-semibold text-ink">{s.pool.label}<div className="text-xs font-normal text-gray-500">{s.rate.id}</div></TD>
                  <TD>{kindLabel(s.rate)}</TD>
                  <TD className="text-right tabular-nums">{s.status === "disabled" ? "—" : s.rate.value ? rateText(s.rate, s.rate.value) : <span className="text-gray-500">None on file</span>}</TD>
                  <TD className="text-right tabular-nums">{s.status === "insufficient" || s.status === "disabled" ? "—" : rateText(s.rate, s.observed)}</TD>
                  <TD className="text-right tabular-nums">{s.status === "insufficient" || s.status === "disabled" ? "—" : s.deviation === null ? <span className="text-gray-500">Not applicable</span> : pct(s.deviation)}</TD>
                  <TD className="text-right tabular-nums">{s.pool.eligible.length} of {MIN_JOBS}</TD>
                  <TD>{s.status === "insufficient" || s.status === "disabled" ? "—" : s.flag === "prominent" ? <Badge tone="red">Above 20%</Badge> : s.flag === "flagged" ? <Badge tone="amber">Above 15%</Badge> : <span className="text-xs text-gray-500">Within 15%</span>}</TD>
                  <TD><Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      {current && <Detail s={current} />}

      <Reviews />

      <VersionHistory rate={history ? current?.rate : undefined} onClose={() => setHistory(false)} />
    </>
  );
}

function Detail({ s }: { s: Suggestion }) {
  const [view, setView] = useState<"pooled" | "median">("pooled");
  if (s.status === "disabled") {
    return <Card className="mb-4 p-4"><CardLabel>{s.pool.label} · {kindLabel(s.rate)}</CardLabel><Banner tone="info" className="mt-3">Coverage suggestions are not enabled for this combination.</Banner></Card>;
  }
  return (
    <div className="mb-4 space-y-4">
      {s.status === "insufficient" && <Banner tone="warn" title={`Insufficient evidence — ${s.pool.eligible.length} of ${MIN_JOBS} eligible jobs.`}>No suggestion is produced for {s.pool.label}. The evidence and the exclusions are still listed below.</Banner>}
      <Evidence s={s} view={view} setView={setView} />
      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <Calculation s={s} view={view} />
        {s.status !== "insufficient" && <Approval s={s} />}
      </div>
      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <Exclusions s={s} />
        {s.status !== "insufficient" && <Preview s={s} />}
      </div>
    </div>
  );
}

function Evidence({ s, view, setView }: { s: Suggestion; view: "pooled" | "median"; setView: (v: "pooled" | "median") => void }) {
  const user = useCurrentUser();
  const [excluding, setExcluding] = useState<string>();
  const prod = s.rate.kind === "productivity";
  const prominent = s.flag === "prominent" && s.status !== "insufficient";
  return (
    <Card className={`p-4 ${prominent ? "ring-2 ring-red-300" : ""}`} data-tour="feedback-evidence">
      <CardLabel right={prod && <PillTabs value={view} onChange={setView} options={[{ value: "pooled", label: "Pooled" }, { value: "median", label: "Median" }]} />}>Evidence · {s.pool.label}</CardLabel>
      {prominent && <Banner tone="danger" className="mt-3">The deviation is above 20 percent. Check every included job before deciding.</Banner>}
      <p className="mt-2 text-xs text-gray-500">Consumed gallons include spills. Preparation, travel, setup and rework hours are captured but excluded from the application rate.</p>
      <div className="mt-3">
        {s.pool.eligible.length === 0 ? <EmptyState title="No eligible jobs" body="A job counts once its whole-job actuals are verified and it has a single surface and product combination, within the last 18 months." /> : (
          <Table>
            <THead>
              <tr>
                <TH>Job</TH><TH className="text-right">Area (sq ft)</TH><TH className="text-right">App. hours</TH><TH className="text-right">Other hours</TH><TH className="text-right">Gallons</TH>
                <TH className="text-right">Waste</TH><TH className="text-right">Coats</TH><TH className="text-right">Coat-adj. area</TH><TH className="text-right">{prod ? "sq ft/h" : "Coverage"}</TH>{can(user, "feedback.exclude") && <TH />}
              </tr>
            </THead>
            <tbody>
              {s.pool.eligible.map(({ job, combo: c }) => (
                <TR key={job.id}>
                  <TD className="whitespace-nowrap font-semibold text-ink">{job.id}<div className="text-xs font-normal text-gray-500">{dateLong(job.completedAt)}</div></TD>
                  <TD className="text-right tabular-nums">{c.measuredSqft.toLocaleString()}</TD>
                  <TD className="text-right tabular-nums">{c.applicationHours.toFixed(1)}</TD>
                  <TD className="text-right tabular-nums text-gray-500" title="Prep, travel, setup, rework — excluded">{(c.prepHours + c.travelHours + c.setupHours + c.reworkHours).toFixed(1)}</TD>
                  <TD className="text-right tabular-nums">{c.consumedGal.toFixed(2)}{c.spillsGal > 0 && <div className="text-xs text-gray-500">incl. {c.spillsGal.toFixed(2)} spilt</div>}</TD>
                  <TD className="text-right tabular-nums">{Math.round(c.wasteAllowance * 100)}%</TD>
                  <TD className="text-right tabular-nums">{c.coats}</TD>
                  <TD className="text-right tabular-nums">{(c.measuredSqft * c.coats).toLocaleString()}</TD>
                  <TD className="text-right tabular-nums">{prod ? (c.measuredSqft / c.applicationHours).toFixed(1) : ((c.measuredSqft * c.coats) / wasteAdjustedGal(c)).toFixed(1)}</TD>
                  {can(user, "feedback.exclude") && <TD><Button size="sm" variant="ghost" onClick={() => setExcluding(job.id)}>Exclude</Button></TD>}
                </TR>
              ))}
              <TR className="bg-gray-50 font-semibold">
                <TD>Totals · {s.pool.eligible.length} jobs</TD>
                <TD className="text-right tabular-nums">{s.totals.sqft.toLocaleString()}</TD>
                <TD className="text-right tabular-nums">{s.totals.hours.toFixed(1)}</TD>
                <TD /><TD className="text-right tabular-nums">{s.totals.wasteAdjustedGal.toFixed(2)}<div className="text-xs font-normal text-gray-500">waste-adjusted</div></TD><TD /><TD />
                <TD className="text-right tabular-nums">{s.totals.coatSqft.toLocaleString()}</TD>
                <TD className="text-right tabular-nums">{prod && view === "median" ? `${s.median?.toFixed(1)} median` : s.observed.toFixed(1)}</TD>
                {can(user, "feedback.exclude") && <TD />}
              </TR>
            </tbody>
          </Table>
        )}
      </div>
      {prod && <p className="mt-2 text-xs text-gray-600">Pooled <strong>{s.observed.toFixed(1)} sq ft/h</strong> · median per job <strong>{s.median?.toFixed(1)} sq ft/h</strong>. The suggestion uses the pooled rate; per-job percentages are never averaged into it.</p>}
      <ReasonModal
        open={!!excluding} onClose={() => setExcluding(undefined)} title={`Exclude ${excluding} from this evidence`} label="Reason" confirm="Exclude" done="Job excluded, reason recorded"
        description="Excluded jobs and their reasons are kept permanently. A restore is logged too."
        onSubmit={(reason) => act(excludeEvidence, s.rate.comboKey, excluding!, reason)}
      />
    </Card>
  );
}

function Calculation({ s, view }: { s: Suggestion; view: "pooled" | "median" }) {
  const prod = s.rate.kind === "productivity";
  const n = s.pool.eligible;
  const current = s.rate.value;
  const formula = prod
    ? view === "median"
      ? [`Median of ${n.length} per-job rates = ${s.median?.toFixed(2)} sq ft/h (shown beside the pooled rate, not used for the suggestion)`]
      : [`Productivity = total measured area ÷ total application hours`, `= ${s.totals.sqft.toLocaleString()} ÷ ${s.totals.hours.toFixed(1)}`, `= ${s.observed.toFixed(2)} sq ft/h`]
    : [
        `Waste-adjusted gallons per job = consumed gallons ÷ (1 + that job's waste allowance)`,
        ...n.slice(0, 3).map(({ job, combo: c }) => `  ${job.id}: ${c.consumedGal.toFixed(2)} ÷ ${(1 + c.wasteAllowance).toFixed(2)} = ${wasteAdjustedGal(c).toFixed(4)}`),
        ...(n.length > 3 ? [`  … and ${n.length - 3} more (see the evidence table)`] : []),
        `Coverage = total coat-adjusted area ÷ sum of waste-adjusted gallons`,
        `= ${s.totals.coatSqft.toLocaleString()} ÷ ${s.totals.wasteAdjustedGal.toFixed(4)}`,
        `= ${s.observed.toFixed(2)} coat sq ft/gal`,
      ];
  const dev = current ? [`Deviation = (observed − current) ÷ current`, `= (${s.observed.toFixed(2)} − ${current}) ÷ ${current}`, `= ${pct(s.deviation)}`] : [`Deviation: Not applicable — no current rate on file`];
  const text = [...formula, "", ...dev].join("\n");
  return (
    <Card className="p-4" data-tour="feedback-calc">
      <CardLabel icon={<Calculator />} right={<Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(text).then(() => toast.success("Figures copied"), () => toast.error("Copy failed"))}><ClipboardCopy className="h-3.5 w-3.5" /> Copy figures</Button>}>Calculation</CardLabel>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-700">{text}</pre>
      {s.status !== "insufficient" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {s.flag === "prominent" ? <Badge tone="red">Strictly above 20% — evidence shown prominently</Badge> : s.flag === "flagged" ? <Badge tone="amber">Strictly above 15% — flagged</Badge> : <Badge tone="gray">Within 15% — not flagged</Badge>}
          <span className="text-gray-500">Owner approval is required whatever the size.</span>
        </div>
      )}
    </Card>
  );
}

function Exclusions({ s }: { s: Suggestion }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const history = db.evidenceExclusions.filter((e) => e.comboKey === s.rate.comboKey);
  return (
    <Card className="p-4">
      <CardLabel>Exclusions and ineligible jobs</CardLabel>
      <p className="mt-1 text-xs text-gray-500">Every job left out, and why. Mixed jobs stay ineligible — no per-surface allocation is invented.</p>
      <div className="mt-3 space-y-2">
        {history.length === 0 && s.pool.ineligible.length === 0 && <p className="text-xs italic text-gray-500">Nothing excluded.</p>}
        {history.map((e) => (
          <div key={e.id} className="rounded-lg border border-line px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><strong>{e.jobId}</strong> <Badge tone={e.restoredAt ? "gray" : "amber"}>{e.restoredAt ? "Restored" : "Excluded"}</Badge></span>
              {!e.restoredAt && can(user, "feedback.exclude") && <Button size="sm" onClick={() => act(restoreEvidence, e.id).ok && toast.success(`${e.jobId} restored`, "Both actions stay in the log.")}><RotateCcw className="h-3.5 w-3.5" /> Restore</Button>}
            </div>
            <div className="text-gray-500">{e.reason} · excluded by {userName(db, e.by)} on {dateLong(e.at)}{e.restoredAt ? ` · restored by ${userName(db, e.restoredBy)} on ${dateLong(e.restoredAt)}` : ""}</div>
          </div>
        ))}
        {s.pool.ineligible.map(({ job, check }) => (
          <div key={job.id} className="rounded-lg border border-dashed border-line px-3 py-2 text-xs">
            <div><strong>{job.id}</strong> <Badge tone="gray">Ineligible</Badge> <span className="text-gray-500">{job.name}</span></div>
            <div className="text-gray-600">Failed check: {check.reason}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Preview({ s }: { s: Suggestion }) {
  const [open, setOpen] = useState(false);
  const proposed = Math.round(s.observed * 10) / 10;
  const current = s.rate.value || s.observed;
  const p = impactPreview(s.pool.eligible.map((e) => ({ jobId: e.job.id, completedAt: e.job.completedAt, combo: e.combo })), s.rate.kind, current, proposed);
  const total = (k: "before" | "after") => p.rows.reduce((a, r) => a + r[k], 0);
  return (
    <Card className="p-4" data-tour="feedback-preview">
      <CardLabel right={open ? <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close preview</Button> : <Button size="sm" onClick={() => { if (act(runPreview, s.rate.id).ok) setOpen(true); }}>Run preview</Button>}>Impact preview</CardLabel>
      <p className="mt-1 text-xs text-gray-500">What this rate would have meant on real jobs. Scope, measurements, historical selling price, markup and material unit prices are held fixed. Nothing stored changes.</p>
      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2 text-xs"><Badge tone="blue">Preview based on {p.count} eligible jobs.</Badge><Badge tone="purple">Variable moved: {p.variable === "Labour" ? "Labor" : "Material quantity and its cost"}</Badge></div>
          <Table>
            <THead><tr><TH>Job</TH><TH className="text-right">Selling price (fixed)</TH><TH className="text-right">Labor before → after</TH><TH className="text-right">Material before → after</TH><TH className="text-right">Cost change</TH></tr></THead>
            <tbody>
              {p.rows.map((r) => (
                <TR key={r.jobId}>
                  <TD className="font-semibold text-ink">{r.jobId}</TD>
                  <TD className="text-right tabular-nums">{money(r.sellPrice)}</TD>
                  <TD className="text-right tabular-nums">{money(r.labourBefore)} → {money(r.labourAfter)}</TD>
                  <TD className="text-right tabular-nums">{money(r.materialBefore)} → {money(r.materialAfter)}</TD>
                  <TD className="text-right tabular-nums">{r.after - r.before > 0 ? "+" : ""}{money(r.after - r.before)}</TD>
                </TR>
              ))}
              <TR className="bg-gray-50 font-semibold"><TD>Total</TD><TD /><TD /><TD /><TD className="text-right tabular-nums">{total("after") - total("before") > 0 ? "+" : ""}{money(total("after") - total("before"))}</TD></TR>
            </tbody>
          </Table>
          <p className="text-xs text-gray-500">Prototype constants: blended labor {money(PREVIEW_WAGE_PER_HOUR)}/h, material {money(PREVIEW_PRICE_PER_GAL)}/gal, historical markup {Math.round(PREVIEW_MARKUP * 100)}%.</p>
        </div>
      )}
    </Card>
  );
}

function Approval({ s }: { s: Suggestion }) {
  const db = useDb((d) => d);
  const surfaceRates = useSurfaceRateUpdate();
  const affected = surfaceRates.preview(s.rate);
  const user = useCurrentUser();
  const [rejecting, setRejecting] = useState(false);
  const d = s.decision;
  const owner = can(user, "feedback.approve");
  const curated = user.role !== "owner" && curatedBy(db, s.rate.comboKey, user.id);
  return (
    <Card className="p-4" data-tour="feedback-approval">
      <CardLabel icon={<ShieldCheck />}>Approval</CardLabel>
      <div className="mt-3 rounded-lg border border-line bg-gray-50 px-3 py-2 text-xs">
        Rate record affected: <strong>{s.rate.id}</strong> — {kindLabel(s.rate)} for {s.pool.label}. No other rate in the family changes.
        <div className="mt-1 tabular-nums">{s.rate.value ? rateText(s.rate, s.rate.value) : "No current rate"} → <strong>{rateText(s.rate, s.observed)}</strong></div>
        {s.status === "suggested" && s.rate.kind === "productivity" && (
          <div className="mt-1 text-gray-600">
            {affected.length
              ? <>Approving also updates Settings → Surface Rates: <strong>{affected.map((r) => r.name).join(", ")}</strong> (every coat, same proportion).</>
              : "No surface rate matches this combination, so Surface Rates will not change."}
          </div>
        )}
      </div>
      {s.status === "suggested" && (
        owner ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => {
              const from = s.rate.value;
              const r = act(approveRate, s.rate.id, "");
              if (!r.ok) return;
              const to = byId(useStore.getState().db.rateRecords, s.rate.id)?.value ?? s.observed;
              toast.success(`${s.rate.id} version ${r.value?.version} approved`, `${surfaceRates.apply(s.rate, from, to, r.value?.version ?? 0)} ${r.value?.drafts} open draft estimates flagged.`);
            }}>Approve {s.rate.id}</Button>
            <Button variant="danger" onClick={() => setRejecting(true)}>Reject</Button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-gray-500">Approve is unavailable — only the business owner approves a rate change.{curated ? " You curated this evidence, so you could not approve it in any case." : ""}</p>
        )
      )}
      {s.status === "suppressed" && d && s.suppression && (
        <Banner tone="warn" className="mt-3" title={`Rejected ${dateLong(d.at)} by ${userName(db, d.by)} — suppressed until ${dateLong(s.suppression.until)}`}
          action={can(user, "feedback.reopen") && <Button size="sm" disabled={!s.suppression.canReopen} onClick={() => act(reopenSuggestion, s.rate.id).ok && toast.success("Suggestion reopened")}>Reopen</Button>}>
          Reason: {d.reason}. The estimating manager may reopen early once three new eligible jobs have completed since the rejection. New since: {s.newSince} of 3.
        </Banner>
      )}
      {s.status === "approved" && d && (
        <>
          <Banner tone="success" className="mt-3" title={`Approved ${dateLong(d.at)} by ${userName(db, d.by)}`}>Effective from that date, company-wide for the one market and crew pool. Project calculation overrides are not overwritten.</Banner>
          {!!d.draftsFlagged?.length && <Banner tone="info" className="mt-2">{d.draftsFlagged.length} open draft estimate{d.draftsFlagged.length === 1 ? "" : "s"} use{d.draftsFlagged.length === 1 ? "s" : ""} this rate ({d.draftsFlagged.join(", ")}). Estimators can choose to refresh them. Sent and accepted estimates, templates already used and generated orders are unchanged.</Banner>}
        </>
      )}
      {s.status === "suggested" && d?.decision === "approved" && <p className="mt-2 text-xs text-gray-500">{s.newSince} eligible jobs have completed since the last approval, so there is a fresh suggestion.</p>}
      <ReasonModal open={rejecting} onClose={() => setRejecting(false)} title={`Reject the suggestion for ${s.rate.id}`} label="Reason" confirm="Reject" done="Suggestion rejected, suppressed for 90 days" tone="danger"
        description="The suggestion is suppressed for 90 days, unless three new eligible jobs complete and the estimating manager reopens it."
        onSubmit={(reason) => act(rejectRate, s.rate.id, reason)} />
    </Card>
  );
}

function VersionHistory({ rate, onClose }: { rate?: RateRecord; onClose: () => void }) {
  const db = useDb((d) => d);
  const surfaceRates = useSurfaceRateUpdate();
  const user = useCurrentUser();
  const [rolling, setRolling] = useState(false);
  if (!rate) return null;
  const live = byId(db.rateRecords, rate.id)!;
  const last = live.versions.at(-1);
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="lg" title={`${live.id} version history`} description={`${kindLabel(live)} · ${comboLabel(live.comboKey)}. Versions are never deleted; a rollback is its own version.`}
      footer={<>{can(user, "feedback.approve") && last?.previous !== undefined && <Button onClick={() => setRolling(true)}><Undo2 className="h-4 w-4" /> Roll back to {rateText(live, last.previous)}</Button>}<Button onClick={onClose}>Close</Button></>}>
      {live.versions.length === 0 ? <EmptyState title="No versions yet" body="No rate is on file for this record." /> : (
        <Table>
          <THead><tr><TH>Version</TH><TH>Kind</TH><TH className="text-right">Previous</TH><TH className="text-right">New</TH><TH>By</TH><TH>Date</TH><TH>Reason</TH></tr></THead>
          <tbody>
            {[...live.versions].reverse().map((v) => (
              <TR key={v.version}>
                <TD className="font-semibold">v{v.version}</TD>
                <TD><Badge tone={v.kind === "rollback" ? "purple" : v.kind === "approval" ? "green" : "gray"}>{v.kind === "initial" ? "Initial" : v.kind === "approval" ? "Approval" : "Rollback"}</Badge></TD>
                <TD className="text-right tabular-nums">{v.previous === undefined ? "—" : rateText(live, v.previous)}</TD>
                <TD className="text-right tabular-nums font-semibold">{rateText(live, v.value)}</TD>
                <TD>{userName(db, v.by)}</TD>
                <TD className="whitespace-nowrap">{dateLong(v.at)}</TD>
                <TD className="max-w-[220px] whitespace-normal text-xs">{v.reason}{v.review && <div className="text-gray-500">Reviewed {dateLong(v.review.at)}: {v.review.outcome}</div>}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      <ReasonModal open={rolling} onClose={() => setRolling(false)} title={`Roll back ${live.id}`} label="Reason" confirm="Roll back" done="Rolled back as a new version" description="Creates a new version. The approval it reverses stays in the history."
        onSubmit={(reason) => {
          const from = live.value;
          const r = act(rollbackRate, live.id, reason);
          if (r.ok) {
            const after = byId(useStore.getState().db.rateRecords, live.id)!;
            toast.info("Surface Rates", surfaceRates.apply(after, from, after.value, after.versions.length));
          }
          return r;
        }} />
    </Modal>
  );
}

function Reviews() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [reviewing, setReviewing] = useState<string>();
  const list = reviewList(db);
  const owner = db.users.find((u) => u.role === "owner");
  return (
    <Card className="p-4" data-tour="feedback-reviews">
      <div id="feedback-reviews" className="scroll-mt-24" />
      <CardLabel icon={<CalendarClock />} right={<Button size="sm" onClick={() => { const r = act(runReviewCheck); if (r.ok) toast.success(r.value ? `${r.value} overdue review${r.value === 1 ? "" : "s"} escalated` : "Nothing new to escalate", r.value ? `Escalated to ${owner?.name}.` : undefined); }}>Run daily review check</Button>}>Day-90 reviews and day-120 escalations</CardLabel>
      <p className="mt-1 text-xs text-gray-500">The estimating manager reviews every approved change at day 90. A review still outstanding at day 120 escalates to the business owner.</p>
      <div className="mt-3 space-y-2">
        {list.length === 0 && <p className="text-xs italic text-gray-500">No approved changes yet.</p>}
        {list.map((r) => (
          <div key={r.rate.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs">
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <strong>{r.rate.id}</strong> <span className="text-gray-500">{comboLabel(r.rate.comboKey)}</span>
                {r.state === "reviewed" ? <Badge tone="green">Reviewed</Badge> : r.state === "escalated" ? <Badge tone="red">{r.version.escalatedAt ? `Escalated to ${owner?.name}` : "Overdue — day 120 passed"}</Badge> : r.state === "due" ? <Badge tone="amber">Review due · day {r.days}</Badge> : <Badge tone="gray">Day {r.days} of 90</Badge>}
              </div>
              <div className="text-gray-500">v{r.version.version} approved {dateLong(r.version.at)} · review due {dateLong(r.dueAt)} · escalates {dateLong(r.escalateAt)}{r.version.review ? ` · ${userName(db, r.version.review.by)}: ${r.version.review.outcome}` : ""}</div>
            </div>
            {(r.state === "due" || r.state === "escalated") && can(user, "feedback.review") && <Button size="sm" variant="primary" onClick={() => setReviewing(r.rate.id)}>Mark review complete</Button>}
          </div>
        ))}
      </div>
      <ReasonModal open={!!reviewing} onClose={() => setReviewing(undefined)} title={`Day-90 review of ${reviewing}`} label="Outcome" confirm="Complete review" done="Day-90 review recorded"
        description="Record whether the approved rate is holding up on new jobs." onSubmit={(outcome) => act(completeReview, reviewing!, outcome)} />
    </Card>
  );
}

function ReasonModal({ open, onClose, title, description, label, confirm, done, tone, onSubmit }: {
  open: boolean; onClose: () => void; title: string; description: string; label: string; confirm: string; done: string; tone?: "danger"; onSubmit: (text: string) => ActionResult<unknown>;
}) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string>();
  const close = () => { setText(""); setErr(undefined); onClose(); };
  return (
    <Modal open={open} onOpenChange={(v) => !v && close()} size="sm" title={title} description={description}
      footer={<><Button onClick={close}>Cancel</Button><Button variant={tone ?? "primary"} onClick={() => { const r = onSubmit(text); if (r.ok) { toast.success(done); close(); } else setErr(r.error); }}>{confirm}</Button></>}>
      <Field label={label} required error={err}><Textarea value={text} onChange={(e) => setText(e.target.value)} /></Field>
    </Modal>
  );
}
