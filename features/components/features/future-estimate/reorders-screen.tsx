"use client";
/**
 * Feature 28 — Touch-Up Reorders for one property.
 * Menu: Properties > {Property} > Touch-Up Reorders
 *
 * Start from a property history record or a customer's touch-up request.
 * ?reorder=TUR-2026-n opens that reorder; ?fromRequest=TU-n or ?fromApp=APP-n
 * opens the start form prefilled.
 */
import { useState } from "react";
import { Inbox, PaintBucket, Plus } from "lucide-react";
import type { Property } from "@/features/types";
import { useCurrentUser, useDb } from "@/features/lib/store";
import { historyGroups } from "@/features/lib/store/actions/future-estimate";
import { formatPacks } from "@/features/lib/rules/materials";
import { can } from "@/features/lib/permissions";
import { useParam } from "@/features/lib/navigation";
import { byId } from "@/features/lib/selectors";
import { dateLong } from "@/features/lib/format";
import { REORDER_STATUS } from "@/features/lib/status";
import { PanelHeader as PageHeader } from "@/features/components/features/contacts/details/panel-header";
import { Badge, Banner, Button, Card, CardLabel, EmptyState, IdChip, PillTabs, Stat, StatStrip, Swatch, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { ReorderForm } from "./reorder-form";
import { ReorderDrawer } from "./reorder-drawer";
import { OwnershipBanner } from "./shared";


type Filter = "all" | "open" | "fulfilled" | "cancelled";

export function ReordersPanel({ property }: { property: Property }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const canAct = can(user, "reorder.approve");
  const reorderParam = useParam("reorder");
  const fromRequest = useParam("fromRequest");
  const fromApp = useParam("fromApp");
  const [openId, setOpenId] = useState<string | undefined>(reorderParam);
  const [form, setForm] = useState<{ open: boolean; requestId?: string; appId?: string }>(() => ({ open: !!(fromRequest || fromApp) && canAct, requestId: fromRequest, appId: fromApp ?? appForRequest(fromRequest) }));
  const [filter, setFilter] = useState<Filter>("all");

  function appForRequest(reqId?: string) {
    const req = reqId ? byId(db.touchUpRequests, reqId) : undefined;
    if (!req?.surfaceId) return undefined;
    const items = historyGroups(db, property).flatMap((g) => g.items).filter((i) => i.app.surfaceId === req.surfaceId && i.app.verification === "confirmed");
    return items.sort((a, b) => (b.app.completedAt ?? "").localeCompare(a.app.completedAt ?? ""))[0]?.app.id;
  }

  const all = db.touchUpReorders.filter((r) => r.propertyId === property.id);
  const isOpen = (s: string) => s === "draft" || s === "approved";
  const list = all.filter((r) => filter === "all" || (filter === "open" ? isOpen(r.status) : r.status === filter));
  const requests = db.touchUpRequests.filter((t) => t.propertyId === property.id && (t.status === "new" || t.status === "acknowledged"));
  const refundsDue = all.filter((r) => r.refundDueAt && !r.refundRecordedAt).length;
  const current = byId(db.touchUpReorders, openId);

  return (
    <>
      <PageHeader
        title="Touch-Up Reorders"
        subtitle="Small paint sales against this property's record." details="Up to two gallons, paid first, with no estimate."
        actions={canAct && <Button variant="primary" onClick={() => setForm({ open: true })}><Plus className="h-4 w-4" /> Start reorder</Button>}
      />
      <Banner tone="info" className="mb-4" title="A paint sale is not painting work">
        Reorders never update the property's application history and never reset the repaint clock.
      </Banner>
      <OwnershipBanner db={db} property={property} />

      <StatStrip className="mb-4">
        <Stat label="Open" value={all.filter((r) => isOpen(r.status)).length} tone="brand" />
        <Stat label="Fulfilled" value={all.filter((r) => r.status === "fulfilled").length} />
        <Stat label="Refunds due" value={refundsDue} tone={refundsDue ? "warn" : "good"} />
        <Stat label="Touch-up requests" value={requests.length} hint="waiting" tone={requests.length ? "warn" : "default"} />
      </StatStrip>

      {requests.length > 0 && (
        <Card className="mb-4 p-5">
          <CardLabel icon={<Inbox />}>Customer touch-up requests</CardLabel>
          <div className="mt-3 space-y-2">
            {requests.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                <IdChip>{t.id}</IdChip>
                <div className="min-w-0 flex-1 text-xs">
                  <div className="font-semibold text-ink">{t.colourLabel ?? "Color not given"} · {t.requesterName}</div>
                  <div className="text-gray-500">“{t.note}” · {dateLong(t.createdAt)}</div>
                </div>
                <Badge tone={t.status === "new" ? "blue" : "gray"}>{t.status === "new" ? "New" : "Acknowledged"}</Badge>
                {canAct && <Button size="sm" variant="primary" onClick={() => setForm({ open: true, requestId: t.id, appId: appForRequest(t.id) })}>Convert to reorder</Button>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5" data-tour="reorders-list">
        <CardLabel icon={<PaintBucket />} right={<PillTabs value={filter} onChange={setFilter} options={[{ value: "all", label: "All", count: all.length }, { value: "open", label: "Open" }, { value: "fulfilled", label: "Fulfilled" }, { value: "cancelled", label: "Canceled" }]} />}>
          Reorders
        </CardLabel>
        <div className="mt-4">
          {list.length === 0 ? (
            <EmptyState icon={<PaintBucket />} title={all.length ? "No reorders match this filter." : "No touch-up reorders at this property yet."} body="Start one from a color on the property record, or convert a customer's touch-up request." />
          ) : (
            <Table>
              <THead>
                <tr><TH>Reorder</TH><TH>Color</TH><TH>Quantity</TH><TH>Payment</TH><TH>Supply</TH><TH>Status</TH><TH>Started</TH></tr>
              </THead>
              <tbody>
                {list.map((r) => {
                  const app = byId(db.applications, r.applicationId);
                  const st = REORDER_STATUS[r.status];
                  return (
                    <TR key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                      <TD><button className="font-semibold text-brand hover:underline">{r.id}</button></TD>
                      <TD><span className="flex items-center gap-2">{app && <Swatch hex={app.hex} size="sm" />}{app?.colourName} {app?.colourNumber}<span className="text-gray-500">{app?.sheen}</span></span></TD>
                      <TD>{formatPacks(r.packs)}</TD>
                      <TD>{r.payment === "prepaid_cleared" ? <Badge tone="green">Prepaid</Badge> : r.payment === "on_account" ? <Badge tone="indigo">On account</Badge> : <Badge tone="red">Unpaid</Badge>}</TD>
                      <TD className="text-xs">{r.supply === "company_stock" ? "Company stock" : r.supply === "customer_cans" ? "Customer's cans" : "New order"}{r.stockCheck && !r.stockCheck.ok && <Badge tone="red" className="ml-1">Rematch</Badge>}</TD>
                      <TD><Badge tone={st.tone}>{st.label}</Badge>{r.refundDueAt && !r.refundRecordedAt && <Badge tone="amber" className="ml-1">Refund due {dateLong(r.refundDueAt)}</Badge>}</TD>
                      <TD>{dateLong(r.createdAt)}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
      </Card>

      {form.open && (
        <ReorderForm
          property={property}
          open={form.open}
          onOpenChange={(v) => setForm((f) => ({ ...f, open: v }))}
          initialApp={form.appId}
          requestId={form.requestId}
          onCreated={(id) => setOpenId(id)}
        />
      )}
      <ReorderDrawer reorder={current} onClose={() => setOpenId(undefined)} />
    </>
  );
}
