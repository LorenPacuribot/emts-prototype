"use client";
/**
 * Feature 33 — Finance reports: job margin, monthly income and expense,
 * aged receivables. Each shows the synchronisation cutoff and an
 * unmatched-cost warning where one applies.
 * NEW (needs client confirmation): Reports tabs Job Margin, Income & Expense, Aged Receivables (/reports?tab=).
 */
import { useState } from "react";
import { AlertTriangle, Download } from "lucide-react";
import { useDb } from "@/features/lib/store";
import { byId } from "@/features/lib/selectors";
import { dateLong, dateTime, money, pct } from "@/features/lib/format";
import { downloadCsv } from "@/features/lib/export";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { useParam } from "@/features/lib/navigation";
import { roundMoney } from "@/features/lib/rules/rounding";
import { ageFromInvoiceDate, periodOf, type AgeBucket } from "@/features/lib/rules/finance";
import { jobFinancials, unallocated } from "@/features/lib/store/actions/finance";
import { burdenedTotal } from "@/features/lib/rules/labour-cost";
import { PanelHeader as PageHeader } from "@/features/components/features/contacts/details/panel-header";
import { Badge, Banner, Button, Card, PillTabs, Table, TD, TH, THead, TR } from "@/features/components/ui";

type View = "margin" | "income" | "receivables";


const NA = <span className="text-gray-500">Not applicable</span>;

export function FinanceReportsBody({ view }: { view: View }) {
  const db = useDb((d) => d);
  const cutoff = db.financeSettings.qbo.lastExchangeAt;
  const unmatchedBills = db.financeRecords.filter((r) => r.match && r.match.unmatchedValue > 0);
  const toCode = unallocated(db);

  return (
    <>
      <PageHeader
        title="Finance Reports"
        subtitle={`Synchronised with QuickBooks up to ${dateTime(cutoff)}. Formal financial statements stay in QuickBooks.`}
      />
      {(unmatchedBills.length > 0 || toCode.length > 0) && (
        <Banner tone="warn" className="mb-4" title="Unmatched costs">
          {unmatchedBills.length > 0 && `${unmatchedBills.length} bill${unmatchedBills.length === 1 ? "" : "s"} with quantities billed but not received (${money(unmatchedBills.reduce((a, r) => a + r.match!.unmatchedValue, 0))}). `}
          {toCode.length > 0 && `${toCode.length} QuickBooks record${toCode.length === 1 ? "" : "s"} not yet coded to a job (${money(toCode.reduce((a, r) => a + r.amount, 0))}).`}
        </Banner>
      )}
      {view === "margin" && <Margin cutoff={cutoff} />}
      {view === "income" && <Income cutoff={cutoff} />}
      {view === "receivables" && <Receivables cutoff={cutoff} />}
    </>
  );
}

function Margin({ cutoff }: { cutoff?: string }) {
  const db = useDb((d) => d);
  const jobs = db.jobs.filter((j) => j.contractSigned);
  const rows = jobs.map((j) => ({ job: j, f: jobFinancials(db, j.id) }));
  const csv = () => {
    downloadCsv(`job-margin-${now().slice(0, 10)}.csv`, [
      [`Synchronised to ${cutoff ?? "—"}`],
      ["job", "contract_ex_tax", "invoiced_ex_tax", "labour", "material", "subcontractor", "other", "credits", "cost_to_date", "actual_margin", "forecast_cost", "projected_margin"],
      ...rows.map(({ job, f }) => [job.id, f.contractExTax, f.invoicedExTax, f.labour, f.material, f.subcontractor, f.other, f.credits, f.costToDate, f.actual === null ? "Not applicable" : (f.actual * 100).toFixed(1) + "%", f.forecastCost, f.projected === null ? "Not applicable" : (f.projected * 100).toFixed(1) + "%"]),
    ]);
    toast.success("Job margin exported");
  };
  return (
    <Card className="p-4" data-tour="job-margin">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">Actual margin = (invoiced revenue ex tax − job cost to date) ÷ invoiced revenue ex tax. Projected margin, for jobs in progress = (contract ex tax − forecast cost) ÷ contract ex tax. The two are never blended.</p>
        <Button size="sm" onClick={csv}><Download className="h-3.5 w-3.5" /> CSV</Button>
      </div>
      <Table>
        <THead><tr><TH>Job</TH><TH className="text-right">Contract (ex tax)</TH><TH className="text-right">Invoiced (ex tax)</TH><TH className="text-right">Labor</TH><TH className="text-right">Material</TH><TH className="text-right">Subs / other</TH><TH className="text-right">Cost to date</TH><TH className="text-right">Actual margin</TH><TH className="text-right">Projected margin</TH></tr></THead>
        <tbody>
          {rows.map(({ job, f }) => (
            <TR key={job.id}>
              <TD className="font-semibold">{job.id}<div className="text-xs font-normal text-gray-500">{job.name}</div>{f.unmatched > 0 && <Badge tone="amber" icon={<AlertTriangle className="h-3 w-3" />}>{money(f.unmatched)} unmatched</Badge>}</TD>
              <TD className="text-right tabular-nums">{money(f.contractExTax)}</TD>
              <TD className="text-right tabular-nums">{money(f.invoicedExTax)}</TD>
              <TD className="text-right tabular-nums">{money(f.labour)}</TD>
              <TD className="text-right tabular-nums">{money(f.material)}<div className="text-xs text-gray-500">incl. purchase tax</div></TD>
              <TD className="text-right tabular-nums">{money(f.subcontractor + f.other)}</TD>
              <TD className="text-right tabular-nums font-semibold">{money(f.costToDate)}{f.credits ? <div className="text-xs text-gray-500">after {money(f.credits)} credits</div> : null}</TD>
              <TD className="text-right"><div className="text-xxs font-bold uppercase tracking-wide text-gray-500">Actual margin</div>{f.actual === null ? NA : <span className="font-semibold tabular-nums">{pct(f.actual, 1)}</span>}</TD>
              <TD className="text-right"><div className="text-xxs font-bold uppercase tracking-wide text-gray-500">Projected margin</div>{f.projected === null ? (f.inProgress ? NA : <span className="text-gray-500">Job complete</span>) : <span className="font-semibold tabular-nums">{pct(f.projected, 1)}</span>}<div className="text-xs text-gray-500">forecast {money(f.forecastCost)}</div></TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <p className="mt-2 text-xs text-gray-500">Customer sales tax is excluded from revenue; purchase tax is included in cost. Labor is the bookkeeper's approved payroll totals, split across jobs by approved hours. Deposits are liabilities, not revenue.</p>
    </Card>
  );
}

function Income({ cutoff }: { cutoff?: string }) {
  const db = useDb((d) => d);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now());
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return periodOf(d.toISOString());
  });
  const live = (r: { deletedInQbo?: unknown; approvalRequest?: unknown }) => !r.deletedInQbo && !r.approvalRequest;
  const rows = months.map((m) => {
    const recs = db.financeRecords.filter((r) => r.period === m && live(r));
    const revenue = roundMoney(recs.filter((r) => r.type === "invoice").reduce((a, r) => a + r.amount, 0));
    const cost = (codes: string[]) => roundMoney(recs.filter((r) => ["bill", "receipt", "check"].includes(r.type) && r.costCode && codes.includes(r.costCode)).reduce((a, r) => a + r.amount + (r.purchaseTax ?? 0), 0));
    const credits = roundMoney(recs.filter((r) => r.type === "credit").reduce((a, r) => a + r.amount, 0));
    const labour = roundMoney(db.labourCosts.filter((l) => l.weekStart.slice(0, 7) === m).reduce((a, l) => a + burdenedTotal(l.amount, l.burdenPct), 0));
    const materials = roundMoney(cost(["PAINT", "SUND"]) - credits);
    const subs = cost(["SUB"]);
    const overhead = cost(["VEH", "RENT"]);
    return { m, revenue, materials, labour, subs, overhead, net: roundMoney(revenue - materials - labour - subs - overhead) };
  });
  const years = [...new Set(db.migrationTotals.map((x) => x.year))].sort((a, b) => b - a);
  const csv = () => {
    downloadCsv(`income-expense-${now().slice(0, 10)}.csv`, [[`Synchronised to ${cutoff ?? "—"}`], ["month", "revenue_ex_tax", "materials", "labour", "subcontractors", "overhead", "net"], ...rows.map((r) => [r.m, r.revenue, r.materials, r.labour, r.subs, r.overhead, r.net])]);
    toast.success("Income and expense exported");
  };
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between"><p className="text-xs text-gray-500">Monthly, by accounting period. Revenue excludes customer sales tax; costs include purchase tax.</p><Button size="sm" onClick={csv}><Download className="h-3.5 w-3.5" /> CSV</Button></div>
        <Table>
          <THead><tr><TH>Month</TH><TH className="text-right">Revenue</TH><TH className="text-right">Materials</TH><TH className="text-right">Labor</TH><TH className="text-right">Subcontractors</TH><TH className="text-right">Overhead</TH><TH className="text-right">Net</TH></tr></THead>
          <tbody>{rows.map((r) => (
            <TR key={r.m}><TD className="font-semibold">{r.m}{db.financeSettings.closedPeriods.includes(r.m) && <Badge tone="gray" className="ml-1.5">Closed</Badge>}</TD>
              {[r.revenue, r.materials, r.labour, r.subs, r.overhead].map((v, i) => <TD key={i} className="text-right tabular-nums">{money(v)}</TD>)}
              <TD className={`text-right font-semibold tabular-nums ${r.net < 0 ? "text-red-600" : ""}`}>{money(r.net)}</TD></TR>
          ))}</tbody>
        </Table>
      </Card>
      <Card className="p-4">
        <p className="mb-3 text-xs text-gray-500">Comparison totals from the two-year migration. Totals only — no historical transactions were imported or reposted.</p>
        <Table>
          <THead><tr><TH>Year</TH>{(["revenue", "materials", "labour", "subcontractors", "overhead"] as const).map((c) => <TH key={c} className="text-right capitalize">{c}</TH>)}</tr></THead>
          <tbody>{years.map((y) => <TR key={y}><TD className="font-semibold">{y}</TD>{(["revenue", "materials", "labour", "subcontractors", "overhead"] as const).map((c) => <TD key={c} className="text-right tabular-nums">{money(db.migrationTotals.find((x) => x.year === y && x.category === c)?.amount ?? 0, { cents: false })}</TD>)}</TR>)}</tbody>
        </Table>
      </Card>
    </div>
  );
}

function Receivables({ cutoff }: { cutoff?: string }) {
  const db = useDb((d) => d);
  const asOf = now();
  const rows = db.financeRecords
    .filter((r) => r.type === "invoice" && r.paymentStatus !== "paid" && !r.deletedInQbo)
    .map((r) => {
      const credit = db.financeRecords.filter((x) => x.accountCredit && x.jobId === r.jobId).reduce((a, x) => a + (x.accountCredit ?? 0), 0);
      const outstanding = roundMoney(r.amount + (r.salesTax ?? 0) - (r.amountPaid ?? 0) - credit);
      return { r, age: ageFromInvoiceDate(r.date, asOf), outstanding, credit };
    });
  const buckets: AgeBucket[] = ["0–30", "31–60", "61–90", "90+"];
  const csv = () => {
    downloadCsv(`aged-receivables-${asOf.slice(0, 10)}.csv`, [[`Synchronised to ${cutoff ?? "—"}; aged from invoice date as of ${asOf.slice(0, 10)}`], ["invoice", "job", "customer", "invoice_date", "age_days", "bucket", "outstanding"], ...rows.map((x) => [x.r.ref, x.r.jobId, x.r.party, x.r.date.slice(0, 10), x.age.days, x.age.bucket, x.outstanding])]);
    toast.success("Aged receivables exported");
  };
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">{buckets.map((b) => <Badge key={b} tone={b === "90+" ? "red" : b === "61–90" ? "amber" : "gray"}>{b} days: {money(rows.filter((x) => x.age.bucket === b).reduce((a, x) => a + x.outstanding, 0))}</Badge>)}</div>
        <Button size="sm" onClick={csv}><Download className="h-3.5 w-3.5" /> CSV</Button>
      </div>
      <Table>
        <THead><tr><TH>Invoice</TH><TH>Job</TH><TH>Customer</TH><TH>Invoice date</TH><TH className="text-right">Age</TH><TH className="text-right">Outstanding</TH></tr></THead>
        <tbody>{rows.map(({ r, age, outstanding, credit }) => (
          <TR key={r.id}><TD className="font-semibold">{r.ref}</TD><TD>{r.jobId} <span className="text-gray-500">{byId(db.jobs, r.jobId)?.name}</span></TD><TD>{r.party}</TD><TD>{dateLong(r.date)}</TD>
            <TD className="text-right tabular-nums">{age.days} d <Badge tone="gray">{age.bucket}</Badge></TD><TD className="text-right tabular-nums font-semibold">{money(outstanding)}{credit ? <div className="text-xs text-gray-500">after {money(credit)} credit</div> : null}</TD></TR>
        ))}</tbody>
      </Table>
      <p className="mt-2 text-xs text-gray-500">Receivables age from the invoice date, never from the due date. Credits reduce receivables; bad-debt entries stay in QuickBooks.</p>
    </Card>
  );
}
