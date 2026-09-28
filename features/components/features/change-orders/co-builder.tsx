"use client";
/**
 * Change order builder and record (Wireframe "Main Panel (builder view)").
 * Panels: change content, pricing, dependency, internal approval, customer
 * approval + links, emergency, downstream, history.
 */
import { useState } from "react";
import {
  AlertOctagon, BadgeCheck, CalendarClock, CheckCircle2, ClipboardList, Eye, FileDiff, GitBranch, History, Link2, Pencil, PhoneCall, Plus, Printer,
  RefreshCw, Receipt, RotateCcw, Scissors, Send, ShieldCheck, Siren, Trash2, UserCheck, Wrench, XCircle,
} from "lucide-react";
import type { ApprovalLink, ChangeOrder, ChangeOrderLine, DownstreamKey } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { date, dateLong, dateTime, money, relDays } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { CO_LINK_STATE, CO_STATUS } from "@/features/lib/status";
import {
  BILLING_LABEL, dependencyBlock, emergencyEligible, lineAmount, ownerApprovalCheck, refundAllowed, undeliverableStatus, writtenConfirmationStatus,
} from "@/features/lib/rules/change-orders";
import {
  coLinkState, coLinks, coPricing, coTaxRate, coVersion, currentLink, DOWNSTREAM_KEYS, DOWNSTREAM_LABEL, markReconciled, ownerApprove, ownerReturn,
  recordCustomerCall, recordDispute, recordRefundChoice, recordWrittenConfirmation, removeLine, reopenAsNewVersion, retryDownstream, scopeVersion,
  sendBlock, setDiscount, simulateSignerChange, simulateUndeliverable, submitForInternalApproval,
} from "@/features/lib/store/actions/change-orders";
import { Badge, Banner, Button, ConfirmDialog, Drawer, EmptyState, IdChip, Input, KV, RowMenu, Tooltip } from "@/features/components/ui";
import { DownstreamBadge, EmergencyBadge, Section, StatusBadge, TypeBadge } from "./shared";
import { DecisionModal, EmergencyModal, LineModal, NoteModal, SendModal, SplitModal, VerifyRecipientModal } from "./co-modals";
import { CustomerLinkModal, PresentationModal } from "./co-document";

const DS_ICON: Record<DownstreamKey, React.ReactNode> = {
  work_order: <Wrench className="h-4 w-4" />,
  materials: <ClipboardList className="h-4 w-4" />,
  scheduler: <CalendarClock className="h-4 w-4" />,
  billing: <Receipt className="h-4 w-4" />,
};

type NoteKind = "reopen" | "ownerReturn" | "dispute" | "written" | "call" | { reconcile: DownstreamKey };

export function CoBuilder({ coId, onClose, onOpenCo }: { coId?: string; onClose: () => void; onOpenCo: (id: string) => void }) {
  const db = useDb((d) => d);
  const co = coId ? byId(db.changeOrders, coId) : undefined;
  return (
    <Drawer
      open={!!co}
      onOpenChange={(v) => !v && onClose()}
      width="max-w-4xl"
      title={
        co ? (
          <span className="flex flex-wrap items-center gap-2">
            {co.id} <span className="font-normal text-slate-400">v{coVersion(co)}</span>
          </span>
        ) : (
          ""
        )
      }
      subtitle={co && <span className="flex flex-wrap items-center gap-1.5">{co.title} · <TypeBadge type={co.type} /> <StatusBadge co={co} /></span>}
    >
      {co && <BuilderBody co={co} onOpenCo={onOpenCo} />}
    </Drawer>
  );
}

function BuilderBody({ co, onOpenCo }: { co: ChangeOrder; onOpenCo: (id: string) => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const job = byId(db.jobs, co.jobId)!;
  const customer = byId(db.customers, job.customerId);
  const parent = byId(db.changeOrders, co.parentId);
  const children = db.changeOrders.filter((c) => c.parentId === co.id);
  const p = coPricing(db, co);
  const rate = coTaxRate(db, co);
  const nowIso = now();
  const canBuild = can(user, "co.build");
  const canPrice = can(user, "co.seePrices");
  const canCost = can(user, "co.seeCost");
  const canSend = can(user, "co.send");
  const canDecide = can(user, "co.recordDecision");
  const isOwner = can(user, "co.ownerApprove");
  const isDraft = co.status === "draft";
  const signed = co.status === "approved" || co.status === "disputed";
  const depBlock = dependencyBlock(parent);
  const ownerCheck = ownerApprovalCheck({ grossAddition: p.grossAddition, credit: p.credit, discountRequested: co.discount?.status === "requested" });
  const link = currentLink(co);
  const linkSt = link ? coLinkState(co, link, nowIso) : undefined;
  const block = sendBlock(db, co);

  const [lineModal, setLineModal] = useState<{ open: boolean; line?: ChangeOrderLine }>({ open: false });
  const [removing, setRemoving] = useState<ChangeOrderLine>();
  const [split, setSplit] = useState(false);
  const [verify, setVerify] = useState(false);
  const [send, setSend] = useState<"send" | "reissue" | null>(null);
  const [decision, setDecision] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const [note, setNote] = useState<NoteKind | null>(null);
  const [preview, setPreview] = useState<"preview" | "print" | null>(null);
  const [customerLink, setCustomerLink] = useState<ApprovalLink>();
  const [discountText, setDiscountText] = useState(co.discount ? String(co.discount.pct) : "");
  const [refundDate, setRefundDate] = useState(nowIso.slice(0, 10));

  const history = db.activity.filter((a) => a.message.includes(co.id));

  function submit() {
    const res = act(submitForInternalApproval, co.id);
    if (res.ok) {
      const v = res.value as { ownerRequired: boolean };
      toast.success(v.ownerRequired ? "Sent to the owner for approval" : "Ready to send", v.ownerRequired ? ownerCheck.reasons.join("; ") || "Deposit review triggered" : "Owner approval not required by the threshold.");
    }
  }

  return (
    <>
      {/* ---------- Status banners ---------- */}
      {co.returnedToDraft && isDraft && (
        <Banner tone="warn" title={`Returned to draft — ${co.returnedToDraft.reason}`}>
          Repriced against scope version {co.returnedToDraft.scopeVersion} on {dateLong(co.returnedToDraft.at)} at today&apos;s tax rate. Check any lines that depended on the parent&apos;s scope.
        </Banner>
      )}
      {co.discount?.status === "requested" && <Banner tone="warn" title="Awaiting owner approval of inherited discount.">The change order is held until the business owner approves the {co.discount.pct}% discount.</Banner>}
      {co.status === "rejected" && co.rejection && (
        <Banner tone="danger" title={`Rejected by ${co.rejection.signer} on ${dateLong(co.rejection.at)}`}>Reason: {co.rejection.reason}</Banner>
      )}
      {co.status === "disputed" && co.dispute && (
        <Banner tone="danger" title="Disputed — referred to the business owner">
          Payment refused for work already performed ({dateLong(co.dispute.at)}). {co.dispute.note} Resolution is the owner&apos;s decision; nothing is resolved automatically.
        </Banner>
      )}
      {co.splitFrom && <Banner tone="info">Split from <button className="font-semibold underline" onClick={() => onOpenCo(co.splitFrom!)}>{co.splitFrom}</button>. Approved separately.</Banner>}

      {/* ---------- Summary ---------- */}
      <KV
        items={[
          ["Job", `${job.id} · ${job.name}`],
          ["Customer", customer?.name],
          ["Change-order date", `${dateLong(co.taxDate)} (sets the tax rate)`],
          ["Baseline", `Scope version ${scopeVersion(db, job.id)} — original contract plus signed change orders`],
          ["Created", `${dateTime(co.createdAt)} by ${byId(db.users, co.createdBy)?.name ?? "—"}`],
        ]}
      />

      {/* ---------- Change content ---------- */}
      <Section
        title="Change content"
        icon={<FileDiff />}
        right={
          isDraft && canBuild && (
            <div className="flex gap-2">
              {co.lines.length > 1 && (
                <Button size="sm" onClick={() => setSplit(true)}>
                  <Scissors className="h-3.5 w-3.5" /> Split
                </Button>
              )}
              <Button size="sm" variant="primary" onClick={() => setLineModal({ open: true })}>
                <Plus className="h-3.5 w-3.5" /> Add line
              </Button>
            </div>
          )
        }
      >
        <p className="mb-3 text-[11.5px] text-slate-500">
          Incremental difference only.{canPrice && ` The original contract (${money(job.contractValue)}) is not re-added.`}
        </p>
        {co.lines.length === 0 ? (
          <EmptyState
            icon={<FileDiff />}
            title="No changes recorded yet."
            body="Add or remove scope to build this change order."
            action={isDraft && canBuild && <Button variant="primary" onClick={() => setLineModal({ open: true })}><Plus className="h-4 w-4" /> Add line</Button>}
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[560px] text-left text-[12.5px]">
              <thead className="bg-slate-50/80 text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  <th className="px-3 py-2">Change</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Measure</th>
                  {canCost && <th className="px-3 py-2 text-right">Cost</th>}
                  {canPrice && <th className="px-3 py-2 text-right">Difference</th>}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {co.lines.map((l) => {
                  const amt = lineAmount(l, co.markupPct);
                  return (
                    <tr key={l.id} className="border-t border-line">
                      <td className="px-3 py-2">
                        <Badge tone={l.kind === "add" ? "blue" : "pink"}>{l.kind === "add" ? "+ Add" : "− Remove"}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-ink">{l.description}</div>
                        <div className="text-[11px] text-slate-500">
                          {[l.product, l.colour].filter(Boolean).join(" · ")}
                          {l.treatment === "stranded_paint" && " · Nonreturnable tinted paint — billed here once, not again via leftover stock"}
                          {l.treatment === "absorbed_labour" && " · Labour cancelled inside 24 h — absorbed by the contractor"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{l.sqft !== undefined ? `${l.sqft} sq ft` : "—"}</td>
                      {canCost && <td className="px-3 py-2 text-right text-slate-500">{money(l.cost)}</td>}
                      {canPrice && <td className={`px-3 py-2 text-right font-semibold ${amt < 0 ? "text-pink-700" : "text-ink"}`}>{amt > 0 ? "+" : ""}{money(amt)}</td>}
                      <td className="px-1">
                        {isDraft && canBuild && (
                          <RowMenu
                            items={[
                              { label: "Edit line", icon: <Pencil />, onSelect: () => setLineModal({ open: true, line: l }) },
                              { label: "Remove line", icon: <Trash2 />, danger: true, onSelect: () => setRemoving(l) },
                            ]}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isDraft && canBuild && ["pending_internal", "ready_to_send", "sent"].includes(co.status) && (
          <p className="mt-3 text-[11.5px] text-slate-500">
            Content is locked after submission. To change it,{" "}
            <button className="font-semibold text-brand hover:underline" onClick={() => setNote("reopen")}>reopen as version {coVersion(co) + 1}</button> (any sent link is superseded).
          </p>
        )}
      </Section>

      {/* ---------- Pricing ---------- */}
      {canPrice && (
        <Section title="Pricing" icon={<Receipt />}>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 text-[12.5px]">
              <PriceRow k="Markup" v={`${co.markupPct}% (original contract)`} />
              <PriceRow k="Tax rate" v={`${rate.ratePct}% effective ${dateLong(rate.effectiveFrom)}`} />
              <PriceRow k="Change-order date" v={`${dateLong(co.taxDate)} (printed on the document)`} />
              <PriceRow k="Rounding" v="Half-up to cents, per line" />
              <PriceRow k="Minimum charge" v="None inside an existing contract" />
              {rate.ratePct !== job.taxRatePct && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
                  The contract was signed at {job.taxRatePct}%. That rate is obsolete for this change and is not reused.
                </p>
              )}
              <div className="pt-2">
                <div className="text-[11.5px] font-semibold text-slate-700">Inherited discount</div>
                {isDraft && canBuild ? (
                  <div className="mt-1 flex items-center gap-2">
                    <Input className="h-8 w-24" type="number" min={0} max={50} step="0.5" value={discountText} onChange={(e) => setDiscountText(e.target.value)} aria-label="Discount percent" placeholder="%" />
                    <Button size="sm" onClick={() => act(setDiscount, co.id, discountText === "" ? null : Number(discountText)).ok && toast.success(discountText ? "Discount requested" : "Discount removed", discountText ? "Held for owner approval." : undefined)}>
                      {discountText ? "Request" : "Clear"}
                    </Button>
                  </div>
                ) : (
                  <div className="text-[12px] text-slate-500">{co.discount ? `${co.discount.pct}% · ${co.discount.status === "approved" ? `approved by ${byId(db.users, co.discount.approvedBy)?.name}` : "awaiting owner"}` : "None"}</div>
                )}
                <p className="mt-1 text-[11px] text-slate-400">No discount is inherited without the owner&apos;s approval.</p>
              </div>
            </div>
            <div className="space-y-1.5 rounded-lg bg-slate-50 p-4 text-[13px]">
              <PriceRow k="Gross addition" v={money(p.grossAddition)} />
              <PriceRow k="Credit" v={p.credit ? money(-p.credit) : money(0)} />
              {(p.discount > 0 || p.pendingDiscount > 0) && <PriceRow k={p.discount ? "Discount (approved)" : "Discount (held, not applied)"} v={money(-(p.discount || p.pendingDiscount))} muted={!p.discount} />}
              <PriceRow k="Net change" v={money(p.net)} bold />
              <PriceRow k={`Tax ${rate.ratePct}%`} v={money(p.tax)} />
              <div className="border-t border-line pt-1.5">
                <PriceRow k="Change order total" v={money(p.total)} bold />
              </div>
              {canCost && p.absorbedCost > 0 && <PriceRow k="Absorbed labour (job cost)" v={money(p.absorbedCost)} muted />}
            </div>
          </div>
        </Section>
      )}

      {/* ---------- Dependency ---------- */}
      {(parent || children.length > 0) && (
        <Section title="Dependency" icon={<GitBranch />}>
          {parent && (
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="text-slate-500">Parent</span>
              <button className="font-semibold text-brand hover:underline" onClick={() => onOpenCo(parent.id)}>{parent.id}</button>
              <span>{parent.title}</span>
              <StatusBadge co={parent} />
            </div>
          )}
          {parent && depBlock && <Banner tone="warn" className="mt-3" title="Can be drafted, not sent or approved">{depBlock} If {parent.id} is rejected, this change order returns to draft and is repriced against the last approved scope.</Banner>}
          {parent && !depBlock && <p className="mt-2 text-[12px] text-emerald-700">Parent resolved ({CO_STATUS[parent.status].label}). This change order can proceed.</p>}
          {children.length > 0 && (
            <div className="mt-2 text-[12.5px] text-slate-600">
              Dependent change orders:{" "}
              {children.map((c) => (
                <button key={c.id} className="mr-2 font-semibold text-brand hover:underline" onClick={() => onOpenCo(c.id)}>{c.id}</button>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ---------- Internal approval ---------- */}
      {!co.emergency && (
        <Section title="Internal approval" icon={<BadgeCheck />}>
          <div className="space-y-3 text-[12.5px]">
            <div className="flex flex-wrap items-center gap-2">
              {ownerCheck.required || co.depositReview ? <Badge tone="amber">Business owner approval required</Badge> : <Badge tone="gray">Owner approval not required by the threshold</Badge>}
              {co.ownerApprovedBy && <Badge tone="green" icon={<CheckCircle2 className="h-3 w-3" />}>Approved by {byId(db.users, co.ownerApprovedBy)?.name} · {dateTime(co.ownerApprovedAt)}</Badge>}
            </div>
            <ul className="list-disc space-y-0.5 pl-5 text-slate-600">
              {ownerCheck.reasons.map((r) => <li key={r}>{r}</li>)}
              {!ownerCheck.required && <li>Gross addition is not above $2,000.00 and there is no credit. Credits never offset additions.</li>}
            </ul>
            {co.depositReview && canPrice && (
              <Banner tone="warn" title="Deposit review triggered">
                Cumulative signed net changes including this one are {money(co.depositReview.cumulativeNet)} — {(co.depositReview.pct * 100).toFixed(1)}% of the original contract ({money(job.contractValue)}). Revised deposit target {money(co.depositReview.target)} (one-third of the new total), collected {money(co.depositReview.collected)}, additional due {money(co.depositReview.due)}. Approved by the owner, signed by the customer with this change order.
              </Banner>
            )}
            <div className="flex flex-wrap gap-2">
              {isDraft && canBuild && (
                <Tooltip content={co.lines.length === 0 ? "Add at least one line" : depBlock ?? "Price and submit"}>
                  <span>
                    <Button variant="primary" size="sm" onClick={submit} disabled={co.lines.length === 0}>
                      <Send className="h-3.5 w-3.5" /> Submit for internal approval
                    </Button>
                  </span>
                </Tooltip>
              )}
              {co.status === "pending_internal" && isOwner && (
                <>
                  <Button variant="success" size="sm" onClick={() => act(ownerApprove, co.id).ok && toast.success("Approved by owner", `${co.id} is ready to send.`)}>
                    <ShieldCheck className="h-3.5 w-3.5" /> Owner approve
                  </Button>
                  <Button size="sm" onClick={() => setNote("ownerReturn")}>
                    <RotateCcw className="h-3.5 w-3.5" /> Return to estimator
                  </Button>
                </>
              )}
              {co.status === "pending_internal" && !isOwner && <p className="text-[12px] text-amber-700">Waiting for the business owner. Switch role to Business Owner in the demo bar to approve.</p>}
            </div>
          </div>
        </Section>
      )}

      {/* ---------- Customer approval ---------- */}
      {!co.emergency && (
        <Section
          title="Customer approval"
          icon={<UserCheck />}
          right={
            co.status === "sent" && canSend && (
              <RowMenu
                label="Demo controls"
                items={[
                  { label: "Demo: message bounced (undeliverable)", icon: <AlertOctagon />, onSelect: () => act(simulateUndeliverable, co.id).ok && toast.info("Marked undeliverable", "Office flagged today; owner after two working days.") },
                  { label: "Demo: signer changed on customer record", icon: <UserCheck />, onSelect: () => act(simulateSignerChange, co.id).ok && toast.info("Signer changed", "A new link is required.") },
                ]}
              />
            )
          }
        >
          <div className="space-y-3 text-[12.5px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500">Recipient</span>
              {co.recipientVerified ? (
                <Badge tone="green" icon={<ShieldCheck className="h-3 w-3" />}>{co.recipientName ?? co.recipient} &lt;{co.recipient}&gt; · verified on customer record</Badge>
              ) : (
                <Badge tone="amber">Not verified</Badge>
              )}
              {canSend && ["draft", "pending_internal", "ready_to_send", "sent"].includes(co.status) && (
                <Button size="sm" onClick={() => setVerify(true)}>
                  <UserCheck className="h-3.5 w-3.5" /> {co.recipientVerified ? "Change recipient" : "Verify recipient"}
                </Button>
              )}
            </div>

            {co.status === "ready_to_send" && canSend && (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm" disabled={!!block} onClick={() => setSend("send")}>
                  <Send className="h-3.5 w-3.5" /> Send to customer
                </Button>
                {block && <span className="text-[12px] text-amber-700">{block}</span>}
              </div>
            )}
            {["draft", "pending_internal"].includes(co.status) && block && <p className="text-[12px] text-slate-500">Send: {block}</p>}

            {link && co.status === "sent" && linkSt && (
              <LinkStatusBanner co={co} link={link} state={linkSt} canSend={canSend} onReissue={() => setSend("reissue")} onVerify={() => setVerify(true)} />
            )}

            {coLinks(co).length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[620px] text-left text-[12px]">
                  <thead className="bg-slate-50/80 text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Link</th>
                      <th className="px-3 py-2">Version</th>
                      <th className="px-3 py-2">Sent</th>
                      <th className="px-3 py-2">To</th>
                      <th className="px-3 py-2">Expires</th>
                      <th className="px-3 py-2">State</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...coLinks(co)].reverse().map((l) => {
                      const st = coLinkState(co, l, nowIso);
                      return (
                        <tr key={l.id} className="border-t border-line">
                          <td className="px-3 py-2 font-semibold text-ink">{l.id}</td>
                          <td className="px-3 py-2">v{l.version}</td>
                          <td className="px-3 py-2">{dateTime(l.sentAt)} · {l.channel === "portal" ? "Portal" : "Email"}</td>
                          <td className="px-3 py-2">{l.recipientName}</td>
                          <td className="px-3 py-2">{date(l.expiresAt)} <span className="text-slate-400">({relDays(l.expiresAt, nowIso)})</span></td>
                          <td className="px-3 py-2">
                            <Badge tone={CO_LINK_STATE[st].tone}>{CO_LINK_STATE[st].label}</Badge>
                            {l.supersededReason && <div className="mt-0.5 max-w-52 text-[10.5px] text-slate-400">{l.supersededReason}</div>}
                          </td>
                          <td className="px-3 py-2">
                            <Button size="sm" variant="ghost" onClick={() => setCustomerLink(l)}>
                              <Eye className="h-3.5 w-3.5" /> Open as customer
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {co.evidence && co.evidence.channel !== "verbal" && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Approval evidence</div>
                <KV items={[["Version", `v${co.evidence.version}`], ["Signer", co.evidence.signer], ["Channel", co.evidence.channel === "portal" ? "Portal signature" : "Written email reply"], ["Timestamp", dateTime(co.evidence.at)], ["Evidence", co.evidence.ref], ["Recorded by", byId(db.users, co.evidence.recordedBy)?.name]]} />
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {co.status === "sent" && canDecide && (
                <Button variant="primary" size="sm" onClick={() => setDecision(true)} disabled={!!depBlock}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Record customer decision
                </Button>
              )}
              {co.status === "sent" && depBlock && <span className="text-[12px] text-amber-700">Blocked: {depBlock}</span>}
              {co.status === "approved" && canDecide && (
                <Button size="sm" variant="danger" onClick={() => setNote("dispute")}>
                  <XCircle className="h-3.5 w-3.5" /> Mark disputed (payment refused for work done)
                </Button>
              )}
            </div>
            {!canSend && ["ready_to_send", "sent"].includes(co.status) && <p className="text-[11.5px] text-slate-400">The office verifies the recipient and sends. Your role can view only.</p>}
          </div>
        </Section>
      )}

      {/* ---------- Emergency ---------- */}
      {(co.emergency || (isDraft && canBuild && co.lines.length > 0)) && (
        <EmergencyPanel co={co} total={p.total} canPrice={canPrice} canBuild={canBuild} canDecide={canDecide} onRaise={() => setEmergency(true)} onWritten={() => setNote("written")} onCall={() => setNote("call")} />
      )}

      {/* ---------- Downstream ---------- */}
      {signed && (
        <Section title="Downstream updates" icon={<RefreshCw />}>
          {DOWNSTREAM_KEYS.every((k) => co.downstream[k] === "done") ? (
            <Banner tone="success" className="mb-3" title="All four downstream actions succeeded">Work order, material demand, scheduler task and billing action are complete.</Banner>
          ) : DOWNSTREAM_KEYS.some((k) => co.downstream[k] === "failed") ? (
            <Banner tone="danger" className="mb-3" title="Partial failure">
              Failed actions are on the office manager&apos;s 7 a.m. exception list. Retry runs only the missing action; succeeded actions are locked and never reapplied.
            </Banner>
          ) : null}
          <div className="divide-y divide-line rounded-lg border border-line">
            {DOWNSTREAM_KEYS.map((k) => {
              const st = co.downstream[k];
              const meta = co.downstreamMeta?.[k];
              return (
                <div key={k} className="flex flex-wrap items-start gap-3 px-3 py-3">
                  <span className="mt-0.5 text-slate-400">{DS_ICON[k]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{DOWNSTREAM_LABEL[k]}</span>
                      <DownstreamBadge state={st} />
                    </div>
                    {meta?.ref && <div className="text-[11.5px] text-slate-500">{meta.ref}{meta.reconciledNote ? ` — ${meta.reconciledNote}` : ""}</div>}
                    {st === "failed" && meta?.error && <div className="text-[11.5px] text-red-600">Failed {dateTime(meta.at)}: {meta.error}</div>}
                    {meta?.at && st === "done" && <div className="text-[10.5px] text-slate-400">{dateTime(meta.at)}</div>}
                    {k === "scheduler" && <div className="text-[10.5px] text-slate-400">Crews are never rescheduled automatically. Schedule review is confirmed separately from customer approval.</div>}
                    {k === "billing" && <BillingDetail co={co} canPrice={canPrice} />}
                  </div>
                  {st === "failed" && can(user, "co.exceptions") ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" onClick={() => act(retryDownstream, co.id, k).ok && toast.success(`${DOWNSTREAM_LABEL[k]} retried`, "Only the missing action ran.")}>
                        <RefreshCw className="h-3.5 w-3.5" /> Retry
                      </Button>
                      <Button size="sm" onClick={() => setNote({ reconcile: k })}>Mark reconciled</Button>
                    </div>
                  ) : (
                    <Tooltip content={st === "done" ? "Already succeeded — locked" : "Only a failed action can be retried"}>
                      <span>
                        <Button size="sm" disabled>
                          <RefreshCw className="h-3.5 w-3.5" /> Retry
                        </Button>
                      </span>
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </div>
          {co.downstream.billing === "done" && co.billing?.mode === "account_credit" && co.billing.creditRaisedAt && canDecide && (
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-line p-3 text-[12px]">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-ink">Refund or account credit</div>
                <div className="text-slate-500">
                  Credit raised {dateLong(co.billing.creditRaisedAt)}; refund window closes {dateLong(`${co.billing.refundWindowCloses}T12:00:00`)}. Current choice: {co.billing.customerChoice === "refund" ? "Refund" : "Account credit (default)"}.
                </div>
              </div>
              <Input type="date" className="h-8 w-40" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} aria-label="Refund request date" />
              <Button size="sm" onClick={() => act(recordRefundChoice, co.id, "refund", `${refundDate}T12:00:00`).ok && toast.success("Refund recorded")}>
                Customer requests refund
              </Button>
              {!refundAllowed(co.billing.creditRaisedAt, `${refundDate}T12:00:00`) && <span className="w-full text-[11.5px] text-amber-700">That date is after the 14-day window. The default account credit stands.</span>}
            </div>
          )}
        </Section>
      )}

      {/* ---------- History ---------- */}
      <Section title="Version and activity history" icon={<History />}>
        {history.length === 0 ? (
          <p className="text-[12px] italic text-slate-400">No recorded activity.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {history.map((a) => (
              <div key={a.id} className="border-l-2 border-line pl-3 text-[12px]">
                <div className="text-[10px] font-bold uppercase text-slate-400">{dateTime(a.at)} · {byId(db.users, a.userId)?.name}</div>
                <div className={a.blocked ? "text-red-700" : "text-slate-700"}>{a.message}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button onClick={() => setPreview("preview")}>
          <Eye className="h-4 w-4" /> Customer preview
        </Button>
        <Button onClick={() => setPreview("print")}>
          <Printer className="h-4 w-4" /> Print change order
        </Button>
      </div>

      <LineModal co={co} line={lineModal.line} open={lineModal.open} onClose={() => setLineModal({ open: false })} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(undefined)}
        title={`Remove line ${removing?.id}?`}
        body={`“${removing?.description}” is removed from this draft. The removal is logged.`}
        confirmLabel="Remove line"
        onConfirm={() => removing && act(removeLine, co.id, removing.id).ok && toast.success("Line removed")}
      />
      <SplitModal co={split ? co : undefined} onClose={() => setSplit(false)} onSplit={onOpenCo} />
      {verify && <VerifyRecipientModal co={co} onClose={() => setVerify(false)} />}
      {send && <SendModal co={co} reissue={send === "reissue"} onClose={() => setSend(null)} />}
      {decision && <DecisionModal co={co} onClose={() => setDecision(false)} onSplit={() => setSplit(true)} />}
      {emergency && <EmergencyModal co={co} onClose={() => setEmergency(false)} />}
      <PresentationModal co={preview ? co : undefined} mode={preview ?? "preview"} onClose={() => setPreview(null)} />
      <CustomerLinkModal co={customerLink ? co : undefined} link={customerLink} onClose={() => setCustomerLink(undefined)} />
      <NoteModal
        open={note !== null}
        onClose={() => setNote(null)}
        {...noteCopy(note, co)}
        onSubmit={(text) => {
          let res: { ok: boolean; error?: string } = { ok: false };
          if (note === "reopen") res = act(reopenAsNewVersion, co.id, text);
          else if (note === "ownerReturn") res = act(ownerReturn, co.id, text);
          else if (note === "dispute") res = act(recordDispute, co.id, text);
          else if (note === "written") res = act(recordWrittenConfirmation, co.id, text);
          else if (note === "call") res = act(recordCustomerCall, co.id, text);
          else if (note && typeof note === "object") res = act(markReconciled, co.id, note.reconcile, text);
          if (res.ok) toast.success(noteCopy(note, co).confirmLabel, co.id);
          return res;
        }}
      />
    </>
  );
}

function noteCopy(note: NoteKind | null, co: ChangeOrder) {
  if (note === "reopen") return { title: `Reopen ${co.id} as version ${coVersion(co) + 1}`, description: "Any sent link is superseded and blocked. Internal approval runs again.", label: "Reason for the new version", confirmLabel: "Reopen as new version" };
  if (note === "ownerReturn") return { title: `Return ${co.id} to the estimator`, label: "What needs to change", confirmLabel: "Return to estimator" };
  if (note === "dispute") return { title: `Mark ${co.id} disputed`, description: "Payment refused for work already performed. It is referred to the business owner; nothing is resolved automatically.", label: "What the customer said", confirmLabel: "Mark disputed" };
  if (note === "written") return { title: "Record written confirmation", description: "Signed document or written email from the customer confirming the emergency work.", label: "Evidence reference", confirmLabel: "Record confirmation", placeholder: "Email from customer 9/24 3:10 p.m. — “Confirmed”" };
  if (note === "call") return { title: "Record customer call", description: "The office manager phones the customer the same day the confirmation goes overdue.", label: "Call notes", confirmLabel: "Record call" };
  if (note && typeof note === "object") return { title: `Mark ${DOWNSTREAM_LABEL[note.reconcile]} reconciled`, description: "Use when the office fixed the update by hand. It will not be retried.", label: "How it was reconciled", confirmLabel: "Mark reconciled" };
  return { title: "", label: "", confirmLabel: "" };
}

function PriceRow({ k, v, bold, muted }: { k: string; v: React.ReactNode; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? "font-bold text-ink" : muted ? "text-slate-400" : "text-slate-600"}`}>
      <span>{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

function LinkStatusBanner({ co, link, state, canSend, onReissue, onVerify }: { co: ChangeOrder; link: ApprovalLink; state: string; canSend: boolean; onReissue: () => void; onVerify: () => void }) {
  const nowIso = now();
  if (state === "expired")
    return (
      <Banner tone="warn" title={`Link expired ${dateLong(link.expiresAt)}`} action={canSend && <Button size="sm" onClick={onReissue}><Link2 className="h-3.5 w-3.5" /> Reissue link</Button>}>
        The customer sees “This approval link has expired. Please contact us for a new link.” A person must send the new link; there is no automatic resend.
      </Banner>
    );
  if (state === "signer_changed")
    return (
      <Banner tone="warn" title="Signer changed on the customer record — a new link is required" action={canSend && <Button size="sm" onClick={co.recipientVerified ? onReissue : onVerify}>{co.recipientVerified ? "Reissue link" : "Verify new signer"}</Button>}>
        The old link {link.id} can no longer be used.
      </Banner>
    );
  if (state === "undeliverable") {
    const u = undeliverableStatus(link.deliveryFailedAt ?? link.sentAt, nowIso);
    return (
      <Banner tone="danger" title={`Undeliverable — ${link.deliveryError ?? "message bounced"}`} action={canSend && <Button size="sm" onClick={onVerify}>Fix recipient</Button>}>
        Office flagged {dateLong(link.deliveryFailedAt)}. {link.escalatedAt || u.escalate ? `Escalated to the business owner (two working days passed).` : `Escalates to the business owner after ${dateLong(`${u.escalateAfter}T12:00:00`)}.`} Correct the address, then reissue the link.
      </Banner>
    );
  }
  const days = Math.ceil((new Date(link.expiresAt).getTime() - new Date(nowIso).getTime()) / 86_400_000);
  return (
    <Banner tone="info" title={`Awaiting signature — v${link.version} sent ${dateLong(link.sentAt)} via ${link.channel === "portal" ? "portal" : "email"}`} action={canSend && <Button size="sm" onClick={onReissue}><Link2 className="h-3.5 w-3.5" /> Reissue link</Button>}>
      Delivered. Link expires {dateLong(link.expiresAt)} ({days} day{days === 1 ? "" : "s"} left).
    </Banner>
  );
}

function BillingDetail({ co, canPrice }: { co: ChangeOrder; canPrice: boolean }) {
  return (
    <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
      {co.billing && <div className="font-medium text-slate-700">{BILLING_LABEL[co.billing.mode]}{co.billing.docId ? ` — ${co.billing.docId}` : ""}{canPrice && co.billing.mode !== "none" ? ` · ${money(co.billing.amount)}` : ""}</div>}
      <div>Rules: draft invoice updated in place · addition to a sent invoice → supplemental invoice · negative change to a sent unpaid invoice → credit note · already paid → account credit by default, refund on request within 14 days. Issued invoices are never edited; original references are kept.</div>
    </div>
  );
}

function EmergencyPanel({ co, total, canPrice, canBuild, canDecide, onRaise, onWritten, onCall }: {
  co: ChangeOrder; total: number; canPrice: boolean; canBuild: boolean; canDecide: boolean; onRaise: () => void; onWritten: () => void; onCall: () => void;
}) {
  const db = useDb((d) => d);
  const e = co.emergency;
  if (!e) {
    const eligible = emergencyEligible(total);
    return (
      <Section title="Emergency work" icon={<Siren />}>
        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
          <p className="min-w-0 flex-1 text-slate-600">
            {eligible
              ? "Urgent work strictly below $500.00 may start on verbal approval, with same-day evidence and written confirmation within two working days."
              : `Not available: the emergency path is only for work strictly below $500.00${canPrice ? ` (this change is ${money(total)})` : ""}. Exactly $500.00 does not qualify.`}
          </p>
          {canBuild && (
            <Button size="sm" onClick={onRaise} disabled={!eligible}>
              <Siren className="h-3.5 w-3.5" /> Raise emergency work
            </Button>
          )}
        </div>
      </Section>
    );
  }
  const s = writtenConfirmationStatus(e.verbalAt, e.writtenConfirmedAt, now());
  const dueLabel = new Date(`${s.dueDay}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return (
    <Section title="Emergency work" icon={<Siren />} right={<EmergencyBadge co={co} />}>
      {s.state === "awaiting" && (
        <Banner tone="warn" className="mb-3" title={`Awaiting written confirmation — ${s.workingDaysLeft === 0 ? "due today" : `${s.workingDaysLeft} working day${s.workingDaysLeft === 1 ? "" : "s"} left`}`} action={canDecide && <Button size="sm" onClick={onWritten}>Record written confirmation</Button>}>
          Due by end of {dueLabel}. On day three the owner is escalated to, work on this change stops, and the office manager phones the customer.
        </Banner>
      )}
      {s.state === "overdue" && (
        <Banner tone="danger" className="mb-3" title="Work stopped — written confirmation overdue. Owner escalated." action={canDecide && (
          <div className="flex flex-col gap-1.5">
            {!e.customerCalledAt && e.escalatedAt && <Button size="sm" onClick={onCall}><PhoneCall className="h-3.5 w-3.5" /> Record customer call</Button>}
            <Button size="sm" onClick={onWritten}>Record written confirmation</Button>
          </div>
        )}>
          Was due {dueLabel}. {e.escalatedAt ? `Escalated ${dateTime(e.escalatedAt)}; call task for the office manager created.` : "Escalation runs at the 7 a.m. check."} {e.customerCalledAt && `Customer called ${dateTime(e.customerCalledAt)}.`}
        </Banner>
      )}
      {s.state === "confirmed" && <Banner tone="success" className="mb-3" title={`Written confirmation received ${dateTime(e.writtenConfirmedAt)}`}>{e.writtenRef}</Banner>}
      <KV
        items={[
          ["Findings", e.findings],
          ["Photographs", `${e.photos} attached (same day)`],
          ["Authorised by", `${byId(db.users, e.authoriser)?.name ?? "—"}${e.ownerUnreachable ? " (office manager — owner unreachable)" : ""}`],
          ["Verbal authorisation", dateTime(e.verbalAt)],
          ["Customer text or email", e.customerMessageRef ?? "—"],
          ["Written confirmation due", `End of ${dueLabel} (two working days)`],
          ...(canPrice ? ([["Amount", `${money(e.amount ?? total)} (below $500.00)`]] as [string, string][]) : []),
        ]}
      />
    </Section>
  );
}
