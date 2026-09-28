/**
 * Feature 3 → 27 — colour card palette and lifespan carried to the repaint date.
 */
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { ActionResult, Application, Area, Database, LifespanLibrary, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { closeJob, confirmAllMatching } from "@/features/lib/store/actions/property";
import { publishLibrary, type LibraryDraft } from "@/features/lib/store/actions/service";
import { calcRepaintDate, libraryDefault, specLifespanDefault } from "./lifespan";
import { planNightlyRun } from "./alerts";

const NOW = "2026-06-10T15:00:00.000Z";

function run<A extends unknown[], R>(db: Database, userId: string, action: (db: Database, actor: User, ...args: A) => ActionResult<R>, ...args: A) {
  let result: ActionResult<R> = { ok: false, error: "not run" };
  const next = produce(db, (draft) => {
    result = action(draft as Database, draft.users.find((u) => u.id === userId)!, ...args);
  });
  return { db: next, result };
}

const lib: LifespanLibrary = {
  version: 1, updatedAt: NOW, updatedBy: "U-OWNER", southWestDeduction: 1, premiumBonus: 1, poorPrepDeduction: 2,
  defaults: [{ roomType: "bedroom", years: 7 }],
  surfaceDefaults: [{ surfaceType: "ceiling", years: 10 }],
  productDefaults: [
    { manufacturer: "Sherwin-Williams", productLine: "Emerald", years: 9 },
    { manufacturer: "Sherwin-Williams", productLine: "Emerald", product: "Emerald Urethane Trim Enamel", years: 6 },
  ],
};
const app = (over: Partial<Application> = {}): Application => ({
  id: "APP-X", propertyId: "P", surfaceId: "S", manufacturer: "Sherwin-Williams", colourName: "x", colourNumber: "x", hex: "#fff", product: "x", sheen: "Satin", coats: 2,
  completedAt: "2026-06-15T12:00:00.000Z", verification: "confirmed", photoCount: 0, touchUps: [], ...over,
});
const area: Area = { id: "A", propertyId: "P", name: "Room", kind: "interior", roomType: "bedroom" };

describe("Colour card lifespan drives the repaint date", () => {
  it("the card lifespan replaces the library base interval", () => {
    const r = calcRepaintDate(app({ lifespanYears: 10, specId: "SPEC-9" }), area, lib);
    expect(r.years).toBe(10);
    expect(r.dueDate!.slice(0, 10)).toBe("2036-06-15");
    expect(r.basis[0]).toBe("Colour card lifespan 10 yrs (SPEC-9)");
  });
  it("adjustments still apply on top of the card lifespan", () => {
    expect(calcRepaintDate(app({ lifespanYears: 10, prepQuality: "poor" }), area, lib).years).toBe(8);
  });
  it("without a card lifespan the library default is used", () => {
    expect(calcRepaintDate(app(), area, lib).years).toBe(7);
  });
  it("closing a job copies each spec's lifespan onto the paint history, and the nightly run uses it", () => {
    let db = createSeed(NOW);
    // An estimator's lifespan change on the card must reach the follow-up date.
    db = produce(db, (d) => { d.specs.find((s) => s.id === "SPEC-6")!.lifespanYears = 12; });
    db = run(db, "U-CREW", confirmAllMatching, "JOB-2026-5", "2026-06-08T12:00:00.000Z").db;
    db = produce(db, (d) => { d.closeouts![0].rows.forEach((r) => { r.sheen = r.sheen ?? "Semi-Gloss"; r.confirmedBy = r.confirmedBy ?? "U-CREW"; }); });
    const r = run(db, "U-OFFICE", closeJob, "JOB-2026-5");
    expect(r.result.ok).toBe(true);
    const created = r.db.applications.filter((a) => a.jobId === "JOB-2026-5" && a.surfaceId === "SF-4011");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ lifespanYears: 12, specId: "SPEC-6", productLine: "Cashmere" });
    const calc = planNightlyRun(r.db, NOW).calculations.find((c) => c.surfaceId === "SF-4011");
    expect(calc?.basis[0]).toBe("Colour card lifespan 12 yrs (SPEC-6)");
  });
});

describe("Lifespan library product defaults", () => {
  it("product wins over product line, which wins over surface type and room", () => {
    expect(libraryDefault(lib, { roomType: "bedroom", surfaceType: "ceiling", manufacturer: "Sherwin-Williams", productLine: "Emerald", product: "Emerald Urethane Trim Enamel" }).years).toBe(6);
    expect(libraryDefault(lib, { roomType: "bedroom", surfaceType: "ceiling", manufacturer: "Sherwin-Williams", productLine: "Emerald", product: "Emerald Interior Acrylic Latex" }).years).toBe(9);
    expect(libraryDefault(lib, { roomType: "bedroom", surfaceType: "ceiling", productLine: "Cashmere" }).years).toBe(10);
    expect(libraryDefault(lib, { roomType: "bedroom", surfaceType: "walls" }).years).toBe(7);
  });
  it("a product default from another manufacturer doesn't apply", () => {
    expect(libraryDefault(lib, { roomType: "bedroom", manufacturer: "Behr", productLine: "Emerald" }).years).toBe(7);
  });
  it("the spec editor default resolves the product line from the catalogue", () => {
    const db = createSeed(NOW);
    expect(specLifespanDefault(db, [], { manufacturer: "Sherwin-Williams", product: "Duration Exterior Acrylic Latex" })).toBe(8);
  });
  it("the owner publishes product defaults; duplicates are refused and changes are logged", () => {
    const db = createSeed(NOW);
    const l = db.lifespanLibrary;
    const base: LibraryDraft = {
      defaults: l.defaults, surfaceDefaults: l.surfaceDefaults ?? [], productDefaults: l.productDefaults ?? [],
      southWestDeduction: l.southWestDeduction, premiumBonus: l.premiumBonus, poorPrepDeduction: l.poorPrepDeduction,
    };
    const extra = { manufacturer: "Sherwin-Williams", productLine: "Emerald", years: 9 };
    expect(run(db, "U-OWNER", publishLibrary, { ...base, productDefaults: [...base.productDefaults, extra, extra] }, "test").result.ok).toBe(false);
    expect(run(db, "U-EST", publishLibrary, { ...base, productDefaults: [...base.productDefaults, extra] }, "test").result.ok).toBe(false);
    const r = run(db, "U-OWNER", publishLibrary, { ...base, productDefaults: [...base.productDefaults, extra] }, "Emerald outlasts the room default");
    expect(r.result.ok).toBe(true);
    expect(r.db.lifespanLibrary.productDefaults).toContainEqual(extra);
    expect(r.db.lifespanLibrary.version).toBe(l.version + 1);
  });
});

describe("Manufacturer palette", () => {
  it("is seeded for every manufacturer offered on the colour card", () => {
    const db = createSeed(NOW);
    for (const m of ["Sherwin-Williams", "Benjamin Moore", "Behr", "PPG"]) {
      expect(db.palette!.some((c) => c.manufacturer === m)).toBe(true);
    }
    expect(new Set(db.palette!.map((c) => c.id)).size).toBe(db.palette!.length);
  });
});

describe("Feature 18 — order lines carry the full ordering identity", () => {
  it("a generated order stores manufacturer, product line, colour name, colour number and tint base", async () => {
    const { generateOrder, acceptRecalculation } = await import("@/features/lib/store/actions/materials");
    const { jobDemand, lineState } = await import("./procurement");
    let db = createSeed(NOW);
    let pick: { jobId: string; specId: string; gal: number } | undefined;
    for (const jobId of ["JOB-2026-1", "JOB-2026-5", "JOB-2026-2"]) {
      db = run(db, "U-OWNER", acceptRecalculation, jobId).db;
      const line = jobDemand(db, jobId).find((l) => !l.blocked.length && lineState(db, jobId, l.specId, l.needGal).orderableNow > 0);
      if (line) { pick = { jobId, specId: line.specId, gal: Math.min(1, lineState(db, jobId, line.specId, line.needGal).orderableNow) }; break; }
    }
    expect(pick).toBeDefined();
    const r = run(db, "U-OWNER", generateOrder, {
      key: "test-identity", jobId: pick!.jobId, supplierId: "SUP-SW", branchId: "BR-7132", phase: "Phase 1",
      deliveryDate: "2099-06-20T12:00:00.000Z", fulfilment: "pickup", lines: [{ specId: pick!.specId, gallons: pick!.gal }],
    });
    expect(r.result.ok).toBe(true);
    const po = r.db.purchaseOrders.find((p) => p.generationKey === "test-identity")!;
    const spec = r.db.specs.find((s) => s.id === pick!.specId)!;
    const colour = r.db.colours.find((c) => c.id === spec.colourId)!;
    expect(po.lines[0]).toMatchObject({
      manufacturer: colour.manufacturer, productLine: spec.productLine, colourName: colour.name, colourNumber: colour.number, tintBase: spec.tintBase, product: spec.product, sheen: spec.sheen,
    });
  });
  it("older lines without the fields resolve them from the catalogue and colour card", async () => {
    const { lineIdentity } = await import("./procurement");
    const db = createSeed(NOW);
    const line = db.purchaseOrders.flatMap((p) => p.lines).find((l) => l.specId === "SPEC-7")!;
    expect(line.manufacturer).toBeUndefined();
    expect(lineIdentity(db, line)).toMatchObject({ manufacturer: "Sherwin-Williams", productLine: "ProMar 200", colourNumber: "SW 7007", tintBase: "Extra White base" });
  });
});
