"use client";
/**
 * Customer quote PDF (print). The customer sees the new quote only: no
 * comparison, no historical cost, no source-job usage.
 */
import { useRef } from "react";
import { Printer } from "lucide-react";
import type { RepeatEstimate } from "@/features/types";
import { useDb } from "@/features/lib/store";
import { lineSurface } from "@/features/lib/store/actions/future-estimate";
import { byId, currentOwner, propertyAddress } from "@/features/lib/selectors";
import { CURRENT_BASIS, DIFFERING_CONDITIONS_CLAUSE, QUOTE_VALIDITY_DAYS, quoteTotals } from "@/features/lib/rules/future-estimate";
import { dateLong, money } from "@/features/lib/format";
import { printElement } from "@/features/lib/export";
import { Banner, Button, Modal, Swatch } from "@/features/components/ui";

export function QuotePrintModal({ rep, open, onOpenChange }: { rep: RepeatEstimate; open: boolean; onOpenChange: (v: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const db = useDb((d) => d);
  const property = byId(db.properties, rep.propertyId)!;
  const owner = currentOwner(db, property);
  const totals = quoteTotals(rep.lines.map((l) => l.price ?? 0), CURRENT_BASIS.taxRatePct);
  const issued = rep.status === "issued";
  const number = rep.estimateId ?? rep.id;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Customer quote"
      description="Print, or choose “Save as PDF” in the print dialog."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="primary" onClick={() => printElement(ref.current, `${number} quote`)}>
            <Printer className="h-4 w-4" /> Print / Save PDF
          </Button>
        </>
      }
    >
      {!issued && <Banner tone="warn" className="mb-3" title="Draft preview">This quote has not been issued. The PDF is marked DRAFT.</Banner>}
      <div ref={ref} className="rounded-xl border border-line bg-white p-6 text-xs text-gray-700">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <div className="font-display text-xl font-bold text-ink">Estimate Master Painting</div>
            <div className="text-gray-500">Plano, TX · (972) 555-0100</div>
          </div>
          <div className="text-right">
            <div className="font-display text-lg font-bold text-ink">{issued ? "Quote" : "DRAFT QUOTE"} {number}</div>
            <div>Issued {issued ? dateLong(rep.issuedAt) : "—"}</div>
            <div className="font-semibold">Valid until {issued ? dateLong(rep.validUntil) : `${QUOTE_VALIDITY_DAYS} days from issue`}</div>
          </div>
        </div>
        <div className="grid gap-4 py-4 sm:grid-cols-2">
          <div>
            <div className="text-xxs font-bold uppercase tracking-wider text-gray-500">Prepared for</div>
            <div className="font-semibold text-ink">{owner?.name}</div>
            <div>{propertyAddress(property, true)}</div>
          </div>
          <div>
            <div className="text-xxs font-bold uppercase tracking-wider text-gray-500">Project</div>
            <div className="font-semibold text-ink">{rep.title}</div>
          </div>
        </div>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line text-xxs uppercase tracking-wider text-gray-500">
              <th className="py-2">Area · Surface</th>
              <th className="py-2">Color</th>
              <th className="py-2">Product · Sheen</th>
              <th className="py-2 text-right">Coats</th>
              <th className="py-2 text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {rep.lines.map((l) => {
              const { surface, area } = lineSurface(db, l);
              return (
                <tr key={l.id} className="border-b border-line/70">
                  <td className="py-2">{area?.name} · {surface?.name}</td>
                  <td className="py-2"><span className="inline-flex items-center gap-2"><Swatch hex={l.hex} size="sm" /> {l.colourLabel}</span></td>
                  <td className="py-2">{l.product} · {l.sheen}</td>
                  <td className="py-2 text-right">{l.coats}</td>
                  <td className="py-2 text-right">{money(l.price)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="ml-auto mt-3 w-56 space-y-1">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
          <div className="flex justify-between"><span>Tax ({CURRENT_BASIS.taxRatePct}%)</span><span>{money(totals.tax)}</span></div>
          <div className="flex justify-between border-t border-line pt-1 font-bold text-ink"><span>Total</span><span>{money(totals.total)}</span></div>
        </div>
        {rep.clauseIncluded && (
          <div className="mt-6 rounded-lg border border-line bg-gray-50 p-3">
            <div className="text-xxs font-bold uppercase tracking-wider text-gray-500">Differing conditions</div>
            <p className="mt-1">{DIFFERING_CONDITIONS_CLAUSE}</p>
          </div>
        )}
        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          <div className="border-t border-gray-400 pt-1 text-xs text-gray-500">Customer signature</div>
          <div className="border-t border-gray-400 pt-1 text-xs text-gray-500">Date</div>
        </div>
      </div>
    </Modal>
  );
}
