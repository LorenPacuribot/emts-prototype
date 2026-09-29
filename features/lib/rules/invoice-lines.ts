/**
 * Invoice lines built from the accepted scope (patent 23): the draft invoice
 * carries the included and approved optional lines, extras, the estimate's
 * discount and tax, so its total equals the accepted estimate total. Change
 * orders add their own lines to a draft (patent 24).
 */
import type { Estimate as REstimate } from "@/lib/types";
import { estimateTotals, includedLine, round2 } from "@/lib/calculations";
import type { Invoice, InvoiceLine } from "@/features/types";

type Snapshot = Pick<REstimate, "lineItems" | "extras" | "discountType" | "discountValue" | "taxRate">;

const UNIT: Record<string, string> = { sqft: "sq ft", lnft: "lin ft", each: "each", hour: "h", gallon: "gal" };

/** Same formula as the replica's invoiceTotals: lines, minus a flat discount, plus tax on the rest. */
export function invoiceLinesTotal(inv: Pick<Invoice, "lines" | "taxRatePct" | "discount">): number {
  const subtotal = round2((inv.lines ?? []).reduce((s, l) => s + l.quantity * l.rate, 0));
  const discount = inv.discount ?? 0;
  const tax = round2(((subtotal - discount) * (inv.taxRatePct ?? 0)) / 100);
  return round2(subtotal - discount + tax);
}

export function scopeInvoiceLines(snapshot: Snapshot, idPrefix: string): Pick<Invoice, "lines" | "taxRatePct" | "discount"> {
  const lines: InvoiceLine[] = [
    ...snapshot.lineItems.filter(includedLine).map((l) => ({
      id: `${idPrefix}-${l.id}`,
      description: [l.location, l.description || l.surfaceType].filter(Boolean).join(" · ")
        + (l.quantity ? ` (${l.quantity} ${UNIT[l.unit] ?? l.unit}${l.coats ? `, ${l.coats} coat${l.coats === 1 ? "" : "s"}` : ""})` : ""),
      quantity: 1,
      rate: round2(l.total),
    })),
    ...snapshot.extras.map((x) => ({ id: `${idPrefix}-${x.id}`, description: x.name, quantity: x.quantity, rate: x.unitPrice })),
  ];
  return { lines, taxRatePct: snapshot.taxRate || 0, discount: estimateTotals(snapshot).discount };
}

/** The contract as one line, for estimates without saved builder pricing. */
export function contractInvoiceLine(idPrefix: string, jobName: string, total: number): Pick<Invoice, "lines" | "taxRatePct" | "discount"> {
  return { lines: [{ id: `${idPrefix}-contract`, description: `Contract work · ${jobName}`, quantity: 1, rate: round2(total) }], taxRatePct: 0, discount: 0 };
}
