/**
 * Builds the customer-safe copy of a property record for one ownership period.
 *
 * Everything the public page and the customer PDF show comes from here, and
 * only customer fields are copied (toCustomerApplication). Hours, gallons,
 * costs, tint formulas, crew names, notes, data sheet links and expected
 * paint life never enter this structure, so they cannot leak into the page.
 */
import type { Area, Database, Property, SharedPhoto, Surface } from "@/features/types";
import { byId } from "@/features/lib/selectors";
import { newestFirst, photoShareable, predecessorAccess, scopeApplications, toCustomerApplication, type CustomerApplication, type PredecessorAccess } from "@/features/lib/rules/property";

export interface CustomerSurface {
  surface: Pick<Surface, "id" | "name">;
  latest: CustomerApplication;
  earlier: (CustomerApplication & { predecessor: boolean })[];
  latestIsPredecessor: boolean;
}

export interface CustomerArea {
  area: Pick<Area, "id" | "name" | "building" | "unit">;
  surfaces: CustomerSurface[];
}

export interface CustomerRecord {
  propertyId: string;
  address: string;
  cityLine: string;
  areas: CustomerArea[];
  predecessor: PredecessorAccess;
  photos: Pick<SharedPhoto, "id" | "caption" | "takenAt" | "surfaceId">[];
}

export function buildCustomerRecord(db: Database, property: Property, periodId: string, opts: { asOf?: string; jobIds?: string[] } = {}): CustomerRecord {
  const period = property.ownership.find((o) => o.id === periodId) ?? property.ownership[property.ownership.length - 1];
  const first = property.ownership[0]?.id === period.id;
  const access = predecessorAccess(period, first);
  const liveSurfaces = db.surfaces.filter((s) => s.propertyId === property.id && !s.removedAt);
  let apps = db.applications.filter((a) => a.propertyId === property.id && liveSurfaces.some((s) => s.id === a.surfaceId));
  if (opts.asOf) apps = apps.filter((a) => !a.completedAt || a.completedAt <= opts.asOf!);
  // Paint Passport: only the chosen jobs.
  if (opts.jobIds) apps = apps.filter((a) => !!a.jobId && opts.jobIds!.includes(a.jobId));
  const { own, earlier } = scopeApplications(apps, period, first);
  const predecessorAllowed = access === "full" || access === "spec_only";
  const visible = [...own.map((a) => ({ a, predecessor: false })), ...(predecessorAllowed ? earlier.map((a) => ({ a, predecessor: true })) : [])];

  const areas: CustomerArea[] = [];
  for (const area of db.areas.filter((x) => x.propertyId === property.id)) {
    const surfaces: CustomerSurface[] = [];
    for (const s of liveSurfaces.filter((x) => x.areaId === area.id)) {
      const list = newestFirst(visible.filter((v) => v.a.surfaceId === s.id).map((v) => ({ ...v.a, predecessor: v.predecessor })));
      if (!list.length) continue;
      const [latest, ...rest] = list;
      surfaces.push({
        surface: { id: s.id, name: s.name },
        latest: toCustomerApplication(latest),
        latestIsPredecessor: latest.predecessor,
        earlier: rest.map((r) => ({ ...toCustomerApplication(r), predecessor: r.predecessor })),
      });
    }
    if (surfaces.length) areas.push({ area: { id: area.id, name: area.name, building: area.building, unit: area.unit }, surfaces });
  }

  // Photos: approved only; predecessor photos only with full consent (spec-only shares none).
  const ownIds = new Set(own.map((a) => a.id));
  const earlierIds = new Set(earlier.map((a) => a.id));
  const photos = (db.sharedPhotos ?? [])
    .filter((p) => p.propertyId === property.id && photoShareable(p))
    .filter((p) => !p.applicationId || ownIds.has(p.applicationId) || (access === "full" && earlierIds.has(p.applicationId)))
    .map((p) => ({ id: p.id, caption: p.caption, takenAt: p.takenAt, surfaceId: p.surfaceId }));

  return {
    propertyId: property.id,
    address: property.address,
    cityLine: `${property.city}, ${property.state} ${property.zip}`,
    areas,
    predecessor: access,
    photos,
  };
}

export function surfaceName(db: Database, surfaceId: string) {
  const s = byId(db.surfaces, surfaceId);
  const a = byId(db.areas, s?.areaId);
  return { area: a?.name ?? "", surface: s?.name ?? "" };
}
