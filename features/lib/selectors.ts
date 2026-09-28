/**
 * Read helpers shared by screens. Pure functions over the Database.
 */
import type { Database, Job, Property, SpecLine, Surface } from "@/features/types";

export const byId = <T extends { id: string }>(list: T[], id?: string) => list.find((x) => x.id === id);

export function propertyAddress(p?: Property, full = false): string {
  if (!p) return "—";
  return full ? `${p.address}, ${p.city}, ${p.state} ${p.zip}` : `${p.address}, ${p.city}, ${p.state}`;
}

export function currentOwnership(p: Property) {
  return p.ownership.find((o) => !o.end) ?? p.ownership[p.ownership.length - 1];
}

export function currentOwner(db: Database, p: Property) {
  return byId(db.customers, currentOwnership(p)?.customerId);
}

export function jobSurfaces(db: Database, job: Job): Surface[] {
  return job.surfaceIds.map((id) => byId(db.surfaces, id)).filter(Boolean) as Surface[];
}

export function surfaceLabel(db: Database, surfaceId: string): string {
  const s = byId(db.surfaces, surfaceId);
  if (!s) return surfaceId;
  const a = byId(db.areas, s.areaId);
  return `${a?.name ?? ""} · ${s.name}`;
}

export function jobSpecs(db: Database, jobId: string): SpecLine[] {
  return db.specs.filter((s) => s.jobId === jobId);
}

/** A specification is orderable only when Approved and all three ordering fields are set (feature 3). */
export function orderingGaps(spec: SpecLine): string[] {
  const gaps: string[] = [];
  if (spec.state !== "approved") gaps.push("approval");
  if (!spec.productLine) gaps.push("product line");
  if (!spec.product) gaps.push("specific product");
  if (!spec.tintBase) gaps.push("tint base");
  return gaps;
}

export function catalogFor(db: Database, product?: string) {
  return db.catalog.find((c) => c.product === product);
}
