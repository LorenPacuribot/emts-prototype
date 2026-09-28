/**
 * Additions to the live app's apps/main/src/types/estimates.ts
 * (features 3 and 24). Ambient types, the same style as the live file.
 *
 * - Interfaces that exist in the live file list only the fields the new
 *   features touch; everything marked NEW is to be added to that interface.
 * - Interfaces marked NEW are new.
 *
 * Endpoints (NEW):
 *   GET    /estimates/:id/paint-colors/:colorId/spec-lines
 *   POST   /estimates/:id/paint-colors/:colorId/spec-lines
 *   PATCH  /estimates/:id/paint-colors/:colorId/spec-lines/:specLineId     (Rule 1 check on a signed scope)
 *   DELETE /estimates/:id/paint-colors/:colorId/spec-lines/:specLineId     (blocked while referenced)
 *   POST   /estimates/:id/paint-colors/:colorId/sample-rounds
 *   PATCH  /estimates/:id/paint-colors/:colorId/sample-rounds/:roundId      ({ outcome })
 *   POST   /estimates/:id/color-approvals                                    (send specs for approval)
 *   POST   /estimates/:id/color-approvals/:approvalId/reply                  (record the customer's reply)
 *   POST   /estimates/:id/color-card/versions                                (create card version)
 *   GET    /estimates/:id/color-card/print?layout=crew|customer
 * Existing endpoints that change:
 *   POST /public/estimates/:token/accept — also approves every complete
 *        spec line and stores the signature as its approval evidence.
 *   POST /estimates/:id/amend — refused once the work order is IN_PROGRESS
 *        or COMPLETED (decision D4, needs client confirmation).
 */

/** NEW: approval state of one specification line (feature 3). */
type PaintSpecApprovalStatus = 'DRAFT' | 'PENDING_SAMPLE' | 'SENT' | 'APPROVED' | 'SUPERSEDED';

/** NEW: one way a colour is applied (primer + finish on a surface group). */
interface EstimatePaintSpecLineResponse {
  id: string;
  paintColorId: string;
  paintProductId: string | null;
  finishId: string | null;
  productName: string | null;
  finishName: string | null;
  coats: number | null;
  /** Required before approval. "No primer, existing coating sound" is a valid choice; blank is not. */
  primer: string | null;
  coatSequence: string[];
  /** EstimateAreaSurfaceResponse.id values. A surface sits on one spec line only. */
  surfaceIds: string[];
  /** Required before ordering. */
  tintBase: string | null;
  lifespanYears: number;
  lifespanLocked: boolean;
  approvalStatus: PaintSpecApprovalStatus;
  approvedCardVersion: number | null;
  /** Set when a work order, material calculation or paint history uses the line (removal is blocked). */
  referencedBy: ('WORK_ORDER' | 'MATERIAL_CALC' | 'HISTORY')[];
  createdAt: string;
  updatedAt: string;
}

/** NEW: custom colour match sample rounds (feature 3). */
interface EstimatePaintSampleRound {
  id: string;
  round: number;
  date: string;
  deliveredBy: { id: string; name: string };
  outcome: 'ACCEPTED' | 'REJECTED' | null;
  note: string | null;
}

/** NEW: approval evidence for a set of spec lines (feature 3). */
interface EstimateColorApprovalResponse {
  id: string;
  cardVersion: number;
  specLineIds: string[];
  channel: 'ESTIMATE_SIGNATURE' | 'EMAIL' | 'PORTAL';
  status: 'SENT' | 'APPROVED';
  sentAt: string;
  sentBy: { id: string; name: string };
  signerName: string | null;
  approvedAt: string | null;
  /** Email sender address, portal signature ID, or the estimate signature. */
  evidenceRef: string | null;
}

/** Live EstimatePaintColorResponse — NEW fields only. */
interface EstimatePaintColorResponse {
  /** NEW: manufacturer colour code, e.g. "SW 7015" (colorNumber stays the #1, #2 sequence). */
  colorCode: string;
  /** NEW: swatch. */
  hex: string | null;
  /** NEW: a custom match needs an accepted sample round before its spec lines can be approved. */
  customMatch: boolean;
  sampleRef: string | null;
  /** NEW: the spec lines. The live paintProductId / finishId become the first line. */
  specLines: EstimatePaintSpecLineResponse[];
  sampleRounds: EstimatePaintSampleRound[];
}

/** Live EstimateResponse — NEW fields only. */
interface EstimateResponse {
  /** NEW (3): current colour card version; earlier versions are read-only snapshots. */
  colorCardVersion: number;
  colorApprovals: EstimateColorApprovalResponse[];
  /** NEW (3): open banners where an approved selection changed after ordering. */
  colorCommitmentFlags: { id: string; specLineId: string; purchaseOrderId: string | null; message: string; responsibleUser: { id: string; name: string }; storeCallConfirmedAt: string | null }[];
  /** NEW (24): why "Amend Estimate" is disabled, or null when allowed. */
  amendBlockedReason: string | null;
  /** NEW (24): change orders raised against this signed estimate. */
  changeOrders: ChangeOrderSummary[];
}

/** Live EstimateHistoryEntry.trigger gains the change-order events (NEW, feature 24). */
type EstimateHistoryTrigger =
  | 'CREATED' | 'UPDATED' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'DECLINED' | 'AMENDMENT_OPENED' | 'SENT_FOR_REAPPROVAL' | 'MANUAL_APPROVED' | 'EXPIRED'
  | 'CHANGE_ORDER_CREATED' | 'CHANGE_ORDER_SENT' | 'CHANGE_ORDER_APPROVED' | 'CHANGE_ORDER_REJECTED';

/** Live EstimateHistoryEntry — NEW fields only. */
interface EstimateHistoryEntry {
  /** NEW (24): set on the change-order triggers. */
  changeOrderId: string | null;
  changeOrderNumber: string | null;
}
