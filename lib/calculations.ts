/*
  Pricing math used by estimates, jobs, invoices and the dashboard.
  Keep every money calculation here so all screens show the same numbers.

  How an estimate line is priced:
    labor hours   = quantity x coats / production rate (units per hour)
    labor cost    = labor hours x labor rate x difficulty multiplier
    material cost = quantity x material price per unit
    line total    = (labor cost + material cost) x (1 + profit margin %)

  Estimate total:
    subtotal = sum of line totals + extras
    discount = percent of subtotal, or a flat amount
    tax      = (subtotal - discount) x tax rate %
    total    = subtotal - discount + tax
*/
import type { Estimate, EstimateLineItem, Invoice } from './types';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function laborHoursFor(quantity: number, coats: number, productionRate: number): number {
  if (!productionRate) return 0;
  return round2((quantity * Math.max(coats, 1)) / productionRate);
}

export function lineCost(item: Pick<EstimateLineItem, 'laborHours' | 'laborRate' | 'difficultyMultiplier' | 'quantity' | 'unitPrice'>) {
  const labor = item.laborHours * item.laborRate * (item.difficultyMultiplier || 1);
  const material = item.quantity * item.unitPrice;
  return { labor: round2(labor), material: round2(material), cost: round2(labor + material) };
}

export function lineTotal(
  item: Pick<EstimateLineItem, 'laborHours' | 'laborRate' | 'difficultyMultiplier' | 'quantity' | 'unitPrice'>,
  profitMargin: number,
): number {
  return round2(lineCost(item).cost * (1 + profitMargin / 100));
}

export interface EstimateTotals {
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
  laborCost: number;
  materialCost: number;
  cost: number;
  profit: number;
  /** profit / (total - tax), as a percent */
  margin: number;
  laborHours: number;
}

export function estimateTotals(e: Pick<Estimate, 'lineItems' | 'extras' | 'discountType' | 'discountValue' | 'taxRate'>): EstimateTotals {
  const linesSum = e.lineItems.reduce((s, l) => s + l.total, 0);
  const extrasSum = e.extras.reduce((s, x) => s + x.quantity * x.unitPrice, 0);
  const subtotal = round2(linesSum + extrasSum);
  const discount =
    e.discountType === 'percent' ? round2((subtotal * e.discountValue) / 100) : e.discountType === 'flat' ? e.discountValue : 0;
  const taxable = round2(Math.max(subtotal - discount, 0));
  const tax = round2((taxable * e.taxRate) / 100);
  const total = round2(taxable + tax);
  let laborCost = 0;
  let materialCost = 0;
  let laborHours = 0;
  for (const l of e.lineItems) {
    const c = lineCost(l);
    laborCost += c.labor;
    materialCost += c.material;
    laborHours += l.laborHours;
  }
  const cost = round2(laborCost + materialCost);
  const profit = round2(taxable - cost);
  const margin = taxable ? round2((profit / taxable) * 100) : 0;
  return {
    subtotal, discount, taxable, tax, total,
    laborCost: round2(laborCost), materialCost: round2(materialCost), cost, profit, margin,
    laborHours: round2(laborHours),
  };
}

export interface InvoiceTotals {
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
}

export function invoiceTotals(inv: Pick<Invoice, 'lineItems' | 'taxRate' | 'discount' | 'payments'>): InvoiceTotals {
  const subtotal = round2(inv.lineItems.reduce((s, l) => s + l.quantity * l.rate, 0));
  const discount = inv.discount || 0;
  const tax = round2(((subtotal - discount) * inv.taxRate) / 100);
  const total = round2(subtotal - discount + tax);
  const paid = round2(inv.payments.reduce((s, p) => s + p.amount, 0));
  return { subtotal, tax, discount, total, paid, balance: round2(Math.max(total - paid, 0)) };
}

/** Status an invoice should show given its payments. Draft/Void stay as-is. */
export function derivedInvoiceStatus(inv: Invoice): Invoice['status'] {
  if (inv.status === 'Draft' || inv.status === 'Void') return inv.status;
  const t = invoiceTotals(inv);
  if (t.total > 0 && t.balance <= 0) return 'Paid';
  if (t.paid > 0) return 'Partial';
  if (new Date(inv.dueDate) < new Date()) return 'Overdue';
  return inv.status === 'Sent' ? 'Sent' : 'Unpaid';
}
