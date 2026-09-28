/**
 * Additions to the live app's apps/main/src/types/work-orders.ts
 * (features 3, 18, 19, 22, 24 and 25 on /work-orders/[id]).
 * Existing interfaces list only the NEW fields to add.
 *
 * Endpoints (NEW):
 *   GET   /work-orders/:id/material-demand            MaterialDemandLine[]  (18)
 *   POST  /work-orders/:id/material-demand/recalculate                        (18)
 *   POST  /work-orders/:id/material-demand/:specLineId/adjustments           (18, office approval above 10%)
 *   GET   /work-orders/:id/paint-orders · POST /work-orders/:id/paint-orders (18 "Generate Paint Order")
 *   GET   /paint-orders/:id · POST /paint-orders/:id/send · /acknowledge · /receipts · /cancel · /returns  (19)
 *   POST  /work-orders/:id/closeout/rows/:surfaceId    CloseoutRowDto (25, crew lead confirms)
 *   POST  /work-orders/:id/closeout/confirm-matching   { completedAt }         (25)
 *   POST  /work-orders/:id/closeout/close              { customerAcceptedAt? } (25, office manager; sets COMPLETED)
 * Existing endpoints that change:
 *   POST  /work-orders/:id/time-entries — accepts memberId, workDate, startTime, endTime (22)
 *   PATCH /work-orders/:id/status — COMPLETED is refused; use closeout/close (25)
 */

/** Live WODetail — NEW fields only. */
interface WODetail {
  /** NEW (25): closeout progress, shown as "Closeout 3/5 surfaces confirmed". */
  closeout: { rows: WOCloseoutRow[]; confirmedCount: number; blockers: { estimateSurfaceId: string; missing: string[] }[] } | null;
  /** NEW (24): open change orders on this job (chip in the header). */
  openChangeOrderCount: number;
  /** NEW (18): demand and orders for the Materials and Paint Orders sections. */
  materialDemand: MaterialDemandLine[];
  paintOrders: PaintOrderSummary[];
}

/** Live WOPaintColor — NEW fields only (3, 18). */
interface WOPaintColor {
  /** NEW (3): ordering is blocked until every spec line is APPROVED. */
  approvalStatuses: PaintSpecApprovalStatus[];
  /** NEW (18): Rule 2 balance, gallons. */
  outstandingGallons: number;
  orderableNowGallons: number;
}

/** Live WOTimeEntry — NEW fields only (22). */
interface WOTimeEntry {
  /** NEW: the crew member the hours are for (live: always loggedBy). */
  member: WOCrewMember | null;
  /** NEW: work date (YYYY-MM-DD); may be in the past, never the future. */
  workDate: string;
  /** NEW: the clock segment, when start and end were entered or the crew was clocked in on site. */
  timeSegmentId: string | null;
  /** NEW: payroll state of that member's day; APPROVED, LOCKED and PAID entries can't be edited. */
  payrollState: 'OPEN' | 'SUBMITTED' | 'APPROVED' | 'LOCKED' | 'PAID' | null;
}

/** Live create body for POST /work-orders/:id/time-entries — NEW fields only (22). */
interface CreateWOTimeEntryDto {
  memberId?: string;
  workDate?: string;
  /** "HH:MM". With both, a clock segment is created for payroll approval. */
  startTime?: string;
  endTime?: string;
}

/** NEW (25): one surface's closeout confirmation. */
interface WOCloseoutRow {
  estimateSurfaceId: string;
  specLineId: string | null;
  painted: boolean;
  notPaintedReason: string | null;
  brandName: string;
  colorName: string;
  colorCode: string;
  productName: string;
  finishName: string | null;
  coats: number | null;
  /** Required: the repaint clock (27) starts here. */
  completedAt: string | null;
  /** Optional actuals: null means "Not recorded", never zero. */
  actualHours: number | null;
  actualGallons: number | null;
  photoCount: number | null;
  tintFormula: string | null;
  unknowns: { field: 'COLOR' | 'SHEEN' | 'COMPLETED_AT'; kind: 'LEGACY' | 'SUBCONTRACTOR'; approvedBy: { id: string; name: string }; reason: string }[];
  confirmedBy: { id: string; name: string } | null;
  confirmedAt: string | null;
}

/** NEW (18): one specification line's demand (coverage → waste → packing, Rule 6 rounding). */
interface MaterialDemandLine {
  specLineId: string;
  paintColorId: string;
  paintProductId: string | null;
  measuredSqft: number;
  coatSqft: number;
  coverageRate: number;
  coverageSource: 'OVERRIDE' | 'FIELD_RATE' | 'MANUFACTURER' | 'CONDITION_RULE' | 'MISSING';
  wastePercent: number;
  /** base × (1 + waste), rounded once to 3 decimals. */
  calculatedGallons: number;
  /** An approved adjustment, else calculatedGallons. */
  needGallons: number;
  containers: ContainerBreakdownItem[];
  /** Rule 2 states. */
  reservedShelf: number;
  sentUnacknowledged: number;
  acknowledgedNet: number;
  received: number;
  outstanding: number;
  orderableNow: number;
  /** Reasons the line can't be ordered; empty means orderable. */
  blocked: string[];
}

type PaintOrderStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'ISSUED' | 'SENT' | 'ACKNOWLEDGED' | 'READY_FOR_PICKUP' | 'PICKED_UP' | 'PARTIALLY_FILLED' | 'PROBLEM' | 'CANCELLED';

/** NEW (18, 19): a supplier paint order raised from the work order. */
interface PaintOrderSummary {
  id: string;
  paintOrderNumber: string; // JOB-2026-1-PO-01 (DocumentNumberingConfig 'PURCHASE_ORDER')
  status: PaintOrderStatus;
  supplier: { id: string; name: string };
  branch: { id: string; name: string; storeNumber: string } | null;
  phase: string;
  deliveryDate: string | null;
  fulfilment: 'PICKUP' | 'DELIVERY';
  sendMethod: 'PRINT' | 'EMAIL' | 'PHONE' | null;
  sentAt: string | null;
  /** Evidence of the send: stored email copy, printed-by, or call notes. */
  sentEvidence: string | null;
  acknowledgedAt: string | null;
  acknowledgementRef: string | null;
  /** Hidden (null) for roles without SUPPLIER_PRICE_VIEW. */
  total: number | null;
  lines: { id: string; specLineId: string | null; description: string; gallons: number; containers: ContainerBreakdownItem[]; status: PaintOrderStatus; receivedGallons: number; supplierStatusText: string | null }[];
}
