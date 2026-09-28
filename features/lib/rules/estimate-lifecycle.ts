/**
 * Estimate lifecycle rules shared by the estimate page, the public page and
 * the work order. Pure functions, so they are tested on their own.
 */
import type { Estimate, EstimateStatus, Lead, WorkOrderStatus } from "@/features/types";
import { roundMoney } from "./rounding";

/** Live FinancialSettings.depositPercent default (Settings › Financial Settings). */
export const DEFAULT_DEPOSIT_PERCENT = 33.33;

/** Live display labels (project-toolbar.tsx STATUS_DISPLAY). */
export const ESTIMATE_STATUS_LABEL: Record<EstimateStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  VIEWED: "Viewed",
  ACCEPTED: "Approved",
  AMENDED_DRAFT: "Editing Amendment",
  PENDING_REAPPROVAL: "Awaiting Re-approval",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

export const ESTIMATE_STATUS_TONE: Record<EstimateStatus, "gray" | "blue" | "green" | "amber" | "red"> = {
  DRAFT: "gray",
  SENT: "blue",
  VIEWED: "blue",
  ACCEPTED: "green",
  AMENDED_DRAFT: "amber",
  PENDING_REAPPROVAL: "amber",
  DECLINED: "red",
  EXPIRED: "gray",
};

/** Live read-only rule: only DRAFT and AMENDED_DRAFT are editable in place. */
export function isEditable(status: EstimateStatus): boolean {
  return status === "DRAFT" || status === "AMENDED_DRAFT";
}

/** Live canAccept on the public page. */
export function customerCanAccept(status: EstimateStatus): boolean {
  return status === "SENT" || status === "VIEWED" || status === "PENDING_REAPPROVAL";
}

/**
 * NEW (feature 24, decision D4 — needs client confirmation):
 * "Amend Estimate" stays available until work starts. Once the work order is
 * In Progress or Completed, signed-scope changes go through a change order.
 * Returns the reason Amend is blocked, or undefined when it is allowed.
 */
export function amendBlockedReason(estimate: Pick<Estimate, "status">, woStatus?: WorkOrderStatus): string | undefined {
  if (estimate.status !== "ACCEPTED" && estimate.status !== "PENDING_REAPPROVAL") return "Only an approved estimate can be amended.";
  if (woStatus === "IN_PROGRESS" || woStatus === "COMPLETED") return "Work has started. Use Create Change Order for changes to the signed scope.";
  return undefined;
}

/**
 * A change order is for a signed scope. It is offered once the estimate is
 * approved; while the job is still before production, Amend is also offered.
 */
export function changeOrderAllowed(estimate: Pick<Estimate, "status">): boolean {
  return estimate.status === "ACCEPTED";
}

/** Live rule: an estimate starts from a lead that is Scheduled and not yet linked (LeadEligibleForEstimate). */
export function leadEligibleForEstimate(lead: Pick<Lead, "stage" | "estimateId">): string | undefined {
  if (lead.estimateId) return "This lead already has an estimate. Each estimate comes from its own lead.";
  if (lead.stage !== "estimate_scheduled") return "The lead must be Estimate Scheduled first. Schedule the estimate appointment on the lead.";
  return undefined;
}

/** Deposit invoice amount on acceptance. 0% means no deposit and the work order skips Pending Deposit. */
export function depositAmount(total: number, depositPercent = DEFAULT_DEPOSIT_PERCENT): number {
  return roundMoney((total * depositPercent) / 100);
}

export function firstWorkOrderStatus(depositPercent = DEFAULT_DEPOSIT_PERCENT): WorkOrderStatus {
  return depositPercent > 0 ? "PENDING_DEPOSIT" : "UNSCHEDULED";
}
