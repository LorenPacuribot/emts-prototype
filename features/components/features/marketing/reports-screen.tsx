"use client";
/**
 * Feature 34 — Monthly report: posts published and website leads by source.
 * Permission-dependent metrics show as Unavailable — never zero, never
 * estimated. No reach, engagement or revenue attribution at launch.
 */
import { useState } from "react";
import { FileBarChart } from "lucide-react";
import type { LeadSource } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { titleCase } from "@/features/lib/format";
import { localParts } from "@/features/lib/rules/marketing";
import { logMonthlyReport, monthlyReport } from "@/features/lib/store/actions/marketing";
import { PageHeader } from "@/features/components/layout/screen";
import { Banner, Button, Card, CardLabel, Field, Input, Stat, StatStrip, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { MarketingFrame } from "./marketing-frame";

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
  const r = monthlyReport(db, month);
  return (
    <>
      <PageHeader title="Monthly Report" subtitle="The two agreed monthly counts: posts published, and leads by source."
        actions={<Button variant="primary" onClick={() => act(logMonthlyReport, month).ok && toast.success(`Report for ${month} produced`, "Logged with the unavailable metrics named.")}><FileBarChart className="h-4 w-4" /> Produce report</Button>} />
      <Card className="mb-4 p-4"><Field label="Month"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-48" /></Field></Card>
      <StatStrip className="mb-4" data-tour="marketing-report">
        <Stat label="Posts published" value={r.published} hint={`Facebook ${r.perPlatform.facebook} · Instagram ${r.perPlatform.instagram} platform posts`} />
        <Stat label="Website leads" value={r.bySource.website ?? 0} />
        <Stat label="All leads" value={r.leads} />
        {r.unavailable.map((u) => <Stat key={u} label={u} value={<span className="text-[14px] text-slate-400">Unavailable</span>} hint="not reported at launch" />)}
      </StatStrip>
      <Card className="p-4">
        <CardLabel>Leads by source</CardLabel>
        <div className="mt-3">
          <Table>
            <THead><tr><TH>Source at creation</TH><TH className="text-right">Leads</TH></tr></THead>
            <tbody>{SOURCES.map((s) => <TR key={s}><TD>{titleCase(s)}</TD><TD className="text-right tabular-nums">{r.bySource[s] ?? 0}</TD></TR>)}</tbody>
          </Table>
        </div>
      </Card>
      <Banner tone="info" className="mt-4">Attribution rules are recorded for later design only: origin is the lead source at creation, the window is 90 days from creation to signed contract, and revenue is the signed value excluding tax in the signing month. No campaign analytics are produced now.</Banner>
    </>
  );
}
