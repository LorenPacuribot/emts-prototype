/**
 * Feature 21 — Estimated Versus Actual Performance. Each test names the
 * acceptance criterion it checks.
 */
import { describe, expect, it } from "vitest";
import { actualPaintGal, correctionApprovers, presetRange, reconciles, validRange, variance } from "./performance";

describe("Feature 21 — variance language", () => {
  it("40 estimated hours and 50 actual: 10 hours over, 25 percent, Over budget", () => {
    const v = variance(50, 40, "hours");
    expect(v.amount).toBe(10);
    expect(v.pct).toBeCloseTo(0.25, 10);
    expect(v.label).toBe("Over budget");
  });
  it("labels negative variance Under budget, in words", () => {
    expect(variance(900, 1000).label).toBe("Under budget");
  });
});

describe("Feature 21 — highlighting", () => {
  it("does not highlight exactly 10 percent and $400", () => {
    expect(variance(4400, 4000).highlight).toBeNull();
  });
  it("highlights 10.1 percent above estimate as Over budget", () => {
    const v = variance(1101, 1000);
    expect(v.highlight).toBe("over");
    expect(v.label).toBe("Over budget");
  });
  it("highlights $600 below estimate on the job total in the favourable colour, Under budget", () => {
    const v = variance(9400, 10000);
    expect(v.highlight).toBe("under");
    expect(v.label).toBe("Under budget");
  });
  it("does not highlight exactly $500 with no percentage breach", () => {
    expect(variance(10500, 10000).highlight).toBeNull();
  });
  it("shows Not applicable for a zero estimate and keeps the absolute difference", () => {
    const v = variance(350, 0);
    expect(v.pct).toBeNull();
    expect(v.amount).toBe(350);
  });
});

describe("Feature 21 — baseline and usage", () => {
  it("original approved plus change contribution reconciles to revised approved", () => {
    expect(reconciles(8200, 1000, 9200)).toBe(true);
    expect(reconciles(8200, 1000, 9150)).toBe(false);
  });
  it("12 gallons issued with 2 sealed usable returned is 10 gallons of actual paint", () => {
    expect(actualPaintGal(12, 2)).toBe(10);
  });
});

describe("Feature 21 — corrections and periods", () => {
  it("needs the office manager and owner after completion; the owner for labour after payroll", () => {
    expect(correctionApprovers({ jobCompleted: true, afterPayroll: false, labour: false })).toEqual(["office_manager", "owner"]);
    expect(correctionApprovers({ jobCompleted: false, afterPayroll: true, labour: true })).toEqual(["owner"]);
  });
  it("defaults to the current month and rejects From after To", () => {
    expect(presetRange("this_month", new Date(2026, 8, 25, 10).toISOString())).toEqual({ from: "2026-09-01", to: "2026-09-25" });
    expect(validRange("2026-09-10", "2026-09-01")).toBe(false);
  });
});
