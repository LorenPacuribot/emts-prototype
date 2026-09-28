/**
 * Feature 24 — Change Orders And Additional Work.
 * Each test names the acceptance criterion it checks.
 */
import { describe, expect, it } from "vitest";
import {
  actionsToRetry, addWorkingDays, billingMode, dependencyBlock, depositReview, emergencyEligible, lineSell, linkExpiry, linkState,
  missingEmergencyEvidence, nextDocNumber, ownerApprovalCheck, priceChangeOrder, refundAllowed, refundWindowCloses, retryable, taxRateOn,
  undeliverableStatus, writtenConfirmationStatus,
} from "./change-orders";
import { classifyChange, type Selection } from "./change-rule";

describe("24.1 — incremental pricing", () => {
  it("Given an added room, only the incremental scope and price are calculated (original project not re-added)", () => {
    const p = priceChangeOrder({ lines: [{ kind: "add", cost: 1000 }], markupPct: 45, taxRatePct: 8.25 });
    expect(p.grossAddition).toBe(1450);
    expect(p.net).toBe(1450);
    expect(p.tax).toBe(119.63); // 119.625 half-up
    expect(p.total).toBe(1569.63);
  });

  it("uses the original markup and rounds half-up to cents", () => {
    expect(lineSell(0.1, 45)).toBe(0.15); // 0.145 → 0.15
    expect(lineSell(190, 45)).toBe(275.5);
  });

  it("credits reduce net but are reported separately", () => {
    const p = priceChangeOrder({ lines: [{ kind: "add", cost: 1000 }, { kind: "remove", cost: 200 }], markupPct: 50, taxRatePct: 10 });
    expect(p.grossAddition).toBe(1500);
    expect(p.credit).toBe(300);
    expect(p.net).toBe(1200);
    expect(p.total).toBe(1320);
  });

  it("Given an inherited discount, it is held (not applied) until the owner approves", () => {
    const held = priceChangeOrder({ lines: [{ kind: "add", cost: 1000 }], markupPct: 0, taxRatePct: 0, discountPct: 10 });
    expect(held.discount).toBe(0);
    expect(held.pendingDiscount).toBe(100);
    expect(held.net).toBe(1000);
    const approved = priceChangeOrder({ lines: [{ kind: "add", cost: 1000 }], markupPct: 0, taxRatePct: 0, discountPct: 10, discountApproved: true });
    expect(approved.net).toBe(900);
    expect(ownerApprovalCheck({ grossAddition: 100, credit: 0, discountRequested: true }).required).toBe(true);
  });

  it("Given labour cancelled 12 hours before the shift, the contractor absorbs it (not billed)", () => {
    const p = priceChangeOrder({ lines: [{ kind: "add", cost: 300, treatment: "absorbed_labour" }], markupPct: 45, taxRatePct: 8.25 });
    expect(p.total).toBe(0);
    expect(p.absorbedCost).toBe(300);
  });

  it("Given a change that strands tinted paint, the nonreturnable paint is billed on the change order", () => {
    const p = priceChangeOrder({ lines: [{ kind: "add", cost: 100, treatment: "stranded_paint" }], markupPct: 45, taxRatePct: 0 });
    expect(p.grossAddition).toBe(145);
  });

  it("Given a change order dated after a tax rate change, the new rate is applied", () => {
    const rates = [
      { ratePct: 8.25, effectiveFrom: "2020-01-01T00:00:00.000Z" },
      { ratePct: 8.5, effectiveFrom: "2026-09-16T00:00:00.000Z" },
    ];
    expect(taxRateOn("2026-09-23T15:00:00.000Z", rates)?.ratePct).toBe(8.5);
    expect(taxRateOn("2026-09-10T15:00:00.000Z", rates)?.ratePct).toBe(8.25);
  });
});

describe("24 — owner approval threshold", () => {
  it("Given a gross addition of $2,000 exactly, owner approval is not required by the threshold", () => {
    expect(ownerApprovalCheck({ grossAddition: 2000, credit: 0 }).required).toBe(false);
  });
  it("Given a gross addition of $2,000.01, owner approval is required", () => {
    expect(ownerApprovalCheck({ grossAddition: 2000.01, credit: 0 }).required).toBe(true);
  });
  it("Given a $3,000 addition and a $1,500 credit, the gross $3,000 governs and the credit does not offset it", () => {
    const p = priceChangeOrder({ lines: [{ kind: "add", cost: 3000 }, { kind: "remove", cost: 1500 }], markupPct: 0, taxRatePct: 0 });
    expect(p.net).toBe(1500);
    const check = ownerApprovalCheck({ grossAddition: p.grossAddition, credit: p.credit });
    expect(check.required).toBe(true);
    expect(check.reasons[0]).toMatch(/Gross addition/);
  });
  it("Given any credit, owner approval is required regardless of value", () => {
    expect(ownerApprovalCheck({ grossAddition: 0, credit: 0.01 }).required).toBe(true);
  });
});

describe("24 — deposit review (24.Q02)", () => {
  it("$30,000 original, +$4,000, −$1,000, proposed +$6,000 → $9,000 = 30%, threshold exceeded", () => {
    const r = depositReview({ originalValue: 30000, approvedNets: [4000, -1000], proposedNet: 6000, collected: 10000 });
    expect(r.cumulativeNet).toBe(9000);
    expect(r.pct).toBeCloseTo(0.3);
    expect(r.triggered).toBe(true);
  });
  it("same case with $10,000 collected → target one-third of $39,000 = $13,000, additional due $3,000", () => {
    const r = depositReview({ originalValue: 30000, approvedNets: [4000, -1000], proposedNet: 6000, collected: 10000 });
    expect(r.newContractTotal).toBe(39000);
    expect(r.target).toBe(13000);
    expect(r.due).toBe(3000);
  });
  it("exactly 25% does not trigger", () => {
    expect(depositReview({ originalValue: 10000, approvedNets: [2500], collected: 0 }).triggered).toBe(false);
  });
});

describe("24.3 — emergency work", () => {
  it("Given emergency work of $499, verbal approval is permitted", () => {
    expect(emergencyEligible(499)).toBe(true);
    expect(emergencyEligible(499.99)).toBe(true);
  });
  it("Given emergency work of exactly $500, verbal approval does not qualify", () => {
    expect(emergencyEligible(500)).toBe(false);
  });
  it("Given $499 with no same-day photographs, it is blocked and the missing evidence is named", () => {
    const now = "2026-06-01T15:00:00";
    const missing = missingEmergencyEvidence({ photos: 0, findings: "Rot", authoriser: "U-OWNER", customerMessageRef: "Text 3:02 pm", verbalAt: now }, now);
    expect(missing).toEqual(["photographs"]);
  });
  it("written confirmation is due within two working days (Mon → Wed), skipping weekends", () => {
    expect(addWorkingDays("2026-06-01T15:00:00", 2)).toBe("2026-06-03");
    expect(addWorkingDays("2026-06-05T15:00:00", 2)).toBe("2026-06-09"); // Fri → Tue
    expect(addWorkingDays("2026-09-04T15:00:00", 2)).toBe("2026-09-09"); // Labor Day skipped
  });
  it("Given written confirmation missing on day three, it is overdue (escalate, work stops)", () => {
    const verbal = "2026-06-01T15:00:00";
    expect(writtenConfirmationStatus(verbal, undefined, "2026-06-03T20:00:00").state).toBe("awaiting");
    expect(writtenConfirmationStatus(verbal, undefined, "2026-06-04T07:00:00").state).toBe("overdue");
    expect(writtenConfirmationStatus(verbal, "2026-06-02T10:00:00", "2026-06-10T07:00:00").state).toBe("confirmed");
  });
});

describe("24.2 — approval links", () => {
  const sent = "2026-06-01T10:00:00.000Z";
  const link = { version: 1, sentAt: sent, expiresAt: linkExpiry(sent) };
  it("Given an approval link 31 days old, it is expired", () => {
    expect(linkState(link, 1, "2026-07-02T10:00:00.000Z")).toBe("expired");
    expect(linkState(link, 1, "2026-06-30T10:00:00.000Z")).toBe("active");
  });
  it("Given a superseded link, it is blocked", () => {
    expect(linkState(link, 2, "2026-06-02T10:00:00.000Z")).toBe("superseded");
  });
  it("Given the signer on the customer record changes, a new link is required", () => {
    expect(linkState({ ...link, signerChanged: true }, 1, "2026-06-02T10:00:00.000Z")).toBe("signer_changed");
  });
  it("Given an undeliverable message, the office is flagged the same day and the owner after two working days", () => {
    const failed = "2026-06-01T10:00:00";
    expect(undeliverableStatus(failed, "2026-06-01T16:00:00")).toMatchObject({ flagged: true, escalate: false });
    expect(undeliverableStatus(failed, "2026-06-03T16:00:00").escalate).toBe(false);
    expect(undeliverableStatus(failed, "2026-06-04T08:00:00").escalate).toBe(true);
  });
});

describe("24 — dependent change orders", () => {
  it("Given a pending parent, the child is blocked with the parent named", () => {
    expect(dependencyBlock({ id: "CO-2026-1-03", status: "sent" })).toMatch("CO-2026-1-03");
  });
  it("A resolved parent (approved or rejected) no longer blocks", () => {
    expect(dependencyBlock({ id: "CO-2026-1-03", status: "approved" })).toBeNull();
    expect(dependencyBlock({ id: "CO-2026-1-03", status: "rejected" })).toBeNull();
  });
});

describe("24 — billing states and credits", () => {
  it("Given an addition to an already-sent invoice, a supplemental invoice is created", () => {
    expect(billingMode(500, "sent")).toBe("supplemental");
  });
  it("Given a negative change to a sent unpaid invoice, a credit note is created", () => {
    expect(billingMode(-500, "sent")).toBe("credit_note");
  });
  it("Draft invoices are updated in place", () => {
    expect(billingMode(500, "draft")).toBe("draft_update");
    expect(billingMode(-500, "draft")).toBe("draft_update");
  });
  it("Paid amounts default to account credit", () => {
    expect(billingMode(-500, "paid")).toBe("account_credit");
  });
  it("Given a credit raised on 1 June and a refund requested on 16 June, the window has closed", () => {
    expect(refundWindowCloses("2026-06-01T12:00:00.000Z")).toBe("2026-06-15");
    expect(refundAllowed("2026-06-01T12:00:00.000Z", "2026-06-16T12:00:00.000Z")).toBe(false);
    expect(refundAllowed("2026-06-01T12:00:00.000Z", "2026-06-15T12:00:00.000Z")).toBe(true);
  });
});

describe("24.4 — downstream recovery", () => {
  it("Given work order succeeded and billing failed, only billing is retried", () => {
    expect(actionsToRetry({ work_order: "done", materials: "done", scheduler: "done", billing: "failed" })).toEqual(["billing"]);
  });
  it("Given an action already succeeded, retry is unavailable", () => {
    expect(retryable("done")).toBe(false);
  });
});

describe("Rule 1 — Colour Re-approval boundary (24)", () => {
  const base: Selection = { brand: "SW", productLine: "Duration", colour: "SW 7015", sheen: "Satin", product: "Duration Ext", costPerGal: 82 };
  const ctx = { jobSigned: true, tintedOrOrdered: false, priceChanges: false };
  it("Given paint already tinted, a Colour Re-approval is rejected and a priced change order is required", () => {
    expect(classifyChange(base, { ...base, colour: "SW 7006" }, { ...ctx, tintedOrOrdered: true }).kind).toBe("change_order");
  });
  it("Given the sheen changes, a Colour Re-approval is rejected", () => {
    expect(classifyChange(base, { ...base, colour: "SW 7006", sheen: "Gloss" }, ctx).kind).toBe("change_order");
  });
  it("Given the price changes, a Colour Re-approval is rejected", () => {
    expect(classifyChange(base, { ...base, colour: "SW 7006" }, { ...ctx, priceChanges: true }).kind).toBe("change_order");
  });
});

describe("Numbering", () => {
  it("CO-2026-1-03: job number + 2-digit sequence", () => {
    expect(nextDocNumber("CO", "JOB-2026-1", ["CO-2026-1-01", "CO-2026-1-02"])).toBe("CO-2026-1-03");
    expect(nextDocNumber("CRA", "JOB-2026-1", ["CO-2026-1-01"])).toBe("CRA-2026-1-01");
    expect(nextDocNumber("CO", "JOB-2026-1", ["CO-2026-1-01", "CRA-2026-1-01", "CO-2026-1-02"])).toBe("CO-2026-1-03");
  });
});
