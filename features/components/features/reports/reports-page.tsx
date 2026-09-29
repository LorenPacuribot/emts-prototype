"use client";
/**
 * /reports?tab= — one page with the live REPORT_TABS, like the live app.
 * The six live tabs are rebuilt from the prototype data (columns as the
 * live components); the NEW tabs render the feature screens.
 */
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { useDb } from "@/features/lib/store";
import { useParam } from "@/features/lib/navigation";
import { byId } from "@/features/lib/selectors";
import { sourceName } from "@/features/lib/store/helpers";
import { ESTIMATE_STATUS_LABEL, ESTIMATE_STATUS_TONE } from "@/features/lib/rules/estimate-lifecycle";
import { specForSurface, jobSurfaceHours } from "@/features/lib/rules/estimate";
import { renderedHoursBySurface } from "@/features/lib/store/actions/work-orders";
import { downloadCsv } from "@/features/lib/export";
import { date, dateTime, money } from "@/features/lib/format";
import { cn } from "@/features/lib/cn";
import { Button, EmptyState, Input, StatusPill } from "@/features/components/ui";
import { ReportsFrame, REPORT_TABS, type ReportTabKey } from "./reports-frame";
import { JobPerformanceScreen } from "./job-performance-screen";
import { EstimatingFeedbackScreen } from "./estimating-feedback-screen";
import { FinanceReportsBody } from "@/features/components/features/finance/reports-screen";

export function ReportsPage() {
  const param = useParam("tab") as ReportTabKey | undefined;
  const tab: ReportTabKey = param && REPORT_TABS.some((t) => t.key === param) ? param : "estimates";
  if (tab === "job_performance") return <JobPerformanceScreen />;
  if (tab === "estimating_feedback") return <EstimatingFeedbackScreen />;
  return (
    <ReportsFrame tab={tab}>
      {tab === "estimates" && <EstimatesLog />}
      {tab === "jobs_sold" && <JobsSold />}
      {tab === "sales" && <SalesGoal />}
      {tab === "production" && <JobsToDo />}
      {tab === "summary" && <Stats />}
      {tab === "activity" && <ActivityLog />}
      {tab === "job_margin" && <FinanceReportsBody view="margin" />}
      {tab === "income_expense" && <FinanceReportsBody view="income" />}
      {tab === "aged_receivables" && <FinanceReportsBody view="receivables" />}
    </ReportsFrame>
  );
}

function Card({ title, children, onExport }: { title: string; children: React.ReactNode; onExport?: () => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border-0 bg-white shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-5">
        <h3 className="font-heading text-lg font-bold text-gray-900">{title}</h3>
        {onExport && <Button size="sm" onClick={onExport}><Download className="h-4 w-4" /> Export</Button>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
const th = "px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-gray-500";
const td = "px-6 py-3 text-sm text-gray-700";

function EstimatesLog() {
  const db = useDb((d) => d);
  const rows = [...db.estimates].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Card title={`Estimates Log (${new Date().getFullYear()})`} onExport={() => downloadCsv("estimates-log.csv", [["Date", "Estimate", "Customer", "Amount", "Status"], ...rows.map((e) => [date(e.createdAt), e.id, byId(db.customers, e.customerId)?.name, e.total, ESTIMATE_STATUS_LABEL[e.status]])])}>
      <table className="w-full min-w-[720px] text-left">
        <thead className="border-b border-gray-100"><tr>{["Date", "Job #", "Customer", "Source", "Amount", "Status"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((e) => {
            const lead = byId(db.leads, e.leadId);
            return <tr key={e.id}><td className={td}>{date(e.createdAt)}</td><td className={cn(td, "font-mono font-bold")}>{e.id}</td><td className={td}>{byId(db.customers, e.customerId)?.name}</td><td className={td}>{lead?.source.replace("_", " ") ?? "—"}</td><td className={td}>{money(e.total)}</td><td className={td}><StatusPill tone={ESTIMATE_STATUS_TONE[e.status]}>{ESTIMATE_STATUS_LABEL[e.status]}</StatusPill></td></tr>;
          })}
        </tbody>
      </table>
    </Card>
  );
}

function JobsSold() {
  const db = useDb((d) => d);
  const jobs = db.jobs.filter((j) => j.contractSigned);
  return (
    <Card title={`Jobs Sold (${new Date().getFullYear()})`}>
      <table className="w-full min-w-[640px] text-left">
        <thead className="border-b border-gray-100"><tr>{["Date", "Job #", "Customer", "Amount", "Paid"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">
          {jobs.map((j) => <tr key={j.id}><td className={td}>{date(j.contractSignedAt)}</td><td className={cn(td, "font-mono font-bold")}>{j.id}</td><td className={td}>{byId(db.customers, j.customerId)?.name}</td><td className={td}>{money(j.contractValue)}</td><td className={td}>{money(j.depositsCollected)}</td></tr>)}
        </tbody>
      </table>
    </Card>
  );
}

function SalesGoal() {
  const db = useDb((d) => d);
  const sold = db.jobs.filter((j) => j.contractSigned).reduce((a, j) => a + j.contractValue, 0);
  return (
    <Card title="Sales Goal">
      <div className="grid gap-6 p-6 sm:grid-cols-3">
        {[["Target Revenue", 100000], ["Actual Sold", sold], ["Differential", sold - 100000]].map(([l, v]) => <div key={l as string}><div className="text-xs font-bold uppercase tracking-widest text-gray-500">{l}</div><div className="font-heading text-2xl font-black">{money(v as number)}</div></div>)}
      </div>
    </Card>
  );
}

/** Live "Jobs To Do": Job #, Customer, Contract, Budget Hrs, Used, Remaining. */
function JobsToDo() {
  const db = useDb((d) => d);
  const rows = useMemo(() => db.workOrders.filter((w) => w.status !== "COMPLETED").map((w) => {
    const job = byId(db.jobs, w.jobId)!;
    const budget = job.surfaceIds.map((id) => byId(db.surfaces, id)).filter(Boolean).reduce((a, s) => a + jobSurfaceHours(db, job.id, s!), 0);
    const used = Array.from(renderedHoursBySurface(w).values()).reduce((a, b) => a + b, 0);
    return { job, budget, used, remaining: budget - used, pct: budget ? used / budget : 0 };
  }), [db]);
  return (
    <Card title={`Production Schedule (${new Date().getFullYear()})`}>
      {rows.length === 0 ? <div className="p-6"><EmptyState title="No production jobs found for this period." /></div> : (
        <table className="w-full min-w-[720px] text-left">
          <thead className="border-b border-gray-100"><tr>{["Job #", "Customer", "Contract", "Budget Hrs", "Used", "Remaining"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.job.id}>
                <td className={cn(td, "font-mono font-bold")}>{r.job.id}</td>
                <td className={td}>{byId(db.customers, r.job.customerId)?.name}</td>
                <td className={cn(td, "text-right")}>{money(r.job.contractValue)}</td>
                <td className={cn(td, "text-center")}><span className="rounded-full bg-gray-100 px-2 py-0.5">{r.budget.toFixed(1)}</span></td>
                <td className={cn(td, "text-center")}>{r.used.toFixed(1)}</td>
                <td className={cn(td, "text-center")}>{r.remaining.toFixed(1)}<div className="mx-auto mt-1 h-1.5 w-16 rounded-full bg-gray-100"><div className={cn("h-1.5 rounded-full", r.pct > 0.9 ? "bg-red-500" : "bg-green-500")} style={{ width: `${Math.min(100, r.pct * 100)}%` }} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Stats() {
  const db = useDb((d) => d);
  const done = db.estimates.length;
  const sold = db.estimates.filter((e) => e.status === "ACCEPTED").length;
  return (
    <Card title={`${new Date().getFullYear()} Performance Summary`}>
      <div className="grid gap-6 p-6 sm:grid-cols-3">
        {[["Estimates Done", done], ["Jobs Sold", sold], ["Close Rate", `${done ? Math.round((sold / done) * 100) : 0}%`]].map(([l, v]) => <div key={l as string}><div className="text-xs font-bold uppercase tracking-widest text-gray-500">{l}</div><div className="font-heading text-2xl font-black">{v}</div></div>)}
      </div>
    </Card>
  );
}

function ActivityLog() {
  const db = useDb((d) => d);
  const [q, setQ] = useState("");
  const rows = db.activity.filter((a) => [a.module, a.message].join(" ").toLowerCase().includes(q.toLowerCase())).slice(0, 100);
  return (
    <Card title="Activity Log">
      <div className="relative px-6 pt-4"><Search className="pointer-events-none absolute left-9 top-1/2 mt-2 h-4 w-4 -translate-y-1/2 text-gray-500" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activity..." className="pl-9" /></div>
      <table className="mt-2 w-full min-w-[720px] text-left">
        <thead className="border-b border-gray-100"><tr>{["When", "Area", "What", "User"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((a) => <tr key={a.id}><td className={cn(td, "whitespace-nowrap")}>{dateTime(a.at)}</td><td className={td}>{a.module}</td><td className={cn(td, a.blocked && "text-red-700")}>{a.message}</td><td className={td}>{sourceName(db, a)}</td></tr>)}
        </tbody>
      </table>
    </Card>
  );
}
