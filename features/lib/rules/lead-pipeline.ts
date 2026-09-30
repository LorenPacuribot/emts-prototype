/**
 * The live Lead Pipeline rules (features/(main)/leads/listings/lib/constants.ts),
 * written against the prototype's internal stages.
 *
 * Live LeadStatus  ↔  internal PipelineStage
 *   New            ↔  new_lead
 *   Contacted      ↔  contacted
 *   Scheduled      ↔  estimate_scheduled   (shown as "Estimate Scheduled")
 *   Pending        ↔  pending               (set by the estimate lifecycle)
 *   Sold           ↔  sold
 *   Lost           ↔  lost
 *   Archived       ↔  archived
 */
import type { Lead, LeadSource, PipelineStage } from "@/features/types";

export const LIVE_LEAD_STATUS: Record<PipelineStage, string> = {
  new_lead: "New", contacted: "Contacted", estimate_scheduled: "Scheduled", pending: "Pending", sold: "Sold", lost: "Lost", archived: "Archived",
};

/** Live DEFAULT_PIPELINE_STAGES: the six kanban columns. */
export const PIPELINE_COLUMNS: { id: PipelineStage; label: string; color: string; border: string }[] = [
  { id: "new_lead", label: "New Leads", color: "bg-blue-100 text-blue-700", border: "border-blue-500" },
  { id: "contacted", label: "Contacted", color: "bg-purple-100 text-purple-700", border: "border-purple-500" },
  { id: "estimate_scheduled", label: "Scheduled", color: "bg-orange-100 text-orange-700", border: "border-orange-500" },
  { id: "pending", label: "Pending", color: "bg-amber-100 text-amber-700", border: "border-amber-500" },
  { id: "sold", label: "Sold", color: "bg-green-100 text-green-700", border: "border-green-500" },
  { id: "lost", label: "Lost", color: "bg-red-100 text-red-700", border: "border-red-500" },
];

/** Live PIPELINE_STEPS on the lead details status bar. */
export const PIPELINE_STEPS: PipelineStage[] = ["new_lead", "contacted", "estimate_scheduled", "pending", "sold", "lost"];

/** Live LEAD_STATUS_DISPLAY_NAMES. */
export const LEAD_STAGE_DISPLAY: Record<PipelineStage, string> = { ...LIVE_LEAD_STATUS, estimate_scheduled: "Estimate Scheduled" };

const MANUAL: PipelineStage[] = ["new_lead", "contacted", "estimate_scheduled", "archived"];

/** Live canManuallySetStatus: Sold only from Scheduled; Lost from Contacted or Scheduled; Pending never by hand. */
export function canManuallySetStage(from: PipelineStage, to: PipelineStage): boolean {
  if (to === "sold") return from === "estimate_scheduled";
  if (to === "lost") return from === "contacted" || from === "estimate_scheduled";
  return MANUAL.includes(to);
}

/** Live canArchiveLeadStatus: only Scheduled, Pending and Lost can be archived. */
export const canArchiveStage = (s: PipelineStage) => s === "estimate_scheduled" || s === "pending" || s === "lost";

/** Live NEXT_STAGE_MAP (the arrow button on a card). */
export const NEXT_STAGE: Record<PipelineStage, PipelineStage | null> = {
  new_lead: "contacted", contacted: "estimate_scheduled", estimate_scheduled: null, pending: null, sold: null, lost: "contacted", archived: "contacted",
};

/** The message the live board shows when a drop is refused. */
export function refusedMoveMessage(to: PipelineStage): string {
  if (to === "lost") return "A lead can only be marked Lost from the Contacted or Scheduled stage.";
  if (to === "sold") return "A lead can only be marked Sold from the Scheduled stage.";
  return `${LIVE_LEAD_STATUS[to]} is set by the estimate lifecycle. Send / accept / decline the estimate to move the lead there.`;
}

/** Live LEAD_LIFECYCLE_TYPE: Lead → Contact (once scheduled) → Client (once sold). */
export function lifecycleType(s: PipelineStage): { label: string; color: string } {
  if (s === "sold") return { label: "Client", color: "bg-green-100 text-green-700" };
  if (s === "estimate_scheduled" || s === "pending") return { label: "Contact", color: "bg-purple-100 text-purple-700" };
  if (s === "lost" || s === "archived") return { label: "Lead", color: "bg-gray-100 text-gray-500" };
  return { label: "Lead", color: "bg-blue-100 text-blue-700" };
}

/** Live COMMON_SOURCES for the lead form. */
export const COMMON_SOURCES = ["Website", "Referral", "Google", "Facebook", "Instagram", "Thumbtack", "Angi", "Nextdoor", "Yard Sign", "Truck Wrap"];

const SOURCE_LABEL: Record<LeadSource, string> = { website: "Website", referral: "Referral", existing_customer: "Existing Customer", repaint_alert: "Repaint alert" };

export function leadSourceLabel(l: Pick<Lead, "source" | "sourceLabel">): string {
  return l.sourceLabel ?? SOURCE_LABEL[l.source];
}

/** The form's source text → the stored source (anything not listed is kept as the label). */
export function sourceFromLabel(label: string): { source: LeadSource; sourceLabel?: string } {
  if (label === "Website") return { source: "website" };
  if (label === "Referral") return { source: "referral" };
  return { source: "website", sourceLabel: label };
}

/* ------------------------------------------------------------------ */
/* Pipelines and stages (30 Sep call, CRM-M1 to M3, CRM-C2)            */
/* Written against the replica records (lib/types).                    */
/* ------------------------------------------------------------------ */

export const MAX_STAGES = 12;

type RStage = import("@/lib/types").PipelineStage;
type RLead = import("@/lib/types").Lead;
type REstimate = Pick<import("@/lib/types").Estimate, "id" | "status" | "leadId" | "customerId" | "title" | "jobId">;
type RCard = import("@/lib/types").ProductionCard;
type RLeadStatus = import("@/lib/types").LeadStatus;

/** Stages saved before pipelines existed belong to Sales. */
export const stagePipeline = (s: Pick<RStage, "pipelineId">) => s.pipelineId ?? "sales";

/** The board columns of one pipeline, in order (the hidden Archived stage left out). */
export function pipelineColumns(stages: RStage[], pipelineId: string): RStage[] {
  return stages.filter((s) => stagePipeline(s) === pipelineId && !s.hidden).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Where each system stage must sit. Sales: New first, Sold second last, Lost
 * last. Production and added pipelines: their system stage last.
 */
function fixedSlot(s: RStage, count: number): number | undefined {
  if (!s.system) return undefined;
  if (s.leadStatus === "New") return 0;
  if (s.leadStatus === "Sold") return count - 2;
  return count - 1;
}

/** Explains why an order breaks the rules, or undefined when it is fine. */
export function stageOrderProblem(columns: RStage[]): string | undefined {
  if (columns.length > MAX_STAGES) return `A pipeline can have at most ${MAX_STAGES} stages.`;
  for (const [i, s] of columns.entries()) {
    const slot = fixedSlot(s, columns.length);
    if (slot !== undefined && slot !== i) return `${s.displayName} is a system stage and stays in its place.`;
  }
  return undefined;
}

/** Renumbers sortOrder 1..n in the given order. */
const renumber = (cols: RStage[]) => cols.map((s, i) => ({ ...s, sortOrder: i + 1 }));

type StageResult = { ok: true; columns: RStage[] } | { ok: false; error: string };

/** Moves a custom stage to a new position (0-based). System stages don't move. */
export function moveStage(columns: RStage[], id: string, to: number): StageResult {
  const from = columns.findIndex((s) => s.id === id);
  if (from < 0) return { ok: false, error: "Stage not found." };
  if (columns[from]!.system) return { ok: false, error: "System stages can't be moved." };
  const next = [...columns];
  const [s] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, s!);
  return stageOrderProblem(next) ? { ok: false, error: "Custom stages go between the system stages." } : { ok: true, columns: renumber(next) };
}

/** Adds a custom stage above Sold (Sales) or above the last system stage (other pipelines). */
export function insertStage(columns: RStage[], stage: RStage): StageResult {
  if (columns.length >= MAX_STAGES) return { ok: false, error: `A pipeline can have at most ${MAX_STAGES} stages.` };
  const soldAt = columns.findIndex((s) => s.leadStatus === "Sold");
  const last = columns.length - 1;
  const at = soldAt >= 0 ? soldAt : last >= 0 && columns[last]!.system ? last : columns.length;
  const next = [...columns];
  next.splice(at, 0, { ...stage, system: false });
  return { ok: true, columns: renumber(next) };
}

/** Why a stage can't be deleted, or undefined. */
export function deleteStageProblem(stage: Pick<RStage, "system">, cardCount: number): string | undefined {
  if (stage.system) return "System stages can't be deleted.";
  if (cardCount > 0) return `Move the ${cardCount} ${cardCount === 1 ? "card" : "cards"} in this stage first.`;
  return undefined;
}

/** Why a stage name can't be saved, or undefined. Names are unique inside a pipeline. */
export function stageNameProblem(name: string, others: string[]): string | undefined {
  const n = name.trim();
  if (!n) return "Enter a stage name.";
  if (n.length > 30) return "Keep it under 30 characters.";
  if (others.some((o) => o.trim().toLowerCase() === n.toLowerCase())) return "Each stage needs a unique name.";
  return undefined;
}

/**
 * The Sales column a lead sits in: a stage it was moved into by hand while its
 * status is unchanged, otherwise the stage that stands for its status.
 */
export function salesColumnFor(lead: Pick<RLead, "status" | "stageId" | "stageStatus">, columns: RStage[]): RStage | undefined {
  if (lead.stageId && lead.stageStatus === lead.status) {
    const own = columns.find((s) => s.id === lead.stageId && !s.leadStatus);
    if (own) return own;
  }
  return columns.find((s) => s.leadStatus === lead.status);
}

/** The stage a lead is in on an added pipeline (CRM-C2): its saved one, else the first. */
export function customColumnFor(lead: Pick<RLead, "pipelineStages">, columns: RStage[], pipelineId: string): RStage | undefined {
  const saved = lead.pipelineStages?.[pipelineId];
  return columns.find((s) => s.id === saved) ?? columns[0];
}

/** Leads or cards sitting in each stage, for the delete guard and the settings counts. */
export function stageCounts(
  stages: RStage[],
  pipelineIds: { id: string; kind: string }[],
  leads: Pick<RLead, "status" | "stageId" | "stageStatus" | "pipelineStages">[],
  cards: Pick<RCard, "stageId">[],
): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(stages.map((s) => [s.id, 0]));
  const bump = (id?: string) => { if (id && id in out) out[id]! += 1; };
  const active = leads.filter((l) => l.status !== "Archived");
  for (const p of pipelineIds) {
    const cols = pipelineColumns(stages, p.id);
    if (p.kind === "sales") active.forEach((l) => bump(salesColumnFor(l, cols)?.id));
    else if (p.kind === "custom") active.forEach((l) => bump(customColumnFor(l, cols, p.id)?.id));
  }
  cards.forEach((c) => bump(c.stageId));
  return out;
}

/* ---------- Production cards (CRM-M3) ---------- */

/** One sale = its estimate when there is one, else the lead. */
export const saleKeyOf = (lead?: Pick<RLead, "id" | "estimateId">, estimate?: Pick<REstimate, "id">) => estimate?.id ?? lead?.estimateId ?? lead?.id ?? "";

export interface NewCard {
  saleKey: string;
  leadId?: string;
  estimateId?: string;
  customerId?: string;
  title: string;
}

/**
 * Sales that need a Production card: leads at Sold and approved estimates
 * without one. A sale that already has a card (even after a re-approval), or
 * whose card was removed on purpose (`dismissed`), gets none.
 */
export function productionCardsToCreate(
  leads: Pick<RLead, "id" | "status" | "estimateId" | "firstName" | "lastName" | "customerId">[],
  estimates: REstimate[],
  cards: Pick<RCard, "saleKey">[],
  dismissed: string[] = [],
): NewCard[] {
  const have = new Set([...cards.map((c) => c.saleKey), ...dismissed]);
  const out: NewCard[] = [];
  const add = (c: NewCard) => {
    if (!c.saleKey || have.has(c.saleKey)) return;
    have.add(c.saleKey);
    out.push(c);
  };
  for (const e of estimates) if (e.status === "Approved") add({ saleKey: e.id, estimateId: e.id, leadId: e.leadId, customerId: e.customerId, title: e.title });
  for (const l of leads) {
    if (l.status !== "Sold") continue;
    const e = estimates.find((x) => x.id === l.estimateId);
    add({ saleKey: saleKeyOf(l, e), leadId: l.id, estimateId: e?.id, customerId: l.customerId, title: `${l.firstName} ${l.lastName}`.trim() });
  }
  return out;
}

/** Leaving Sold by hand asks what to do with the Production card. */
export const leavesSold = (from: RLeadStatus, to: RLeadStatus) => from === "Sold" && to !== "Sold";
