"use client";
/**
 * Customer presentation and printable change-order document (24 Output).
 * Shows the incremental change and the revised contract total, the effective
 * tax date and the approval block. Never shows internal cost or markup.
 */
import { useRef } from "react";
import { Clock3, Link2Off, Printer, ShieldAlert } from "lucide-react";
import type { ApprovalLink, ChangeOrder } from "@/features/types";
import { useDb } from "@/features/lib/store";
import { byId, propertyAddress } from "@/features/lib/selectors";
import { printElement } from "@/features/lib/export";
import { dateLong, money } from "@/features/lib/format";
import { lineAmount } from "@/features/lib/rules/change-orders";
import { coLinkState, coPricing, coTaxRate, coVersion, contractSummary, currentLink } from "@/features/lib/store/actions/change-orders";
import { now } from "@/features/lib/clock";
import { CO_TYPE } from "@/features/lib/status";
import { Banner, Button, Modal } from "@/features/components/ui";

export function CoDocument({ co }: { co: ChangeOrder }) {
  const db = useDb((d) => d);
  const job = byId(db.jobs, co.jobId)!;
  const property = byId(db.properties, job.propertyId);
  const customer = byId(db.customers, job.customerId);
  const p = coPricing(db, co);
  const rate = coTaxRate(db, co);
  const summary = contractSummary(db, job);
  const signed = co.status === "approved" || co.status === "disputed";
  // Revised total: previously approved changes + this change (if not already counted).
  const before = signed ? summary.revisedTotal - p.net : summary.revisedTotal;
  const revised = before + p.net;
  return (
    <div className="space-y-5 bg-white p-6 text-xs text-gray-700">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="font-display text-xl font-bold text-ink">Change Order {co.id}</div>
          <div className="text-gray-500">Version {coVersion(co)} · {CO_TYPE[co.type].label} · Dated {dateLong(co.taxDate)}</div>
          <div className="mt-1 font-semibold text-ink">{co.title}</div>
        </div>
        <div className="text-right">
          <div className="font-display font-bold text-ink">Estimate Master Painting</div>
          <div className="text-gray-500">{customer?.name}</div>
          <div className="text-gray-500">{propertyAddress(property, true)}</div>
          <div className="text-gray-500">Job {job.id} · {job.name}</div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xxs font-bold uppercase tracking-[0.14em] text-gray-400">What changes (incremental only)</div>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line text-xxs uppercase tracking-wider text-gray-400">
              <th className="py-1.5 pr-2">Change</th>
              <th className="py-1.5 pr-2">Description</th>
              <th className="py-1.5 pr-2 text-right">Area</th>
              <th className="py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {co.lines.map((l) => (
              <tr key={l.id} className="border-b border-line/70">
                <td className="py-1.5 pr-2 font-semibold">{l.kind === "add" ? "Add" : "Remove"}</td>
                <td className="py-1.5 pr-2">
                  {l.description}
                  {l.colour && <span className="text-gray-400"> · {l.colour}</span>}
                  {l.treatment === "stranded_paint" && <span className="block text-xs text-gray-500">Nonreturnable tinted paint</span>}
                  {l.treatment === "absorbed_labour" && <span className="block text-xs text-gray-500">No charge</span>}
                </td>
                <td className="py-1.5 pr-2 text-right">{l.sqft ? `${l.sqft} sq ft` : "—"}</td>
                <td className="py-1.5 text-right font-medium">{money(lineAmount(l, co.markupPct))}</td>
              </tr>
            ))}
            {co.lines.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 italic text-gray-400">No changes recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="ml-auto max-w-sm space-y-1">
        {p.grossAddition > 0 && <Row k="Additions" v={money(p.grossAddition)} />}
        {p.discount > 0 && <Row k={`Discount (${co.discount?.pct}%)`} v={money(-p.discount)} />}
        {p.credit > 0 && <Row k="Credits" v={money(-p.credit)} />}
        <Row k="Net change" v={money(p.net)} bold />
        <Row k={`Tax ${rate.ratePct}% (rate effective ${dateLong(rate.effectiveFrom)})`} v={money(p.tax)} />
        <Row k="This change order total" v={money(p.total)} bold />
        <div className="my-2 border-t border-line" />
        <Row k="Original contract (pre-tax)" v={money(job.contractValue)} />
        <Row k="Previously approved changes" v={money(before - job.contractValue)} />
        <Row k="This change" v={money(p.net)} />
        <Row k="Revised contract total (pre-tax)" v={money(revised)} bold />
      </div>
      <p className="text-xs text-gray-500">
        Tax is charged at the rate in force on the change-order date, {dateLong(co.taxDate)}. Everything else in your original agreement stays the same.
        {co.depositReview && ` Revised deposit: one-third of the new contract total is ${money(co.depositReview.target)}; you have paid ${money(co.depositReview.collected)}, so ${money(co.depositReview.due)} is due on signing.`}
      </p>

      <div className="rounded-lg border border-line p-4">
        <div className="text-xxs font-bold uppercase tracking-[0.14em] text-gray-400">Approval — the whole change order</div>
        <p className="mt-1 text-xs text-gray-500">Approve or decline this change order as a whole. If you agree with only part of it, tell us and we'll split it into separate change orders.</p>
        {signed && co.evidence ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Row k="Signed by" v={co.evidence.signer} />
            <Row k="Channel" v={co.evidence.channel} />
            <Row k="Date" v={dateLong(co.evidence.at)} />
            <Row k="Version" v={`v${co.evidence.version}`} />
          </div>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="border-t border-gray-400 pt-1 text-xs text-gray-500">Signature</div>
            <div className="border-t border-gray-400 pt-1 text-xs text-gray-500">Date</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: React.ReactNode; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? "font-bold text-ink" : ""}`}>
      <span>{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

export function PresentationModal({ co, onClose, mode = "preview" }: { co?: ChangeOrder; onClose: () => void; mode?: "preview" | "print" }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Modal
      open={!!co}
      onOpenChange={(v) => !v && onClose()}
      size="lg"
      title={mode === "print" ? `Print ${co?.id ?? ""}` : "Customer presentation preview"}
      description="What the customer sees: the incremental change and the revised contract total. No internal cost."
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={() => co && printElement(ref.current, `${co.id} v${coVersion(co)}`)}>
            <Printer className="h-4 w-4" /> Print / Save PDF
          </Button>
        </>
      }
    >
      <div ref={ref} className="rounded-xl border border-line">
        {co && <CoDocument co={co} />}
      </div>
    </Modal>
  );
}

/** What the customer sees when they open a specific approval link. */
export function CustomerLinkModal({ co, link, onClose }: { co?: ChangeOrder; link?: ApprovalLink; onClose: () => void }) {
  const state = co && link ? coLinkState(co, link, now()) : "active";
  const current = co ? currentLink(co) : undefined;
  return (
    <Modal open={!!co && !!link} onOpenChange={(v) => !v && onClose()} size="lg" title={`Customer view · link ${link?.id ?? ""}`} description={`As opened by ${link?.recipientName ?? ""}`}>
      {co && link && (
        <div className="space-y-4">
          {state === "expired" && (
            <Banner tone="warn" title="This approval link has expired. Please contact us for a new link.">
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> Expired {dateLong(link.expiresAt)}. The office sees a reissue control; a person must send the new link.</span>
            </Banner>
          )}
          {state === "superseded" && (
            <Banner tone="danger" title={`This link is for version ${link.version}. Version ${coVersion(co)} is now current.`}>
              <span className="inline-flex items-center gap-1"><Link2Off className="h-3.5 w-3.5" /> Blocked. Please use the newest link we sent{current ? ` (sent ${dateLong(current.sentAt)})` : ""}, or contact us. Reason: {link.supersededReason ?? "replaced by a newer version"}.</span>
            </Banner>
          )}
          {state === "signer_changed" && (
            <Banner tone="warn" title="This link is no longer valid.">
              The approver on the account changed. We will send a new link to the right person.
            </Banner>
          )}
          {state === "used" && <Banner tone="success" title="This change order has already been decided.">Thank you. No further action is needed.</Banner>}
          {(state === "active" || state === "undeliverable") && (
            <>
              <Banner tone="info" title={`Link valid until ${dateLong(link.expiresAt)}`}>
                <span className="inline-flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5" /> This link carries version {link.version} only. Approve or decline the whole change order.</span>
              </Banner>
              <div className="rounded-xl border border-line">
                <CoDocument co={co} />
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
