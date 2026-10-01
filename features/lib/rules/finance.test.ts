/**
 * Feature 33 — Financial And Accounting Management. Each test names the
 * acceptance criterion it checks.
 */
import { describe, expect, it } from "vitest";
import {
  actualMargin, ageFromInvoiceDate, allocateSource, allocationDifference, isDuplicateExpense, matchBill,
  paymentNeedsOwner, postingPeriod, projectedMargin, reimbursementSteps,
} from "./finance";

const local = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi);

describe("Feature 33 — posting periods", () => {
  it("posts a correction for a closed period to the next period", () => {
    expect(postingPeriod(local(2026, 8, 14).toISOString(), ["2026-08"])).toEqual({ period: "2026-09", movedFrom: "2026-08" });
    expect(postingPeriod(local(2026, 9, 14).toISOString(), ["2026-08"])).toEqual({ period: "2026-09" });
  });
});

describe("Feature 33 — margins (33.Q01)", () => {
  it("actual margin: $20,000 revenue and $13,000 cost is 35 percent", () => {
    expect(actualMargin(20000, 13000)).toBeCloseTo(0.35, 10);
  });
  it("projected margin: $50,000 contract and $36,000 forecast is 28 percent", () => {
    expect(projectedMargin(50000, 36000)).toBeCloseTo(0.28, 10);
  });
  it("shows Not applicable for zero or credit-only revenue", () => {
    expect(actualMargin(0, 500)).toBeNull();
    expect(actualMargin(-200, 500)).toBeNull();
  });
});

describe("Feature 33 — receivables", () => {
  it("ages an invoice dated 1 March, on 20 April, from 1 March — not from the due date", () => {
    const a = ageFromInvoiceDate(local(2026, 3, 1, 12).toISOString(), local(2026, 4, 20, 9).toISOString());
    expect(a.days).toBe(50);
    expect(a.bucket).toBe("31–60");
  });
});

describe("Feature 33 — supplier bill matching", () => {
  it("flags the quantity and value billed beyond what was received", () => {
    const m = matchBill([{ billedGal: 10, unitCost: 77, receivedGal: 10 }, { billedGal: 2, unitCost: 82, receivedGal: 1 }]);
    expect(m.matched).toBe(false);
    expect(m.unmatchedGal).toBe(1);
    expect(m.unmatchedValue).toBe(82);
  });
  it("matches when billed equals received", () => {
    expect(matchBill([{ billedGal: 2, unitCost: 36, receivedGal: 2 }]).matched).toBe(true);
  });
});

describe("Feature 33 — approvals", () => {
  it("needs the owner before an external payment of $2,600, not at $2,500", () => {
    expect(paymentNeedsOwner(2600)).toBe(true);
    expect(paymentNeedsOwner(2500)).toBe(false);
  });
  it("routes the office manager's own reimbursement to the owner at any value", () => {
    expect(reimbursementSteps({ type: "salaried", role: "office_manager" })).toEqual(["owner"]);
    expect(reimbursementSteps({ type: "hourly" })).toEqual(["crew_lead", "office"]);
  });
  it("flags a reimbursement that repeats an expense already on the job", () => {
    expect(isDuplicateExpense({ amount: 86.4, merchant: "Home Depot", date: "2026-09-20T12:00:00Z" }, { amount: 86.4, party: "Home Depot #0544", date: "2026-09-19T12:00:00Z" })).toBe(true);
    expect(isDuplicateExpense({ amount: 86.4, merchant: "Lowe's", date: "2026-09-20T12:00:00Z" }, { amount: 86.4, party: "Home Depot #0544", date: "2026-09-19T12:00:00Z" })).toBe(false);
  });
});

describe("Feature 33 — job allocation (Rule 5)", () => {
  it("allocates $1,000 across three jobs; the one-cent residual goes to the largest allocation; rows sum exactly", () => {
    const r = allocateSource(1000, [{ jobId: "JOB-2026-1", weight: 1 }, { jobId: "JOB-2026-2", weight: 1 }, { jobId: "JOB-2026-5", weight: 1.1 }]);
    expect(r.residual).toBeCloseTo(0.01, 6);
    expect(r.rows.reduce((a, x) => a + x.amount, 0)).toBeCloseTo(1000, 6);
    expect(r.receiver).toBe("JOB-2026-5");
  });
  it("gives the residual to the lowest job number when two allocations tie as largest", () => {
    const r = allocateSource(100, [{ jobId: "JOB-2026-5", weight: 1 }, { jobId: "JOB-2026-2", weight: 1 }, { jobId: "JOB-2026-1", weight: 1 }]);
    expect(r.receiver).toBe("JOB-2026-1");
  });
  it("blocks a save when rows sum to $999.99 against $1,000.00 and shows the difference", () => {
    expect(allocationDifference(1000, [{ amount: 500 }, { amount: 499.99 }])).toBe(0.01);
  });
});
