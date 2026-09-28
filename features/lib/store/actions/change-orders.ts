/**
 * Feature 24 — Change Orders And Additional Work.
 *
 * Each exported action receives an Immer draft of the database and the
 * acting user, validates first, then mutates. The read helpers at the top
 * (coPricing, contractSummary, ...) are pure and are shared with the screens.
 *
 * Tables (spec "Tables To Use"): CHANGE_ORDERS / CHANGE_ORDER_LINES /
 * CHANGE_ORDER_VERSIONS live on ChangeOrder (lines + version); APPROVAL_LINKS
 * and APPROVAL_EVIDENCE are ChangeOrder.links / .evidence; DEPOSIT_REVIEWS is
 * .depositReview; EXCEPTION_QUEUE is derived from failed downstream actions.
 */
import type { ApprovalLink, ChangeOrder, ChangeOrderLine, ChangeOrderType, Customer, Database, DownstreamKey, Invoice, Job, User } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId, catalogFor } from "@/features/lib/selectors";
import { dateLong, dateTime, money } from "@/features/lib/format";
import { CO_TYPE } from "@/features/lib/status";
import { roundMoney } from "@/features/lib/rules/rounding";
import { classifyChange, type ChangeDecision, type Selection } from "@/features/lib/rules/change-rule";
import {
  addWorkingDays, billingMode, dependencyBlock, depositReview, emergencyEligible, isWorkingDay, linkExpiry, linkState,
  missingEmergencyEvidence, nextDocNumber, ownerApprovalCheck, priceChangeOrder, refundAllowed, refundWindowCloses, taxRateOn,
  undeliverableStatus, writtenConfirmationStatus, type Pricing,
} from "@/features/lib/rules/change-orders";
import { denied, fail, log, nextId, ok, userName } from "../helpers";

const MODULE = "Change Orders";

export const DOWNSTREAM_KEYS: DownstreamKey[] = ["work_order", "materials", "scheduler", "billing"];
export const DOWNSTREAM_LABEL: Record<DownstreamKey, string> = {
  work_order: "Work order",
  materials: "Material demand",
  scheduler: "Scheduler task",
  billing: "Billing action",
};
/** Wording used in the Exception / Recovery log lines. */
const DOWNSTREAM_LOG: Record<DownstreamKey, string> = { work_order: "WorkOrder", materials: "Material", scheduler: "Schedule", billing: "Billing" };
const DOWNSTREAM_ERROR: Record<DownstreamKey, string> = {
  work_order: "Work order service did not respond (timeout after 30 s)",
  materials: "Material demand recalculation failed: specification locked by another user",
  scheduler: "Scheduler task could not be created: calendar service unavailable",
  billing: "Accounting sync failed: QuickBooks returned 503 Service Unavailable",
};

/* ================================================================== */
/* Read helpers (pure, shared with screens)                            */
/* ================================================================== */

export const OPEN_STATES: ChangeOrder["status"][] = ["draft", "pending_internal", "ready_to_send", "sent"];
export const PROPOSED_STATES: ChangeOrder["status"][] = ["pending_internal", "ready_to_send", "sent"];
const SIGNED_STATES: ChangeOrder["status"][] = ["approved", "disputed"];

export function jobChangeOrders(db: Database, jobId: string) {
  return db.changeOrders.filter((c) => c.jobId === jobId && !c.isColourReapproval);
}

export function jobColourReapprovals(db: Database, jobId: string) {
  return db.changeOrders.filter((c) => c.jobId === jobId && c.isColourReapproval);
}

/** Tax rate table, falling back to the job's contract rate for older saved data. */
export function taxTable(db: Database, job?: Job) {
  return db.taxRates?.length ? db.taxRates : [{ id: "TX-0", region: "Contract rate", ratePct: job?.taxRatePct ?? 8.25, effectiveFrom: "2000-01-01T00:00:00.000Z" }];
}

/** Drafts are always priced at the rate effective on the change-order date. */
export function coTaxRate(db: Database, co: ChangeOrder) {
  const job = byId(db.jobs, co.jobId);
  const row = taxRateOn(co.taxDate, taxTable(db, job));
  if (co.status === "draft" && row) return { ratePct: row.ratePct, effectiveFrom: row.effectiveFrom, region: row.region };
  return { ratePct: co.taxRatePct, effectiveFrom: row?.effectiveFrom ?? co.taxDate, region: row?.region ?? "" };
}

export function coPricing(db: Database, co: ChangeOrder): Pricing {
  return priceChangeOrder({
    lines: co.lines,
    markupPct: co.markupPct,
    taxRatePct: coTaxRate(db, co).ratePct,
    discountPct: co.discount?.pct,
    discountApproved: co.discount?.status === "approved",
  });
}

export function coVersion(co: ChangeOrder) {
  return co.version ?? 1;
}

/** Links, including a synthesised one for older records that only stored sentAt. */
export function coLinks(co: ChangeOrder): ApprovalLink[] {
  if (co.links?.length) return co.links;
  if (!co.sentAt) return [];
  return [
    {
      id: `LNK-${co.id}`,
      version: coVersion(co),
      recipientName: co.signer ?? co.recipient ?? "Customer",
      recipient: co.recipient ?? "",
      channel: co.channel ?? "portal",
      sentAt: co.sentAt,
      sentBy: co.createdBy,
      expiresAt: co.linkExpiresAt ?? linkExpiry(co.sentAt),
      delivery: "delivered",
    },
  ];
}

export function currentLink(co: ChangeOrder): ApprovalLink | undefined {
  return [...coLinks(co)].reverse().find((l) => !l.supersededAt);
}

export function coLinkState(co: ChangeOrder, link: ApprovalLink, nowIso: string) {
  const decided = link === currentLink(co) && (co.status === "approved" || co.status === "disputed" || co.status === "rejected");
  return linkState(link, coVersion(co), nowIso, decided);
}

/** Scope version = original contract (1) + each signed change order. */
export function scopeVersion(db: Database, jobId: string) {
  return 1 + jobChangeOrders(db, jobId).filter((c) => SIGNED_STATES.includes(c.status)).length;
}

export function contractSummary(db: Database, job: Job) {
  const cos = jobChangeOrders(db, job.id);
  const approvedNets = cos.filter((c) => SIGNED_STATES.includes(c.status)).map((c) => coPricing(db, c).net);
  const proposed = cos.filter((c) => PROPOSED_STATES.includes(c.status));
  const proposedNet = roundMoney(proposed.reduce((a, c) => a + coPricing(db, c).net, 0));
  const approvedNet = roundMoney(approvedNets.reduce((a, b) => a + b, 0));
  const withProposed = depositReview({ originalValue: job.contractValue, approvedNets, proposedNet, collected: job.depositsCollected });
  const signedOnly = depositReview({ originalValue: job.contractValue, approvedNets, collected: job.depositsCollected });
  return {
    original: job.contractValue,
    approvedNet,
    revisedTotal: roundMoney(job.contractValue + approvedNet),
    changePct: signedOnly.pct,
    proposedNet,
    deposit: withProposed,
    triggeredBy: withProposed.triggered ? proposed.map((c) => c.id) : [],
  };
}

export interface Recipient {
  name: string;
  address: string;
  role: string;
}

/** The people on the customer record who may approve a change order. */
export function allowedRecipients(customer?: Customer): Recipient[] {
  if (!customer) return [];
  return [
    { name: customer.name, address: customer.email ?? "", role: "Account holder" },
    ...customer.authorisedSigners.map((s) => ({ name: s.replace(/\s*\(.*\)$/, ""), address: "", role: s.match(/\((.*)\)/)?.[1] ?? "Authorised signer" })),
  ];
}

export function isAuthorisedSigner(customer: Customer | undefined, name: string): boolean {
  const n = name.trim().toLowerCase();
  return !!n && allowedRecipients(customer).some((r) => r.name.toLowerCase() === n);
}

/** Why this change order can't be sent right now (null when it can). */
export function sendBlock(db: Database, co: ChangeOrder): string | null {
  if (co.lines.length === 0) return "No line differences. A change order with no changes cannot be sent.";
  const parent = byId(db.changeOrders, co.parentId);
  const dep = dependencyBlock(parent);
  if (dep) return dep;
  if (co.discount?.status === "requested") return "Awaiting owner approval of inherited discount.";
  if (co.status === "draft") return "Submit for internal approval first.";
  if (co.status === "pending_internal") return "Waiting for the business owner's internal approval.";
  if (!co.recipientVerified) return "Verify the recipient against the customer record first.";
  return null;
}

export function nextListDay(nowIso: string): string {
  const d = new Date(nowIso);
  if (d.getHours() >= 7 || !isWorkingDay(d)) {
    do d.setDate(d.getDate() + 1);
    while (!isWorkingDay(d));
  }
  d.setHours(7, 0, 0, 0);
  return d.toISOString();
}

/* ================================================================== */
/* Internal helpers                                                    */
/* ================================================================== */

function getCo(db: Database, id: string) {
  return db.changeOrders.find((c) => c.id === id);
}

function channelLabel(c: string) {
  return c === "portal" ? "Portal" : c === "email" ? "Email" : "Verbal";
}

/** Keep drafts on the original markup and today's effective tax rate. */
function reprice(db: Database, co: ChangeOrder) {
  const job = byId(db.jobs, co.jobId);
  if (job) co.markupPct = job.markupPct;
  const row = taxRateOn(co.taxDate, taxTable(db, job));
  if (row) co.taxRatePct = row.ratePct;
}

function supersedeLinks(co: ChangeOrder, reason: string) {
  if (!co.links && co.sentAt) co.links = coLinks(co);
  for (const l of co.links ?? []) if (!l.supersededAt) Object.assign(l, { supersededAt: now(), supersededReason: reason });
}

/** Back to draft as a new version. Old links are superseded, owner approval cleared. */
function toNewDraftVersion(co: ChangeOrder, reason: string) {
  const hadLinks = coLinks(co).length > 0;
  supersedeLinks(co, reason);
  if (hadLinks || co.status !== "draft") co.version = coVersion(co) + 1;
  co.status = "draft";
  co.ownerApprovedBy = undefined;
  co.ownerApprovedAt = undefined;
  co.submittedAt = undefined;
  co.depositReview = undefined;
  if (co.discount?.status === "approved") co.discount.status = "requested";
}

function guardBuild(db: Database, actor: User, co: ChangeOrder | undefined, what: string) {
  if (!co) return fail("Change order not found.");
  if (!can(actor, "co.build")) return denied(db, actor, MODULE, what, whoCan("co.build"));
  return null;
}

function guardDraft(co: ChangeOrder) {
  if (co.status !== "draft") return fail(`${co.id} is ${co.status.replace(/_/g, " ")}. Reopen it as a new version to change its content.`);
  return null;
}

function sqftSummary(co: ChangeOrder) {
  const add = co.lines.filter((l) => l.kind === "add").reduce((a, l) => a + (l.sqft ?? 0), 0);
  const rem = co.lines.filter((l) => l.kind === "remove").reduce((a, l) => a + (l.sqft ?? 0), 0);
  return [add && `+${add} sq ft`, rem && `−${rem} sq ft`].filter(Boolean).join(", ") || "no measured area";
}

function mainInvoice(db: Database, jobId: string): Invoice | undefined {
  return [...db.invoices].reverse().find((i) => i.jobId === jobId && i.kind === "standard" && i.status !== "void");
}

/** Performs one downstream action. Returns the reference recorded. */
function performDownstream(db: Database, actor: User, co: ChangeOrder, key: DownstreamKey): string | null {
  const job = byId(db.jobs, co.jobId)!;
  switch (key) {
    case "work_order":
      return `Work order ${job.id}-WO revised to scope v${scopeVersion(db, job.id)} (approved scope only)`;
    case "materials":
      return `Demand revised for ${sqftSummary(co)} — Materials tab`;
    case "scheduler": {
      const taskId = nextId(db, "task", "T-");
      db.tasks.unshift({ id: taskId, title: `Scheduler: review labour for ${co.id} on ${job.id} (${sqftSummary(co)}). Crews are not rescheduled automatically.`, done: false, createdAt: now() });
      return `Task ${taskId} for the scheduler`;
    }
    case "billing": {
      if (co.emergency && !co.emergency.writtenConfirmedAt) return null; // billed only once confirmed in writing
      if (co.billing) return co.billing.docId ?? "Already billed"; // never applied twice
      const total = coPricing(db, co).total;
      const inv = mainInvoice(db, job.id);
      const mode = billingMode(total, inv?.status);
      let docId: string | undefined;
      if (mode === "draft_update" && inv) {
        inv.amount = roundMoney(inv.amount + total);
        docId = inv.id;
        log(db, actor, MODULE, `Change Order ${co.id} – DraftUpdate ${inv.id} created by ${actor.name}`);
      } else if (mode === "supplemental" || mode === "credit_note" || mode === "account_credit") {
        docId = nextId(db, "invoice", "INV-2026-");
        db.invoices.push({ id: docId, jobId: job.id, kind: mode === "supplemental" ? "supplemental" : "credit_note", status: "draft", amount: total, createdAt: now(), changeOrderId: co.id });
        log(db, actor, MODULE, `Change Order ${co.id} – ${mode === "supplemental" ? "SupplementalInvoice" : "CreditNote"} ${docId} created by ${actor.name}`);
      }
      co.billing = { mode, docId, amount: total };
      if (mode === "account_credit") {
        const raised = now();
        co.billing.creditRaisedAt = raised;
        co.billing.refundWindowCloses = refundWindowCloses(raised);
        co.billing.customerChoice = "credit";
        log(db, actor, MODULE, `Change Order ${co.id} – Credit ${money(-total)} raised ${dateLong(raised)}; refund window closes ${co.billing.refundWindowCloses}. Customer choice: Credit`);
      }
      return mode === "none" ? "No billing change (no invoice yet)" : `${docId}`;
    }
  }
}

function runDownstream(db: Database, actor: User, co: ChangeOrder, failKey?: DownstreamKey) {
  co.downstreamMeta ??= {};
  for (const key of DOWNSTREAM_KEYS) {
    if (co.downstream[key] === "done") continue; // succeeded actions are locked
    if (key === failKey) {
      co.downstream[key] = "failed";
      co.downstreamMeta[key] = { at: now(), error: DOWNSTREAM_ERROR[key] };
      log(db, actor, MODULE, `Change Order ${co.id} – ${DOWNSTREAM_LOG[key]} update failed at ${dateTime(now())}. Listed for office manager on ${dateLong(nextListDay(now()))}`);
      continue;
    }
    const ref = performDownstream(db, actor, co, key);
    if (ref === null) {
      co.downstreamMeta[key] = { at: now(), ref: "Deferred until written confirmation is received" };
      continue;
    }
    co.downstream[key] = "done";
    co.downstreamMeta[key] = { at: now(), by: actor.id, ref };
  }
}

/* ================================================================== */
/* Rule 1 check for no-cost colour changes                             */
/* ================================================================== */

export interface ColourCheckInput {
  specId: string;
  toColourName: string;
  toColourNumber: string;
  sheenChanges: boolean;
  newSheen?: string;
  brandOrLineChanges: boolean;
  priceChanges: boolean;
  tintedOrOrdered: boolean;
}

/** Was any paint for this specification tinted or ordered already? */
export function specTintedOrOrdered(db: Database, specId: string): boolean {
  return db.purchaseOrders.some((po) => po.status !== "preliminary" && po.status !== "draft" && po.lines.some((l) => l.specId === specId));
}

export function classifyColourCheck(db: Database, jobId: string, input: ColourCheckInput): ChangeDecision | null {
  const job = byId(db.jobs, jobId);
  const spec = byId(db.specs, input.specId);
  if (!job || !spec) return null;
  const colour = byId(db.colours, spec.colourId);
  const cost = catalogFor(db, spec.product)?.cost.gal ?? 0;
  const before: Selection = { brand: colour?.manufacturer ?? "", productLine: spec.productLine ?? "", colour: colour?.number ?? "", sheen: spec.sheen ?? "", product: spec.product ?? "", costPerGal: cost };
  const after: Selection = {
    ...before,
    colour: input.toColourNumber.trim() || before.colour,
    sheen: input.sheenChanges ? input.newSheen || `${before.sheen} (changed)` : before.sheen,
    productLine: input.brandOrLineChanges ? `${before.productLine} (changed)` : before.productLine,
  };
  return classifyChange(before, after, { jobSigned: job.contractSigned, tintedOrOrdered: input.tintedOrOrdered, priceChanges: input.priceChanges });
}

/* ================================================================== */
/* Create and build                                                    */
/* ================================================================== */

export interface NewCoInput {
  type: ChangeOrderType;
  title: string;
  parentId?: string;
  colourCheck?: ColourCheckInput;
}

export function createChangeOrder(db: Database, actor: User, jobId: string, input: NewCoInput) {
  const job = byId(db.jobs, jobId);
  if (!job) return fail("Job not found.");
  if (!can(actor, "co.build")) return denied(db, actor, MODULE, "create a change order", whoCan("co.build"));
  if (!job.contractSigned) return fail("This job has not been sold. Amend the estimate instead of raising a change order.");
  if (!input.title.trim()) return fail("Give the change order a short title the customer will recognise.", "title");
  if (input.parentId) {
    const parent = byId(db.changeOrders, input.parentId);
    if (!parent || parent.jobId !== jobId) return fail("Parent change order not found on this job.", "parentId");
    if (parent.status === "rejected") return fail(`${parent.id} was rejected. A child can't depend on a rejected change order.`, "parentId");
  }
  let colourLine: ChangeOrderLine | undefined;
  if (input.type === "no_cost_colour_change") {
    if (!input.colourCheck) return fail("Complete the Rule 1 check for the colour change.", "specId");
    if (!input.colourCheck.specId) return fail("Choose the specification whose colour changes.", "specId");
    if (!input.colourCheck.toColourName.trim() || !input.colourCheck.toColourNumber.trim()) return fail("Enter the new colour name and number.", "toColour");
    const decision = classifyColourCheck(db, jobId, input.colourCheck);
    if (decision?.kind === "colour_reapproval") {
      return fail("This change qualifies for a Colour Re-approval under Rule 1. Record it as a Colour Re-approval instead — a change never gets both a re-approval and a change order.", "type");
    }
    const spec = byId(db.specs, input.colourCheck.specId)!;
    const from = byId(db.colours, spec.colourId);
    colourLine = {
      id: "L1",
      kind: "add",
      description: `Colour change on ${spec.id}: ${from?.name ?? ""} ${from?.number ?? ""} → ${input.colourCheck.toColourName} ${input.colourCheck.toColourNumber}${input.colourCheck.sheenChanges ? `, sheen → ${input.colourCheck.newSheen ?? "changed"}` : ""} (no cost)`,
      sqft: spec.surfaceIds.reduce((a, s) => a + (byId(db.surfaces, s)?.areaSqft ?? 0), 0),
      cost: 0,
      product: spec.product,
      colour: `${input.colourCheck.toColourName} ${input.colourCheck.toColourNumber}`,
    };
  }
  const id = nextDocNumber("CO", jobId, db.changeOrders.filter((c) => c.jobId === jobId).map((c) => c.id));
  const co: ChangeOrder = {
    id,
    jobId,
    type: input.type,
    title: input.title.trim(),
    status: "draft",
    parentId: input.parentId || undefined,
    lines: colourLine ? [colourLine] : [],
    markupPct: job.markupPct,
    taxRatePct: job.taxRatePct,
    taxDate: now(),
    createdAt: now(),
    createdBy: actor.id,
    recipientVerified: false,
    version: 1,
    downstream: { work_order: "not_started", materials: "not_started", scheduler: "not_started", billing: "not_started" },
  };
  reprice(db, co);
  db.changeOrders.push(co);
  log(db, actor, MODULE, `Change Order ${id} created on job ${jobId}, type ${CO_TYPE[input.type].label}, gross ${money(coPricing(db, co).grossAddition)} by ${actor.name}`);
  return ok(id);
}

export function createColourReapproval(db: Database, actor: User, jobId: string, input: ColourCheckInput) {
  const job = byId(db.jobs, jobId);
  if (!job) return fail("Job not found.");
  if (!can(actor, "co.build")) return denied(db, actor, MODULE, "record a Colour Re-approval", whoCan("co.build"));
  if (!job.contractSigned) return fail("This job has not been sold. Amend the estimate instead.");
  if (!input.specId) return fail("Choose the specification whose colour changes.", "specId");
  if (!input.toColourName.trim() || !input.toColourNumber.trim()) return fail("Enter the new colour name and number.", "toColour");
  const decision = classifyColourCheck(db, jobId, input);
  if (!decision) return fail("Specification not found.");
  if (decision.kind !== "colour_reapproval") {
    return fail(`Colour Re-approval not allowed. ${decision.kind === "no_change" ? "Nothing changes." : decision.reason} Raise a priced change order instead.`);
  }
  const spec = byId(db.specs, input.specId)!;
  const from = byId(db.colours, spec.colourId);
  const id = nextDocNumber("CRA", jobId, db.changeOrders.filter((c) => c.jobId === jobId).map((c) => c.id));
  db.changeOrders.push({
    id,
    jobId,
    type: "no_cost_colour_change",
    title: `Colour Re-approval: ${from?.name ?? ""} → ${input.toColourName}`,
    status: "draft",
    lines: [],
    markupPct: job.markupPct,
    taxRatePct: job.taxRatePct,
    taxDate: now(),
    createdAt: now(),
    createdBy: actor.id,
    recipientVerified: false,
    isColourReapproval: true,
    colourChange: { specId: spec.id, fromColour: `${from?.name ?? ""} ${from?.number ?? ""}`.trim(), toColour: `${input.toColourName.trim()} ${input.toColourNumber.trim()}`, sheen: spec.sheen },
    downstream: { work_order: "not_started", materials: "not_started", scheduler: "not_started", billing: "not_started" },
  });
  log(db, actor, MODULE, `Colour Re-approval ${id} recorded on job ${jobId} for ${spec.id}: ${from?.name ?? ""} → ${input.toColourName.trim()} by ${actor.name}. No change order raised (Rule 1).`);
  return ok(id);
}

export function updateChangeOrderHeader(db: Database, actor: User, coId: string, patch: { title: string; type: ChangeOrderType }) {
  const co = getCo(db, coId);
  const g = guardBuild(db, actor, co, "edit a change order");
  if (g) return g;
  const d = guardDraft(co!);
  if (d) return d;
  if (!patch.title.trim()) return fail("Title is required.", "title");
  co!.title = patch.title.trim();
  co!.type = patch.type;
  reprice(db, co!);
  return ok();
}

export interface LineDraft {
  kind: "add" | "remove";
  description: string;
  sqft?: number;
  cost: number;
  product?: string;
  colour?: string;
  surfaceId?: string;
  treatment?: ChangeOrderLine["treatment"];
}

export function saveLine(db: Database, actor: User, coId: string, draft: LineDraft, lineId?: string) {
  const co = getCo(db, coId);
  const g = guardBuild(db, actor, co, "change change-order lines");
  if (g) return g;
  const d = guardDraft(co!);
  if (d) return d;
  if (!draft.description.trim()) return fail("Describe the scope being added or removed.", "description");
  if (draft.sqft !== undefined && (Number.isNaN(draft.sqft) || draft.sqft < 0)) return fail("Measurement must be zero or more.", "sqft");
  if (Number.isNaN(draft.cost) || draft.cost < 0) return fail("Cost must be zero or more. Use a Remove line for a reduction.", "cost");
  if (draft.treatment === "stranded_paint" && draft.kind !== "add") return fail("Stranded tinted paint is billed as an added line.", "treatment");
  const clean: ChangeOrderLine = {
    id: lineId ?? `L${Math.max(0, ...co!.lines.map((l) => Number(l.id.replace(/\D/g, "")) || 0)) + 1}`,
    kind: draft.kind,
    description: draft.description.trim(),
    sqft: draft.sqft,
    cost: roundMoney(draft.cost),
    product: draft.product?.trim() || undefined,
    colour: draft.colour?.trim() || undefined,
    surfaceId: draft.surfaceId || undefined,
    treatment: draft.treatment && draft.treatment !== "billable" ? draft.treatment : undefined,
  };
  if (lineId) {
    const i = co!.lines.findIndex((l) => l.id === lineId);
    if (i < 0) return fail("Line not found.");
    co!.lines[i] = clean;
  } else co!.lines.push(clean);
  reprice(db, co!);
  log(db, actor, MODULE, `Change Order ${co!.id} – line ${clean.id} ${lineId ? "updated" : "added"} (${clean.kind === "add" ? "+" : "−"} ${clean.description}) by ${actor.name}`);
  return ok(clean.id);
}

export function removeLine(db: Database, actor: User, coId: string, lineId: string) {
  const co = getCo(db, coId);
  const g = guardBuild(db, actor, co, "remove a change-order line");
  if (g) return g;
  const d = guardDraft(co!);
  if (d) return d;
  const line = co!.lines.find((l) => l.id === lineId);
  if (!line) return fail("Line not found.");
  co!.lines = co!.lines.filter((l) => l.id !== lineId);
  reprice(db, co!);
  log(db, actor, MODULE, `Change Order ${co!.id} – line ${lineId} removed (${line.description}) by ${actor.name}`);
  return ok();
}

/** Inherit a discount from the contract. Held until the owner approves it. */
export function setDiscount(db: Database, actor: User, coId: string, pct: number | null) {
  const co = getCo(db, coId);
  const g = guardBuild(db, actor, co, "request a discount");
  if (g) return g;
  const d = guardDraft(co!);
  if (d) return d;
  if (pct === null || pct === 0) {
    co!.discount = undefined;
    log(db, actor, MODULE, `Change Order ${co!.id} – inherited discount removed by ${actor.name}`);
    return ok();
  }
  if (Number.isNaN(pct) || pct < 0 || pct > 50) return fail("Enter a discount between 0.1% and 50%.", "discount");
  co!.discount = { pct, status: "requested" };
  log(db, actor, MODULE, `Change Order ${co!.id} – inherited discount ${pct}% requested by ${actor.name}. Awaiting owner approval of inherited discount.`);
  return ok();
}

/* ================================================================== */
/* Internal approval                                                   */
/* ================================================================== */

export function submitForInternalApproval(db: Database, actor: User, coId: string) {
  const co = getCo(db, coId);
  const g = guardBuild(db, actor, co, "submit a change order");
  if (g) return g;
  const d = guardDraft(co!);
  if (d) return d;
  if (co!.lines.length === 0) return fail("No changes recorded yet. Add or remove scope to build this change order.");
  const dep = dependencyBlock(byId(db.changeOrders, co!.parentId));
  if (dep) return fail(`Blocked: ${dep}`);
  const job = byId(db.jobs, co!.jobId)!;
  reprice(db, co!);
  const p = coPricing(db, co!);
  const check = ownerApprovalCheck({ grossAddition: p.grossAddition, credit: p.credit, discountRequested: co!.discount?.status === "requested" });
  const approvedNets = jobChangeOrders(db, job.id).filter((c) => c.id !== co!.id && SIGNED_STATES.includes(c.status)).map((c) => coPricing(db, c).net);
  const dr = depositReview({ originalValue: job.contractValue, approvedNets, proposedNet: p.net, collected: job.depositsCollected });
  const rate = coTaxRate(db, co!);
  log(db, actor, MODULE, `Change Order ${co!.id} priced at markup ${co!.markupPct}%, tax rate ${rate.ratePct}% effective ${dateLong(co!.taxDate)}, total ${money(p.total)} by ${actor.name}`);
  co!.depositReview = undefined;
  if (dr.triggered) {
    co!.depositReview = { cumulativeNet: dr.cumulativeNet, pct: dr.pct, target: dr.target, collected: dr.collected, due: dr.due, at: now() };
    log(db, actor, MODULE, `Change Order ${co!.id} – Cumulative net change ${money(dr.cumulativeNet)} is ${(dr.pct * 100).toFixed(1)}% of original contract ${money(job.contractValue)}. Revised deposit target ${money(dr.target)}, collected ${money(dr.collected)}, additional due ${money(dr.due)}`);
  }
  const needsOwner = check.required || dr.triggered;
  co!.submittedAt = now();
  co!.status = needsOwner ? "pending_internal" : "ready_to_send";
  log(db, actor, MODULE, `Change Order ${co!.id} submitted for internal approval by ${actor.name}. ${needsOwner ? `Owner approval required: ${[...check.reasons, ...(dr.triggered ? ["deposit review triggered"] : [])].join("; ")}.` : "Owner approval not required by the threshold."}`);
  return ok({ ownerRequired: needsOwner });
}

export function ownerApprove(db: Database, actor: User, coId: string) {
  const co = getCo(db, coId);
  if (!co) return fail("Change order not found.");
  if (!can(actor, "co.ownerApprove")) return denied(db, actor, MODULE, `approve ${coId}`, whoCan("co.ownerApprove"));
  if (co.status !== "pending_internal") return fail("This change order is not waiting for owner approval.");
  const p = coPricing(db, co);
  if (co.discount?.status === "requested") co.discount = { ...co.discount, status: "approved", approvedBy: actor.id, approvedAt: now() };
  co.ownerApprovedBy = actor.id;
  co.ownerApprovedAt = now();
  co.status = "ready_to_send";
  const at = dateTime(now());
  if (p.grossAddition > 0) log(db, actor, MODULE, `Change Order ${co.id} – Gross addition ${money(p.grossAddition)} approved by ${actor.name} at ${at}`);
  if (p.credit > 0) log(db, actor, MODULE, `Change Order ${co.id} – Credit ${money(p.credit)} approved by ${actor.name} at ${at}`);
  if (co.discount?.status === "approved") log(db, actor, MODULE, `Change Order ${co.id} – Inherited discount ${co.discount.pct}% approved by ${actor.name} at ${at}`);
  if (co.depositReview) log(db, actor, MODULE, `Change Order ${co.id} – Revised deposit target ${money(co.depositReview.target)} approved by ${actor.name}; to be signed by the customer with the change order`);
  return ok();
}

export function ownerReturn(db: Database, actor: User, coId: string, note: string) {
  const co = getCo(db, coId);
  if (!co) return fail("Change order not found.");
  if (!can(actor, "co.ownerApprove")) return denied(db, actor, MODULE, `return ${coId}`, whoCan("co.ownerApprove"));
  if (co.status !== "pending_internal") return fail("This change order is not waiting for owner approval.");
  if (!note.trim()) return fail("Say what needs to change.", "note");
  co.status = "draft";
  co.submittedAt = undefined;
  log(db, actor, MODULE, `Change Order ${co.id} returned to the estimator by ${actor.name}. Note: ${note.trim()}`);
  return ok();
}

/** Any content change after submission is a new version with a new link. */
export function reopenAsNewVersion(db: Database, actor: User, coId: string, reason: string) {
  const co = getCo(db, coId);
  const g = guardBuild(db, actor, co, "reopen a change order");
  if (g) return g;
  if (!["pending_internal", "ready_to_send", "sent"].includes(co!.status)) return fail("Only a submitted or sent change order can be reopened.");
  if (!reason.trim()) return fail("Give a reason for the new version.", "reason");
  const old = coVersion(co!);
  toNewDraftVersion(co!, `Replaced by version ${old + 1}: ${reason.trim()}`);
  reprice(db, co!);
  log(db, actor, MODULE, `Change Order ${co!.id} reopened as v${coVersion(co!)} by ${actor.name}. Reason: ${reason.trim()}. Links for v${old} superseded.`);
  return ok();
}

/* ================================================================== */
/* Recipient and send                                                  */
/* ================================================================== */

export function verifyRecipient(db: Database, actor: User, coId: string, who: { name: string; address: string }) {
  const co = getCo(db, coId);
  if (!co) return fail("Change order not found.");
  if (!can(actor, "co.send")) return denied(db, actor, MODULE, "verify a change-order recipient", whoCan("co.send"));
  const job = byId(db.jobs, co.jobId)!;
  const customer = byId(db.customers, job.customerId);
  if (!who.name.trim()) return fail("Choose who will approve.", "name");
  if (!/^\S+@\S+\.\S+$/.test(who.address.trim())) return fail("Enter the email address or portal login the link goes to.", "address");
  if (!isAuthorisedSigner(customer, who.name)) {
    log(db, actor, MODULE, `Blocked: ${who.name.trim()} is not an authorised signer on ${customer?.name}'s account (${co.id}).`, true);
    return fail(`${who.name.trim()} is not an authorised signer on ${customer?.name}'s account. A property manager must already be listed as authorised on the account before their approval can be accepted.`, "name");
  }
  if (customer && !customer.contactVerified && who.name.trim().toLowerCase() === customer.name.toLowerCase()) {
    return fail(`${customer.name}'s contact details are not verified on the customer record. Verify them first.`, "address");
  }
  co.recipientName = who.name.trim();
  co.recipient = who.address.trim();
  co.recipientVerified = true;
  const link = currentLink(co);
  if (link?.signerChanged) link.signerChanged = false;
  log(db, actor, MODULE, `Change Order ${co.id} – recipient ${co.recipientName} <${co.recipient}> verified against the customer record by ${actor.name}`);
  return ok();
}

function newLink(db: Database, actor: User, co: ChangeOrder, channel: "portal" | "email"): ApprovalLink {
  const sentAt = now();
  return {
    id: nextId(db, "colink", "LNK-"),
    version: coVersion(co),
    recipientName: co.recipientName ?? co.recipient ?? "",
    recipient: co.recipient ?? "",
    channel,
    sentAt,
    sentBy: actor.id,
    expiresAt: linkExpiry(sentAt),
    delivery: "delivered",
  };
}

export function sendChangeOrder(db: Database, actor: User, coId: string, channel: "portal" | "email") {
  const co = getCo(db, coId);
  if (!co) return fail("Change order not found.");
  if (!can(actor, "co.send")) return denied(db, actor, MODULE, "send a change order", whoCan("co.send"));
  if (co.status !== "ready_to_send") {
    if (co.status === "sent") return fail("Already sent. Use Reissue link to send a new link.");
    const why = sendBlock(db, co);
    return fail(why ?? "This change order can't be sent.");
  }
  const why = sendBlock(db, co);
  if (why) return fail(why);
  if (channel !== "portal" && channel !== "email") return fail("Send by portal or email. Verbal approval is only for emergency work below $500.");
  const link = newLink(db, actor, co, channel);
  if (!co.links && co.sentAt) co.links = coLinks(co);
  co.links = [...(co.links ?? []), link];
  co.status = "sent";
  co.channel = channel;
  co.sentAt = link.sentAt;
  co.linkExpiresAt = link.expiresAt;
  log(db, actor, MODULE, `Change Order ${co.id} v${link.version} sent to ${link.recipientName} <${link.recipient}> via ${channelLabel(channel)} by ${actor.name} at ${dateTime(link.sentAt)}. Link expires ${dateLong(link.expiresAt)}`);
  return ok(link.id);
}

export function reissueLink(db: Database, actor: User, coId: string, channel?: "portal" | "email") {
  const co = getCo(db, coId);
  if (!co) return fail("Change order not found.");
  if (!can(actor, "co.send")) return denied(db, actor, MODULE, "reissue an approval link", whoCan("co.send"));
  if (co.status !== "sent") return fail("Only a change order awaiting the customer has a link to reissue.");
  if (!co.recipientVerified) return fail("The signer changed. Verify the recipient against the customer record, then reissue.");
  const old = currentLink(co);
  if (!co.links) co.links = coLinks(co);
  const stored = co.links.find((l) => l.id === old?.id);
  if (stored) Object.assign(stored, { supersededAt: now(), supersededReason: "New link issued by the office" });
  const link = newLink(db, actor, co, channel ?? old?.channel ?? "portal");
  co.links.push(link);
  co.sentAt = link.sentAt;
  co.linkExpiresAt = link.expiresAt;
  co.channel = link.channel;
  log(db, actor, MODULE, `Change Order ${co.id} – New approval link issued by ${actor.name}; previous link ${old?.id ?? "—"} superseded`);
  log(db, actor, MODULE, `Change Order ${co.id} v${link.version} sent to ${link.recipientName} <${link.recipient}> via ${channelLabel(link.channel)} by ${actor.name} at ${dateTime(link.sentAt)}. Link expires ${dateLong(link.expiresAt)}`);
  return ok(link.id);
}

/** Demo control: the email bounced. */
export function simulateUndeliverable(db: Database, actor: User, coId: string) {
  const co = getCo(db, coId);
  if (!co) return fail("Change order not found.");
  if (!co.links) co.links = coLinks(co);
  const link = [...co.links].reverse().find((l) => !l.supersededAt);
  if (!link) return fail("No active link.");
  Object.assign(link, { delivery: "undeliverable", deliveryFailedAt: now(), deliveryError: "550 Mailbox unavailable" });
  log(db, actor, MODULE, `Change Order ${co.id} – approval message to ${link.recipient} undeliverable. Office flagged ${dateLong(now())}; owner escalation after two working days`);
  return ok();
}

/** Demo control: the signer on the customer record changed after the send. */
export function simulateSignerChange(db: Database, actor: User, coId: string) {
  const co = getCo(db, coId);
  if (!co) return fail("Change order not found.");
  if (!co.links) co.links = coLinks(co);
  const link = [...co.links].reverse().find((l) => !l.supersededAt);
  if (!link) return fail("No active link.");
  link.signerChanged = true;
  co.recipientVerified = false;
  log(db, actor, MODULE, `Change Order ${co.id} – signer on the customer record changed after link ${link.id} was sent. A new link is required.`);
  return ok();
}

/* ================================================================== */
/* Customer decision (whole change order only)                         */
/* ================================================================== */

export interface ApprovalInput {
  signer: string;
  channel: "portal" | "email";
  evidenceRef: string;
  /** Demo: make one downstream action fail so the recovery path can be shown. */
  failAction?: DownstreamKey;
}

export function recordApproval(db: Database, actor: User, coId: string, input: ApprovalInput) {
  const co = getCo(db, coId);
  if (!co) return fail("Change order not found.");
  if (!can(actor, "co.recordDecision")) return denied(db, actor, MODULE, "record a customer approval", whoCan("co.recordDecision"));
  return applyApproval(db, actor, co, input);
}

function applyApproval(db: Database, actor: User, co: ChangeOrder, input: ApprovalInput) {
  if (co.status !== "sent") return fail("Only a change order sent to the customer can be approved.");
  const dep = dependencyBlock(byId(db.changeOrders, co.parentId));
  if (dep) return fail(`Blocked: ${dep}`);
  const link = currentLink(co);
  if (link) {
    const state = coLinkState(co, link, now());
    if (state === "expired") return fail(`Link ${link.id} expired on ${dateLong(link.expiresAt)}. A person must issue a new link before the approval can be accepted.`);
    if (state === "signer_changed") return fail("The signer on the customer record changed. A new link is required.");
  }
  const job = byId(db.jobs, co.jobId)!;
  const customer = byId(db.customers, job.customerId);
  if (!input.signer.trim()) return fail("Enter who signed.", "signer");
  if (!isAuthorisedSigner(customer, input.signer)) {
    log(db, actor, MODULE, `Blocked: approval of ${co.id} by ${input.signer.trim()} not recorded — not an authorised signer on ${customer?.name}'s account.`, true);
    return fail(`Approval not recorded. ${input.signer.trim()} is not an authorised signer on ${customer?.name}'s account. The account must list them as authorised before their approval is accepted.`, "signer");
  }
  if ((input.channel as string) === "verbal") return fail("Verbal approval is never accepted outside the emergency path.", "channel");
  if (!input.evidenceRef.trim()) return fail("Record the evidence: the portal signature ID or the email reply reference.", "evidenceRef");
  const at = now();
  co.status = "approved";
  co.signer = input.signer.trim();
  co.decidedAt = at;
  co.evidence = { version: coVersion(co), signer: co.signer, channel: input.channel, ref: input.evidenceRef.trim(), at, recordedBy: actor.id };
  log(db, actor, MODULE, `Change Order ${co.id} v${coVersion(co)} approved by ${co.signer} via ${channelLabel(input.channel)} at ${dateTime(at)}. Evidence: ${co.evidence.ref}`);
  runDownstream(db, actor, co, input.failAction);
  return ok();
}

export function recordRejection(db: Database, actor: User, coId: string, input: { signer: string; reason: string }) {
  const co = getCo(db, coId);
  if (!co) return fail("Change order not found.");
  if (!can(actor, "co.recordDecision")) return denied(db, actor, MODULE, "record a rejection", whoCan("co.recordDecision"));
  return applyRejection(db, actor, co, input);
}

function applyRejection(db: Database, actor: User, co: ChangeOrder, input: { signer: string; reason: string }) {
  if (co.status !== "sent") return fail("Only a change order sent to the customer can be rejected.");
  if (!input.signer.trim()) return fail("Enter who declined.", "signer");
  if (!input.reason.trim()) return fail("Record the customer's reason.", "reason");
  const at = now();
  co.status = "rejected";
  co.decidedAt = at;
  co.rejection = { signer: input.signer.trim(), reason: input.reason.trim(), at, by: actor.id };
  log(db, actor, MODULE, `Change Order ${co.id} rejected by ${co.rejection.signer} at ${dateTime(at)}. Reason: ${co.rejection.reason}`);
  // Children return to draft and are repriced against the last approved scope.
  const sv = scopeVersion(db, co.jobId);
  for (const child of db.changeOrders.filter((c) => c.parentId === co.id && OPEN_STATES.includes(c.status))) {
    toNewDraftVersion(child, `Parent ${co.id} rejected`);
    child.taxDate = now();
    reprice(db, child);
    child.returnedToDraft = { reason: `Parent ${co.id} was rejected`, at, scopeVersion: sv };
    log(db, actor, MODULE, `Change Order ${child.id} returned to draft because parent ${co.id} was rejected. Repriced against scope version ${sv}`);
  }
  return ok();
}

/**
 * NEW (feature 24): the customer decides on the public estimate page
 * (/estimates/view/[token]) using the link they were sent. The same checks
 * as a recorded approval apply: link state, authorised signer, evidence.
 */
export function customerDecideChangeOrder(db: Database, actor: User, coId: string, linkId: string, input: { decision: "approve" | "reject"; signer: string; signed: boolean; reason?: string }) {
  const co = getCo(db, coId);
  if (!co) return fail("Change order not found.");
  const link = coLinks(co).find((l) => l.id === linkId);
  if (!link) return fail("This approval link is not valid.");
  const state = coLinkState(co, link, now());
  if (state === "expired") return fail("This approval link has expired. Please contact us for a new link.");
  if (state === "superseded") return fail("This link is for an earlier version. Please use the newest link we sent.");
  if (state === "signer_changed") return fail("This link is no longer valid. We will send a new link to the right person.");
  if (state === "used" || co.status !== "sent") return fail("This change order has already been decided.");
  if (input.decision === "reject") return applyRejection(db, actor, co, { signer: input.signer, reason: input.reason ?? "" });
  if (!input.signed) return fail("Please sign above before approving.", "signature");
  return applyApproval(db, actor, co, { signer: input.signer, channel: "portal", evidenceRef: `Portal signature on link ${link.id}` });
}

/** Payment refused for work already performed. Never recorded as Rejected. */
export function recordDispute(db: Database, actor: User, coId: string, note: string) {
  const co = getCo(db, coId);
  if (!co) return fail("Change order not found.");
  if (!can(actor, "co.recordDecision")) return denied(db, actor, MODULE, "record a dispute", whoCan("co.recordDecision"));
  if (co.status !== "approved") return fail("Only approved work can be disputed. Refusal before work begins is a rejection.");
  if (!note.trim()) return fail("Note what the customer said.", "note");
  const taskId = nextId(db, "task", "T-");
  db.tasks.unshift({ id: taskId, title: `Owner: disputed change order ${co.id} — payment refused for performed work`, done: false, createdAt: now() });
  co.status = "disputed";
  co.dispute = { note: note.trim(), at: now(), by: actor.id, taskId };
  log(db, actor, MODULE, `Change Order ${co.id} – Payment disputed for performed work. Referred to owner by ${actor.name} at ${dateTime(now())}`);
  return ok();
}

/** Partial acceptance is not allowed: move the agreed or disputed lines to a separate change order. */
export function splitChangeOrder(db: Database, actor: User, coId: string, lineIds: string[], title: string) {
  const co = getCo(db, coId);
  const g = guardBuild(db, actor, co, "split a change order");
  if (g) return g;
  if (!OPEN_STATES.includes(co!.status)) return fail("Only an open change order can be split.");
  if (lineIds.length === 0) return fail("Choose the lines to move.", "lines");
  if (lineIds.length >= co!.lines.length) return fail("Leave at least one line on the original change order.", "lines");
  if (!title.trim()) return fail("Give the new change order a title.", "title");
  const moving = co!.lines.filter((l) => lineIds.includes(l.id));
  const newId = nextDocNumber("CO", co!.jobId, db.changeOrders.filter((c) => c.jobId === co!.jobId).map((c) => c.id));
  const child: ChangeOrder = {
    id: newId,
    jobId: co!.jobId,
    type: co!.type,
    title: title.trim(),
    status: "draft",
    parentId: co!.parentId,
    lines: moving.map((l, i) => ({ ...l, id: `L${i + 1}` })),
    markupPct: co!.markupPct,
    taxRatePct: co!.taxRatePct,
    taxDate: now(),
    createdAt: now(),
    createdBy: actor.id,
    recipient: co!.recipient,
    recipientName: co!.recipientName,
    recipientVerified: co!.recipientVerified,
    version: 1,
    splitFrom: co!.id,
    downstream: { work_order: "not_started", materials: "not_started", scheduler: "not_started", billing: "not_started" },
  };
  reprice(db, child);
  db.changeOrders.push(child);
  co!.lines = co!.lines.filter((l) => !lineIds.includes(l.id));
  if (co!.status !== "draft") toNewDraftVersion(co!, `Split: lines moved to ${newId}`);
  reprice(db, co!);
  log(db, actor, MODULE, `Change Order ${newId} created on job ${co!.jobId}, type ${CO_TYPE[child.type].label}, gross ${money(coPricing(db, child).grossAddition)} by ${actor.name}`);
  log(db, actor, MODULE, `Change Order ${co!.id} split: ${moving.length} line(s) moved to ${newId} by ${actor.name}. Both are drafts and are approved separately.`);
  return ok(newId);
}

/* ================================================================== */
/* Emergency work (24.3)                                               */
/* ================================================================== */

export interface EmergencyInput {
  findings: string;
  photos: number;
  authoriserId: string;
  ownerUnreachable: boolean;
  verbalAt: string;
  customerMessageRef: string;
}

export function raiseEmergency(db: Database, actor: User, coId: string, input: EmergencyInput) {
  const co = getCo(db, coId);
  const g = guardBuild(db, actor, co, "raise emergency work");
  if (g) return g;
  const d = guardDraft(co!);
  if (d) return d;
  if (co!.lines.length === 0) return fail("Add the emergency work as a line first.");
  const dep = dependencyBlock(byId(db.changeOrders, co!.parentId));
  if (dep) return fail(`Blocked: ${dep}`);
  reprice(db, co!);
  const p = coPricing(db, co!);
  if (!emergencyEligible(p.total)) {
    return fail(`Verbal approval does not qualify. The emergency path is only for work strictly below $500.00, and this change totals ${money(p.total)}. Get written approval first.`);
  }
  const authoriser = byId(db.users, input.authoriserId);
  const missing = missingEmergencyEvidence({ ...input, authoriser: authoriser?.id }, now());
  if (missing.length) return fail(`Missing same-day evidence: ${missing.join(", ")}.`, missing[0]);
  if (!authoriser || !(authoriser.role === "owner" || authoriser.role === "office_manager")) return fail("Emergency work is authorised by the business owner, or the office manager if the owner is unreachable.", "authoriser");
  if (authoriser.role === "office_manager" && !input.ownerUnreachable) return fail("The office manager authorises only when the owner is unreachable. Tick “Owner unreachable” or choose the owner.", "authoriser");
  const due = addWorkingDays(input.verbalAt, 2);
  co!.emergency = {
    authoriser: authoriser.id,
    verbalAt: input.verbalAt,
    findings: input.findings.trim(),
    photos: input.photos,
    ownerUnreachable: authoriser.role === "office_manager" ? true : undefined,
    customerMessageRef: input.customerMessageRef.trim(),
    amount: p.total,
  };
  const customer = byId(db.customers, byId(db.jobs, co!.jobId)?.customerId);
  co!.status = "approved";
  co!.ownerApprovedBy = authoriser.id;
  co!.ownerApprovedAt = input.verbalAt;
  co!.signer = customer?.name;
  co!.decidedAt = input.verbalAt;
  co!.evidence = { version: coVersion(co!), signer: customer?.name ?? "Customer", channel: "verbal", ref: input.customerMessageRef.trim(), at: input.verbalAt, recordedBy: actor.id };
  log(db, actor, MODULE, `Change Order ${co!.id} – Emergency work ${money(p.total)} verbally authorised by ${authoriser.name} at ${dateTime(input.verbalAt)}. Written confirmation due ${dateLong(`${due}T12:00:00`)}`);
  runDownstream(db, actor, co!);
  return ok();
}

export function recordWrittenConfirmation(db: Database, actor: User, coId: string, ref: string) {
  const co = getCo(db, coId);
  if (!co?.emergency) return fail("Not an emergency change order.");
  if (!can(actor, "co.recordDecision")) return denied(db, actor, MODULE, "record written confirmation", whoCan("co.recordDecision"));
  if (co.emergency.writtenConfirmedAt) return fail("Written confirmation is already recorded.");
  if (!ref.trim()) return fail("Record the signed document or email reference.", "ref");
  co.emergency.writtenConfirmedAt = now();
  co.emergency.writtenRef = ref.trim();
  co.emergency.workStopped = false;
  log(db, actor, MODULE, `Change Order ${co.id} – Written confirmation (${ref.trim()}) recorded by ${actor.name} at ${dateTime(now())}. Work may continue.`);
  runDownstream(db, actor, co); // billing was deferred until now
  return ok();
}

export function recordCustomerCall(db: Database, actor: User, coId: string, note: string) {
  const co = getCo(db, coId);
  if (!co?.emergency) return fail("Not an emergency change order.");
  if (!can(actor, "co.recordDecision")) return denied(db, actor, MODULE, "record the customer call", whoCan("co.recordDecision"));
  if (!co.emergency.escalatedAt) return fail("This change order has not been escalated.");
  if (!note.trim()) return fail("Note what the customer said.", "note");
  co.emergency.customerCalledAt = now();
  const task = db.tasks.find((t) => t.id === co.emergency!.callTaskId);
  if (task) task.done = true;
  log(db, actor, MODULE, `Change Order ${co.id} – Written confirmation missing after two working days. Escalated to owner; work stopped; customer called by ${actor.name}. Note: ${note.trim()}`);
  return ok();
}

/* ================================================================== */
/* Downstream recovery (24.4)                                          */
/* ================================================================== */

export function retryDownstream(db: Database, actor: User, coId: string, key: DownstreamKey) {
  const co = getCo(db, coId);
  if (!co) return fail("Change order not found.");
  if (!can(actor, "co.exceptions")) return denied(db, actor, MODULE, "retry a downstream action", whoCan("co.exceptions"));
  if (co.downstream[key] !== "failed") return fail(`${DOWNSTREAM_LABEL[key]} is not in a failed state. Succeeded actions are locked and never reapplied.`);
  const ref = performDownstream(db, actor, co, key);
  if (ref === null) return fail("Billing waits for written confirmation of the emergency work.");
  co.downstream[key] = "done";
  co.downstreamMeta = { ...co.downstreamMeta, [key]: { ...co.downstreamMeta?.[key], at: now(), by: actor.id, ref, error: undefined } };
  log(db, actor, MODULE, `Change Order ${co.id} – Missing ${DOWNSTREAM_LABEL[key]} retried successfully by ${actor.name} at ${dateTime(now())}`);
  return ok(ref);
}

export function markReconciled(db: Database, actor: User, coId: string, key: DownstreamKey, note: string) {
  const co = getCo(db, coId);
  if (!co) return fail("Change order not found.");
  if (!can(actor, "co.exceptions")) return denied(db, actor, MODULE, "reconcile a downstream action", whoCan("co.exceptions"));
  if (co.downstream[key] !== "failed") return fail("Only a failed action can be reconciled.");
  if (!note.trim()) return fail("Say how it was reconciled.", "note");
  co.downstream[key] = "done";
  co.downstreamMeta = { ...co.downstreamMeta, [key]: { at: now(), by: actor.id, ref: "Reconciled by hand", reconciledNote: note.trim() } };
  log(db, actor, MODULE, `Change Order ${co.id} – ${DOWNSTREAM_LABEL[key]} marked reconciled by ${actor.name}. Note: ${note.trim()}`);
  return ok();
}

export function recordRefundChoice(db: Database, actor: User, coId: string, choice: "refund" | "credit", requestIso: string) {
  const co = getCo(db, coId);
  if (!co?.billing || co.billing.mode !== "account_credit" || !co.billing.creditRaisedAt) return fail("No account credit on this change order.");
  if (!can(actor, "co.recordDecision")) return denied(db, actor, MODULE, "record the customer's refund choice", whoCan("co.recordDecision"));
  if (choice === "refund" && !refundAllowed(co.billing.creditRaisedAt, requestIso)) {
    return fail(`The 14-day refund window closed on ${co.billing.refundWindowCloses}. The default account credit stands.`, "date");
  }
  co.billing.customerChoice = choice;
  co.billing.choiceAt = requestIso;
  log(db, actor, MODULE, `Change Order ${co.id} – Credit ${money(-co.billing.amount)} raised ${dateLong(co.billing.creditRaisedAt)}; refund window closes ${co.billing.refundWindowCloses}. Customer choice: ${choice === "refund" ? "Refund" : "Credit"}`);
  return ok();
}

/* ================================================================== */
/* Daily 7 a.m. checks                                                 */
/* ================================================================== */

/**
 * Idempotent: escalates overdue emergency confirmations (owner escalated,
 * work stopped, call task for the office manager) and undeliverable links
 * past two working days. Screens run it on open, like the 7 a.m. job.
 */
export function runDailyChecks(db: Database, actor: User) {
  const t = now();
  let changed = 0;
  const office = db.users.find((u) => u.role === "office_manager");
  for (const co of db.changeOrders) {
    if (co.emergency && !co.emergency.writtenConfirmedAt && !co.emergency.escalatedAt) {
      const s = writtenConfirmationStatus(co.emergency.verbalAt, undefined, t);
      if (s.state === "overdue") {
        const job = byId(db.jobs, co.jobId);
        const customer = byId(db.customers, job?.customerId);
        const taskId = nextId(db, "task", "T-");
        db.tasks.unshift({ id: taskId, title: `${office?.name ?? "Office manager"}: call ${customer?.name ?? "the customer"} today — written confirmation for ${co.id} overdue`, done: false, createdAt: t });
        Object.assign(co.emergency, { escalatedAt: t, workStopped: true, callTaskId: taskId });
        log(db, actor, MODULE, `Change Order ${co.id} – Written confirmation missing after two working days. Escalated to owner; work stopped; customer call task ${taskId} created for ${office?.name ?? "the office manager"}`);
        changed++;
      }
    }
    for (const l of co.links ?? []) {
      if (l.supersededAt || l.delivery !== "undeliverable" || !l.deliveryFailedAt || l.escalatedAt) continue;
      if (undeliverableStatus(l.deliveryFailedAt, t).escalate) {
        l.escalatedAt = t;
        log(db, actor, MODULE, `Change Order ${co.id} – approval message to ${l.recipient} undeliverable for two working days. Escalated to ${userName(db, "U-OWNER")} (owner)`);
        changed++;
      }
    }
  }
  return ok(changed);
}
