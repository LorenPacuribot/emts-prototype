import type { Database, PipelineStage, Property } from "@/features/types";

/**
 * A contact's service locations. In the live app they are rows under the
 * customer (ServiceLocationResponse); the prototype keeps them as
 * properties, owned through the current ownership period (feature 25).
 */
export function contactLocations(db: Database, customerId: string): Property[] {
  return db.properties.filter((p) => !p.mergedInto && (p.ownership.find((o) => !o.end) ?? p.ownership[p.ownership.length - 1])?.customerId === customerId);
}

/** Addresses this contact owned before (their history stays with the address). */
export function formerLocations(db: Database, customerId: string): Property[] {
  return db.properties.filter((p) => p.ownership.some((o) => o.customerId === customerId && o.end));
}

/** Live LEAD_STATUS_DISPLAY_NAMES for the prototype's lead stages. */
export const LEAD_STAGE: Record<PipelineStage, string> = {
  new_lead: "New",
  contacted: "Contacted",
  estimate_scheduled: "Estimate Scheduled",
  pending: "Pending",
  sold: "Sold",
  lost: "Lost",
  archived: "Archived",
};
