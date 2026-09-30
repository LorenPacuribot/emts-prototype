"use client";
/**
 * Feature 21 — Estimated Versus Actual Performance.
 * Menu: Reports > Job Performance
 *
 * Four value columns always: Original approved, Approved change
 * contribution, Revised approved, Actual. Variance is actual minus the
 * selected baseline, labelled in words. Pending hours sit in their own
 * column; incomplete jobs sit in their own grid with the actual shown as
 * missing, never zero. Every view, drill-down and export applies the
 * viewer's own permissions.
 */
import { useMemo, useRef, useState } from "react";
import { Archive, BarChart3, CalendarClock, Download, FileText, Printer, Save, Send } from "lucide-react";
import type { PerformanceDimension, PerformanceMeasure, PerformanceRow, PerformanceSnapshot, ReasonCode } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { dateLong, dateTime, money } from "@/features/lib/format";
import { downloadCsv, printElement } from "@/features/lib/export";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { PRESET_LABEL, REASON_CODES, presetRange, reconciles, validRange, variance, type PeriodPreset } from "@/features/lib/rules/performance";
import {
  approveCorrection, buildRows, employeeHoursOnJob, filtersFor, issueSnapshot, jobPerformance, logExport, measureFor, overheadExcluded, requestArchived,
  requestCorrection, runWeeklyIssue, saveFilter, setReason, visibleTo, type JobPerf, type PerfFilter,
} from "@/features/lib/store/actions/performance";
import { userName } from "@/features/lib/store/helpers";
import { PanelHeader as PageHeader } from "@/features/components/features/contacts/details/panel-header";
import { Badge, Banner, Button, Card, CardLabel, Drawer, EmptyState, Field, Input, KV, Modal, PillTabs, Select, Stat, StatStrip, Table, TD, TH, THead, TR, Textarea } from "@/features/components/ui";
import { ReportsFrame } from "./reports-frame";
import { usText } from "@/features/lib/display-text";

const DIMENSIONS: { value: PerformanceDimension; label: string }[] = [
  { value: "job", label: "Job" }, { value: "estimator", label: "Estimator" }, { value: "crew_lead", label: "Crew lead" }, { value: "kind", label: "Interior vs exterior" },
];

export function JobPerformanceScreen() {
  return (
    <ReportsFrame tab="job_performance">
      <Performance />
    </ReportsFrame>
  );
}

type RowSort = "default" | "over" | "under" | "pct" | "name";
const SORT_LABEL: Record<RowSort, string> = {
  default: "Default order",
  over: "Most over budget first",
  under: "Most under budget first",
  pct: "Largest variance % first",
  name: "Name (A–Z)",
};

/** Sorts grid rows by variance against the chosen baseline; rows without an actual go last. */
function sortRows(rows: PerformanceRow[], sort: RowSort, baseline: "revised" | "original", measure: PerformanceMeasure): PerformanceRow[] {
  if (sort === "default") return rows;
  if (sort === "name") return [...rows].sort((a, b) => a.label.localeCompare(b.label));
  const key = (r: PerformanceRow) => {
    if (r.actual === undefined) return undefined;
    const v = variance(r.actual, baseline === "revised" ? r.revised : r.original, measure);
    return sort === "pct" ? (v.pct === null ? undefined : Math.abs(v.pct)) : sort === "over" ? v.amount : -v.amount;
  };
  return [...rows].sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (ka === undefined || kb === undefined) return ka === undefined ? (kb === undefined ? 0 : 1) : -1;
    return kb - ka;
  });
}

function fmt(v: number | undefined, m: PerformanceMeasure) {
  if (v === undefined) return "—";
  return m === "hours" ? `${v.toFixed(1)} h` : money(v);
}

/** Tab body without the frame: the replica /reports page hosts it. */
export function Performance() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const printRef = useRef<HTMLDivElement>(null);
  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [custom, setCustom] = useState(presetRange("this_month", now()));
  const [dimension, setDimension] = useState<PerformanceDimension>("job");
  const [baseline, setBaseline] = useState<"revised" | "original">("revised");
  const [measureSel, setMeasure] = useState<PerformanceMeasure>("cost");
  const [openJob, setOpenJob] = useState<string>();
  const [openSnap, setOpenSnap] = useState<string>();
  const [saving, setSaving] = useState(false);
  const measure = measureFor(user, measureSel);
  const range = preset === "custom" ? custom : presetRange(preset, now());
  const filter: PerfFilter = { ...range, dimension, baseline, measure };
  const rangeOk = validRange(range.from, range.to);

  const [jobFilter, setJobFilter] = useState("");
  const [crewFilter, setCrewFilter] = useState("");
  const [sort, setSort] = useState<RowSort>("default");

  const allJobs = useMemo(() => (rangeOk ? visibleTo(user, jobPerformance(db, range)) : []), [db, user, range.from, range.to, rangeOk]); // eslint-disable-line react-hooks/exhaustive-deps
  // Crew members on any visible job: its crew lead, or anyone with approved time on it in the period.
  const crewByJob = useMemo(() => new Map(allJobs.map((j) => {
    const ids = new Set(employeeHoursOnJob(db, j.jobId, range).map((e) => e.employeeId));
    for (const e of db.employees) if (e.userId && e.userId === j.crewLeadId) ids.add(e.id);
    return [j.jobId, ids] as const;
  })), [allJobs, db, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const crewOptions = db.employees.filter((e) => [...crewByJob.values()].some((ids) => ids.has(e.id)));
  const jobs = allJobs.filter((j) => (!jobFilter || j.jobId === jobFilter) && (!crewFilter || crewByJob.get(j.jobId)?.has(crewFilter)));
  const completeJobs = jobs.filter((j) => j.complete && j.actual);
  const incompleteJobs = jobs.filter((j) => !(j.complete && j.actual));
  const rows = sortRows(buildRows(db, completeJobs, dimension, measure), sort, baseline, measure);
  const incompleteRows = sortRows(buildRows(db, incompleteJobs, dimension, measure), sort, baseline, measure);
  const broken = [...rows, ...incompleteRows].filter((r) => !reconciles(r.original, r.change, r.revised));
  const excluded = overheadExcluded(db, range);
  const filters = filtersFor(db, user);

  const csv = () => {
    downloadCsv(`job-performance-${range.from}-${range.to}.csv`, [
      [`Period ${range.from} to ${range.to}`], ["Date basis: work date"], [`Timezone: ${db.payrollSettings.timezone}`], [`Role filter: ${user.role}${user.role === "estimator" || user.role === "senior_estimator" ? " (own jobs)" : ""}`], [`Measure: ${measure}; baseline: ${baseline}`],
      [`Job: ${jobFilter ? allJobs.find((j) => j.jobId === jobFilter)?.name ?? jobFilter : "all"}; crew member: ${crewFilter ? byId(db.employees, crewFilter)?.name ?? crewFilter : "all"}`],
      ["row", "original_approved", "approved_change", "revised_approved", "actual", "pending_hours", "variance", "variance_pct", "label", "reason_code", "status"],
      ...[...rows, ...incompleteRows].map((r) => {
        const base = baseline === "revised" ? r.revised : r.original;
        const v = r.actual === undefined ? undefined : variance(r.actual, base, measure);
        return [r.label, r.original, r.change, r.revised, r.actual ?? "missing", r.pending, v?.amount ?? "", v?.pct === null || v === undefined ? "Not applicable" : (v.pct * 100).toFixed(1) + "%", v?.label ?? "", r.reasonCode ?? "", r.complete ? "complete" : "incomplete"];
      }),
    ]);
    act(logExport, filter, "CSV");
    toast.success("CSV exported", "Period, date basis, timezone and your role filter are printed at the top.");
  };

  return (
    <>
      <PageHeader
        title="Job Performance"
        subtitle="Estimated versus actual, measured fairly." details="The original estimate, what approved change orders added, the revised estimate, and what actually happened."
        actions={
          <>
            <Button onClick={csv}><Download className="h-4 w-4" /> Export CSV</Button>
            <Button onClick={() => { printElement(printRef.current, `Job performance ${range.from} to ${range.to}`); act(logExport, filter, "PDF"); }}><Printer className="h-4 w-4" /> Export PDF</Button>
            <Button onClick={() => setSaving(true)}><Save className="h-4 w-4" /> Save Filter</Button>
            {can(user, "perf.issue") && <Button variant="primary" onClick={() => { const r = act(issueSnapshot, filter); if (r.ok) toast.success(`Snapshot ${r.value} issued`, "Issued reports never change."); }}><Send className="h-4 w-4" /> Issue report</Button>}
          </>
        }
      />

      <Card className="mb-4 p-4" data-tour="perf-filters">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Period (work date)">
            <Select value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)} className="w-40">
              {(Object.keys(PRESET_LABEL) as PeriodPreset[]).map((p) => <option key={p} value={p}>{PRESET_LABEL[p]}</option>)}
            </Select>
          </Field>
          {preset === "custom" && (
            <>
              <Field label="From" error={!rangeOk ? "From must be on or before To" : undefined}><Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></Field>
              <Field label="To"><Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></Field>
            </>
          )}
          <Field label="Dimension">
            <Select value={dimension} onChange={(e) => setDimension(e.target.value as PerformanceDimension)} className="w-48">
              {DIMENSIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </Select>
          </Field>
          <Field label="Baseline">
            <PillTabs value={baseline} onChange={setBaseline} options={[{ value: "revised", label: "Revised approved" }, { value: "original", label: "Original approved" }]} />
          </Field>
          <Field label="Measure">
            {user.role === "crew_lead" ? <Badge tone="gray">Hours only for crew leads</Badge> : <PillTabs value={measureSel} onChange={setMeasure} options={[{ value: "cost", label: "Cost" }, { value: "hours", label: "Hours" }]} />}
          </Field>
          <Field label="Job">
            <Select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} className="w-52">
              <option value="">All jobs</option>
              {allJobs.map((j) => <option key={j.jobId} value={j.jobId}>{j.name}</option>)}
            </Select>
          </Field>
          <Field label="Crew member">
            <Select value={crewFilter} onChange={(e) => setCrewFilter(e.target.value)} className="w-44">
              <option value="">All crew</option>
              {crewOptions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
          <Field label="Sort">
            <Select value={sort} onChange={(e) => setSort(e.target.value as RowSort)} className="w-52">
              {(Object.keys(SORT_LABEL) as RowSort[]).map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
            </Select>
          </Field>
          {filters.length > 0 && (
            <Field label="Saved filter">
              <Select value="" onChange={(e) => {
                const f = filters.find((x) => x.id === e.target.value);
                if (!f) return;
                setPreset(f.preset as PeriodPreset);
                setCustom({ from: f.from, to: f.to });
                setDimension(f.dimension);
                setBaseline(f.baseline);
                setMeasure(f.measure);
                toast.info(`Loaded "${f.name}"`, "Your own permissions apply, whoever created it.");
              }} className="w-52">
                <option value="">— Load —</option>
                {filters.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
      </Card>

      <StatStrip className="mb-4">
        <Stat label="Period" value={<span className="text-sm">{dateLong(`${range.from}T12:00:00`)} – {dateLong(`${range.to}T12:00:00`)}</span>} hint="date basis: work date" />
        <Stat label="Timezone" value={<span className="text-sm">Configured local</span>} hint={db.payrollSettings.timezone} />
        <Stat label="Jobs included" value={jobs.length} hint={user.role === "estimator" || user.role === "senior_estimator" ? "your own jobs" : undefined} />
        <Stat label="Incomplete" value={incompleteJobs.length} tone={incompleteJobs.length ? "warn" : "good"} />
        {measure === "cost" && <Stat label="Overhead excluded" value={money(excluded)} hint="unallocatable, shown so totals reconcile" />}
      </StatStrip>

      {user.role === "crew_lead" && <Banner tone="info" className="mb-4">Crew leads see hours only. No cost figure appears on screen or in exports.</Banner>}
      {(user.role === "estimator" || user.role === "senior_estimator") && <Banner tone="info" className="mb-4">You see your own jobs with category-level cost. Individual wages and company finances are not shown.</Banner>}
      {broken.length > 0 && <Banner tone="danger" className="mb-4" title="Reconciliation error">Original approved plus approved change contribution does not equal revised approved for: {broken.map((b) => b.label).join(", ")}. The report is blocked for these rows.</Banner>}

      <div ref={printRef}>
        <Card className="mb-4 p-4" data-tour="perf-grid">
          <CardLabel icon={<BarChart3 />}>Completed{dimension !== "job" ? ` · by ${DIMENSIONS.find((d) => d.value === dimension)?.label.toLowerCase()}` : ""}</CardLabel>
          <div className="mt-3">
            {!rangeOk ? <EmptyState title="Fix the period" body="The From date must be on or before the To date." /> : rows.length === 0 ? (
              <EmptyState icon={<BarChart3 />} title="No jobs with work dates in this period." body="Choose a longer period. No zero-value rows are invented." />
            ) : (
              <Grid rows={rows} measure={measure} baseline={baseline} dimension={dimension} onOpen={setOpenJob} />
            )}
          </div>
        </Card>
        <Card className="mb-4 p-4">
          <CardLabel>Incomplete — not in the completed totals</CardLabel>
          <p className="mt-1 text-xs text-gray-500">Jobs still in progress, or without a reconciled actual. A missing actual is shown as missing, never as zero.</p>
          <div className="mt-3">
            {incompleteRows.length === 0 ? <p className="text-xs italic text-gray-500">No incomplete jobs in this period.</p> : (
              <Grid rows={incompleteRows} measure={measure} baseline={baseline} dimension={dimension} onOpen={setOpenJob} incomplete />
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <Snapshots onOpen={setOpenSnap} />
        <Corrections />
      </div>

      <DrillDown job={jobs.find((j) => j.jobId === openJob)} range={range} measure={measure} onClose={() => setOpenJob(undefined)} />
      <SnapshotModal snap={byId(db.performanceSnapshots, openSnap)} onClose={() => setOpenSnap(undefined)} />
      <SaveFilterModal open={saving} onClose={() => setSaving(false)} preset={preset} filter={filter} />
    </>
  );
}

function Grid({ rows, measure, baseline, dimension, onOpen, incomplete, readOnly }: {
  rows: PerformanceRow[]; measure: PerformanceMeasure; baseline: "revised" | "original"; dimension: PerformanceDimension; onOpen?: (jobId: string) => void; incomplete?: boolean; readOnly?: boolean;
}) {
  const user = useCurrentUser();
  return (
    <Table>
      <THead>
        <tr>
          <TH>{dimension === "job" ? "Job" : "Group"}</TH><TH className="text-right">Original approved</TH><TH className="text-right">Approved change</TH><TH className="text-right">Revised approved</TH>
          <TH className="text-right">Actual</TH><TH className="text-right">Variance</TH><TH className="text-right">Variance %</TH><TH>Label</TH><TH className="text-right">Pending (h)</TH>{dimension === "job" && <TH>Reason</TH>}
        </tr>
      </THead>
      <tbody>
        {rows.map((r) => {
          const base = baseline === "revised" ? r.revised : r.original;
          const v = r.actual === undefined ? undefined : variance(r.actual, base, measure);
          const tint = !incomplete && v?.highlight === "over" ? "bg-red-50/70" : !incomplete && v?.highlight === "under" ? "bg-green-50/70" : "";
          return [
            <TR key={r.key} className={`${tint} ${onOpen && dimension === "job" ? "cursor-pointer" : ""}`} onClick={() => dimension === "job" && onOpen?.(r.key)}>
              <TD className="max-w-[260px] whitespace-normal font-semibold text-ink">{r.label}{dimension !== "job" && <div className="text-xs font-normal text-gray-500">{r.jobIds.length} jobs</div>}</TD>
              <TD className="text-right tabular-nums">{fmt(r.original, measure)}</TD>
              <TD className="text-right tabular-nums">{fmt(r.change, measure)}</TD>
              <TD className="text-right tabular-nums font-semibold">{fmt(r.revised, measure)}</TD>
              <TD className="text-right tabular-nums">{r.actual === undefined ? <Badge tone="amber">Missing</Badge> : fmt(r.actual, measure)}</TD>
              <TD className="text-right tabular-nums">{v ? `${v.amount > 0 ? "+" : ""}${fmt(v.amount, measure)}` : "—"}</TD>
              <TD className="text-right tabular-nums">{!v ? "—" : v.pct === null ? <span className="text-gray-500">Not applicable</span> : `${v.pct > 0 ? "+" : ""}${(v.pct * 100).toFixed(1)}%`}</TD>
              <TD>{v ? <span className={`text-xs font-bold ${v.highlight === "over" ? "text-red-700" : v.highlight === "under" ? "text-green-700" : "text-gray-600"}`}>{v.label}</span> : "—"}</TD>
              <TD className="text-right tabular-nums text-gray-500">{r.pending ? r.pending.toFixed(1) : "—"}</TD>
              {dimension === "job" && <TD onClick={(e) => e.stopPropagation()}>{readOnly ? (r.reasonCode ?? "—") : <ReasonCell jobId={r.key} current={r.reasonCode as ReasonCode | undefined} canEdit={can(user, "perf.reason")} />}</TD>}
            </TR>,
            r.outOfScope ? (
              <TR key={`${r.key}-oos`} className="bg-gray-50/70">
                <TD colSpan={dimension === "job" ? 10 : 9} className="whitespace-normal text-xs text-gray-600">↳ Out of scope, not counted as estimating error: {r.outOfScope.label} — {fmt(r.outOfScope.value, measure)}</TD>
              </TR>
            ) : null,
          ];
        })}
      </tbody>
    </Table>
  );
}

function ReasonCell({ jobId, current, canEdit }: { jobId: string; current?: ReasonCode; canEdit: boolean }) {
  if (!canEdit) return <span className="text-xs">{current ?? "—"}</span>;
  return (
    <Select value={current ?? ""} className="h-8 w-44 py-0 text-xs" aria-label="Reason code" onChange={(e) => e.target.value && act(setReason, jobId, e.target.value as ReasonCode, "").ok && toast.success("Reason recorded")}>
      <option value="">— Reason —</option>
      {REASON_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
    </Select>
  );
}

function DrillDown({ job, range, measure, onClose }: { job?: JobPerf; range: { from: string; to: string }; measure: PerformanceMeasure; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [correcting, setCorrecting] = useState(false);
  if (!job) return <Drawer open={false} onOpenChange={() => onClose()} title="">{null}</Drawer>;
  const hoursOnly = measure === "hours" || user.role === "crew_lead";
  const empHours = job.source === "live" && can(user, "perf.wageDetail") ? employeeHoursOnJob(db, job.jobId, range) : [];
  const empCost = job.source === "live" && can(user, "labour.seeEmployeeTotals")
    ? db.labourCosts.filter((l) => l.weekStart >= range.from && l.weekStart <= range.to).flatMap((l) => l.allocations.filter((a) => a.jobId === job.jobId).map((a) => ({ name: byId(db.employees, l.employeeId)?.name, amount: a.amount })))
    : [];
  const cat = (label: string, o: number, c: number, a?: number, isMoney = true) => [label, `${isMoney ? money(o + c) : `${(o + c).toFixed(1)} h`} estimated · ${a === undefined ? "actual missing" : isMoney ? money(a) : `${a.toFixed(1)} h`} actual`] as [string, string];
  return (
    <Drawer open onOpenChange={(v) => !v && onClose()} title={`${job.jobId} · ${job.name}`} subtitle={`${job.kind === "interior" ? "Interior" : "Exterior"} · estimator ${userName(db, job.estimatorId)} · crew lead ${userName(db, job.crewLeadId)} · ${job.source === "live" ? "live job" : "completed-job history"}`}
      footer={job.source === "history" && job.actual && <Button onClick={() => setCorrecting(true)}>Correct actual</Button>}>
      <KV items={[
        cat("Labor hours", job.original.labourHours, job.change.labourHours, job.actual?.labourHours, false),
        ...(hoursOnly ? [] : [
          cat("Labor cost", job.original.labourCost, job.change.labourCost, job.actual?.labourCost),
          cat("Material", job.original.material, job.change.material, job.actual?.material),
          cat("Subcontractors", job.original.subcontractor, job.change.subcontractor, job.actual?.subcontractor),
        ]),
        ["Pending (not in main figures)", `${job.pendingHours.toFixed(1)} h submitted, not yet approved`],
      ]} />
      {job.source === "live" && !hoursOnly && (
        <Card className="p-4">
          <CardLabel>Purchases versus usage</CardLabel>
          <p className="mt-2 text-xs text-gray-600">Purchased {job.purchasedGal?.toFixed(2)} gal ({money(job.purchasedValue)}). Used = issued {job.issuedGal?.toFixed(2)} gal less {job.returnedGal?.toFixed(2)} gal sealed returns = <strong>{((job.issuedGal ?? 0) - (job.returnedGal ?? 0)).toFixed(2)} gal</strong>. Spills stay inside usage; paint bought but not issued is not usage.</p>
        </Card>
      )}
      {empHours.length > 0 && (
        <Card className="p-4">
          <CardLabel>Hours by employee</CardLabel>
          <ul className="mt-2 space-y-1 text-xs">{empHours.map((e) => <li key={e.employeeId}>{e.name}: {e.hours.toFixed(1)} h</li>)}</ul>
        </Card>
      )}
      {empCost.length > 0 && (
        <Card className="p-4">
          <CardLabel>Labor cost by employee (bookkeeper and owner only)</CardLabel>
          <ul className="mt-2 space-y-1 text-xs">{empCost.map((e, i) => <li key={i}>{e.name}: {money(e.amount)}</li>)}</ul>
        </Card>
      )}
      {!can(user, "perf.wageDetail") && job.source === "live" && <p className="text-xs text-gray-500">Wage-level detail is restricted to the business owner and the office manager.</p>}
      <CorrectionModal open={correcting} jobId={job.jobId} onClose={() => setCorrecting(false)} />
    </Drawer>
  );
}

function CorrectionModal({ open, jobId, onClose }: { open: boolean; jobId: string; onClose: () => void }) {
  const [field, setField] = useState<"labourHours" | "labourCost" | "material" | "subcontractor">("material");
  const [value, setValue] = useState("");
  const [code, setCode] = useState<ReasonCode>("Customer change");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string>();
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} size="sm" title="Correct a completed job's actual" description="After completion the office manager and the business owner both approve. Issued snapshots never change."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => {
        const r = act(requestCorrection, jobId, field, Number(value), code, note);
        if (r.ok) { toast.success("Correction requested", "Applied once both approvers have approved."); onClose(); } else setErr(r.error);
      }}>Request</Button></>}>
      <div className="space-y-3">
        <Field label="Field"><Select value={field} onChange={(e) => setField(e.target.value as typeof field)}><option value="labourHours">Labor hours</option><option value="labourCost">Labor cost</option><option value="material">Material</option><option value="subcontractor">Subcontractors</option></Select></Field>
        <Field label="Corrected value" required><Input type="number" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <Field label="Reason code"><Select value={code} onChange={(e) => setCode(e.target.value as ReasonCode)}>{REASON_CODES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Note" required error={err}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function Snapshots({ onOpen }: { onOpen: (id: string) => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  return (
    <Card className="p-4" data-tour="perf-snapshots">
      <CardLabel icon={<FileText />} right={can(user, "perf.issue") && <Button size="sm" onClick={() => { const r = act(runWeeklyIssue); if (r.ok) toast.success(`Weekly summary ${r.value} issued`, "Sent to the owner, office manager and estimating manager."); }}><CalendarClock className="h-3.5 w-3.5" /> Run Monday 7 a.m. issue</Button>}>Issued snapshots</CardLabel>
      <p className="mt-1 text-xs text-gray-500">Issued reports are immutable. A correction is reissued as a new snapshot; the old one is kept seven years.</p>
      <div className="mt-3 space-y-2">
        {db.performanceSnapshots.length === 0 && <EmptyState title="No snapshots yet" body="Snapshots are saved weekly, or when someone issues one from this page." />}
        {db.performanceSnapshots.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs">
            <div>
              <div className="flex flex-wrap items-center gap-1.5"><strong>{s.id}</strong> <Badge tone={s.kind === "weekly" ? "blue" : "gray"}>{s.kind === "weekly" ? "Weekly" : "Manual"}</Badge>{s.supersededBy && <Badge tone="purple">Superseded by {s.supersededBy}</Badge>}{s.archivedAt && <Badge tone="gray" icon={<Archive className="h-3 w-3" />}>Archived</Badge>}</div>
              <div className="text-gray-500">{s.period.from} – {s.period.to} · issued {dateTime(s.issuedAt)}{s.recipients ? ` · to ${s.recipients.length} addresses` : ""}</div>
            </div>
            {s.archivedAt && !s.retrievalRequestedAt ? (
              <Button size="sm" onClick={() => act(requestArchived, s.id).ok && toast.success("Retrieval requested", "Archived — available within one working day.")}>Request</Button>
            ) : s.archivedAt ? <span className="text-xs text-gray-500">Requested {dateLong(s.retrievalRequestedAt)} — available within one working day</span> : (
              <Button size="sm" onClick={() => onOpen(s.id)}>Open</Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Corrections() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const list = db.performanceCorrections;
  return (
    <Card className="p-4">
      <CardLabel>Actual corrections</CardLabel>
      <p className="mt-1 text-xs text-gray-500">After completion the office manager and the owner approve. The current report updates at once; issued snapshots don't.</p>
      <div className="mt-3 space-y-2">
        {list.length === 0 && <p className="text-xs italic text-gray-500">No corrections.</p>}
        {list.map((c) => {
          const mine = user.role === "owner" || user.role === "office_manager" ? (user.role as "owner" | "office_manager") : undefined;
          const canApprove = c.status === "pending" && mine && c.requires.includes(mine) && !c.approvals.some((a) => a.role === mine);
          return (
            <div key={c.id} className="rounded-lg border border-line px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><strong>{c.id}</strong> · {c.jobId} · {usText(c.field)}: {c.oldValue} → {c.newValue}</span>
                {c.status === "applied" ? <Badge tone="green">Applied</Badge> : canApprove ? <Button size="sm" variant="primary" onClick={() => act(approveCorrection, c.id).ok && toast.success("Approved")}>Approve</Button> : <Badge tone="amber">Waiting for {c.requires.filter((r) => !c.approvals.some((a) => a.role === r)).map((r) => (r === "owner" ? "owner" : "office manager")).join(" and ")}</Badge>}
              </div>
              <div className="text-gray-500">{c.code} — {c.note} · approved so far by {c.approvals.map((a) => userName(db, a.by)).join(", ")}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SnapshotModal({ snap, onClose }: { snap?: PerformanceSnapshot; onClose: () => void }) {
  const user = useCurrentUser();
  const db = useDb((d) => d);
  if (!snap) return null;
  const estimator = user.role === "estimator" || user.role === "senior_estimator";
  const ownJobs = new Set([...db.jobs, ...db.completedJobs].filter((j) => j.estimatorId === user.id).map((j) => j.id));
  const rows = estimator ? snap.rows.filter((r) => r.jobIds.every((id) => ownJobs.has(id))) : snap.rows;
  const blocked = user.role === "crew_lead" && snap.measure === "cost";
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="xl" title={`${snap.id} — issued ${dateTime(snap.issuedAt)}`} description={`Period ${snap.period.from} – ${snap.period.to} · work date · ${snap.timezone}. Read-only: snapshots can't be edited or deleted by anyone.`}>
      {blocked ? <Banner tone="info">This snapshot is in cost. Crew leads see hours only.</Banner> : rows.length === 0 ? <EmptyState title="Nothing in this snapshot you can see" /> : (
        <Grid rows={rows} measure={snap.measure} baseline={snap.baseline} dimension={snap.dimension} readOnly />
      )}
    </Modal>
  );
}

function SaveFilterModal({ open, onClose, preset, filter }: { open: boolean; onClose: () => void; preset: string; filter: PerfFilter }) {
  const [name, setName] = useState("");
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} size="sm" title="Save this filter" description="Saved per user. Loading it always applies the viewer's own permissions."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { if (act(saveFilter, name, preset, filter).ok) { toast.success("Filter saved"); setName(""); onClose(); } }}>Save</Button></>}>
      <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Interior jobs this quarter" /></Field>
    </Modal>
  );
}
