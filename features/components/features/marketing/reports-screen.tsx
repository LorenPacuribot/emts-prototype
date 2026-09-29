"use client";
/**
 * Feature 34 — Monthly report: posts published and leads by source, then
 * campaign analytics (patent §34): revenue by campaign, leads by source and
 * customer acquisition cost, for the month or all time. Reach and engagement
 * stay Unavailable until a platform reports them — never zero, never estimated.
 */
import { useMemo, useState } from "react";
import { FileBarChart, Target } from "lucide-react";
import type { LeadSource } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { titleCase } from "@/features/lib/format";
import { AppLink } from "@/features/lib/navigation";
import { localParts } from "@/features/lib/rules/marketing";
import { cacReport, expenseTotals, leadsBySourceReport, revenueByCampaignReport } from "@/features/lib/rules/marketing-growth";
import { logMonthlyReport, monthlyReport } from "@/features/lib/store/actions/marketing";
import { PageHeader } from "@/features/components/layout/screen";
import { Banner, Button, Card, CardLabel, EmptyState, Field, Input, PillTabs, Stat, StatStrip, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { MarketingFrame } from "./marketing-frame";
import { cents, ReportTableCard, TAP } from "./growth-shared";

export function MarketingReportScreen() {
  return (
    <MarketingFrame tab="reports">
      <Report />
    </MarketingFrame>
  );
}

const SOURCES: LeadSource[] = ["website", "referral", "existing_customer", "repaint_alert"];

function Report() {
  const db = useDb((d) => d);
  const [month, setMonth] = useState(localParts(now()).date.slice(0, 7));
  const [scope, setScope] = useState<"month" | "all">("month");
  const r = monthlyReport(db, month);
  const range = scope === "month" ? { from: `${month}-01`, to: `${month}-31` } : {};
  const campaigns = useMemo(() => revenueByCampaignReport(db, now(), range), [db, scope, month]);
  const bySource = useMemo(() => leadsBySourceReport(db, now(), range), [db, scope, month]);
  const cac = useMemo(() => cacReport(db, now(), range), [db, scope, month]);
  const spend = expenseTotals(db, range);
  const hasCampaigns = (db.mktCampaigns ?? []).length > 0;
  return (
    <>
      <PageHeader title="Monthly Report" subtitle="Posts published and leads by source, then what each campaign produced: leads, jobs, revenue, spend, customer acquisition cost and ROI."
        actions={<Button className={TAP} variant="primary" onClick={() => act(logMonthlyReport, month).ok && toast.success(`Report for ${month} produced`, "Logged with the unavailable metrics named.")}><FileBarChart className="h-4 w-4" /> Produce report</Button>} />
      <Card className="mb-4 p-4"><Field label="Month" htmlFor="rep-month"><Input id="rep-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-48" /></Field></Card>
      <StatStrip className="mb-4" data-tour="marketing-report">
        <Stat label="Posts published" value={r.published} hint={`Facebook ${r.perPlatform.facebook} · Instagram ${r.perPlatform.instagram} platform posts`} />
        <Stat label="Website leads" value={r.bySource.website ?? 0} />
        <Stat label="All leads" value={r.leads} />
        {r.unavailable.map((u) => <Stat key={u} label={u} value={<span className="text-[14px] text-slate-400">Unavailable</span>} hint="not reported by the platform" />)}
      </StatStrip>
      <Card className="p-4">
        <CardLabel>Leads by source at creation</CardLabel>
        <div className="mt-3">
          <Table>
            <THead><tr><TH>Source at creation</TH><TH className="text-right">Leads</TH></tr></THead>
            <tbody>{SOURCES.map((s) => <TR key={s}><TD>{titleCase(s)}</TD><TD className="text-right tabular-nums">{r.bySource[s] ?? 0}</TD></TR>)}</tbody>
          </Table>
        </div>
      </Card>

      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[18px] font-bold text-ink">Campaign analytics</h2>
        <PillTabs value={scope} onChange={setScope} options={[{ value: "month", label: `Month ${month}` }, { value: "all", label: "All time" }]} />
      </div>
      {!hasCampaigns ? (
        <EmptyState icon={<Target />} title="No campaigns yet" body="Campaign analytics build from the leads, spend and links attached to a campaign. Create one to start." action={<AppLink href="/marketing/campaigns" className={`inline-flex h-10 items-center rounded-lg bg-brand px-4 text-[13px] font-semibold text-white ${TAP}`}>Go to Campaigns</AppLink>} />
      ) : (
        <div className="space-y-4">
          <StatStrip>
            <Stat label="Marketing expenses" value={cents(spend.total)} hint={scope === "month" ? `Logged in ${month}` : "All time"} />
            <Stat label="Leads" value={bySource.rows.reduce((a, x) => a + Number(x[1]), 0)} />
            <Stat label="Jobs won" value={bySource.rows.reduce((a, x) => a + Number(x[4]), 0)} />
            <Stat label="Revenue" value={cents(bySource.rows.reduce((a, x) => a + Number(x[5]), 0))} hint="Signed, before tax" />
          </StatStrip>
          <ReportTableCard table={campaigns} empty="No campaigns." />
          <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
            <ReportTableCard table={bySource} empty={scope === "month" ? "No leads this month." : "No leads yet."} />
            <ReportTableCard table={cac} empty="No spend or leads." />
          </div>
        </div>
      )}
      <Banner tone="info" className="mt-4">How attribution works: a lead&apos;s campaign comes from how it arrived (tracked link or QR code, landing page, promo or referral code, social message) or from being attached to the campaign by hand. Revenue is the signed contract value before tax. Spend is logged marketing expenses plus ad spend. CAC = spend ÷ new customers won; ROI = (revenue − spend) ÷ spend. Leads and revenue are counted by lead date; spend by expense date.</Banner>
    </>
  );
}
