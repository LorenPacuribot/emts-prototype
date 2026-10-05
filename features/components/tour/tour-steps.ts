/**
 * Product tour: the shape of a feature tour and its steps.
 *
 * There is one short tour per new feature, written in ./feature-tours.ts. Each
 * opens with an overview card (what it solves, the flow before it, and its
 * Minimal and Complete versions, or "core module" for the fourteen patent
 * features built as one package), then walks the actions on the real
 * screens: add, update, delete, approve, send or view. Every action step says
 * how it was done before, what you do here, and where the result shows.
 *
 * A step's `target` names a `data-tour="..."` anchor on the page. If the
 * anchor isn't rendered (another role, or the data has changed), the callout
 * shows centred instead of pointing at nothing.
 */
import type { Role } from "@/features/types";
import type { FeatureKey } from "@/features/lib/feature-registry";

/** What the visitor does in a step. Shown as a chip on the callout. */
export type StepKind = "add" | "update" | "delete" | "approve" | "send" | "view";

export const STEP_KIND_LABEL: Record<StepKind, string> = {
  add: "Add", update: "Update", delete: "Delete / remove", approve: "Approve", send: "Send", view: "View",
};

export interface TourStep {
  target?: string;
  title: string;
  kind?: StepKind;
  /** How this was done before the feature (the live app's flow). */
  before?: string;
  /** What you do here, and what happens. */
  body: string;
  bullets?: string[];
  /** Where the result shows afterwards. */
  shows?: string;
  /** A concrete thing to click, shown as "Try it". */
  tryIt?: string;
  /** Shown instead of the generic note when the target appears only after an earlier action. */
  absentNote?: string;
  /** Role that shows this step best. The callout offers a switch button. */
  role?: Role;
  /** 30 Sep call features: the version this step belongs to. */
  version?: "minimal" | "complete";
  /** One-click setup offered on the step. */
  action?: "pin_clock";
}

/** One screen of a feature tour, and the steps taken on it. */
export interface TourPage {
  href: string;
  /** Default role for the page's steps. */
  role?: Role;
  steps: TourStep[];
}

export interface FeatureTour {
  key: FeatureKey;
  /** The problem it solves, in a sentence. */
  solves: string;
  benefits: string[];
  /** The flow before this feature (the live app today). */
  before: string;
  /** Default role for the whole tour. */
  role?: Role;
  /** One-click setup offered on the overview card. */
  action?: "pin_clock";
  pages: TourPage[];
}

/** A step with its page resolved, as the tour runner walks them. */
export interface FlatStep extends TourStep {
  href: string;
  /** The overview card that opens every feature tour. */
  intro?: boolean;
}

/** The overview card, then every page's steps in order. */
export function flatSteps(tour: FeatureTour): FlatStep[] {
  const first = tour.pages[0];
  const intro: FlatStep = { href: first.href, intro: true, title: "Overview", body: tour.solves, role: first.role ?? tour.role, action: tour.action };
  return [intro, ...tour.pages.flatMap((p) => p.steps.map((s) => ({ ...s, href: p.href, role: s.role ?? p.role ?? tour.role })))];
}

/** Split a step href into the parts the tour matches on. */
export function parseHref(href: string) {
  const [path, query = ""] = href.split("?");
  const q = new URLSearchParams(query);
  return { path: normalisePath(path), query: q };
}

export function normalisePath(p: string) {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}
