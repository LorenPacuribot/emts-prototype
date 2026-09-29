/*
  Estimate helpers shared by every estimate screen.

  Why this file exists: the list, the builder, the preview and the client
  view all need the same rules for status labels, line pricing and
  "what happens when an estimate is saved". Keeping them here means every
  screen shows the same numbers and the same wording.

  Pricing itself lives in lib/calculations.ts. This file only prepares
  line items (labor rate, material price, difficulty multiplier) and then
  calls lineTotal().
*/
import type {
  AreaTemplate, Customer, DifficultyTier, Estimate, EstimateArea, EstimateLineItem, EstimateStatus,
  PaintProduct, SurfaceRate, TableColumn,
} from '@/lib/types';
import { estimateTotals, includedLine, lineTotal, round2 } from '@/lib/calculations';
import { deriveLine, materialPerUnit } from '@/lib/estimating';
import { uid } from '@/lib/utils';

/* ---------- Status display ---------- */

/** Live app wording: "Rejected" is shown to users as "Declined". */
export const STATUS_LABEL: Record<EstimateStatus, string> = {
  Draft: 'Draft',
  Sent: 'Sent',
  Viewed: 'Viewed',
  Approved: 'Approved',
  Rejected: 'Declined',
  Expired: 'Expired',
};

/** Statuses counted as "active" (everything except declined and expired). */
export const ACTIVE_STATUSES: EstimateStatus[] = ['Draft', 'Sent', 'Viewed', 'Approved'];

export const isActive = (s: EstimateStatus) => ACTIVE_STATUSES.includes(s);

/** Draft, Sent and Viewed estimates can still be approved or declined. */
export const isOpen = (s: EstimateStatus) => s === 'Draft' || s === 'Sent' || s === 'Viewed';

/* ---------- Dates ---------- */

export function addDays(iso: string, days: number) {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

/* ---------- Line pricing ---------- */

/**
 * Material price per unit for a surface painted with a product: gallons
 * needed per unit (per-coat coverage and the surface condition) x price per
 * gallon (lib/estimating.ts).
 */
export function materialPricePerUnit(
  sr: Pick<SurfaceRate, 'unit'> | undefined,
  paint: PaintProduct | undefined,
  coats: number,
  line?: Pick<EstimateLineItem, 'quantity' | 'coatingAreaSqft' | 'condition'>,
) {
  return materialPerUnit({ unit: sr?.unit ?? 'sqft', quantity: line?.quantity ?? 0, coatingAreaSqft: line?.coatingAreaSqft, coats, condition: line?.condition }, paint);
}

/** Multiplier = height tier x access tier (1 when none is picked). */
export function tierMultiplier(tiers: DifficultyTier[], heightTierId?: string, accessTierId?: string) {
  const h = tiers.find((t) => t.id === heightTierId)?.multiplier ?? 1;
  const a = tiers.find((t) => t.id === accessTierId)?.multiplier ?? 1;
  return round2(h * a);
}

/**
 * Suggested quantity for a surface from the area's dimensions (feet).
 * Walls use the perimeter x height, ceilings and floors use length x width,
 * trim uses the perimeter. Returns 0 when dimensions are missing.
 */
export function quantityFromDimensions(sr: SurfaceRate | undefined, area: Pick<EstimateArea, 'length' | 'width' | 'height'>) {
  const L = area.length || 0;
  const W = area.width || 0;
  const H = area.height || 0;
  if (!sr) return 0;
  const group = sr.rateGroup.toLowerCase();
  const name = sr.name.toLowerCase();
  if (sr.unit === 'each') return 1;
  if (sr.unit === 'lnft') return round2(2 * (L + W));
  if (group.includes('ceiling') || name.includes('ceiling') || name.includes('floor')) return round2(L * W);
  if (group.includes('cabinet')) return round2(L * H);
  return round2(2 * (L + W) * H);
}

export interface PriceCtx {
  surfaceRates: SurfaceRate[];
  tiers: DifficultyTier[];
  profitMargin: number;
  /** Settings > Table Columns: custom columns are the preparation activities. */
  tableColumns?: TableColumn[];
  /** Settings > Paint Library, for the gallons per line. */
  paints?: PaintProduct[];
}

/**
 * Recalculates one line: application hours (per-coat rates), preparation
 * hours, gallons, difficulty multiplier and total (lib/estimating.ts).
 */
export function priceLine(line: EstimateLineItem, ctx: PriceCtx): EstimateLineItem {
  const derived = deriveLine(line, ctx);
  const difficultyMultiplier =
    line.heightTierId || line.accessTierId ? tierMultiplier(ctx.tiers, line.heightTierId, line.accessTierId) : line.difficultyMultiplier || 1;
  const next = { ...derived, difficultyMultiplier };
  return { ...next, total: lineTotal(next, ctx.profitMargin) };
}

/** Builds a new line item for a surface in an area. */
export function newLine(o: {
  area: EstimateArea;
  sr: SurfaceRate;
  paint?: PaintProduct;
  laborRate: number;
  profitMargin: number;
  tiers: DifficultyTier[];
  heightTierId?: string;
  accessTierId?: string;
  tableColumns?: TableColumn[];
  paints?: PaintProduct[];
}): EstimateLineItem {
  const coats = o.sr.defaultCoats || 2;
  const quantity = quantityFromDimensions(o.sr, o.area);
  const base: EstimateLineItem = {
    id: uid('li'),
    areaId: o.area.id,
    description: o.sr.name,
    surfaceType: o.sr.name,
    // The area name is the default location ("Living Room", "Front Elevation").
    location: o.area.name || undefined,
    paintProductId: o.paint?.id,
    paintName: o.paint?.name,
    sheen: o.paint?.finish,
    quantity,
    unit: o.sr.unit,
    unitPrice: materialPricePerUnit(o.sr, o.paint, coats),
    laborHours: 0,
    laborRate: o.laborRate,
    coats,
    difficultyMultiplier: 1,
    total: 0,
    heightTierId: o.heightTierId,
    accessTierId: o.accessTierId,
  };
  return priceLine(base, { surfaceRates: [o.sr], tiers: o.tiers, profitMargin: o.profitMargin, tableColumns: o.tableColumns, paints: o.paints ?? (o.paint ? [o.paint] : undefined) });
}

/** Creates an area (and its default surfaces) from an Area Template. */
export function areaFromTemplate(o: {
  tpl: AreaTemplate;
  surfaceRates: SurfaceRate[];
  paint?: PaintProduct;
  laborRate: number;
  profitMargin: number;
  tiers: DifficultyTier[];
  heightTierId?: string;
  accessTierId?: string;
  tableColumns?: TableColumn[];
  paints?: PaintProduct[];
}) {
  const area: EstimateArea = { id: uid('ar'), name: o.tpl.name, areaTemplateId: o.tpl.id };
  const lines = o.tpl.surfaceRateIds
    .map((id) => o.surfaceRates.find((s) => s.id === id))
    .filter((s): s is SurfaceRate => !!s)
    .map((sr) => newLine({ ...o, area, sr }));
  return { area, lines };
}

/* ---------- Sending ---------- */

/**
 * Why the estimate can't go to the customer yet, or undefined. Same rules the
 * prototype applies when it records the send (features sendEstimate), checked
 * first so the screen never reports a send that is then refused.
 */
export function sendBlocker(e: Estimate, customer?: Pick<Customer, 'email'>): string | undefined {
  if (!e.title.trim()) return 'Enter a project name before sending.';
  if (!e.lineItems.some((l) => includedLine(l) && l.quantity > 0)) return 'Add at least one measured line item (an amount above 0) before sending.';
  if (!(estimateTotals(e).total > 0)) return 'The estimate has no total yet.';
  if (!customer?.email?.trim()) return 'The customer has no email address. Add one on the contact first.';
  return undefined;
}

/* ---------- Versions ---------- */

/** Returns a copy of the estimate with a new history entry appended. */
export function withVersion(e: Estimate, total: number, changedBy: string, note: string, status: EstimateStatus = e.status): Estimate {
  const last = e.versions.reduce((m, v) => Math.max(m, v.version), 0);
  const now = new Date().toISOString();
  return {
    ...e,
    status,
    updatedAt: now,
    versions: [...e.versions, { version: last + 1, date: now, total, status, changedBy, note }],
  };
}
