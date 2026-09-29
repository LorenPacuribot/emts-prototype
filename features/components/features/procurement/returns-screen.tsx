"use client";
/**
 * Returns And Credits (19 System Validations).
 * Menu: Procurement > Returns And Credits
 *
 * Every return links to the original order and job. Tinted paint is
 * non-returnable; it stays job cost and may move to the leftover shelf.
 * Partial returns never change the original ordered quantity.
 */
import { useState } from "react";
import { CheckCircle2, Download, Plus, Undo2 } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { confirmReturnCredit } from "@/features/lib/store/actions/supplier";
import { byId } from "@/features/lib/selectors";
import { dateTime, money } from "@/features/lib/format";
import { downloadCsv } from "@/features/lib/export";
import { userName } from "@/features/lib/store/helpers";
import { toast } from "@/features/lib/toast";
import { AppLink } from "@/features/lib/navigation";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Button, Card, CardLabel, EmptyState, Stat, StatStrip, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { jobHref } from "@/features/lib/hrefs";
import { ProcurementFrame } from "./procurement-frame";
import { OrderDrawer } from "./order-drawer";
import { ReturnModal } from "./order-modals";
import { procurementPerms } from "./shared";

export function ReturnsScreen() {
  return (
    <ProcurementFrame tab="returns">
      <Returns />
    </ProcurementFrame>
  );
}

function Returns() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  const [openPo, setOpenPo] = useState<string>();
  const [record, setRecord] = useState(false);
  const returns = [...(db.returns ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  const confirmedCredit = returns.filter((r) => r.confirmed).reduce((a, r) => a + r.credit, 0);
  const tintedHeld = db.purchaseOrders.flatMap((p) => p.lines.filter((l) => l.tinted !== false && l.receivedGal > 0).map((l) => ({ p, l })));

  function exportCsv() {
    downloadCsv("returns-and-credits.csv", [
      ["Return", "PO", "Job", "Line", "Product", "Qty gal", ...(perms.seePrices ? ["Credit"] : []), "Credit status", "Reason", "Recorded by", "At"],
      ...returns.map((r) => {
        const line = byId(db.purchaseOrders, r.poId)?.lines.find((l) => l.id === r.lineId);
        return [r.id, r.poId, r.jobId, r.lineId, line?.product, r.qtyGal, ...(perms.seePrices ? [r.credit.toFixed(2)] : []), r.confirmed ? "Confirmed" : "Awaiting supplier", r.reason, userName(db, r.by), r.at];
      }),
    ]);
    toast.success("CSV exported");
  }

  return (
    <>
      <PageHeader
        title="Returns And Credits"
        subtitle="Untinted, unopened product returned to the branch, with the credit linked to the original order and job."
        actions={
          <>
            <Button onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
            {perms.submit && <Button variant="primary" onClick={() => setRecord(true)}><Plus className="h-4 w-4" /> Record return</Button>}
          </>
        }
      />
      <StatStrip className="mb-4">
        <Stat label="Returns" value={returns.length} />
        <Stat label="Awaiting supplier credit" value={returns.filter((r) => !r.confirmed).length} tone={returns.some((r) => !r.confirmed) ? "warn" : "good"} />
        {perms.seePrices && <Stat label="Confirmed credits" value={money(confirmedCredit)} tone="good" hint="reduce the $1,500 and $3,000 totals" />}
        <Stat label="Tinted lines (non-returnable)" value={tintedHeld.length} hint="remain job cost" />
      </StatStrip>
      <Card className="p-4">
        <CardLabel icon={<Undo2 />}>Returns</CardLabel>
        <div className="mt-3">
          {returns.length === 0 ? <EmptyState icon={<Undo2 />} title="No returns recorded." body="Returns are recorded against a received order line." /> : (
            <Table>
              <THead>
                <tr><TH>Return</TH><TH>Original order</TH><TH>Job</TH><TH>Line</TH><TH className="text-right">Qty</TH>{perms.seePrices && <TH className="text-right">Credit</TH>}<TH>Credit status</TH><TH>Reason</TH><TH>Recorded</TH></tr>
              </THead>
              <tbody>
                {returns.map((r) => {
                  const po = byId(db.purchaseOrders, r.poId);
                  const line = po?.lines.find((l) => l.id === r.lineId);
                  return (
                    <TR key={r.id}>
                      <TD className="font-semibold text-ink">{r.id}</TD>
                      <TD><button className="text-brand hover:underline" onClick={() => setOpenPo(r.poId)}>{r.poId}</button><div className="text-xs text-gray-400">ordered {line?.gallons} gal (unchanged)</div></TD>
                      <TD><AppLink className="text-brand hover:underline" href={jobHref(r.jobId, "materials")}>{r.jobId}</AppLink></TD>
                      <TD>{r.lineId} · {line?.product}<div><Badge tone="blue">Untinted</Badge></div></TD>
                      <TD className="text-right tabular-nums">{r.qtyGal} gal</TD>
                      {perms.seePrices && <TD className="text-right tabular-nums">{money(r.credit)}</TD>}
                      <TD>{r.confirmed ? <Badge tone="green">Confirmed</Badge> : perms.submit ? <Button size="sm" onClick={() => act(confirmReturnCredit, r.id).ok && toast.success("Credit confirmed", "It now reduces the job's purchasing totals.")}><CheckCircle2 className="h-3.5 w-3.5" /> Confirm credit</Button> : <Badge tone="amber">Awaiting supplier</Badge>}</TD>
                      <TD className="max-w-[240px] whitespace-normal">{r.reason}</TD>
                      <TD>{userName(db, r.by)}<div className="text-xs text-gray-400">{dateTime(r.at)}</div></TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
      </Card>
      <ReturnModal key={`ret${record}`} open={record} onClose={() => setRecord(false)} />
      <OrderDrawer poId={openPo} onClose={() => setOpenPo(undefined)} />
    </>
  );
}
