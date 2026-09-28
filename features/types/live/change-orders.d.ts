/**
 * NEW file for the live app: apps/main/src/types/change-orders.ts (feature 24).
 * Ambient types, the same style as the live types folder.
 *
 * Endpoints (NEW):
 *   GET    /estimates/:id/change-orders                 ChangeOrderSummary[]
 *   POST   /estimates/:id/change-orders                 CreateChangeOrderDto
 *   GET    /change-orders/:id                           ChangeOrderDetail
 *   PATCH  /change-orders/:id                           header (title, type)
 *   POST   /change-orders/:id/lines · PATCH/DELETE /change-orders/:id/lines/:lineId
 *   POST   /change-orders/:id/submit                    internal approval (owner above the threshold)
 *   POST   /change-orders/:id/owner-approve · /owner-return
 *   POST   /change-orders/:id/verify-recipient          authorised signer check
 *   POST   /change-orders/:id/send                      { channel } — creates a one-version link (Rule 4: a person presses Send)
 *   POST   /change-orders/:id/reissue-link
 *   POST   /change-orders/:id/record-approval · /record-rejection · /record-dispute   (office records a reply)
 *   POST   /change-orders/:id/split · /emergency · /written-confirmation
 *   POST   /change-orders/:id/downstream/:key/retry · /reconcile
 *   GET    /public/change-orders/:linkToken             shown on /estimates/view/[token]
 *   POST   /public/change-orders/:linkToken/decide      { decision, signerName, signatureImage?, reason? }
 * Document numbering: DocumentNumberingConfig.entityType gains 'CHANGE_ORDER' and 'COLOR_REAPPROVAL'.
 * Invoices: InvoiceType gains 'SUPPLEMENTAL' and 'CREDIT_NOTE' (types/invoices.ts).
 * Automated messages: "Change order sent" and "Change order approved" templates (Rule 4).
 */

type ChangeOrderType = 'ADDITION' | 'DELETED_ROOM' | 'CREDIT' | 'QUANTITY_REDUCTION' | 'PRODUCT_SUBSTITUTION' | 'NO_COST_COLOUR_CHANGE';

type ChangeOrderStatus = 'DRAFT' | 'PENDING_INTERNAL' | 'READY_TO_SEND' | 'SENT' | 'APPROVED' | 'REJECTED' | 'DISPUTED';

type ChangeOrderDownstreamKey = 'WORK_ORDER' | 'MATERIALS' | 'SCHEDULER' | 'BILLING';

interface ChangeOrderLine {
  id: string;
  kind: 'ADD' | 'REMOVE';
  description: string;
  sqft: number | null;
  /** Cost before markup. */
  cost: number;
  paintProductId: string | null;
  paintColorId: string | null;
  estimateSurfaceId: string | null;
  treatment: 'BILLABLE' | 'STRANDED_PAINT' | 'ABSORBED_LABOUR';
}

interface ChangeOrderApprovalLink {
  id: string;
  version: number;
  recipientName: string;
  recipient: string;
  channel: 'PORTAL' | 'EMAIL';
  sentAt: string;
  expiresAt: string;
  supersededAt: string | null;
  delivery: 'DELIVERED' | 'UNDELIVERABLE';
  signerChanged: boolean;
}

interface ChangeOrderApprovalEvidence {
  version: number;
  signerName: string;
  channel: 'PORTAL' | 'EMAIL' | 'VERBAL';
  /** Portal signature ID or email reply reference. */
  ref: string;
  at: string;
  recordedBy: { id: string; name: string } | null;
}

interface ChangeOrderPricing {
  grossAddition: number;
  credit: number;
  net: number;
  tax: number;
  total: number;
}

interface ChangeOrderSummary {
  id: string;
  changeOrderNumber: string; // CO-2026-1-01
  version: number;
  title: string;
  type: ChangeOrderType;
  status: ChangeOrderStatus;
  parentId: string | null;
  /** Hidden (null) for roles without ESTIMATE_VIEW_FINANCIALS. */
  pricing: ChangeOrderPricing | null;
  sentAt: string | null;
  linkExpiresAt: string | null;
  isColourReapproval: boolean;
  emergency: boolean;
  createdAt: string;
}

interface ChangeOrderDetail extends ChangeOrderSummary {
  estimateId: string;
  jobId: string;
  workOrderId: string | null;
  lines: ChangeOrderLine[];
  markupPercent: number;
  taxRate: number;
  taxDate: string;
  ownerApprovedBy: { id: string; name: string } | null;
  ownerApprovedAt: string | null;
  recipientVerified: boolean;
  links: ChangeOrderApprovalLink[];
  evidence: ChangeOrderApprovalEvidence | null;
  rejection: { signerName: string; reason: string; at: string } | null;
  dispute: { note: string; at: string } | null;
  downstream: Record<ChangeOrderDownstreamKey, 'NOT_STARTED' | 'DONE' | 'FAILED'>;
  billing: { mode: 'DRAFT_UPDATE' | 'SUPPLEMENTAL' | 'CREDIT_NOTE' | 'ACCOUNT_CREDIT' | 'NONE'; invoiceId: string | null; amount: number } | null;
  depositReview: { cumulativeNet: number; percent: number; target: number; collected: number; due: number } | null;
  colourChange: { specLineId: string; fromColour: string; toColour: string } | null;
}

interface CreateChangeOrderDto {
  type: ChangeOrderType;
  title: string;
  /** Parent change order when this one depends on another. */
  parentId?: string;
  emergency?: boolean;
}
