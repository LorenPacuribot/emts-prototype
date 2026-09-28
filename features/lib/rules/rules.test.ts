/**
 * Unit tests for the cross-feature rules and calculations.
 * Each test maps to an acceptance criterion in the design document.
 */
import { describe, expect, it } from "vitest";
import { roundHalfUp, roundMoney } from "./rounding";
import { classifyChange, type Selection } from "./change-rule";
import { demandBalance } from "./demand";
import {
  adjustmentNeedsApproval, calcDemand, consumablesAllowance, netArea, packContainers, routeOverReceipt, wasteAllowance,
} from "./materials";
import { addYears } from "./dates";
import { calcRepaintDate } from "./lifespan";
import { attemptSchedule, inContactWindow, recycleDate } from "./follow-up";
import type { Application, Area, LifespanLibrary } from "@/features/types";

describe("Rule 6 — rounding", () => {
  it("rounds money half-up", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.345)).toBe(2.35);
    expect(roundHalfUp(5.7142857 * 1.05, 3)).toBe(6);
  });
});

describe("Feature 18 — demand", () => {
  it("1,000 sq ft, 2 coats, 350 sq ft/gal, 5% waste = 6 gallons before packing", () => {
    const d = calcDemand({ areaSqft: 1000, coats: 2, rate: 350, waste: 0.05 });
    expect(d.baseNeedGal).toBeCloseTo(5.714285, 5);
    expect(d.adjustedNeedGal).toBe(6);
  });
  it("does not deduct an opening of exactly 20 sq ft, deducts 20.5", () => {
    expect(netArea(300, [20])).toBe(300);
    expect(netArea(300, [20.5])).toBe(279.5);
  });
  it("uses only the highest waste allowance", () => {
    expect(wasteAllowance({ kind: "interior", conditions: ["rough"] })).toBe(0.15);
    expect(wasteAllowance({ kind: "exterior", conditions: ["sound"] })).toBe(0.1);
  });
  it("packs by least leftover, then fewest containers", () => {
    const r = packContainers(6, ["qt", "gal", "5gal"]);
    expect(r.totalGal).toBe(6);
    expect(r.containers).toBe(2); // 1 x 5gal + 1 x gal
  });
  it("only offers available pack sizes", () => {
    const r = packContainers(6, ["gal"]);
    expect(r.packs).toEqual([{ size: "gal", count: 6 }]);
  });
  it("needs approval above ±10% and from a zero baseline", () => {
    expect(adjustmentNeedsApproval(10, 11.2).needsApproval).toBe(true);
    expect(adjustmentNeedsApproval(10, 10.9).needsApproval).toBe(false);
    expect(adjustmentNeedsApproval(0, 1).needsApproval).toBe(true);
  });
  it("routes over-receipt: 8% to job cost, 20% splits at 10%", () => {
    expect(routeOverReceipt(10, 10.8)).toEqual({ toJobCost: expect.closeTo(0.8, 5), toShelf: 0 });
    const r = routeOverReceipt(10, 12);
    expect(r.toJobCost).toBeCloseTo(1, 5);
    expect(r.toShelf).toBeCloseTo(1, 5);
  });
  it("calculates consumables allowance", () => {
    expect(consumablesAllowance({ interiorRooms: [{}, { neverPainted: true }], exteriorSqft: 2500, hasExterior: true })).toEqual({
      interior: 90, exterior: 212.5, total: 302.5,
    });
  });
});

describe("Rule 2 — outstanding demand", () => {
  it("subtracts reserved stock and net acknowledged; sent is held, not netted", () => {
    const b = demandBalance({ calculated: 20, reservedShelf: 2, acknowledged: 10, confirmedCancellations: 3, confirmedReturns: 0, sentUnacknowledged: 4 });
    expect(b.netAcknowledged).toBe(7);
    expect(b.outstanding).toBe(11);
    expect(b.orderableNow).toBe(7);
  });
});

describe("Rule 1 — signed-scope change", () => {
  const base: Selection = { brand: "Sherwin-Williams", productLine: "Emerald", colour: "SW 7005", sheen: "Satin", product: "Emerald Interior", packSize: "gal", costPerGal: 80 };
  const ctx = { jobSigned: true, tintedOrOrdered: false, priceChanges: false };
  it("pack size change within 10% is office approval", () => {
    expect(classifyChange(base, { ...base, packSize: "5gal", costPerGal: 76 }, ctx).kind).toBe("office_approval");
  });
  it("product line change needs a change order", () => {
    expect(classifyChange(base, { ...base, productLine: "Duration" }, ctx).kind).toBe("change_order");
  });
  it("sheen change needs a change order even at zero price", () => {
    expect(classifyChange(base, { ...base, sheen: "Eggshell" }, ctx).kind).toBe("change_order");
  });
  it("colour-only with nothing tinted is a Colour Re-approval", () => {
    expect(classifyChange(base, { ...base, colour: "SW 7006" }, ctx).kind).toBe("colour_reapproval");
  });
  it("colour-only after tinting needs a change order", () => {
    expect(classifyChange(base, { ...base, colour: "SW 7006" }, { ...ctx, tintedOrOrdered: true }).kind).toBe("change_order");
  });
});

describe("Feature 27 — repaint date", () => {
  const lib: LifespanLibrary = {
    version: 1, updatedAt: "", updatedBy: "", southWestDeduction: 1, premiumBonus: 1, poorPrepDeduction: 2,
    defaults: [{ roomType: "exterior_body", years: 7 }],
  };
  const area: Area = { id: "a", propertyId: "p", name: "South", kind: "exterior", roomType: "exterior_body", exposure: "south" };
  const app = { completedAt: "2026-06-15T12:00:00.000Z", productTier: "premium", prepQuality: "good" } as Application;
  it("keeps day of month: 15 June 2026 + 7 years = 15 June 2033", () => {
    expect(addYears("2026-06-15T12:00:00.000Z", 7).slice(0, 10)).toBe("2033-06-15");
  });
  it("applies exposure and premium once each", () => {
    const r = calcRepaintDate(app, area, lib);
    expect(r.years).toBe(7);
  });
  it("never calculates without a completion date", () => {
    expect(calcRepaintDate({ ...app, completedAt: undefined }, area, lib).unresolved).toBeTruthy();
  });
});

describe("Feature 29 — contact rules", () => {
  it("allows 7:00 p.m. and blocks 7:01 p.m.", () => {
    expect(inContactWindow(new Date(2026, 8, 23, 19, 0)).ok).toBe(true);
    expect(inContactWindow(new Date(2026, 8, 23, 19, 1)).ok).toBe(false);
  });
  it("moves a Sunday attempt to Monday", () => {
    // Qualified Sat 2026-09-19 -> day 14 = Fri 10-02, day 35 = Fri 10-23. Day 1 Sat is fine.
    const s = attemptSchedule("2026-09-20T12:00:00.000Z"); // Sunday
    expect(s[0].planned.slice(0, 10)).toBe("2026-09-21");
    expect(s[0].movedFrom).toBeTruthy();
  });
  it("recycles exterior after 1 March to next year", () => {
    expect(recycleDate("2026-04-10T00:00:00.000Z", ["exterior"]).slice(0, 10)).toBe("2027-03-01");
    expect(recycleDate("2026-04-10T00:00:00.000Z", ["exterior", "interior"]).slice(0, 10)).toBe("2026-09-01");
  });
});
