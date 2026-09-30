"use client";
/**
 * Feature 33 — Vendors, cost codes, mappings, periods and migration.
 * Menu: Finance > Vendors & Mappings
 *
 * The bookkeeper controls the chart of accounts, categories and mappings;
 * the owner approves job-cost codes and activates vendors the office
 * requests. Migration brings two years of comparison totals only.
 *
 * 30 Sep call: the QuickBooks sync options (QB-M2) sit apart in the mappings,
 * and the migration section starts with "Match your contacts" (QB-M3).
 */
import { useState } from "react";
import { Building2, CheckCircle2, Download, FileLock2, History, Tags } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { dateLong, money } from "@/features/lib/format";
import { downloadCsv } from "@/features/lib/export";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { periodOf } from "@/features/lib/rules/finance";
import { addMonths } from "@/features/lib/rules/dates";
import { activateVendor, approveCostCode, closePeriod, logAuditExport, proposeCostCode, requestVendor, setGustoJournal, signOffMigration, updateMapping } from "@/features/lib/store/actions/finance";
import { userName } from "@/features/lib/store/helpers";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, CardLabel, Input, Table, TD, TH, THead, TR, Tooltip } from "@/features/components/ui";
import { FinanceFrame } from "./finance-frame";
import { MatchContactsCard } from "./match-contacts";
import { ChartOfAccountsCard, MoveFromQuickBooks } from "./books-settings";
import { FeatureGate } from "@/features/components/ui";
import { useIsOn } from "@/features/lib/feature-visibility";
import type { AccountMapping } from "@/features/types";
import { NewBadge, VersionBadge } from "@/features/components/ui";

/** QB-M2: the four QuickBooks sync options, in this order. */
const SYNC_ORDER: NonNullable<AccountMapping["syncOption"]>[] = ["income", "deposit", "tax", "card_method"];
const SYNC_LABEL: Record<NonNullable<AccountMapping["syncOption"]>, string> = { income: "Income account", deposit: "Deposit account", tax: "Tax mapping", card_method: "Card payment method" };
/** Rows added for the call (the other two existed). */
const ADDED = ["MAP-S1", "MAP-S2"];

export function SetupScreen() {
  return (
    <FinanceFrame tab="setup">
      <Setup />
    </FinanceFrame>
  );
}

function Setup() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [vendor, setVendor] = useState("");
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [mapEdits, setMapEdits] = useState<Record<string, string>>({});
  // QB-M2 (New Features): the sync-option grouping and its two added mappings.
  const syncOn = useIsOn({ item: "QB-M2" });
  const fs = db.financeSettings;
  const years = [...new Set(db.migrationTotals.map((m) => m.year))].sort((a, b) => b - a);
  // The bookkeeper can close last month once it has ended.
  const lastMonth = periodOf(addMonths(now(), -1));
  const openPeriod = fs.closedPeriods.includes(lastMonth) ? undefined : lastMonth;

  const audit = () => {
    const from = db.financeRecords.map((r) => r.date).sort()[0]?.slice(0, 10) ?? "";
    const to = now().slice(0, 10);
    if (!act(logAuditExport, from, to).ok) return;
    downloadCsv(`finance-audit-${to}.csv`, [
      ["record_id", "type", "reference", "external_ref", "party", "amount_pre_tax", "sales_tax", "purchase_tax", "date", "period", "job", "cost_code", "origin", "flags"],
      ...db.financeRecords.map((r) => [r.id, r.type, r.ref, r.externalRef, r.party, r.amount.toFixed(2), r.salesTax?.toFixed(2), r.purchaseTax?.toFixed(2), r.date.slice(0, 10), r.period, r.jobId ?? r.allocations?.map((a) => `${a.overhead ? "OVERHEAD" : a.jobId}:${a.amount}`).join(";"), r.costCode, r.origin,
        [r.variance && "variance", r.deletedInQbo && "deleted_in_qbo", r.approvalRequest && "awaiting_owner", r.postedFromClosedPeriod && `from_${r.postedFromClosedPeriod}`].filter(Boolean).join(";")]),
    ]);
    toast.success("Audit export downloaded");
  };

  return (
    <>
      <PageHeader
        title="Vendors & Mappings"
        subtitle="Accounting setup: vendors, cost codes and account mappings." details="The bookkeeper owns the mappings; the owner approves cost codes and activates vendors. One business, one location, US dollars, calendar year, accrual books."
        actions={
          can(user, "finance.auditExport") ? <Button onClick={audit}><Download className="h-4 w-4" /> Audit export (CSV)</Button> : (
            <Tooltip content="The CSV audit export is restricted to the bookkeeper and the business owner."><span><Button disabled><FileLock2 className="h-4 w-4" /> Audit export</Button></span></Tooltip>
          )
        }
      />
      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-4">
          <CardLabel icon={<Building2 />}>Vendors</CardLabel>
          <div className="mt-3 space-y-1.5">
            {db.vendors.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs">
                <span><strong>{v.name}</strong> <span className="text-gray-500">· requested by {userName(db, v.requestedBy)}</span></span>
                {v.status === "active" ? <Badge tone="green">Active</Badge> : can(user, "finance.activateVendor") ? (
                  <Button size="sm" variant="primary" onClick={() => act(activateVendor, v.id).ok && toast.success(`${v.name} activated`)}>Activate</Button>
                ) : <Badge tone="amber">Awaiting owner</Badge>}
              </div>
            ))}
          </div>
          {can(user, "finance.requestVendor") && (
            <div className="mt-3 flex gap-2">
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="New vendor name" />
              <Button onClick={() => { if (act(requestVendor, vendor).ok) { toast.success("Vendor requested", "The owner activates it."); setVendor(""); } }}>Request</Button>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <CardLabel icon={<Tags />}>Job-cost codes</CardLabel>
          <div className="mt-3 space-y-1.5">
            {db.costCodes.map((c) => (
              <div key={c.code} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs">
                <span><strong>{c.code}</strong> — {c.label}</span>
                {c.status === "approved" ? <Badge tone="green">Approved by {userName(db, c.approvedBy)}</Badge> : can(user, "finance.approveCostCode") ? (
                  <Button size="sm" variant="primary" onClick={() => act(approveCostCode, c.code).ok && toast.success(`${c.code} approved`)}>Approve</Button>
                ) : <Badge tone="amber">Awaiting owner</Badge>}
              </div>
            ))}
          </div>
          {(can(user, "finance.config") || can(user, "finance.approveCostCode")) && (
            <div className="mt-3 flex gap-2">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CODE" className="w-28" />
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What it's for" />
              <Button onClick={() => { if (act(proposeCostCode, code, label).ok) { toast.success("Cost code proposed", "The owner approves it."); setCode(""); setLabel(""); } }}>Propose</Button>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <CardLabel><span className="inline-flex items-center gap-1.5">Account mappings (bookkeeper) <VersionBadge item="BK-C7" withNew={false} /></span></CardLabel>
          <p className="mt-1 text-xs text-gray-500">A mapping change never silently changes a posted transaction.</p>
          <Table className="mt-3">
            <THead><tr><TH>Category</TH><TH>QuickBooks account</TH>{can(user, "finance.config") && <TH />}</tr></THead>
            <tbody>
              {syncOn && <TR>
                <TD colSpan={3} className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                  <span className="inline-flex items-center gap-1.5">QuickBooks sync options <VersionBadge item="QB-M2" /></span>
                </TD>
              </TR>}
              {[...db.accountMappings].filter((m) => syncOn || !ADDED.includes(m.id)).sort((a, b) => (a.syncOption ? SYNC_ORDER.indexOf(a.syncOption) : 99) - (b.syncOption ? SYNC_ORDER.indexOf(b.syncOption) : 99)).map((m, i, all) => (
                <TR key={m.id}>
                  <TD className="font-semibold">
                    {syncOn && !m.syncOption && all[i - 1]?.syncOption && <span className="mb-2 block border-t border-gray-100 pt-2 text-xs font-bold uppercase tracking-wider text-gray-500">Other categories</span>}
                    {syncOn && m.syncOption ? <span className="inline-flex flex-wrap items-center gap-1.5">{SYNC_LABEL[m.syncOption]} <span className="font-normal text-gray-500">· {m.category}</span>{ADDED.includes(m.id) && <NewBadge />}</span> : m.category}
                  </TD>
                  <TD>{can(user, "finance.config") ? <Input value={mapEdits[m.id] ?? m.account} onChange={(e) => setMapEdits({ ...mapEdits, [m.id]: e.target.value })} className="h-8" /> : m.account}</TD>
                  {can(user, "finance.config") && <TD><Button size="sm" disabled={(mapEdits[m.id] ?? m.account) === m.account} onClick={() => act(updateMapping, m.id, mapEdits[m.id]).ok && toast.success("Mapping updated", "Posted transactions unaffected.")}>Save</Button></TD>}
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>

        <FeatureGate item="QB-M3"><MatchContactsCard /></FeatureGate>

        <FeatureGate item="BK-C5"><MoveFromQuickBooks /></FeatureGate>

        <FeatureGate item="BK-M2"><ChartOfAccountsCard /></FeatureGate>

        <Card className="p-4">
          <CardLabel icon={<History />}>Periods, payroll journal and migration</CardLabel>
          <div className="mt-3 space-y-3 text-xs">
            <div>
              <div className="flex items-center gap-1.5 font-semibold text-gray-700">Closed periods <VersionBadge item="BK-M7" withNew={false} /></div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {fs.closedPeriods.map((p) => <Badge key={p} tone="gray">{p}</Badge>)}
                {can(user, "finance.config") && openPeriod && <Button size="sm" onClick={() => act(closePeriod, openPeriod).ok && toast.success(`${openPeriod} closed`)}>Close {openPeriod}</Button>}
              </div>
              <p className="mt-1 text-xs text-gray-500">Corrections dated in a closed period post to the next open period. Closing December rolls the year into 3900 Retained earnings.</p>
            </div>
            <div>
              <div className="font-semibold text-gray-700">Payroll journal</div>
              <p className="text-gray-600">
                {fs.gustoPostsJournal === undefined ? "Waiting for the bookkeeper's written confirmation." : fs.gustoPostsJournal ? "Gusto posts the payroll journal. Estimate Master creates no second posting." : "Gusto does not post it. The bookkeeper journals manually in QuickBooks."}
                {" "}Estimate Master never posts payroll journals; per-job labor stays internal.
              </p>
              {can(user, "finance.config") && (
                <div className="mt-1 flex gap-2">
                  <Button size="sm" onClick={() => act(setGustoJournal, true).ok && toast.success("Recorded")}>Gusto posts it</Button>
                  <Button size="sm" onClick={() => act(setGustoJournal, false).ok && toast.success("Recorded")}>Gusto doesn't</Button>
                </div>
              )}
            </div>
            <div>
              <div className="font-semibold text-gray-700">Migration — comparison totals only</div>
              <Table className="mt-2">
                <THead><tr><TH>Category</TH>{years.map((y) => <TH key={y} className="text-right">{y}</TH>)}</tr></THead>
                <tbody>
                  {(["revenue", "materials", "labour", "subcontractors", "overhead"] as const).map((cat) => (
                    <TR key={cat}><TD className="capitalize">{cat}</TD>{years.map((y) => <TD key={y} className="text-right tabular-nums">{money(db.migrationTotals.find((m) => m.year === y && m.category === cat)?.amount ?? 0, { cents: false })}</TD>)}</TR>
                  ))}
                </tbody>
              </Table>
              {fs.migrationSignOff ? (
                <p className="mt-2 flex items-center gap-1.5 text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> Reconciled and signed off by {userName(db, fs.migrationSignOff.by)} on {dateLong(fs.migrationSignOff.at)}. Totals are never reposted as transactions.</p>
              ) : can(user, "finance.migration") ? (
                <Button size="sm" className="mt-2" onClick={() => act(signOffMigration).ok && toast.success("Migration signed off")}>Sign off totals</Button>
              ) : <Banner tone="warn" className="mt-2">Waiting for the bookkeeper's sign-off.</Banner>}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
