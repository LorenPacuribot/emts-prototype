/** Label + badge tone for every status in the app, in one place. */
import type { Tone } from "@/features/components/ui/badge";

type Meta = { label: string; tone: Tone };

export const JOB_STATUS: Record<string, Meta> = {
  estimating: { label: "Estimating", tone: "gray" },
  unscheduled: { label: "Unscheduled", tone: "gray" },
  confirmed: { label: "Confirmed", tone: "indigo" },
  scheduled: { label: "Scheduled", tone: "blue" },
  in_production: { label: "In Production", tone: "purple" },
  touch_up: { label: "Touch Up", tone: "pink" },
  ready_for_inspection: { label: "Ready for Inspection", tone: "amber" },
  completed: { label: "Completed", tone: "green" },
};

export const SPEC_STATE: Record<string, Meta> = {
  draft: { label: "Draft", tone: "gray" },
  pending_sample: { label: "Pending sample", tone: "amber" },
  sent: { label: "Sent for approval", tone: "blue" },
  approved: { label: "Approved", tone: "green" },
  superseded: { label: "Superseded", tone: "gray" },
};

export const PO_STATUS: Record<string, Meta> = {
  preliminary: { label: "Preliminary", tone: "gray" },
  draft: { label: "Draft", tone: "gray" },
  pending_approval: { label: "Pending approval", tone: "amber" },
  issued: { label: "Issued", tone: "indigo" },
  sent: { label: "Sent", tone: "blue" },
  acknowledged: { label: "Acknowledged", tone: "purple" },
  received: { label: "Received by supplier", tone: "purple" },
  processing: { label: "Processing", tone: "blue" },
  substitute_available: { label: "Substitute available", tone: "amber" },
  ready_for_pickup: { label: "Ready for pickup", tone: "green" },
  picked_up: { label: "Fulfilled (picked up / delivered)", tone: "green" },
  partially_filled: { label: "Partially filled", tone: "amber" },
  problem: { label: "Problem", tone: "red" },
  cancelled: { label: "Canceled", tone: "gray" },
  open: { label: "Open", tone: "gray" },
};

export const CO_STATUS: Record<string, Meta> = {
  draft: { label: "Draft", tone: "gray" },
  pending_internal: { label: "Owner approval", tone: "amber" },
  ready_to_send: { label: "Ready to send", tone: "indigo" },
  sent: { label: "Sent to customer", tone: "blue" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  disputed: { label: "Disputed", tone: "red" },
};

export const FOLLOWUP_STATUS: Record<string, Meta> = {
  qualified: { label: "Qualified", tone: "indigo" },
  contacted: { label: "Contacted", tone: "blue" },
  estimate_requested: { label: "Estimate requested", tone: "purple" },
  estimate_sent: { label: "Estimate sent", tone: "purple" },
  won: { label: "Won", tone: "green" },
  lost: { label: "Lost", tone: "red" },
  deferred: { label: "Deferred", tone: "amber" },
  do_not_contact: { label: "Do not contact", tone: "dark" },
};

export const ALERT_OUTCOME: Record<string, Meta> = {
  open: { label: "Open", tone: "blue" },
  contacted: { label: "Contacted", tone: "indigo" },
  snoozed: { label: "Snoozed", tone: "amber" },
  dismissed: { label: "Dismissed", tone: "gray" },
  converted: { label: "Converted", tone: "green" },
};

/** Live estimate statuses (project-toolbar.tsx STATUS_DISPLAY). */
export const ESTIMATE_STATUS: Record<string, Meta> = {
  DRAFT: { label: "Draft", tone: "gray" },
  SENT: { label: "Sent", tone: "blue" },
  VIEWED: { label: "Viewed", tone: "blue" },
  ACCEPTED: { label: "Approved", tone: "green" },
  AMENDED_DRAFT: { label: "Editing Amendment", tone: "amber" },
  PENDING_REAPPROVAL: { label: "Awaiting Re-approval", tone: "amber" },
  DECLINED: { label: "Declined", tone: "red" },
  EXPIRED: { label: "Expired", tone: "gray" },
};

export const INVOICE_STATUS: Record<string, Meta> = {
  draft: { label: "Draft", tone: "gray" },
  sent: { label: "Sent", tone: "blue" },
  paid: { label: "Paid", tone: "green" },
  void: { label: "Void", tone: "gray" },
};

export const TOUCHUP_STATUS: Record<string, Meta> = {
  new: { label: "New", tone: "blue" },
  acknowledged: { label: "Acknowledged", tone: "indigo" },
  converted: { label: "Converted to job", tone: "green" },
  closed: { label: "Closed", tone: "gray" },
};

export const PREDECESSOR_CONSENT: Record<string, Meta> = {
  not_requested: { label: "Consent pending", tone: "amber" },
  granted: { label: "Seller consent granted", tone: "green" },
  refused: { label: "Seller refused", tone: "red" },
  unreachable_spec_only: { label: "Specification-only (unreachable)", tone: "indigo" },
};

export const STRUCTURE_REQUEST_STATUS: Record<string, Meta> = {
  pending: { label: "Awaiting owner approval", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
};

/* Feature 24 — change orders */
export const CO_TYPE: Record<string, Meta> = {
  addition: { label: "Addition", tone: "blue" },
  deleted_room: { label: "Deleted room", tone: "pink" },
  credit: { label: "Credit", tone: "pink" },
  quantity_reduction: { label: "Quantity reduction", tone: "pink" },
  product_substitution: { label: "Product substitution", tone: "purple" },
  no_cost_colour_change: { label: "No-cost color change", tone: "indigo" },
};

export const CO_DOWNSTREAM: Record<string, Meta> = {
  not_started: { label: "Not started", tone: "gray" },
  done: { label: "Done", tone: "green" },
  failed: { label: "Failed", tone: "red" },
};

export const CO_LINK_STATE: Record<string, Meta> = {
  active: { label: "Active", tone: "blue" },
  expired: { label: "Expired", tone: "amber" },
  superseded: { label: "Superseded", tone: "gray" },
  signer_changed: { label: "Signer changed", tone: "amber" },
  undeliverable: { label: "Undeliverable", tone: "red" },
  used: { label: "Signed", tone: "green" },
};

/** Feature 27: repaint queue states. */
export const ALERT_QUEUE_STATE: Record<string, Meta> = {
  live: { label: "Live", tone: "blue" },
  backlog: { label: "Backlog", tone: "purple" },
  snoozed: { label: "Snoozed", tone: "amber" },
  suppressed: { label: "Suppressed", tone: "gray" },
  resolved: { label: "Resolved", tone: "green" },
};

/** Feature 29: call outcomes. Unsuccessful calls are never labelled a conversation. */
export const CALL_OUTCOME: Record<string, Meta & { conversation: boolean }> = {
  reached: { label: "Conversation", tone: "green", conversation: true },
  wants_quote: { label: "Conversation — wants a quote", tone: "purple", conversation: true },
  declined: { label: "Conversation — declined", tone: "red", conversation: true },
  opt_out: { label: "Conversation — opted out", tone: "dark", conversation: true },
  no_answer: { label: "Unsuccessful — no answer", tone: "gray", conversation: false },
  left_message: { label: "Unsuccessful — voicemail / message", tone: "gray", conversation: false },
  wrong_number: { label: "Unsuccessful — wrong number", tone: "amber", conversation: false },
};

/** Feature 28: repeat estimates (expired is derived from validUntil). */
export const REPEAT_STATUS: Record<string, Meta> = {
  draft: { label: "Draft", tone: "gray" },
  issued: { label: "Issued", tone: "blue" },
  expired: { label: "Expired", tone: "amber" },
};

/** Feature 28: touch-up reorders. */
export const REORDER_STATUS: Record<string, Meta> = {
  draft: { label: "Draft", tone: "gray" },
  approved: { label: "Approved — to fill", tone: "indigo" },
  fulfilled: { label: "Fulfilled", tone: "green" },
  cancelled: { label: "Canceled", tone: "red" },
};
