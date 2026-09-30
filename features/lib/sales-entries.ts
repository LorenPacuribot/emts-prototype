/**
 * Change orders as sales entries (RP-C3). Pure over the prototype Database:
 * each signed change order books its pre-tax net on the date the customer
 * signed, against the estimate of its job. The numbering and rounding live
 * in rules/sales-entries.ts.
 */
import type { ChangeOrder, Database } from "@/features/types";
import { byId } from "@/features/lib/selectors";
import { coPricing } from "@/features/lib/store/actions/change-orders";
import { lineLabourHours } from "@/features/lib/rules/change-order-effects";
import { changeOrderEntries, type SalesEntry } from "@/features/lib/rules/sales-entries";

/** Signed = approved by the customer (a dispute raised later keeps the signature). */
export const isSignedChangeOrder = (co: ChangeOrder) => !co.isColourReapproval && (co.status === "approved" || co.status === "disputed");

/**
 * Sales entries for every signed change order.
 * `numberOf` gives the estimate number shown in reports (the replica numbers its own estimates).
 */
export function changeOrderSalesEntries(db: Database, numberOf: (estimateId: string) => string = (id) => id): SalesEntry[] {
  return changeOrderEntries(
    db.changeOrders.filter(isSignedChangeOrder).flatMap((co) => {
      const job = byId(db.jobs, co.jobId);
      if (!job?.estimateId) return [];
      const est = byId(db.estimates, job.estimateId);
      return [{
        id: co.id, estimateId: job.estimateId, estimateNumber: numberOf(job.estimateId), estimatorId: est?.estimatorId,
        date: co.decidedAt ?? co.ownerApprovedAt ?? co.createdAt,
        net: coPricing(db, co).net,
        hours: co.lines.reduce((s, l) => s + lineLabourHours(db, l), 0),
      }];
    }),
  );
}

/** The entry one change order booked, if any. */
export function changeOrderEntry(db: Database, coId: string): SalesEntry | undefined {
  return changeOrderSalesEntries(db).find((x) => x.versionRef === coId);
}
