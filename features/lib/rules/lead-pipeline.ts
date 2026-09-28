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
  { id: "sold", label: "Sold", color: "bg-emerald-100 text-emerald-700", border: "border-emerald-500" },
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
  if (s === "sold") return { label: "Client", color: "bg-emerald-100 text-emerald-700" };
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
