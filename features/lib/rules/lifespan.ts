/**
 * Feature 27 — expected repaint date and advance notice.
 *
 * Adjustment sequence, applied in this order and each counted once:
 *   1. start with the colour card lifespan, else the library interval
 *      (product on this surface type, product line on this surface type,
 *       product, product line, surface type, then room)
 *   2. minus 1 year for south or west exterior exposure
 *   3. plus 1 year for a premium product tier
 *   4. minus 2 years for poor preparation or a failing coating
 */
import type { Area, Application, Database, LifespanLibrary, PropertyType, Surface } from "@/features/types";
import { addMonths, addYears } from "./dates";

export interface RepaintCalc {
  dueDate?: string;
  years?: number;
  basis: string[];
  unresolved?: string;
}

export interface DefaultInput {
  roomType?: string;
  surfaceType?: string;
  manufacturer?: string;
  productLine?: string;
  product?: string;
}

/**
 * The library's base interval, most specific entry first (patent 27: the
 * expected life can differ by product, surface, or the combination):
 * product on surface → product line on surface → product → product line →
 * surface type → room type → 7 years.
 */
export function libraryDefault(lib: LifespanLibrary, x: DefaultInput): { years: number; basis: string } {
  const sameMaker = (d: { manufacturer: string }) => !x.manufacturer || d.manufacturer === x.manufacturer;
  const onSurface = (d: { surfaceType?: string }) => !!x.surfaceType && d.surfaceType === x.surfaceType;
  const productOnSurface = x.product ? lib.productDefaults?.find((d) => d.product === x.product && onSurface(d) && sameMaker(d)) : undefined;
  if (productOnSurface) return { years: productOnSurface.years, basis: `${productOnSurface.product} on ${labelSurfaceType(x.surfaceType!).toLowerCase()} default ${productOnSurface.years} yrs` };
  const lineOnSurface = x.productLine ? lib.productDefaults?.find((d) => !d.product && d.productLine === x.productLine && onSurface(d) && sameMaker(d)) : undefined;
  if (lineOnSurface) return { years: lineOnSurface.years, basis: `${lineOnSurface.productLine} line on ${labelSurfaceType(x.surfaceType!).toLowerCase()} default ${lineOnSurface.years} yrs` };
  const byProduct = x.product ? lib.productDefaults?.find((d) => d.product === x.product && !d.surfaceType && sameMaker(d)) : undefined;
  if (byProduct) return { years: byProduct.years, basis: `${byProduct.product} default ${byProduct.years} yrs` };
  const byLine = x.productLine ? lib.productDefaults?.find((d) => !d.product && !d.surfaceType && d.productLine === x.productLine && sameMaker(d)) : undefined;
  if (byLine) return { years: byLine.years, basis: `${byLine.productLine} line default ${byLine.years} yrs` };
  const bySurface = x.surfaceType ? lib.surfaceDefaults?.find((d) => d.surfaceType === x.surfaceType) : undefined;
  if (bySurface) return { years: bySurface.years, basis: `${labelSurfaceType(bySurface.surfaceType)} default ${bySurface.years} yrs` };
  const years = lib.defaults.find((d) => d.roomType === x.roomType)?.years ?? 7;
  return { years, basis: `${labelRoomType(x.roomType ?? "")} default ${years} yrs` };
}

/**
 * Suggested lifespan for a new colour card specification: the library default
 * for its first surface and chosen product, so the card and the repaint date agree.
 */
export function specLifespanDefault(db: Pick<Database, "surfaces" | "areas" | "catalog" | "lifespanLibrary">, surfaceIds: string[], x: Omit<DefaultInput, "roomType" | "surfaceType"> = {}): number {
  const surface = db.surfaces.find((s) => s.id === surfaceIds[0]);
  const area = surface && db.areas.find((a) => a.id === surface.areaId);
  const productLine = x.productLine || (x.product ? db.catalog.find((c) => c.product === x.product)?.productLine : undefined);
  return libraryDefault(db.lifespanLibrary, { ...x, productLine, roomType: area?.roomType, surfaceType: surface?.type }).years;
}

/**
 * The base interval is the colour card lifespan carried at closeout when there
 * is one; otherwise the library default (see `libraryDefault`). Adjustments
 * apply on top either way. Coats and colour are never factors.
 */
export function calcRepaintDate(app: Application, area: Area, lib: LifespanLibrary, surface?: Pick<Surface, "type">): RepaintCalc {
  if (!app.completedAt) {
    return { basis: [], unresolved: "No surface completion date. Repaint date is not calculated." };
  }
  let years: number;
  const basis: string[] = [];
  if (app.lifespanYears && app.lifespanYears > 0) {
    years = app.lifespanYears;
    basis.push(`Colour card lifespan ${years} yrs${app.specId ? ` (${app.specId})` : ""}`);
  } else {
    const def = libraryDefault(lib, { roomType: area.roomType, surfaceType: surface?.type, manufacturer: app.manufacturer, productLine: app.productLine, product: app.product });
    years = def.years;
    basis.push(def.basis);
  }

  if (area.kind === "exterior" && (area.exposure === "south" || area.exposure === "west")) {
    years -= lib.southWestDeduction;
    basis.push(`−${lib.southWestDeduction} yr ${area.exposure}-facing exposure`);
  }
  if (app.productTier === "premium") {
    years += lib.premiumBonus;
    basis.push(`+${lib.premiumBonus} yr premium product`);
  }
  if (app.prepQuality === "poor") {
    years -= lib.poorPrepDeduction;
    basis.push(`−${lib.poorPrepDeduction} yrs poor preparation`);
  }
  return { dueDate: addYears(app.completedAt, years), years, basis };
}

/** Advance notice: 9 months commercial (takes precedence), 6 exterior, 3 interior. */
export function noticeMonths(propertyType: PropertyType, kind: Area["kind"]): { months: number; basis: "commercial" | "exterior" | "interior" } {
  if (propertyType === "commercial") return { months: 9, basis: "commercial" };
  if (kind === "exterior") return { months: 6, basis: "exterior" };
  return { months: 3, basis: "interior" };
}

export function noticeDate(dueIso: string, months: number): string {
  return addMonths(dueIso, -months);
}

export function labelRoomType(t: string): string {
  return (
    {
      bedroom: "Bedroom",
      living_room: "Living room",
      hall_stairs: "Halls & stairs",
      kitchen: "Kitchen",
      bathroom: "Bathroom",
      exterior_body: "Exterior body",
      exterior_trim: "Exterior trim",
    } as Record<string, string>
  )[t] ?? t;
}

export function labelSurfaceType(t: string): string {
  return ({ ceiling: "Ceiling", walls: "Walls", trim: "Trim", door: "Door", body: "Body", siding: "Siding", cabinets: "Cabinets" } as Record<string, string>)[t] ?? t;
}
