/**
 * Additions to the live app's types for the Lead Pipeline and marketing
 * (features 29 and 34). Ambient types, like the live apps/main/src/types
 * folder. Existing interfaces list NEW fields only.
 *
 * Unchanged live endpoints used as they are:
 *   GET /leads · POST /leads · PATCH /leads/{id}/status · POST /leads/{id}/notes
 *   POST /sales-calendar/appointments (Schedule Estimate)
 * NEW endpoints:
 *   GET  /leads/website-review                  (34) website leads + open reviews
 *   POST /leads/website-events                  (34) website form event, idempotent on eventRef
 *   POST /leads/{id}/website-review/resolve     (34) manual resolution, no merge
 *   POST /work-orders/{id}/attachments/{attId}/marketing   (34) copy photo to media library
 * NEW settings page: /settings/social-accounts, SETTINGS_PERMISSIONS: MARKETING_ACCESS (34, needs client confirmation).
 */

/* ------------------------------ types/leads.ts ------------------------------ */

/** Live LeadSource, plus the NEW source for leads opened from a qualified repaint alert (29). */
type LeadSourceNew = 'REPAINT_ALERT';

/** Live Lead — NEW fields only. */
interface Lead {
  /** NEW (29): the repaint follow-up working this lead. While it is open the
   *  lead's status follows it and PATCH /leads/{id}/status is refused (409). */
  followUp: {
    id: string;
    status: 'QUALIFIED' | 'CONTACTED' | 'ESTIMATE_REQUESTED' | 'ESTIMATE_SENT' | 'WON' | 'LOST' | 'DEFERRED' | 'DO_NOT_CONTACT';
    alertId: string;
    assignedUser: { id: string; firstName: string; lastName: string } | null;
    attemptsMade: number;
    nextAttemptAt: string | null;
  } | null;
  /** NEW (34): the website form event that created the lead (idempotency key). */
  eventRef: string | null;
  /** NEW (34): website events attached by the 90-day phone/email match. */
  websiteEvents: { ref: string; at: string; message: string; matchedOn: 'PHONE' | 'EMAIL' | null }[];
  /** NEW (34): phone matched one lead and email another. */
  review: { phoneMatchLeadId: string; emailMatchLeadId: string; status: 'OPEN' | 'RESOLVED'; resolution: string | null } | null;
  /** NEW (34): mandatory website fields that were missing. */
  missingFields: string[];
}

/**
 * NEW (29, decision D5): follow-up status → live LeadStatus.
 *   QUALIFIED → NEW · CONTACTED → CONTACTED · ESTIMATE_REQUESTED → SCHEDULED
 *   ESTIMATE_SENT → PENDING · WON → SOLD · LOST → LOST · DEFERRED / DO_NOT_CONTACT → ARCHIVED (+ reason)
 */
type FollowUpLeadStatusMap = Record<NonNullable<Lead['followUp']>['status'], 'NEW' | 'CONTACTED' | 'SCHEDULED' | 'PENDING' | 'SOLD' | 'LOST' | 'ARCHIVED'>;

/* ------------------------------ types/work-orders.ts (34) ------------------------------ */

/** Live WorkOrderAttachment — NEW field only. */
interface WorkOrderAttachment {
  /** NEW: the marketing media asset made from this photo ("Use in marketing"). */
  mediaAssetId: string | null;
}
