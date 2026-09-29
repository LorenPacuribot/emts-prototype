/*
  Surface-level estimating engine (patent sections 5-9).

  One estimate line is one surface. From its inputs the engine derives:

    application hours = sum over coats of  quantity / rate(coat)  x condition labour factor
      rate(coat) is that coat's production rate in Settings > Surface Rates;
      a coat with no rate uses the nearest earlier coat that has one
      (coat 3 blank -> coat 2's rate).
    preparation hours = sum over the line's prep entries (Settings > Table Columns):
      Hours column     -> the hours typed
      Checkbox column  -> coating area / the column's production rate, when ticked
      Quantity column  -> quantity typed / production rate
                          (a "% of surface" column: coating area x % / rate)
    labour hours      = application + preparation
    gallons           = sum over coats of  coating area / coverage(coat) / condition coverage factor
      coverage(coat 1) = product coverageCoat1, later coats coverageCoat2 (else coverageCoat1)
    material per unit = gallons x price per gallon / quantity

  Money (labour cost, material cost, price, totals) stays in lib/calculations.ts.
*/
import type { EstimateLineItem, PaintProduct, SurfaceCondition, SurfaceRate, TableColumn } from './types';
import { round2 } from './calculations';

/* ---------- Surface condition (section 5) ---------- */

export type { SurfaceCondition };

/** Labour factor multiplies application time; coverage factor divides coverage (rough and porous surfaces take more paint). */
export const SURFACE_CONDITIONS: Record<SurfaceCondition, { label: string; labor: number; coverage: number }> = {
  smooth: { label: 'Smooth', labor: 1, coverage: 1 },
  medium: { label: 'Medium', labor: 1.1, coverage: 0.9 },
  rough: { label: 'Rough', labor: 1.25, coverage: 0.8 },
  porous: { label: 'Porous', labor: 1.15, coverage: 0.75 },
};
export const CONDITIONS = Object.keys(SURFACE_CONDITIONS) as SurfaceCondition[];
export const conditionOf = (l: Pick<EstimateLineItem, 'condition'>) => SURFACE_CONDITIONS[l.condition ?? 'smooth'] ?? SURFACE_CONDITIONS.smooth;

/* ---------- Per-coat production rates (section 8) ---------- */

export const coatRates = (sr: Pick<SurfaceRate, 'rateCoat1' | 'rateCoat2' | 'rateCoat3' | 'rateCoat4'>) => [sr.rateCoat1, sr.rateCoat2, sr.rateCoat3, sr.rateCoat4];

/**
 * Production rate for coat `coat` (1-based): its own rate when set, otherwise
 * the nearest earlier coat with a rate. Coats beyond the configured ones use
 * the last configured rate. 0 when no coat has a rate.
 */
export function coatRate(rates: readonly (number | undefined)[], coat: number): number {
  for (let i = Math.min(coat, rates.length) - 1; i >= 0; i--) {
    const r = rates[i];
    if (r && r > 0) return r;
  }
  return 0;
}

/** Hours for each coat, in order. A coat whose rate can't be resolved gives 0. */
export function coatHours(quantity: number, coats: number, rates: readonly (number | undefined)[]): number[] {
  const out: number[] = [];
  for (let c = 1; c <= Math.max(1, Math.floor(coats) || 1); c++) {
    const r = coatRate(rates, c);
    out.push(r ? quantity / r : 0);
  }
  return out;
}

/** Application hours: per-coat rates, times the surface condition's labour factor. */
export function applicationHours(line: Pick<EstimateLineItem, 'quantity' | 'coats' | 'condition'>, sr: Pick<SurfaceRate, 'rateCoat1' | 'rateCoat2' | 'rateCoat3' | 'rateCoat4'>): number {
  const base = coatHours(line.quantity, line.coats, coatRates(sr)).reduce((s, h) => s + h, 0);
  return round2(base * conditionOf(line).labor);
}

/* ---------- Coating area and gallons (sections 9, 18) ---------- */

/** Square feet that receive paint: the quantity for sq ft lines, else the explicit coating area. */
export function coatingArea(line: Pick<EstimateLineItem, 'unit' | 'quantity' | 'coatingAreaSqft'>): number {
  return line.unit === 'sqft' ? line.quantity : line.coatingAreaSqft ?? 0;
}

/** Coverage used when neither the product nor the surface rate gives one. */
export const FALLBACK_COVERAGE = 350;

/**
 * Patent 8 step 3 states production as hours per 100 units; surface rates are
 * stored as units per hour. These convert between the two (0 stays 0).
 */
export function hoursPer100(unitsPerHour: number): number {
  return unitsPerHour > 0 ? Math.round((100 / unitsPerHour) * 1000) / 1000 : 0;
}
export function unitsPerHourFromHours(hoursPer100Units: number): number {
  return hoursPer100Units > 0 ? Math.round((100 / hoursPer100Units) * 100) / 100 : 0;
}

/**
 * Patent 8: coverage for a product/surface combination. The surface rate's
 * override for this product wins over the product's own coverage.
 */
export function coverageFor<P extends Pick<PaintProduct, 'id' | 'coverageCoat1' | 'coverageCoat2'>>(paint: P | undefined, sr?: Pick<SurfaceRate, 'coverageOverrides'>): P | undefined {
  const o = paint && sr?.coverageOverrides?.find((x) => x.paintProductId === paint.id);
  return o && paint ? { ...paint, coverageCoat1: o.coverageCoat1, coverageCoat2: o.coverageCoat2 ?? o.coverageCoat1 } : paint;
}

/** True when the line's paint has no coverage anywhere, so the 350 sq ft/gal fallback is used. */
export function usesCoverageFallback(paint: Pick<PaintProduct, 'coverageCoat1'> | undefined): boolean {
  return !!paint && !(paint.coverageCoat1 > 0);
}

/** Gallons of paint for the line (unrounded to containers; procurement rounds up). */
export function lineGallons(
  line: Pick<EstimateLineItem, 'unit' | 'quantity' | 'coatingAreaSqft' | 'coats' | 'condition'>,
  paint: Pick<PaintProduct, 'coverageCoat1' | 'coverageCoat2'> | undefined,
): number {
  if (!paint) return 0;
  const area = coatingArea(line);
  if (!area) return 0;
  const factor = conditionOf(line).coverage;
  let gal = 0;
  for (let c = 1; c <= Math.max(1, line.coats || 1); c++) {
    const cov = (c === 1 ? paint.coverageCoat1 : paint.coverageCoat2 || paint.coverageCoat1) || FALLBACK_COVERAGE;
    gal += area / (cov * factor);
  }
  return round2(gal);
}

/**
 * Material price per unit of quantity. With a coating area it is the paint
 * cost spread over the quantity; without one (a length or count line with no
 * area given) the older flat rule applies: price x coats / 1000 per unit.
 */
export function materialPerUnit(
  line: Pick<EstimateLineItem, 'unit' | 'quantity' | 'coatingAreaSqft' | 'coats' | 'condition'>,
  paint: Pick<PaintProduct, 'coverageCoat1' | 'coverageCoat2' | 'pricePerGallon'> | undefined,
): number {
  if (!paint) return 0;
  if (line.unit === 'sqft' || line.coatingAreaSqft) {
    // Per unit, independent of the quantity typed so far (a zero quantity still shows a price).
    const probe = line.unit === 'sqft' ? { ...line, quantity: 1 } : line;
    const gal = lineGallonsExact(probe, paint);
    const per = line.unit === 'sqft' ? gal : line.quantity ? gal / line.quantity : 0;
    return round2(per * paint.pricePerGallon);
  }
  return round2((paint.pricePerGallon * Math.max(line.coats, 1)) / 1000);
}

/** lineGallons without rounding, for per-unit prices. */
function lineGallonsExact(
  line: Pick<EstimateLineItem, 'unit' | 'quantity' | 'coatingAreaSqft' | 'coats' | 'condition'>,
  paint: Pick<PaintProduct, 'coverageCoat1' | 'coverageCoat2'>,
) {
  const area = coatingArea(line);
  const factor = conditionOf(line).coverage;
  let gal = 0;
  for (let c = 1; c <= Math.max(1, line.coats || 1); c++) gal += area / (((c === 1 ? paint.coverageCoat1 : paint.coverageCoat2 || paint.coverageCoat1) || FALLBACK_COVERAGE) * factor);
  return gal;
}

/* ---------- Preparation (section 7) ---------- */

/** Custom (non-system) table columns are preparation activities. */
export const prepColumns = (cols: readonly TableColumn[]) => cols.filter((c) => !c.isSystem).sort((a, b) => a.sortOrder - b.sortOrder);

/** Hours one prep entry adds to a line. */
export function prepEntryHours(
  col: Pick<TableColumn, 'columnType' | 'unit' | 'prepRate'>,
  value: number | boolean | undefined,
  line: Pick<EstimateLineItem, 'unit' | 'quantity' | 'coatingAreaSqft'>,
): number {
  if (value === undefined || value === false || value === 0) return 0;
  const area = coatingArea(line) || line.quantity;
  const rate = col.prepRate && col.prepRate > 0 ? col.prepRate : 0;
  switch (col.columnType) {
    case 'HOURS':
      return typeof value === 'number' && value > 0 ? value : 0;
    case 'CHECKBOX':
      return value === true && rate ? area / rate : 0;
    case 'QUANTITY': {
      const n = typeof value === 'number' ? value : 0;
      if (n <= 0 || !rate) return 0;
      return col.unit === 'Percent' ? (area * Math.min(n, 100)) / 100 / rate : n / rate;
    }
    default:
      return 0;
  }
}

/** Preparation hours for a line from its prep entries; entries for deleted columns are ignored. */
export function preparationHours(line: Pick<EstimateLineItem, 'prep' | 'unit' | 'quantity' | 'coatingAreaSqft'>, cols: readonly TableColumn[]): number {
  if (!line.prep) return 0;
  let h = 0;
  for (const c of prepColumns(cols)) h += prepEntryHours(c, line.prep[c.id], line);
  return round2(h);
}

/** Names of the prep activities ticked or filled in on a line ("Wash, Scrape 20%"). */
export function prepSummary(line: Pick<EstimateLineItem, 'prep'>, cols: readonly TableColumn[]): string[] {
  if (!line.prep) return [];
  return prepColumns(cols).flatMap((c) => {
    const v = line.prep?.[c.id];
    if (v === undefined || v === false || v === 0) return [];
    if (c.columnType === 'CHECKBOX') return [c.name];
    if (c.columnType === 'HOURS') return [`${c.name} ${v} hr`];
    return [`${c.name} ${v}${c.unit === 'Percent' ? '%' : ` ${c.unit ?? ''}`.trimEnd()}`];
  });
}

/* ---------- Whole line ---------- */

export interface LineEngineCtx {
  surfaceRates: readonly SurfaceRate[];
  tableColumns?: readonly TableColumn[];
  paints?: readonly PaintProduct[];
}

/**
 * Recomputes the derived hours and gallons of one line. Lines whose surface
 * isn't in Surface Rates keep their typed application hours.
 */
export function deriveLine<T extends EstimateLineItem>(line: T, ctx: LineEngineCtx): T {
  const sr = ctx.surfaceRates.find((s) => s.name === line.surfaceType);
  const prepHours = ctx.tableColumns ? preparationHours(line, ctx.tableColumns) : line.prepHours ?? 0;
  const appHours = sr ? applicationHours(line, sr) : line.applicationHours ?? Math.max(0, round2(line.laborHours - (line.prepHours ?? 0)));
  const paint = coverageFor(ctx.paints?.find((p) => p.id === line.paintProductId), sr);
  const gallons = ctx.paints ? lineGallons(line, paint) : line.gallons;
  return { ...line, applicationHours: appHours, prepHours, laborHours: round2(appHours + prepHours), gallons };
}
