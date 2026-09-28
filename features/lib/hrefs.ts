import { getDb } from "@/features/lib/store";
/**
 * Links to the live app's screens.
 *
 * Merged into the replica: every helper points at the replica's own
 * [id] routes, which host the feature sections. Each helper names the live
 * route it stands for.
 */

/** /estimates/[id] */
export const estimateHref = (id: string, hash?: string) => `/estimates/${encodeURIComponent(id)}${hash ? `#${hash}` : ""}`;
/** /estimates/[id]/history */
export const estimateHistoryHref = (id: string) => `/estimates/${encodeURIComponent(id)}/history`;
/** /estimates/view/[token] (public) */
export const publicEstimateHref = (token: string) => `/estimates/view?token=${token}`;
/** /work-orders/[id] */
export const workOrderHref = (id: string, hash?: string) => `/work-orders/${encodeURIComponent(id)}${hash ? `#${hash}` : ""}`;
/** /jobs/[id] */
export const jobDetailHref = (id: string) => `/jobs/${encodeURIComponent(id)}`;
/** /contacts/[id]?tab= */
export const contactHref = (id: string, tab?: string, extra?: Record<string, string>) => {
  const q = new URLSearchParams({ ...(tab ? { tab } : {}), ...(extra ?? {}) }).toString();
  return `/contacts/${encodeURIComponent(id)}${q ? `?${q}` : ""}`;
};
/** /leads/[id] */
export const leadHref = (id: string) => `/leads/${encodeURIComponent(id)}`;
/** /invoices/[id] */
export const invoiceHref = (id: string) => `/invoices/${encodeURIComponent(id)}`;
/** /reports?tab= */
export const reportsHref = (tab?: string) => `/reports${tab ? `?tab=${tab}` : ""}`;
/** /settings/<page> */
export const settingsHref = (page: string) => `/settings/${page}`;

/**
 * Where the prototype's old job tabs now live in the live app. The live
 * /jobs/[id] page has no tabs: materials and closeout are on the work order,
 * the colour card, scope and change orders are on the estimate.
 */
export type JobLink = "overview" | "color-card" | "change-orders" | "surfaces" | "materials" | "closeout" | "activity";

export function jobHref(jobId: string, tab: JobLink = "overview"): string {
  const db = getDb();
  const job = db.jobs.find((j) => j.id === jobId);
  const wo = db.workOrders.find((w) => w.jobId === jobId);
  switch (tab) {
    case "color-card":
      return job?.estimateId ? estimateHref(job.estimateId, "section-paint-card") : jobDetailHref(jobId);
    case "change-orders":
      return job?.estimateId ? estimateHref(job.estimateId, "section-change-orders") : jobDetailHref(jobId);
    case "surfaces":
      return job?.estimateId ? estimateHref(job.estimateId, "section-scope") : jobDetailHref(jobId);
    case "materials":
      return wo ? workOrderHref(wo.id, "section-materials") : job?.estimateId ? estimateHref(job.estimateId, "section-materials") : jobDetailHref(jobId);
    case "closeout":
      return wo ? workOrderHref(wo.id) : jobDetailHref(jobId);
    default:
      // A job still being estimated has no live job page: open its estimate.
      return job?.status === "estimating" && job.estimateId ? estimateHref(job.estimateId) : jobDetailHref(jobId);
  }
}

/**
 * Where the prototype's old Properties pages now live. A property is the live
 * ServiceLocation, so its paint history is a NEW tab on the owner's contact
 * page (/contacts/[id]?tab=paint-history), filtered by location.
 */
export type PropertyLink = "history" | "ownership" | "qr-links" | "new-estimate" | "reorders";
const PAINT_HISTORY_VIEW: Record<PropertyLink, string> = { history: "history", ownership: "owners", "qr-links": "qr", "new-estimate": "history", reorders: "reorders" };

export function propertyHref(propertyId: string, tab: PropertyLink = "history", extra = ""): string {
  const db = getDb();
  const p = db.properties.find((x) => x.id === propertyId);
  const period = p ? p.ownership.find((o) => !o.end) ?? p.ownership[p.ownership.length - 1] : undefined;
  const extras = Object.fromEntries(new URLSearchParams(extra.replace(/^&/, "")));
  // A repeat estimate is a normal estimate now: open it.
  if (tab === "new-estimate" && extras.rep) {
    const rep = db.repeatEstimates.find((r) => r.id === extras.rep);
    if (rep?.estimateId) return estimateHref(rep.estimateId, "section-from-history");
  }
  if (!period) return "/contacts";
  return contactHref(period.customerId, "paint-history", { location: propertyId, view: PAINT_HISTORY_VIEW[tab], ...extras });
}
