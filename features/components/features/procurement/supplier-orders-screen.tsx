"use client";
/**
 * Feature 19 — Supplier Orders status board.
 * Menu: Procurement > Supplier Orders
 *
 * Views: the board, the Exception List (no acknowledgment after four working
 * hours), uncertain sends, receipts (ordered vs received) and estimator
 * submission requests waiting for the office.
 */
import { useSupplierInbox } from "@/features/lib/integrations/supplier-live";
import { useState } from "react";
import { AlertTriangle, ArrowUpRight, Boxes, CheckCircle2, Download, Eye, FilePlus2, Inbox, PackageCheck, PhoneCall, Repeat2, Send, XCircle } from "lucide-react";
import type { OrderRequest, PurchaseOrder } from "@/features/types";
import { act, useCurrentUser, useDb, useStore } from "@/features/lib/store";
import { escalateException } from "@/features/lib/store/actions/supplier";
import { approveReceipt, generateOrder, rejectRequest } from "@/features/lib/store/actions/materials";
import { byId } from "@/features/lib/selectors";
import { dateLong, dateTime, money } from "@/features/lib/format";
import { formatPacks } from "@/features/lib/rules/materials";
import { ESCALATION_LABEL, ackException, aggregateStatus, poValue } from "@/features/lib/rules/procurement";
import { downloadCsv } from "@/features/lib/export";
import { now } from "@/features/lib/clock";
import { userName } from "@/features/lib/store/helpers";
import { toast } from "@/features/lib/toast";
import { AppLink, useNav, useParam } from "@/features/lib/navigation";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, CardLabel, EmptyState, Field, IdChip, Modal, PillTabs, RowMenu, Select, Stat, StatStrip, Table, TD, TH, THead, TR, Textarea } from "@/features/components/ui";
import { jobHref } from "@/features/lib/hrefs";
import { ProcurementFrame } from "./procurement-frame";
import { OrderDrawer } from "./order-drawer";
import { CallModal } from "./order-modals";
import { AckClockChip, PoStatusBadge, ReceivedBar, minutesLabel, procurementPerms, receivedOf } from "./shared";

type View = "board" | "exceptions" | "uncertain" | "receipts" | "requests";
type StatusFilter = "all" | "preparing" | "sent" | "acknowledged" | "fulfilment" | "problem" | "closed";

const FILTER_MATCH: Record<StatusFilter, (s: string) => boolean> = {
  all: () => true,
  preparing: (s) => s === "issued",
  sent: (s) => s === "sent",
  acknowledged: (s) => s === "acknowledged" || s === "processing",
  fulfilment: (s) => s === "ready_for_pickup" || s === "partially_filled",
  problem: (s) => s === "problem" || s === "substitute_available",
  closed: (s) => s === "picked_up" || s === "cancelled",
};

export function SupplierOrdersScreen() {
  return (
    <ProcurementFrame tab="orders">
      <Board />
    </ProcurementFrame>
  );
}

function Board() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  useSupplierInbox();
  const nav = useNav();
  useStore((s) => s.clockMode);
  const view = (useParam("view") as View) ?? "board";
  const [openPo, setOpenPo] = useState<string | undefined>(useParam("po"));
  const [branch, setBranch] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [newSub, setNewSub] = useState(false);
  const [callFor, setCallFor] = useState<PurchaseOrder>();
  const nowIso = now();

  const orders = [...db.purchaseOrders].filter((p) => p.status !== "preliminary").sort((a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt));
  const byBranch = orders.filter((p) => branch === "all" || p.branchId === branch);
  const exceptions = byBranch.map((p) => ({ po: p, ex: ackException(p, db.users, nowIso) })).filter((x) => x.ex?.overdue);
  const uncertain = byBranch.filter((p) => p.uncertainSend || p.uncertainHistory);
  const requests = (db.orderRequests ?? []).filter((r) => branch === "all" || r.branchId === branch).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const awaitingSend = byBranch.filter((p) => p.status === "issued");
  const counts = Object.fromEntries((Object.keys(FILTER_MATCH) as StatusFilter[]).map((k) => [k, byBranch.filter((p) => FILTER_MATCH[k](aggregateStatus(p))).length]));
  const rows = byBranch.filter((p) => FILTER_MATCH[status](aggregateStatus(p)));
  const setView = (v: View) => nav.push(v === "board" ? "/supplier-orders" : `/supplier-orders?view=${v}`);

  function exportCsv() {
    downloadCsv(`supplier-orders-${nowIso.slice(0, 10)}.csv`, [
      ["PO", "Job", "Branch", "Status", "Sent", "Acknowledged", "Received gal", "Ordered gal", "Exception", ...(perms.seePrices ? ["Order total"] : []), ...(perms.seeAccount ? ["Account"] : [])],
      ...rows.map((p) => {
        const b = byId(db.branches, p.branchId);
        const { ordered, received } = receivedOf(p);
        return [p.id, p.jobId, b?.name, aggregateStatus(p), p.sentAt, p.ackAt, received, ordered, ackException(p, db.users, nowIso)?.overdue ? "Overdue" : p.uncertainSend ? "Uncertain" : "",
          ...(perms.seePrices ? [poValue(p).toFixed(2)] : []), ...(perms.seeAccount ? [b?.accountNumber] : [])];
      }),
    ]);
    toast.success("CSV exported", perms.seePrices ? undefined : "Prices and account numbers are not included for your role.");
  }

  return (
    <>
      <PageHeader
        title="Supplier Orders"
        subtitle="Every order across both branches: how it was sent, whether the branch acknowledged it, and what has arrived."
        actions={
          <>
            <Select value={branch} onChange={(e) => setBranch(e.target.value)} className="h-10 w-auto" aria-label="Branch filter">
              <option value="all">All branches</option>
              {db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.storeNumber ? ` (${b.storeNumber})` : ""}</option>)}
            </Select>
            {perms.submit && <Button variant="primary" onClick={() => setNewSub(true)}><Send className="h-4 w-4" /> New Submission</Button>}
            <Button onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
          </>
        }
      />

      {user.role === "crew_lead" && <Banner tone="info" className="mb-4" title="View only for submission">Crew leads can record receipts and line status, but can't submit orders to a supplier.</Banner>}

      <StatStrip className="mb-4">
        <Stat label="Awaiting send" value={awaitingSend.length} hint="Preparing" />
        <Stat label="Awaiting acknowledgment" value={byBranch.filter((p) => p.status === "sent").length} tone="brand" />
        <Stat label="Overdue (4 working hrs)" value={exceptions.length} tone={exceptions.length ? "danger" : "good"} />
        <Stat label="Partly filled" value={counts.fulfilment} tone={counts.fulfilment ? "warn" : "default"} />
        <Stat label="Office requests" value={requests.filter((r) => r.status === "requested").length} hint="from estimators" />
      </StatStrip>

      <PillTabs<View>
        kind="view"
        className="mb-4"
        value={view}
        onChange={setView}
        options={[
          { value: "board", label: "Status board", count: byBranch.length },
          { value: "exceptions", label: "Exception list", count: exceptions.length },
          { value: "uncertain", label: "Uncertain sends", count: uncertain.length },
          { value: "receipts", label: "Receipts", count: (db.receipts ?? []).length },
          { value: "requests", label: "Requests", count: requests.filter((r) => r.status === "requested").length },
        ]}
      />

      {view === "board" && (
        <Card className="p-4" data-tour="po-board">
          <PillTabs<StatusFilter>
            className="mb-4"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All", count: counts.all },
              { value: "preparing", label: "Preparing", count: counts.preparing },
              { value: "sent", label: "Sent", count: counts.sent },
              { value: "acknowledged", label: "Acknowledged", count: counts.acknowledged },
              { value: "fulfilment", label: "Ready / Partial", count: counts.fulfilment },
              { value: "problem", label: "Problem", count: counts.problem },
              { value: "closed", label: "Closed", count: counts.closed },
            ]}
          />
          {rows.length === 0 ? (
            <EmptyState icon={<Boxes />} title="No orders match this filter." body="Orders are generated from a job's Materials tab." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>PO</TH>
                  <TH>Job</TH>
                  <TH>Branch</TH>
                  <TH>Status</TH>
                  <TH>Sent</TH>
                  <TH>Ack clock</TH>
                  <TH>Received vs ordered</TH>
                  <TH>Exception</TH>
                  {perms.seePrices && <TH className="text-right">Total</TH>}
                  <TH />
                </tr>
              </THead>
              <tbody>
                {rows.map((p) => {
                  const b = byId(db.branches, p.branchId);
                  const job = byId(db.jobs, p.jobId);
                  const ex = ackException(p, db.users, nowIso);
                  return (
                    <TR key={p.id} className="cursor-pointer" onClick={() => setOpenPo(p.id)}>
                      <TD className="font-semibold text-ink">{p.id}</TD>
                      <TD className="max-w-[170px] whitespace-normal">
                        <div className="leading-snug text-ink">{job?.name}</div>
                        <div className="text-xs text-gray-500">{p.jobId} · {p.phase}</div>
                      </TD>
                      <TD>{b?.name}<div className="text-xs text-gray-500">Store {b?.storeNumber || "—"}</div></TD>
                      <TD><PoStatusBadge po={p} /></TD>
                      <TD className="whitespace-nowrap">{p.sentAt ? <>{dateTime(p.resentAt ?? p.sentAt)}<div className="text-xs text-gray-500">{p.sendMethod}{p.resentAt ? " · resent" : ""}</div></> : <span className="text-gray-500">Not sent</span>}</TD>
                      <TD><AckClockChip po={p} nowIso={nowIso} /></TD>
                      <TD><ReceivedBar po={p} /></TD>
                      <TD>
                        {ex?.overdue ? <Badge tone="red" icon={<AlertTriangle className="h-3 w-3" />}>Call branch · {ex.responsible?.name.split(" ")[0]}</Badge>
                          : p.uncertainSend ? <Badge tone="amber">Receipt uncertain</Badge>
                          : p.lines.some((l) => l.supplierStatusText && !["ready for pickup", "picked up"].includes(l.supplierStatusText.toLowerCase()) && l.status !== "picked_up") ? <Badge tone="amber">Text to review</Badge>
                          : <span className="text-gray-300">—</span>}
                      </TD>
                      {perms.seePrices && <TD className="text-right tabular-nums">{money(poValue(p))}</TD>}
                      <TD onClick={(e) => e.stopPropagation()}>
                        <RowMenu items={[
                          { label: "Open order", icon: <Eye />, onSelect: () => setOpenPo(p.id) },
                          ...(perms.submit ? [{ label: "Record branch call", icon: <PhoneCall />, onSelect: () => setCallFor(p), disabled: !p.sentAt, reason: "Not sent yet" }] : []),
                        ]} />
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {view === "exceptions" && (
        <Card className="p-4">
          <CardLabel icon={<AlertTriangle />}>Orders past four working hours with no acknowledgment</CardLabel>
          <p className="mt-1 text-xs text-gray-500">Working hours: Monday to Friday, 7 a.m. to 4 p.m. branch-local, excluding observed US federal holidays. Opening an exception does not clear it — only a recorded action does.</p>
          <div className="mt-4 space-y-3">
            {exceptions.length === 0 && <EmptyState icon={<CheckCircle2 />} title="No overdue acknowledgments." body="Every sent order has either been acknowledged or is still inside its four working hours." />}
            {exceptions.map(({ po, ex }) => {
              const lastCall = po.calls?.[po.calls.length - 1];
              return (
                <div key={po.id} className="rounded-xl border border-red-200 bg-red-50/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-sm font-bold text-ink">{po.id}</span>
                        <PoStatusBadge po={po} />
                        <Badge tone="red">Overdue by {minutesLabel(-ex!.remainingMinutes)} working time</Badge>
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        {byId(db.jobs, po.jobId)?.name} · {byId(db.branches, po.branchId)?.name} · sent {dateTime(po.resentAt ?? po.sentAt)} by {userName(db, po.sentBy)} via {po.sendMethod}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        {(["sender", "office_manager", "owner"] as const).map((s, i) => (
                          <span key={s} className="flex items-center gap-1.5">
                            {i > 0 && <span className="text-gray-300">→</span>}
                            <span className={s === ex!.step ? "rounded-full bg-red-600 px-2 py-0.5 font-bold text-white" : "text-gray-500"}>
                              {ESCALATION_LABEL[s]}{s === "sender" ? ` (${userName(db, po.sentBy)})` : ""}
                            </span>
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 text-xs text-gray-600">Responsible now: <strong>{ex!.responsible?.name}</strong>{ex!.senderAbsent && " — sender is out of office"}. {lastCall ? `Last call ${dateTime(lastCall.at)} with ${lastCall.employee} (${lastCall.outcome.replace(/_/g, " ")}).` : "No branch call recorded yet."}</div>
                      <div className="mt-1 text-xs text-gray-500">Received {receivedOf(po).received} of {receivedOf(po).ordered} gal. Commitment still held — not released on a timer.</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setOpenPo(po.id)}><Eye className="h-3.5 w-3.5" /> Open</Button>
                      {perms.submit && <Button size="sm" onClick={() => setCallFor(po)}><PhoneCall className="h-3.5 w-3.5" /> Record call</Button>}
                      {perms.submit && ex!.next && (
                        <Button size="sm" variant="primary" onClick={() => act(escalateException, po.id).ok && toast.success(`Escalated to ${ESCALATION_LABEL[ex!.next!]}`)}>
                          <ArrowUpRight className="h-3.5 w-3.5" /> Escalate
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {view === "uncertain" && (
        <Card className="p-4">
          <CardLabel icon={<Repeat2 />}>Uncertain sends</CardLabel>
          <p className="mt-1 text-xs text-gray-500">A resend is blocked until a branch confirmation call is recorded. The original reference and the uncertainty stay visible.</p>
          <div className="mt-4 space-y-2">
            {uncertain.length === 0 && <EmptyState icon={<Inbox />} title="No uncertain sends." body="Mark a send uncertain from the order drawer when you're not sure the branch received it." />}
            {uncertain.map((p) => (
              <button key={p.id} onClick={() => setOpenPo(p.id)} className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-line p-3 text-left hover:bg-gray-50">
                <span className="font-semibold text-ink">{p.id}</span>
                {p.uncertainSend ? <Badge tone="amber">Receipt uncertain — call before resend</Badge> : <Badge tone="blue">Resent {p.resendCount}× · original reference kept</Badge>}
                <span className="text-xs text-gray-500">Marked {dateTime(p.uncertainAt)} · {(p.calls ?? []).length} call{(p.calls ?? []).length === 1 ? "" : "s"} recorded</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {view === "receipts" && <ReceiptsView onOpen={setOpenPo} />}
      {view === "requests" && <RequestsView requests={requests} onOpen={setOpenPo} />}

      <Modal open={newSub} onOpenChange={setNewSub} title="New submission" description="Choose a generated order to review, confirm the destination and send.">
        <div className="space-y-2">
          {awaitingSend.length === 0 && <EmptyState icon={<FilePlus2 />} title="No orders waiting to be sent." body="Generate an order from a job's Materials tab first." />}
          {awaitingSend.map((p) => (
            <button key={p.id} onClick={() => { setNewSub(false); setOpenPo(p.id); }} className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-left text-sm hover:border-brand hover:bg-brand-soft/40">
              <span className="font-semibold text-ink">{p.id}</span>
              <span className="text-gray-500">{byId(db.jobs, p.jobId)?.name} · {byId(db.branches, p.branchId)?.name} · {p.lines.length} line{p.lines.length === 1 ? "" : "s"}</span>
            </button>
          ))}
        </div>
      </Modal>
      <CallModal key={callFor?.id} po={callFor} onClose={() => setCallFor(undefined)} />
      <OrderDrawer poId={openPo} onClose={() => setOpenPo(undefined)} />
    </>
  );
}

function ReceiptsView({ onOpen }: { onOpen: (id: string) => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  const receipts = [...(db.receipts ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  const lines = db.purchaseOrders.filter((p) => p.ackAt).flatMap((p) => p.lines.map((l) => ({ po: p, l })));
  function exportReport() {
    downloadCsv(`ordered-vs-received-${now().slice(0, 10)}.csv`, [
      ["PO", "Job", "Branch", "Line", "Product", "Colour", "Ordered gal", "Cancelled gal", "Received gal", "Returned gal", "Unfilled gal"],
      ...lines.map(({ po, l }) => [po.id, po.jobId, byId(db.branches, po.branchId)?.name, l.id, l.product, l.colourLabel, l.gallons, l.cancelledGal, l.receivedGal, l.returnedGal, Math.max(0, l.gallons - l.cancelledGal - l.receivedGal)]),
    ]);
    toast.success("Report exported", "Ordered versus received, per branch and line.");
  }
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <CardLabel icon={<PackageCheck />} right={<Button size="sm" onClick={exportReport}><Download className="h-3.5 w-3.5" /> Ordered vs received (CSV)</Button>}>Receipts</CardLabel>
        <div className="mt-4">
          {receipts.length === 0 ? <EmptyState icon={<PackageCheck />} title="No receipts recorded yet." body="Receipts show here when goods are picked up or delivered against an order." /> : (
            <Table>
              <THead>
                <tr><TH>Receipt</TH><TH>PO · line</TH><TH>Job</TH><TH className="text-right">Qty / ordered</TH><TH>Over-receipt</TH><TH>Status</TH><TH>By</TH></tr>
              </THead>
              <tbody>
                {receipts.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-semibold text-ink">{r.id}</TD>
                    <TD><button className="text-brand hover:underline" onClick={() => onOpen(r.poId)}>{r.poId}</button> · {r.lineId}</TD>
                    <TD>{r.jobId}</TD>
                    <TD className="text-right tabular-nums">{r.qtyGal} / {r.orderedGal}</TD>
                    <TD>{r.overGal > 0 ? `${r.overGal.toFixed(2)} gal → ${r.toJobCostGal.toFixed(2)} job cost${r.toShelfGal > 0 ? `, ${r.toShelfGal.toFixed(2)} shelf` : ""}` : <span className="text-gray-300">—</span>}</TD>
                    <TD>
                      {r.status === "pending_approval" ? (
                        perms.approveOver ? <Button size="sm" variant="primary" onClick={() => act(approveReceipt, r.id).ok && toast.success("Over-receipt approved")}>Approve</Button> : <Badge tone="amber">Awaiting office manager</Badge>
                      ) : <Badge tone="green">{r.status === "approved" ? "Approved" : "Recorded"}</Badge>}
                    </TD>
                    <TD>{userName(db, r.by)}<div className="text-xs text-gray-500">{dateTime(r.at)}</div></TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}

function RequestsView({ requests, onOpen }: { requests: OrderRequest[]; onOpen: (id: string) => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  const [rejecting, setRejecting] = useState<OrderRequest>();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string>();
  const generate = (r: OrderRequest) => {
    const res = act(generateOrder, { key: `REQ:${r.id}`, requestId: r.id, jobId: r.jobId, supplierId: r.supplierId, branchId: r.branchId ?? "", phase: r.phase, deliveryDate: r.deliveryDate ?? "", fulfilment: r.fulfilment, lines: r.lines.map((l) => ({ specId: l.specId, gallons: l.gallons })) });
    if (res.ok) {
      toast.success(`Order ${res.value} generated`, "Confirm the destination and send it from the order drawer.");
      onOpen(res.value as string);
    }
  };
  return (
    <Card className="p-4">
      <CardLabel icon={<Inbox />}>Submission requests from estimators</CardLabel>
      <p className="mt-1 text-xs text-gray-500">Estimators approve demand and request submission. The office manager or owner generates the priced order.</p>
      <div className="mt-4 space-y-3">
        {requests.length === 0 && <EmptyState icon={<Inbox />} title="No requests." body="Material requests for a job show here, ready to turn into a supplier order." />}
        {requests.map((r) => {
          const need = r.limit.needs;
          const canGenerate = perms.generate && (need !== "owner" || user.role === "owner");
          return (
            <div key={r.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-bold text-ink">{r.id}</span>
                    <Badge tone={r.status === "requested" ? "amber" : r.status === "generated" ? "green" : "gray"}>{r.status === "requested" ? "Waiting for office" : r.status === "generated" ? "Generated" : "Rejected"}</Badge>
                    <Badge tone={r.limit.estimatorPass ? "green" : "red"}>Limit {r.limit.estimatorPass ? "pass" : "fail"}</Badge>
                    {need !== "none" && <Badge tone="amber">Needs {need === "owner" ? "owner" : "office manager"} approval</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    <AppLink href={jobHref(r.jobId, "materials")} className="text-brand hover:underline">{byId(db.jobs, r.jobId)?.name} · {r.jobId}</AppLink> · {byId(db.branches, r.branchId)?.name} · {r.phase} · needed {dateLong(r.deliveryDate)}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{r.lines.map((l) => `${l.specId}: ${formatPacks(l.packs)}`).join(" · ")}</div>
                  <div className="mt-1 text-xs text-gray-500">Requested by {userName(db, r.requestedBy)} {dateTime(r.requestedAt)}{r.note ? ` — “${r.note}”` : ""}</div>
                  {perms.seePrices && <div className="mt-1 text-xs text-gray-600">Value {money(r.limit.orderValue)} · 7-day window {money(r.limit.windowTotal)} · lifetime {money(r.limit.lifetimeTotal)}</div>}
                </div>
                <div className="flex gap-2">
                  {r.status === "generated" && r.poId && <Button size="sm" onClick={() => onOpen(r.poId!)}><Eye className="h-3.5 w-3.5" /> View order {r.poId}</Button>}
                  {r.status === "requested" && perms.generate && (
                    <>
                      <Button size="sm" onClick={() => { setRejecting(r); setNote(""); setErr(undefined); }}><XCircle className="h-3.5 w-3.5" /> Reject</Button>
                      <Button size="sm" variant="primary" disabled={!canGenerate} title={!canGenerate ? "Lifetime purchasing above $3,000 — only the owner can generate" : undefined} onClick={() => generate(r)}>
                        <FilePlus2 className="h-3.5 w-3.5" /> Generate priced order
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Modal open={!!rejecting} onOpenChange={(v) => !v && setRejecting(undefined)} title={`Reject ${rejecting?.id ?? ""}`}
        footer={<><Button onClick={() => setRejecting(undefined)}>Cancel</Button><Button variant="primary" onClick={() => {
          const res = act(rejectRequest, rejecting!.id, note);
          if (res.ok) { toast.success("Request rejected"); setRejecting(undefined); } else setErr(res.error);
        }}>Reject request</Button></>}>
        <Field label="Reason" required error={err}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} invalid={!!err} />
        </Field>
      </Modal>
    </Card>
  );
}
