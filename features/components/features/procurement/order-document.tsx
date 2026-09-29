"use client";
/**
 * Supplier-facing purchase order (19 Output/Print-out): account number, job
 * name and address, PO reference, pickup contact and phone, pickup or
 * delivery. Restricted fields are left out entirely for roles that can't see
 * them; only the owner and office manager can print or download it.
 */
import { forwardRef } from "react";
import type { Database, PurchaseOrder } from "@/features/types";
import { byId, propertyAddress } from "@/features/lib/selectors";
import { dateLong, money } from "@/features/lib/format";
import { formatPacks } from "@/features/lib/rules/materials";
import { itemCodeFor, lineIdentity, lineValue, poValue } from "@/features/lib/rules/procurement";
import { Badge } from "@/features/components/ui";

export const OrderDocument = forwardRef<HTMLDivElement, { db: Database; po: PurchaseOrder; showPrices: boolean; showAccount: boolean }>(function OrderDocument(
  { db, po, showPrices, showAccount },
  ref,
) {
  const job = byId(db.jobs, po.jobId);
  const property = byId(db.properties, job?.propertyId);
  const branch = byId(db.branches, po.branchId);
  const supplier = byId(db.suppliers, po.supplierId);
  return (
    <div ref={ref} className="rounded-xl border border-line bg-white p-5 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div>
          <div className="font-display text-base font-bold text-ink">Purchase Order {po.id}</div>
          <div className="text-gray-500">Estimate Master Painting · (214) 555-0100</div>
        </div>
        <div className="text-right">
          <div className="font-semibold text-ink">{supplier?.name}</div>
          <div className="text-gray-600">
            {branch?.name} · Store {branch?.storeNumber || "—"}
          </div>
          <div className="text-gray-500">{branch?.phone}</div>
          {showAccount && branch?.accountNumber && <div className="text-gray-600">Account {branch.accountNumber}</div>}
        </div>
      </div>
      <div className="grid gap-3 border-b border-line py-3 sm:grid-cols-3">
        <div>
          <div className="text-xxs font-bold uppercase tracking-[0.12em] text-gray-400">Job</div>
          <div className="font-medium text-ink">{job?.name} ({po.jobId})</div>
          <div className="text-gray-600">{propertyAddress(property, true)}</div>
        </div>
        <div>
          <div className="text-xxs font-bold uppercase tracking-[0.12em] text-gray-400">{po.fulfilment === "delivery" ? "Delivery" : "Pickup"}</div>
          <div className="font-medium text-ink">{po.fulfilment === "delivery" ? "Deliver to job site" : "Customer pickup at branch"}</div>
          <div className="text-gray-600">{dateLong(po.deliveryDate)} · {po.phase}</div>
        </div>
        <div>
          <div className="text-xxs font-bold uppercase tracking-[0.12em] text-gray-400">Pickup contact</div>
          <div className="font-medium text-ink">{po.pickupContact ?? "—"}</div>
          <div className="text-gray-600">{po.pickupPhone ?? "—"}</div>
        </div>
      </div>
      <table className="mt-3 w-full border-collapse text-left">
        <thead>
          <tr className="text-xxs uppercase tracking-[0.12em] text-gray-400">
            <th className="border-b border-line py-1.5 pr-2">Line</th>
            <th className="border-b border-line py-1.5 pr-2">Manufacturer / product</th>
            <th className="border-b border-line py-1.5 pr-2">Color / number</th>
            <th className="border-b border-line py-1.5 pr-2">Sheen / tint base</th>
            <th className="border-b border-line py-1.5 pr-2">Packs</th>
            <th className="border-b border-line py-1.5 pr-2">Item code</th>
            {showPrices && <th className="border-b border-line py-1.5 text-right">Amount</th>}
          </tr>
        </thead>
        <tbody>
          {po.lines.map((l) => {
            const codes = l.packs.map((p) => itemCodeFor(db, { product: l.product, packSize: p.size, branchId: po.branchId })).filter(Boolean);
            const id = lineIdentity(db, l);
            return (
              <tr key={l.id} className="align-top">
                <td className="border-b border-line py-2 pr-2 font-semibold">{l.id}</td>
                <td className="border-b border-line py-2 pr-2">
                  <div className="text-gray-600">{id.manufacturer ?? "—"}</div>
                  <div className="font-medium text-ink">{l.product}</div>
                </td>
                <td className="border-b border-line py-2 pr-2">
                  <div className="font-medium text-ink">{id.colourName}</div>
                  <div className="font-mono text-gray-600">{id.colourNumber ?? "—"}</div>
                  {l.tintFormula && <div className="text-xs text-gray-500">Tint formula: {l.tintFormula}</div>}
                </td>
                <td className="border-b border-line py-2 pr-2">
                  <div className="text-ink">{l.sheen || "—"}</div>
                  <div className="text-gray-600">{id.tintBase ?? "—"}</div>
                </td>
                <td className="border-b border-line py-2 pr-2 whitespace-nowrap">{formatPacks(l.packs)}</td>
                <td className="border-b border-line py-2 pr-2">
                  {codes.length === l.packs.length && codes.length > 0 ? codes.join(", ") : <Badge tone="amber">No item code — manual order only</Badge>}
                </td>
                {showPrices && <td className="border-b border-line py-2 text-right tabular-nums">{money(lineValue(l))}</td>}
              </tr>
            );
          })}
        </tbody>
        {showPrices && (
          <tfoot>
            <tr>
              <td colSpan={6} className="pt-2 text-right font-semibold">Order total (pre-tax)</td>
              <td className="pt-2 text-right font-bold tabular-nums">{money(poValue(po))}</td>
            </tr>
          </tfoot>
        )}
      </table>
      <p className="mt-4 text-xs text-gray-400">Reference {po.id} on every call, pickup ticket and invoice. Page 1 of 1.</p>
    </div>
  );
});
