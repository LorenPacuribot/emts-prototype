import { describe, expect, it } from "vitest";
import { amendBlockedReason, changeOrderAllowed, customerCanAccept, depositAmount, firstWorkOrderStatus, isEditable, leadEligibleForEstimate } from "./estimate-lifecycle";

describe("Estimate lifecycle — live rules kept", () => {
  it("only Draft and Editing Amendment are editable in place", () => {
    expect(isEditable("DRAFT")).toBe(true);
    expect(isEditable("AMENDED_DRAFT")).toBe(true);
    expect(isEditable("SENT")).toBe(false);
    expect(isEditable("PENDING_REAPPROVAL")).toBe(false);
  });

  it("the customer can accept Sent, Viewed and Awaiting Re-approval estimates", () => {
    expect(customerCanAccept("SENT")).toBe(true);
    expect(customerCanAccept("VIEWED")).toBe(true);
    expect(customerCanAccept("PENDING_REAPPROVAL")).toBe(true);
    expect(customerCanAccept("DRAFT")).toBe(false);
    expect(customerCanAccept("ACCEPTED")).toBe(false);
  });

  it("an estimate needs a Scheduled lead that has no estimate yet", () => {
    expect(leadEligibleForEstimate({ stage: "estimate_scheduled" })).toBeUndefined();
    expect(leadEligibleForEstimate({ stage: "contacted" })).toMatch("Estimate Scheduled");
    expect(leadEligibleForEstimate({ stage: "estimate_scheduled", estimateId: "EST-1" })).toMatch("already has an estimate");
  });

  it("deposit follows the deposit percent; 0% skips Pending Deposit", () => {
    expect(depositAmount(12480, 33.33)).toBe(4159.58);
    expect(firstWorkOrderStatus(33.33)).toBe("PENDING_DEPOSIT");
    expect(firstWorkOrderStatus(0)).toBe("UNSCHEDULED");
  });
});

describe("Feature 24 — when amendment stops (decision D4)", () => {
  it("Amend is allowed on an approved estimate before work starts", () => {
    expect(amendBlockedReason({ status: "ACCEPTED" }, "PENDING_DEPOSIT")).toBeUndefined();
    expect(amendBlockedReason({ status: "ACCEPTED" }, "SCHEDULED")).toBeUndefined();
  });

  it("Amend is blocked once the work order is In Progress or Completed", () => {
    expect(amendBlockedReason({ status: "ACCEPTED" }, "IN_PROGRESS")).toMatch("Create Change Order");
    expect(amendBlockedReason({ status: "ACCEPTED" }, "COMPLETED")).toMatch("Create Change Order");
  });

  it("an unsigned estimate is edited, not amended or change-ordered", () => {
    expect(amendBlockedReason({ status: "SENT" })).toBeDefined();
    expect(changeOrderAllowed({ status: "SENT" })).toBe(false);
    expect(changeOrderAllowed({ status: "ACCEPTED" })).toBe(true);
  });
});
