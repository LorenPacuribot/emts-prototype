/**
 * Patent 25 (Combination 8 step 8) — keep last time's labour, material and
 * paint prices, or update to current pricing.
 */
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { ActionResult, Database, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { previousLinePrice, repPricing, setLineReconfirmed, setPricingMode, startRepeatEstimate, updateRepeatLine } from "@/features/lib/store/actions/future-estimate";

const NOW = "2026-06-10T15:00:00.000Z";

function run<A extends unknown[], R>(db: Database, userId: string, action: (db: Database, actor: User, ...args: A) => ActionResult<R>, ...args: A) {
  let result: ActionResult<R> = { ok: false, error: "not run" };
  const next = produce(db, (draft) => {
    result = action(draft as Database, draft.users.find((u) => u.id === userId)!, ...args);
  });
  return { db: next, result };
}

/** A repeat estimate for an application whose job has a recorded price. */
function start() {
  const seed = createSeed(NOW);
  const job = (seed.historicalJobs ?? []).find((j) => Object.keys(j.linePrices).length)!;
  const surfaceId = Object.keys(job.linePrices)[0]!;
  const app = seed.applications.find((a) => a.surfaceId === surfaceId && a.jobId === job.id)!;
  const r = run(seed, "U-OWNER", startRepeatEstimate, app.propertyId, [app.id], { acknowledgedOpen: true });
  const repId = (r.result as { value?: string }).value!;
  return { db: r.db, repId, oldPrice: job.linePrices[surfaceId]!, surfaceId };
}

describe("Patent 25 — pricing basis for an estimate from history", () => {
  it("keeps last time's price, then switches back to current pricing", () => {
    let { db, repId, oldPrice, surfaceId } = start();
    const lineId = db.repeatEstimates.find((r) => r.id === repId)!.lines.find((l) => l.surfaceId === surfaceId)!.id;
    const kept = run(db, "U-OWNER", setPricingMode, repId, "previous");
    expect(kept.result.ok).toBe(true);
    db = kept.db;
    const rep = db.repeatEstimates.find((r) => r.id === repId)!;
    const line = rep.lines.find((l) => l.id === lineId)!;
    expect(rep.pricingMode).toBe("previous");
    expect(line.price).toBeCloseTo(previousLinePrice(db, line)!, 2);
    expect(previousLinePrice(db, { ...line, sqft: db.surfaces.find((s) => s.id === surfaceId)!.areaSqft })).toBe(oldPrice);

    const current = run(db, "U-OWNER", setPricingMode, repId, "current").db;
    const lp = repPricing(current, current.repeatEstimates.find((r) => r.id === repId)!).lines.find((l) => l.line.id === lineId)!;
    expect(lp.basisSource).toBe("current");
    expect(lp.line.price).toBe(lp.suggested.price);
  });

  it("scales last time's price to a new measurement and un-reconfirms a changed line", () => {
    let { db, repId, surfaceId } = start();
    const recorded = db.surfaces.find((s) => s.id === surfaceId)!.areaSqft;
    const lineId = db.repeatEstimates.find((r) => r.id === repId)!.lines.find((l) => l.surfaceId === surfaceId)!.id;
    db = run(db, "U-OWNER", updateRepeatLine, repId, lineId, { sqft: recorded * 2, price: 1, newQtyGal: 2, prep: "standard", condition: "good" }).db;
    db = run(db, "U-OWNER", setLineReconfirmed, repId, lineId, true).db;
    const line = () => db.repeatEstimates.find((r) => r.id === repId)!.lines.find((l) => l.id === lineId)!;
    const before = line().reconfirmed;
    db = run(db, "U-OWNER", setPricingMode, repId, "previous").db;
    expect(line().price).toBeCloseTo(previousLinePrice(db, line())!, 2);
    expect(previousLinePrice(db, line())).toBeGreaterThan(0);
    if (before) expect(line().reconfirmed).toBe(false);
  });

  it("is refused for someone who can't build estimates", () => {
    const { db, repId } = start();
    expect(run(db, "U-CREW", setPricingMode, repId, "previous").result.ok).toBe(false);
  });
});
