"use client";
/**
 * Feature 33 — Supplier bill matching (component 33.3).
 * Menu: Finance > Bills & Matching
 *
 * A bill is matched against its purchase order and the quantities received
 * (features 18/19). Anything billed but not received is flagged, never
 * absorbed. A card settlement pays an existing bill and is never a second
 * expense. Credits stay against the original job and bill.
 */
import { useState } from "react";
import { CheckCircle2, CreditCard, FileCheck2, Scale } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { dateLong, dateTime, money } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { AppLink } from "@/features/lib/navigation";
import { jobHref } from "@/features/lib/hrefs";
import { matchSupplierBill, recordCardSettlement } from "@/features/lib/store/actions/finance";
import { userName } from "@/features/lib/store/helpers";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, EmptyState, Field, Input, Modal, VersionBadge } from "@/features/components/ui";
import { FinanceFrame } from "./finance-frame";

export function BillsScreen() {
  return (
    <FinanceFrame tab="bills">
      <Bills />
    </FinanceFrame>
  );
}

function Bills() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [settling, setSettling] = useState<string>();
  const [ref, setRef] = useState("");
  const bills = db.financeRecords.filter((r) => r.type === "bill").sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <PageHeader eyebrow={<><VersionBadge item="QB-C5" withNew={false} /><VersionBadge item="BK-M4" withNew={false} /><VersionBadge item="BK-C4" withNew={false} /></>} title="Bills & Matching" subtitle="What was billed, against what was ordered and received." details="Card settlements pay bills — they are never a second expense." />
      <div className="space-y-3" data-tour="bill-matching">
        {bills.length === 0 && <EmptyState icon={<FileCheck2 />} title="No supplier bills yet" body="Supplier bills show here to be matched against their purchase order and the quantities received." />}
        {bills.map((b) => {
          const po = b.poId ? byId(db.purchaseOrders, b.poId) : undefined;
          const credits = db.financeRecords.filter((r) => r.creditOfRecordId === b.id);
          const settlement = db.financeRecords.find((r) => r.paysRecordId === b.id && (r.type === "card_settlement" || r.type === "check") && !r.approvalRequest);
          const receipts = (db.receipts ?? []).filter((x) => x.poId === b.poId);
          return (
            <Card key={b.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base font-bold text-ink">{b.ref}</span>
                    <Badge tone="amber">{b.costCode === "SUB" ? "Subcontractor bill" : "Supplier bill"}</Badge>
                    {b.paymentStatus === "paid" ? <Badge tone="green">Paid</Badge> : <Badge tone="gray">Unpaid</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{b.party} · {dateLong(b.date)} · {b.jobId ? <AppLink className="text-brand underline" href={jobHref(b.jobId, "materials")}>{b.jobId}</AppLink> : "no job"}</div>
                  <div className="mt-1 text-sm font-semibold text-ink">{money(b.amount)} <span className="font-normal text-gray-500">+ {money(b.purchaseTax ?? 0)} purchase tax = {money(b.amount + (b.purchaseTax ?? 0))} gross job cost</span></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {po && can(user, "finance.code") && <Button size="sm" onClick={() => { const r = act(matchSupplierBill, b.id); if (r.ok) { const m = r.value as { matched: boolean; unmatchedValue: number }; toast.success(m.matched ? "Bill matches" : "Discrepancy flagged", m.matched ? "Billed quantities agree with received quantities." : `${money(m.unmatchedValue)} billed but not received.`); } }}><Scale className="h-3.5 w-3.5" /> Match bill</Button>}
                  {b.paymentStatus !== "paid" && can(user, "finance.recordPayment") && <Button size="sm" onClick={() => { setSettling(b.id); setRef(""); }}><CreditCard className="h-3.5 w-3.5" /> Record card settlement</Button>}
                </div>
              </div>

              {po && (
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3 [&>*]:min-w-0">
                  {po.lines.map((l) => {
                    const got = receipts.filter((x) => x.lineId === l.id).reduce((a, x) => a + x.qtyGal, 0);
                    return (
                      <div key={l.id} className={`rounded-lg border px-3 py-2 ${got < l.gallons ? "border-amber-200 bg-amber-50/50" : "border-line"}`}>
                        <div className="font-semibold text-ink">{l.id} · {l.colourLabel}</div>
                        <div className="text-gray-600">Billed {l.gallons} gal · received {got} gal</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {b.match && (
                b.match.unmatchedValue > 0 ? (
                  <Banner tone="warn" className="mt-3" title={`Discrepancy: ${b.match.unmatchedGal} gal, ${money(b.match.unmatchedValue)}`}>{b.match.note} Matched {dateTime(b.match.matchedAt)} by {userName(db, b.match.matchedBy)}.</Banner>
                ) : (
                  <Banner tone="success" className="mt-3" title="Fully matched">{b.match.note}</Banner>
                )
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {credits.map((c) => <Badge key={c.id} tone="pink" className="whitespace-normal">Credit {c.ref} {money(c.amount)} — kept against this bill and {c.jobId}</Badge>)}
                {settlement && <Badge tone="indigo" className="whitespace-normal" icon={<CheckCircle2 className="h-3 w-3" />}>Paid by {settlement.ref} — not a second expense</Badge>}
              </div>
            </Card>
          );
        })}
      </div>
      <Modal
        open={!!settling}
        onOpenChange={(v) => !v && setSettling(undefined)}
        size="sm"
        title="Record card settlement"
        description="The settlement pays this bill. No new expense is created."
        footer={<><Button onClick={() => setSettling(undefined)}>Cancel</Button><Button variant="primary" onClick={() => { if (act(recordCardSettlement, settling!, ref).ok) { toast.success("Settlement recorded", "The bill is paid; no second expense."); setSettling(undefined); } }}>Record</Button></>}
      >
        <Field label="Card statement reference" required><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Chase Visa ••4417 — statement 1018" /></Field>
      </Modal>
    </>
  );
}
