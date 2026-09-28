/**
 * Feature 28 — Future Estimating And Touch-Up Reordering.
 * Each test names the acceptance criterion it checks.
 */
import { describe, expect, it } from "vitest";
import {
  addWorkingDays, chooseProductivity, classifyReplacement, evaluateInspectionGate, historicalRate, historyAccess, isQuoteExpired,
  isSmallInterior, monthsBetween, paymentAllowsApproval, priceLine, productivityAllowed, quoteTotals, quoteValidUntil, reconfirmGaps,
  refundDueDate, reorderQuantity, stockCheckResult, CURRENT_PRODUCTIVITY,
} from "./future-estimate";
import { addDays, addMonths } from "./dates";

const NOW = "2026-09-23T15:00:00.000Z";

describe("28.2 Inspection gate", () => {
  it("exterior repeat estimate with no saved site visit is blocked and names the requirement", () => {
    const g = evaluateInspectionGate({ hasExterior: true, rooms: 0, wallCeilingSqft: 0 });
    expect(g.met).toBe(false);
    expect(g.reasons[0]).toMatch(/site visit/);
  });
  it("site visit with a measurement date but no photograph is blocked", () => {
    const g = evaluateInspectionGate({ hasExterior: true, rooms: 0, wallCeilingSqft: 0, inspection: { path: "site_visit", visitDate: NOW, measurementDate: NOW, photos: 0 } });
    expect(g.met).toBe(false);
    expect(g.reasons.join(" ")).toMatch(/photograph/);
  });
  it("site visit with measurement date and a photo meets the gate", () => {
    const g = evaluateInspectionGate({ hasExterior: true, rooms: 0, wallCeilingSqft: 0, inspection: { path: "site_visit", visitDate: NOW, measurementDate: NOW, photos: 3 } });
    expect(g.met).toBe(true);
  });
  it("380 sq ft interior: photographs and a recorded call satisfy the gate", () => {
    const g = evaluateInspectionGate({ hasExterior: false, rooms: 2, wallCeilingSqft: 380, inspection: { path: "small_interior", photos: 2, callDate: NOW } });
    expect(g.smallInteriorAvailable).toBe(true);
    expect(g.met).toBe(true);
  });
  it("450 sq ft across two rooms: small-interior path rejected, site visit required", () => {
    const g = evaluateInspectionGate({ hasExterior: false, rooms: 2, wallCeilingSqft: 450, inspection: { path: "small_interior", photos: 2, callDate: NOW } });
    expect(g.smallInteriorAvailable).toBe(false);
    expect(g.met).toBe(false);
    expect(g.reasons[0]).toMatch(/site visit is required/);
  });
  it("401 sq ft interior (two rooms): small-interior path unavailable", () => {
    expect(isSmallInterior({ rooms: 2, wallCeilingSqft: 401 })).toBe(false);
    expect(isSmallInterior({ rooms: 2, wallCeilingSqft: 400 })).toBe(true);
    expect(isSmallInterior({ rooms: 1, wallCeilingSqft: 780 })).toBe(true);
  });
});

describe("28 Reconfirmation", () => {
  it("line where condition has not been reconfirmed is named as blocking", () => {
    expect(reconfirmGaps({ newQtyGal: 2, prep: "standard", price: 400 })).toEqual(["condition"]);
  });
  it("prior actual usage never fills the new quantity: an empty quantity is a gap", () => {
    expect(reconfirmGaps({ prep: "standard", condition: "good", price: 400 })).toContain("quantity");
  });
});

describe("28 Quote validity", () => {
  it("issued quote expires after 30 days: 31 days later it is expired", () => {
    const valid = quoteValidUntil(NOW);
    expect(isQuoteExpired(valid, addDays(NOW, 29))).toBe(false);
    expect(isQuoteExpired(valid, addDays(NOW, 31))).toBe(true);
  });
});

describe("28.3 Pricing basis and productivity", () => {
  it("rates 20 months old raise a warning naming the age", () => {
    const d = chooseProductivity({ useHistorical: true, policyApproved: true, surfaceType: "walls", historical: 160, historicalDate: addMonths(NOW, -20), nowIso: NOW });
    expect(d.source).toBe("historical");
    expect(d.ageMonths).toBe(20);
    expect(d.stale).toBe(true);
  });
  it("missing historical rate falls back to the current rate explicitly, no reconstruction", () => {
    expect(historicalRate({ sqft: 500, coats: 2 })).toBeUndefined();
    const d = chooseProductivity({ useHistorical: true, policyApproved: true, surfaceType: "trim", nowIso: NOW });
    expect(d).toMatchObject({ source: "current", fallback: true, rate: CURRENT_PRODUCTIVITY.trim });
  });
  it("no owner-approved policy: historical reuse is blocked (current rate used)", () => {
    expect(productivityAllowed([{ propertyType: "commercial" }], "single_family")).toBe(false);
    const d = chooseProductivity({ useHistorical: true, policyApproved: false, surfaceType: "walls", historical: 160, historicalDate: NOW, nowIso: NOW });
    expect(d.source).toBe("current");
  });
  it("approved policy: reuse proceeds, and the estimator may still request current rates", () => {
    expect(productivityAllowed([{ propertyType: "single_family" }], "single_family")).toBe(true);
    expect(chooseProductivity({ useHistorical: true, policyApproved: true, surfaceType: "walls", historical: 160, historicalDate: NOW, nowIso: NOW }).source).toBe("historical");
    expect(chooseProductivity({ useHistorical: false, policyApproved: true, surfaceType: "walls", historical: 160, historicalDate: NOW, nowIso: NOW }).source).toBe("current");
  });
  it("prices at today's costs; a historical discount is not carried forward", () => {
    const p = priceLine({ sqft: 820, coats: 2, surfaceType: "siding", rate: 130, wageRate: 48, markupPct: 45, materialCostPerGal: 82, gallons: 6 });
    // hours = 1640/130 = 12.615..., labour = 605.54, material = 492
    expect(p.labour).toBe(605.54);
    expect(p.material).toBe(492);
    expect(p.price).toBe(1591.43);
    const totals = quoteTotals([p.price], 8.25);
    expect(totals.total).toBe(1722.72); // no discount parameter exists
  });
  it("months between dates floors partial months", () => {
    expect(monthsBetween("2025-01-31T00:00:00Z", "2026-09-23T00:00:00Z")).toBe(19);
  });
});

describe("28 Discontinued replacement (Rule 1)", () => {
  const base = { brand: "Sherwin-Williams", productLine: "SuperPaint", colour: "SW 6258", sheen: "Satin", product: "SuperPaint Exterior", costPerGal: 62 };
  it("same brand, line, colour and sheen successor within 10%: office approves, no customer document", () => {
    const r = classifyReplacement(base, { ...base, product: "SuperPaint Exterior (Gen 2)", costPerGal: 66 }, true);
    expect(r.decision.kind).toBe("office_approval");
    expect(r.approver).toBe("office");
    expect(r.document).toBe("None");
  });
  it("different product line: priced change order with customer signature, owner approves", () => {
    const r = classifyReplacement(base, { ...base, productLine: "Duration", product: "Duration Exterior Acrylic Latex", costPerGal: 82 }, true);
    expect(r.decision.kind).toBe("change_order");
    expect(r.approver).toBe("owner");
    expect(r.document).toBe("ChangeOrder");
  });
  it("successor over 10% cost is not office-only", () => {
    const r = classifyReplacement(base, { ...base, product: "SuperPaint Exterior (Gen 2)", costPerGal: 75 }, true);
    expect(r.approver).toBe("owner");
  });
});

describe("28.4 Touch-up reorder", () => {
  it("2.5 gallons is rejected: maximum is two gallons", () => {
    const q = reorderQuantity({ requestedGal: 2.5, purpose: "touch_up", available: ["qt", "gal"] });
    expect(q.ok).toBe(false);
    expect(q.error).toMatch(/maximum is 2 gallons/);
  });
  it("one quart with no quart pack: smallest available pack required and excess explained", () => {
    const q = reorderQuantity({ requestedGal: 0.25, purpose: "touch_up", available: ["gal", "5gal"] });
    expect(q.ok).toBe(true);
    expect(q.orderGal).toBe(1);
    expect(q.excessGal).toBe(0.75);
    expect(q.note).toMatch(/smallest available pack/);
  });
  it("one quart with a quart pack: one quart", () => {
    const q = reorderQuantity({ requestedGal: 0.25, purpose: "touch_up", available: ["qt", "gal"] });
    expect(q.packs).toEqual([{ size: "qt", count: 1 }]);
  });
  it("non-touch-up order below one gallon is raised to one gallon, excess to shelf stock", () => {
    const q = reorderQuantity({ requestedGal: 0.5, purpose: "non_touch_up", available: ["qt", "gal"] });
    expect(q.orderGal).toBe(1);
    expect(q.excessToShelf).toBe(true);
    expect(q.note).toMatch(/shelf stock/);
  });
  it("no cleared prepayment and no On account: blocked", () => {
    expect(paymentAllowsApproval("unpaid")).toBe(false);
    expect(paymentAllowsApproval("prepaid_cleared")).toBe(true);
    expect(paymentAllowsApproval("on_account")).toBe(true);
  });
  it("stock with a tint date 26 months old requires rematching", () => {
    const r = stockCheckResult({ tintDate: addMonths(NOW, -26), nowIso: NOW, issues: [], brandMatches: true, codeMatches: true, sheenMatches: true });
    expect(r.result).toBe("Rematch required");
    expect(r.ageMonths).toBe(26);
  });
  it("stock showing skinning requires rematching regardless of age", () => {
    const r = stockCheckResult({ tintDate: addDays(NOW, -30), nowIso: NOW, issues: ["skinning"], brandMatches: true, codeMatches: true, sheenMatches: true });
    expect(r.result).toBe("Rematch required");
  });
  it("stock showing separation cannot be issued", () => {
    expect(stockCheckResult({ tintDate: NOW, nowIso: NOW, issues: ["separation"], brandMatches: true, codeMatches: true, sheenMatches: true }).result).toBe("Rematch required");
  });
  it("sound, labelled, recent stock is usable", () => {
    expect(stockCheckResult({ tintDate: addMonths(NOW, -8), nowIso: NOW, issues: [], brandMatches: true, codeMatches: true, sheenMatches: true }).result).toBe("Usable");
  });
  it("cancelled prepaid reorder: refund due within five working days", () => {
    // Wed 23 Sep 2026 + 5 working days = Wed 30 Sep 2026
    expect(refundDueDate(NOW).slice(0, 10)).toBe("2026-09-30");
    // Weekends are skipped: Fri 2 Oct + 5 working days = Fri 9 Oct
    expect(addWorkingDays("2026-10-02T15:00:00.000Z", 5).slice(0, 10)).toBe("2026-10-09");
    // Federal holidays are skipped: Thu 8 Oct + 3 skips Columbus Day (Mon 12 Oct)
    expect(addWorkingDays("2026-10-08T15:00:00.000Z", 3).slice(0, 10)).toBe("2026-10-14");
  });
});

describe("28 Ownership check (feature 25 rules)", () => {
  const start = "2026-08-09T00:00:00.000Z";
  it("predecessor history without seller consent is not offered", () => {
    expect(historyAccess({ completedAt: "2020-05-01T00:00:00Z", currentStart: start, consent: "not_requested" })).toBe("hidden");
    expect(historyAccess({ completedAt: "2020-05-01T00:00:00Z", currentStart: start, consent: "refused" })).toBe("hidden");
  });
  it("seller consent shares full history; unreachable seller gives specification only", () => {
    expect(historyAccess({ completedAt: "2020-05-01T00:00:00Z", currentStart: start, consent: "granted" })).toBe("full");
    expect(historyAccess({ completedAt: "2020-05-01T00:00:00Z", currentStart: start, consent: "unreachable_spec_only" })).toBe("spec_only");
  });
  it("current ownership period work is shown", () => {
    expect(historyAccess({ completedAt: "2026-09-01T00:00:00Z", currentStart: start })).toBe("full");
  });
});
