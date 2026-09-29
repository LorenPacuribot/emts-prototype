/**
 * What an approved change order changes on the job once its downstream steps
 * succeed (patent 24: "the additional scope can flow into work order,
 * schedule, material requirements, production … and invoice").
 *
 * - work_order done → its lines join the work-order scope
 * - scheduler done  → its labour hours join the job's required hours
 * - materials done  → its square footage joins the matching paint demand
 *
 * A step that failed or is still waiting changes nothing until it is retried.
 */
import type { ChangeOrder, ChangeOrderLine, Database, DownstreamKey, SpecLine } from "@/features/types";
import { roundHalfUp } from "./rounding";
import { surfaceHours } from "./estimate";

export interface AppliedLine extends ChangeOrderLine {
  coId: string;
  coTitle: string;
}

/** Lines of the job's change orders whose `key` step has succeeded. */
export function appliedChangeOrderLines(db: Pick<Database, "changeOrders">, jobId: string, key: DownstreamKey): AppliedLine[] {
  return (db.changeOrders ?? [])
    .filter((co: ChangeOrder) => co.jobId === jobId && co.downstream?.[key] === "done")
    .flatMap((co) => co.lines.map((l) => ({ ...l, coId: co.id, coTitle: co.title })));
}

/**
 * Labour hours a line adds (+) or removes (−). Uses the line's labour
 * breakdown; a removed surface without one gives back that surface's hours.
 */
export function lineLabourHours(db: Pick<Database, "surfaces" | "specs">, line: ChangeOrderLine): number {
  const sign = line.kind === "remove" ? -1 : 1;
  if (line.laborHours !== undefined) return sign * line.laborHours;
  if (line.kind === "remove" && line.surfaceId) {
    const surface = db.surfaces.find((s) => s.id === line.surfaceId);
    const coats = db.specs.find((s) => s.surfaceIds.includes(line.surfaceId!))?.coats ?? 2;
    return surface ? -surfaceHours(surface, coats) : 0;
  }
  return 0;
}

/** Net required hours from applied change orders (scheduler step done). */
export function changeOrderHours(db: Pick<Database, "changeOrders" | "surfaces" | "specs">, jobId: string): number {
  return roundHalfUp(appliedChangeOrderLines(db, jobId, "scheduler").reduce((a, l) => a + lineLabourHours(db, l), 0), 2);
}

const norm = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Does a change-order line's paint belong to this specification? */
export function lineMatchesSpec(db: Pick<Database, "colours">, line: ChangeOrderLine, spec: SpecLine): boolean {
  if (line.surfaceId && spec.surfaceIds.includes(line.surfaceId)) return true;
  if (!line.colour) return false;
  const colour = db.colours.find((c) => c.id === spec.colourId);
  if (!colour) return false;
  const want = norm(line.colour);
  const colourMatch = [colour.number, colour.name].some((x) => norm(x) && want.includes(norm(x)));
  const productMatch = !line.product || !spec.product || norm(spec.product).includes(norm(line.product)) || norm(line.product).includes(norm(spec.product));
  return colourMatch && productMatch;
}

/** Change-order lines with square footage and no matching specification: paint nobody will order. */
export function unmatchedPaintLines(db: Database, jobId: string): AppliedLine[] {
  const specs = db.specs.filter((s) => s.jobId === jobId && s.state !== "superseded");
  return appliedChangeOrderLines(db, jobId, "materials").filter((l) => (l.sqft ?? 0) > 0 && l.kind === "add" && !specs.some((s) => lineMatchesSpec(db, l, s)));
}
