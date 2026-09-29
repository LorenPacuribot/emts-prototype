"use client";
/**
 * Feature 29 — Monthly Measures (29.4).
 * Menu: Service > Monthly Measures
 *
 * Alerts by system date, contacts (successful conversations only), attempts
 * (counted separately), estimates issued, jobs sold and dollars won — each
 * with a drill-down. Dollars won = signed contract value excluding tax and
 * later change orders, in the signature month. Dollar figures are absent for
 * roles that can't see them, including in the CSV export.
 */
import { useMemo, useState } from "react";
import { BarChart3, Download } from "lucide-react";
import { useCurrentUser, useDb } from "@/features/lib/store";
import { lastMonths, monthKey, monthLabel, monthlyMeasures, type MeasureItem, type MeasureKey } from "@/features/lib/rules/alerts";
import { byId, propertyAddress } from "@/features/lib/selectors";
import { can } from "@/features/lib/permissions";
import { date, money } from "@/features/lib/format";
import { now } from "@/features/lib/clock";
import { downloadCsv } from "@/features/lib/export";
import { toast } from "@/features/lib/toast";
import { PageHeader } from "@/features/components/layout/screen";
import { Banner, Button, Card, CardLabel, Drawer, EmptyState, IdChip, Select, Stat, StatStrip, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { ServiceFrame } from "./service-frame";

export function MonthlyMeasuresScreen() {
  return (
    <ServiceFrame tab="measures">
      <Measures />
    </ServiceFrame>
  );
}

const LABELS: Record<MeasureKey, string> = {
  alerts: "Alerts (system date)",
  contacts: "Contacts (conversations)",
  attempts: "Attempts",
  estimates: "Estimates issued",
  sold: "Jobs sold",
  dollars: "Dollars won",
};

function Measures() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const dollars = can(user, "followup.seeDollars");
  const [range, setRange] = useState("6");
  const [drill, setDrill] = useState<{ key: MeasureKey; month: string }>();
  const t = now();
  const data = useMemo(() => monthlyMeasures(db), [db]);
  const months = lastMonths(t, Number(range));
  const keys: MeasureKey[] = dollars ? ["alerts", "contacts", "attempts", "estimates", "sold", "dollars"] : ["alerts", "contacts", "attempts", "estimates", "sold"];
  const inMonth = (k: MeasureKey, m: string) => data[k].filter((i) => monthKey(i.at) === m);
  const val = (k: MeasureKey, m: string) => (k === "dollars" ? inMonth(k, m).reduce((s, i) => s + (i.amount ?? 0), 0) : inMonth(k, m).length);
  const total = (k: MeasureKey) => months.reduce((s, m) => s + val(k, m), 0);
  const fmt = (k: MeasureKey, v: number) => (k === "dollars" ? money(v, { cents: false }) : String(v));
  const items: MeasureItem[] = drill ? inMonth(drill.key, drill.month) : [];

  function exportCsv() {
    downloadCsv(`repaint-measures-${months[months.length - 1]}-to-${months[0]}.csv`, [["Month", ...keys.map((k) => LABELS[k])], ...months.map((m) => [monthLabel(m), ...keys.map((k) => val(k, m))])]);
    toast.success("CSV exported", dollars ? "Measures downloaded." : "Measures downloaded without dollar figures.");
  }

  return (
    <>
      <PageHeader
        title="Monthly Measures"
        subtitle="What the repaint programme produced. Contacts are conversations only; unsuccessful attempts are counted separately. Won means a signed contract, not a completed repaint."
        actions={
          <div className="flex items-center gap-2">
            <Select value={range} onChange={(e) => setRange(e.target.value)} className="h-10 w-40" aria-label="Range">
              <option value="3">Last 3 months</option>
              <option value="6">Last 6 months</option>
              <option value="12">Last 12 months</option>
            </Select>
            <Button onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
          </div>
        }
      />
      {!dollars && <Banner tone="info" className="mb-4">Dollar figures are visible to the business owner, office manager and bookkeeper.</Banner>}
      <StatStrip className="mb-4">
        {keys.map((k) => (
          <Stat key={k} label={`${LABELS[k]} · ${range} mo`} value={fmt(k, total(k))} tone={k === "dollars" ? "good" : "default"} />
        ))}
      </StatStrip>
      <Card className="p-4">
        <CardLabel icon={<BarChart3 />}>By month — click a figure to see the opportunities behind it</CardLabel>
        <Table className="mt-3">
          <THead>
            <tr>
              <TH>Month</TH>
              {keys.map((k) => <TH key={k} className="text-right">{LABELS[k]}</TH>)}
            </tr>
          </THead>
          <tbody>
            {months.map((m) => (
              <TR key={m}>
                <TD className="font-semibold text-ink">{monthLabel(m)}</TD>
                {keys.map((k) => {
                  const v = val(k, m);
                  return (
                    <TD key={k} className="text-right">
                      {v ? (
                        <button className="rounded px-1.5 py-0.5 font-semibold text-brand hover:bg-brand-soft" onClick={() => setDrill({ key: k, month: m })}>{fmt(k, v)}</button>
                      ) : (
                        <span className="text-gray-300">{fmt(k, 0)}</span>
                      )}
                    </TD>
                  );
                })}
              </TR>
            ))}
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-gray-500">
          Dollars won excludes tax and any later change orders, and is attributed to the month the contract was signed. A reopened opportunity keeps its ID, so it is counted once.
          {" "}Completed repaints linked: {db.followUps.filter((f) => f.completedRepaintJobId).length} (reported separately from Won).
        </p>
      </Card>

      <Drawer open={!!drill} onOpenChange={(v) => !v && setDrill(undefined)} title={drill ? `${LABELS[drill.key]} · ${monthLabel(drill.month)}` : ""} subtitle={`${items.length} record${items.length === 1 ? "" : "s"}`}>
        {items.length === 0 ? (
          <EmptyState title="Nothing in this month" />
        ) : (
          <Table>
            <THead><tr><TH>Date</TH><TH>Record</TH><TH>Property</TH>{drill?.key === "dollars" && <TH className="text-right">Amount</TH>}</tr></THead>
            <tbody>
              {items.map((i) => (
                <TR key={i.key}>
                  <TD className="whitespace-nowrap">{date(i.at)}</TD>
                  <TD><div className="flex flex-wrap items-center gap-1.5">{i.followUpId && <IdChip>{i.followUpId}</IdChip>}{i.alertId && <IdChip>{i.alertId}</IdChip>}<span>{i.label}</span></div></TD>
                  <TD className="text-xs">{propertyAddress(byId(db.properties, i.propertyId))}</TD>
                  {drill?.key === "dollars" && <TD className="text-right font-semibold">{money(i.amount)}</TD>}
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Drawer>
    </>
  );
}
