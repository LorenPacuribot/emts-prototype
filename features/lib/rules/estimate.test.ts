import { describe, expect, it } from "vitest";
import { createSeed } from "@/features/data/seed";
import { estimateTotals, paintSurfaceFor, surfaceHours } from "./estimate";

const NOW = "2026-06-10T15:00:00.000Z";

describe("Estimate details — scope calculation", () => {
  it("hours: first coat at the production rate, later coats 25% faster", () => {
    // 150 sq ft/hr walls: 450 / 150 = 3.00 h, second coat 450 / 187.5 = 2.40 h.
    expect(surfaceHours({ type: "walls", areaSqft: 450 }, 1)).toBe(3);
    expect(surfaceHours({ type: "walls", areaSqft: 450 }, 2)).toBe(5.4);
  });

  it("hours are zero with no coats or no area", () => {
    expect(surfaceHours({ type: "walls", areaSqft: 450 }, 0)).toBe(0);
    expect(surfaceHours({ type: "trim", areaSqft: 0 }, 2)).toBe(0);
  });

  it("paint surface follows the surface condition (live Smooth / Medium / Rough)", () => {
    expect(paintSurfaceFor("sound")).toBe("SMOOTH");
    expect(paintSurfaceFor("new_drywall")).toBe("MEDIUM");
    expect(paintSurfaceFor("rough")).toBe("ROUGH");
  });

  it("totals add labour and paint, then tax, rounded to cents", () => {
    const db = createSeed(NOW);
    const job = db.jobs.find((j) => j.id === "JOB-2026-5")!;
    const t = estimateTotals(db, job);
    expect(t.totalHours).toBeGreaterThan(0);
    expect(t.subtotal).toBeCloseTo(t.laborTotal + t.paintTotal, 2);
    expect(t.grandTotal).toBeCloseTo(t.subtotal + t.taxAmount, 2);
    expect(t.taxAmount).toBeCloseTo((t.subtotal * 8.25) / 100, 2);
  });
});
