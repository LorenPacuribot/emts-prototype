"use client";
/**
 * NEW (feature 24) — "Change Orders" section on Estimate Details.
 *
 * Host: /estimates/[id], below the Paint Color Card. It opens from the NEW
 * "+ Create Change Order" button next to Amend Estimate in the toolbar, and
 * from the work order kebab. Contract summary strip, change order list and
 * Colour Re-approvals. Opening a row shows the builder in a drawer
 * (CoBuilder). `?co=` opens one change order.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Download, Eye, FileDiff, ListChecks, Palette, Printer } from "lucide-react";
import type { ChangeOrder, Job } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { useParam, AppLink, useNav } from "@/features/lib/navigation";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { downloadCsv } from "@/features/lib/export";
import { date, dateTime, money, relDays } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { estimateHref } from "@/features/lib/hrefs";
import { CO_STATUS, CO_TYPE } from "@/features/lib/status";
import { coLinkState, coPricing, contractSummary, currentLink, jobChangeOrders, jobColourReapprovals, runDailyChecks } from "@/features/lib/store/actions/change-orders";
import { Badge, Banner, Button, Card, CardLabel, EmptyState, EstimateSection, IdChip, NewBadge, PillTabs, RowMenu, SectionHeader, Stat, StatStrip, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { approvalStateLabel, billingStateLabel, StatusBadge, TypeBadge } from "./shared";
import { NewCoModal } from "./co-modals";
import { CoBuilder } from "./co-builder";
import { PresentationModal } from "./co-document";

type Filter = "all" | "open" | "awaiting" | "approved" | "closed";

export function ChangeOrdersSection({ job, estimateId, creating, setCreating }: { job: Job; estimateId: string; creating: boolean; setCreating: (v: boolean) => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const nav = useNav();
  const initialCo = useParam("co");
  const [openId, setOpenId] = useState<string | undefined>(initialCo);
  const [filter, setFilter] = useState<Filter>("all");
  const [preview, setPreview] = useState<{ co: ChangeOrder; mode: "preview" | "print" }>();

  // Like the 7 a.m. job: escalate overdue emergency confirmations and bounced links.
  useEffect(() => {
    if (job.contractSigned) act(runDailyChecks);
  }, [job.contractSigned]);

  const canPrice = can(user, "co.seePrices");
  const cos = jobChangeOrders(db, job.id);
  const cras = jobColourReapprovals(db, job.id);
  const nowIso = now();

  const header = (right?: React.ReactNode) => (
    <SectionHeader
      icon={<FileDiff />}
      title="Change Orders"
      badge={<NewBadge feature={24} />}
      subtitle="Signed-scope additions, removals, credits and substitutions, each approved by the customer as an exact version."
      right={right}
    />
  );

  if (!job.contractSigned) {
    return (
      <EstimateSection id="section-change-orders" isNew>
        {header()}
        <Banner tone="info" title="Change orders start once the customer signs.">
          Until then the estimate itself is edited and sent again. A change order is only raised against a signed scope.
        </Banner>
      </EstimateSection>
    );
  }

  const summary = contractSummary(db, job);
  const groups: Record<Filter, (c: ChangeOrder) => boolean> = {
    all: () => true,
    open: (c) => ["draft", "pending_internal", "ready_to_send"].includes(c.status),
    awaiting: (c) => c.status === "sent",
    approved: (c) => c.status === "approved",
    closed: (c) => c.status === "rejected" || c.status === "disputed",
  };
  const rows = cos.filter(groups[filter]).sort((a, b) => a.id.localeCompare(b.id));

  function exportCsv() {
    downloadCsv(`${job.id}-change-orders.csv`, [
      ["CO number", "Version", "Title", "Type", ...(canPrice ? ["Gross addition", "Credit", "Net change", "Tax", "Total"] : []), "State", "Parent", "Sent", "Link expires", "Approval", "Billing"],
      ...cos.map((c) => {
        const p = coPricing(db, c);
        return [
          c.id, c.version ?? 1, c.title, CO_TYPE[c.type].label,
          ...(canPrice ? [p.grossAddition, p.credit, p.net, p.tax, p.total] : []),
          CO_STATUS[c.status].label, c.parentId, c.sentAt ? date(c.sentAt) : "", currentLink(c) ? date(currentLink(c)!.expiresAt) : "",
          approvalStateLabel(c).label, c.downstream.billing === "failed" ? "Failed" : c.billing ? `${c.billing.mode} ${c.billing.docId ?? ""}` : "",
        ];
      }),
    ]);
    toast.success("CSV exported", canPrice ? "Change order list downloaded." : "Downloaded without prices for your role.");
  }

  return (
    <EstimateSection id="section-change-orders" isNew>
      {header(
        <>
          {can(user, "co.exceptions") && (
            <AppLink href="/dashboard?open=co-exceptions">
              <Button size="sm">
                <ListChecks className="h-4 w-4" /> Exception List
              </Button>
            </AppLink>
          )}
          <Button size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export
          </Button>
        </>,
      )}

      {canPrice ? (
        <StatStrip className="mb-4">
          <Stat label="Original contract" value={money(summary.original)} hint="pre-tax, preserved" />
          <Stat label="Approved net changes" value={money(summary.approvedNet)} hint={`${cos.filter((c) => c.status === "approved" || c.status === "disputed").length} signed`} tone={summary.approvedNet < 0 ? "warn" : "default"} />
          <Stat label="Revised contract total" value={money(summary.revisedTotal)} tone="brand" hint={summary.proposedNet ? `${money(summary.proposedNet)} proposed, not signed` : "pre-tax"} />
          <Stat label="Cumulative change" value={`${(summary.changePct * 100).toFixed(1)}%`} hint={`with proposed: ${(summary.deposit.pct * 100).toFixed(1)}%`} />
          <Stat
            label="Deposit"
            value={summary.deposit.triggered ? "Review triggered" : `${money(job.depositsCollected)} collected`}
            tone={summary.deposit.triggered ? "warn" : "good"}
            hint={summary.deposit.triggered ? `Target ${money(summary.deposit.target)} · due ${money(summary.deposit.due)} (${summary.triggeredBy.join(", ")})` : "Within 25% of original"}
          />
        </StatStrip>
      ) : (
        <Banner tone="info" className="mb-4" title="Prices are not shown for your role">You can see what changes and its state. Estimators, the Office Manager, the Business Owner and the Bookkeeper see amounts.</Banner>
      )}

      {summary.deposit.triggered && canPrice && (
        <div data-tour="deposit-banner">
          <Banner tone="warn" className="mb-4" title="Deposit review">
            Cumulative signed net changes including proposed change orders are {(summary.deposit.pct * 100).toFixed(1)}% of the original contract (over 25%). Revised deposit target is one-third of {money(summary.deposit.newContractTotal)} = {money(summary.deposit.target)}; collected {money(summary.deposit.collected)}; additional due {money(summary.deposit.due)}. Approved by the owner and signed by the customer.
          </Banner>
        </div>
      )}

      <Card className="p-5" data-tour="co-list">
        <CardLabel icon={<FileDiff />} right={<span className="text-[11.5px] text-slate-400">{cos.length} change order{cos.length === 1 ? "" : "s"}</span>}>
          Change order list
        </CardLabel>
        <PillTabs
          className="mt-4"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: cos.length },
            { value: "open", label: "Draft / internal", count: cos.filter(groups.open).length },
            { value: "awaiting", label: "Awaiting customer", count: cos.filter(groups.awaiting).length },
            { value: "approved", label: "Approved", count: cos.filter(groups.approved).length },
            { value: "closed", label: "Rejected / disputed", count: cos.filter(groups.closed).length },
          ]}
        />
        <div className="mt-4">
          {rows.length === 0 ? (
            <EmptyState
              icon={<FileDiff />}
              title={cos.length ? "No change orders in this view." : "No change orders yet."}
              body={cos.length ? "Try another filter." : "Use + Create Change Order when the customer asks for a change to the signed scope."}
              action={!cos.length && can(user, "co.build") && <Button variant="primary" onClick={() => setCreating(true)}>+ Create Change Order</Button>}
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>CO number</TH>
                  <TH>Type</TH>
                  {canPrice && <TH className="text-right">Gross / net</TH>}
                  <TH>State</TH>
                  <TH>Parent</TH>
                  <TH>Sent / link expiry</TH>
                  <TH>Approval</TH>
                  <TH>Billing</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {rows.map((c) => {
                  const p = coPricing(db, c);
                  const link = currentLink(c);
                  const lst = link ? coLinkState(c, link, nowIso) : undefined;
                  const ap = approvalStateLabel(c);
                  return (
                    <TR key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)}>
                      <TD>
                        <div className="flex items-center gap-1.5">
                          <IdChip tone="blue">{c.id}</IdChip>
                          <span className="text-[10.5px] text-slate-400">v{c.version ?? 1}</span>
                        </div>
                        <div className="mt-0.5 max-w-36 truncate text-[12px] font-medium text-ink" title={c.title}>{c.title}</div>
                      </TD>
                      <TD><TypeBadge type={c.type} /></TD>
                      {canPrice && (
                        <TD className="text-right">
                          <div className="text-[11.5px] text-slate-500">Gross {money(p.grossAddition)}</div>
                          <div className={`font-semibold ${p.net < 0 ? "text-pink-700" : "text-ink"}`}>Net {money(p.net)}</div>
                        </TD>
                      )}
                      <TD><StatusBadge co={c} stack /></TD>
                      <TD>
                        {c.parentId ? (
                          <button className="text-[11.5px] font-semibold text-brand hover:underline" onClick={(e) => { e.stopPropagation(); setOpenId(c.parentId); }}>
                            {c.parentId}
                          </button>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </TD>
                      <TD>
                        <div className="text-[12px]">{c.sentAt ? `Sent ${date(c.sentAt)}` : <span className="text-slate-300">Not sent</span>}</div>
                        {link && c.status === "sent" ? (
                          <span className={lst === "expired" ? "font-semibold text-amber-700" : ""}>
                            Expires {date(link.expiresAt)} <span className="block text-[11px] text-slate-400">{relDays(link.expiresAt, nowIso)}</span>
                          </span>
                        ) : link ? (
                          <span className="text-[11px] text-slate-400">Link {date(link.expiresAt)}</span>
                        ) : null}
                      </TD>
                      <TD><Badge tone={ap.tone} className="max-w-28 whitespace-normal">{ap.label}</Badge></TD>
                      <TD className="max-w-40 whitespace-normal">{billingStateLabel(c, canPrice)}</TD>
                      <TD onClick={(e) => e.stopPropagation()}>
                        <RowMenu
                          items={[
                            { label: "Open", icon: <FileDiff />, onSelect: () => setOpenId(c.id) },
                            { label: "Customer preview", icon: <Eye />, onSelect: () => setPreview({ co: c, mode: "preview" }) },
                            { label: "Print change order", icon: <Printer />, onSelect: () => setPreview({ co: c, mode: "print" }) },
                          ]}
                        />
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <CardLabel icon={<Palette />}>Colour Re-approvals (Rule 1)</CardLabel>
        <p className="mt-2 text-[12px] text-slate-500">
          A separately numbered record, used only when a colour changes with no price change, nothing tinted or ordered, and the same brand, product line and sheen. Never raised together with a change order.
        </p>
        <div className="mt-3">
          {cras.length === 0 ? (
            <EmptyState icon={<Palette />} title="No Colour Re-approvals." body="Choose + Create Change Order › No-cost colour change to run the Rule 1 check." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Record</TH>
                  <TH>Specification</TH>
                  <TH>From</TH>
                  <TH>To</TH>
                  <TH>Recorded</TH>
                </tr>
              </THead>
              <tbody>
                {cras.map((r) => (
                  <TR key={r.id}>
                    <TD><IdChip>{r.id}</IdChip></TD>
                    <TD>{r.colourChange?.specId}</TD>
                    <TD>{r.colourChange?.fromColour}</TD>
                    <TD className="font-semibold text-ink">{r.colourChange?.toColour}</TD>
                    <TD>{dateTime(r.createdAt)} · {byId(db.users, r.createdBy)?.name}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>

      {cos.some((c) => c.type === "product_substitution" && c.status === "draft" && c.lines.every((l) => l.cost === 0)) && (
        <Banner tone="warn" className="mt-4" title="A substitution draft has no price difference yet">
          <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Drafts raised from the Color Card are priced even at zero. Open it to check the lines.</span>
        </Banner>
      )}

      <NewCoModal open={creating} onOpenChange={setCreating} job={job} onCreated={setOpenId} />
      <CoBuilder
        coId={openId}
        onClose={() => {
          setOpenId(undefined);
          if (initialCo) nav.push(estimateHref(estimateId, "section-change-orders"));
        }}
        onOpenCo={setOpenId}
      />
      <PresentationModal co={preview?.co} mode={preview?.mode} onClose={() => setPreview(undefined)} />
    </EstimateSection>
  );
}
