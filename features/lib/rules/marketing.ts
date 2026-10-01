/**
 * Feature 34 — Social Media And Marketing Management.
 *
 * The risks this module manages are publishing something the business has no
 * permission to publish, and publishing at the wrong moment. Nothing here
 * creates advertising spend; an organic post is never an advertisement.
 */
import type { MediaAsset, MarketingPost } from "@/features/types";

export const MARKETING_TZ = "America/Chicago";
export const MAX_UPLOAD_MB = 8;
export const MISSED_AFTER_MIN = 30;
export const REPEAT_WINDOW_DAYS = 90;
export const TEMPLATE_SIZES = { square: "1080 × 1080", vertical: "1080 × 1350" } as const;

/* ------------------------------ Consent ------------------------------ */

export interface ConsentResult {
  ok: boolean;
  /** One line per asset that fails, naming the missing release. */
  failures: string[];
  /** Release references relied on, for the log. */
  releases: string[];
}

/** Consent state shown on each asset: Released, No release (surface images only), Withdrawn. */
export function consentState(a: MediaAsset): "released" | "no_release" | "withdrawn" {
  if (a.withdrawnAt || a.deletedForPrivacyAt) return "withdrawn";
  return a.release === "none" ? "no_release" : "released";
}

/** Without a release, only surface images can be used. Employees are covered by a hiring release. */
export function usable(a: MediaAsset): { ok: boolean; reason?: string } {
  const s = consentState(a);
  if (s === "withdrawn") return { ok: false, reason: `Permission withdrawn${a.withdrawnAt ? ` on ${a.withdrawnAt.slice(0, 10)}` : ""}` };
  if (s === "no_release" && (a.kind === "customer_property" || a.identifying)) return { ok: false, reason: `Surface images only — no signed release on ${a.jobId ?? "this job"}.` };
  if (a.kind === "crew" && a.release !== "hiring_release") return { ok: false, reason: "Crew image without a hiring release." };
  return { ok: true };
}

export function consentCheck(assets: MediaAsset[]): ConsentResult {
  const failures = assets.map((a) => ({ a, u: usable(a) })).filter((x) => !x.u.ok).map((x) => `${x.a.id}: ${x.u.reason}`);
  const releases = assets.filter((a) => a.releaseRef).map((a) => `${a.releaseRef} on job ${a.jobId ?? "—"}`);
  return { ok: failures.length === 0, failures, releases };
}

/* ------------------------------ Approval ----------------------------- */

export type ApprovalReason = "CustomerProperty" | "Photo" | "Testimonial" | "CrewSpotlight";

/**
 * Owner approval is mandatory for customer-property content, photographs of
 * people, testimonials and named crew spotlights. Routine content with no
 * identifiers needs none.
 */
export function approvalReasons(post: Pick<MarketingPost, "template" | "flags">, assets: MediaAsset[]): ApprovalReason[] {
  const r: ApprovalReason[] = [];
  if (post.flags.customerProperty || assets.some((a) => a.kind === "customer_property")) r.push("CustomerProperty");
  if (assets.some((a) => a.identifying)) r.push("Photo");
  if (post.flags.testimonial) r.push("Testimonial");
  if (post.flags.namedCrew || post.template === "crew_spotlight") r.push("CrewSpotlight");
  return r;
}

/** Approval attaches to the reviewed version only. */
export function approvalCurrent(post: Pick<MarketingPost, "approval" | "version">) {
  return !!post.approval && post.approval.version === post.version;
}

/* --------------------------- Location check -------------------------- */

const SUFFIX = "St|Street|Ave|Avenue|Dr|Drive|Rd|Road|Ln|Lane|Ct|Court|Blvd|Boulevard|Pkwy|Parkway|Way|Cir|Circle|Trl|Trail|Pl|Place|Hwy|Highway|Ter|Terrace";
const STREET = new RegExp(`\\b\\d{1,6}\\s+(?:[A-Za-z]+\\s+){1,3}(?:${SUFFIX})\\b\\.?`, "i");

/** Returns the street address found in the copy, or null. Neighbourhood references are fine. */
export function findStreetAddress(copy: string): string | null {
  return copy.match(STREET)?.[0] ?? null;
}

/** Visible address detail (house numbers, licence plates) must be cropped or blocked before scheduling. */
export function addressDetail(a: MediaAsset): boolean {
  return /house number|licen[cs]e plate|street sign/i.test(a.identifyingNote ?? "");
}

/* ------------------------------ Uploads ------------------------------ */

export function validateUpload(file: { sizeMb: number; type: string }): { ok: boolean; error?: string } {
  if (file.type.startsWith("video/")) return { ok: false, error: "Video is not supported at launch. Upload a finished photograph." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "Only photographs can be uploaded." };
  if (!(file.sizeMb < MAX_UPLOAD_MB)) return { ok: false, error: `Images must be under ${MAX_UPLOAD_MB} MB. This one is ${file.sizeMb} MB.` };
  return { ok: true };
}

/* ------------------------- Material edit vs typo ---------------------- */

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export type MaterialKind = "Image" | "IdentifyingText" | "Claim";

/**
 * A changed image, changed identifying text or a changed claim is material.
 * A typo alone is not: same words, each change a small spelling fix with no
 * number involved.
 */
export function materialEdit(before: { copy: string; assetIds: string[] }, after: { copy: string; assetIds: string[] }): MaterialKind | null {
  if ([...before.assetIds].sort().join() !== [...after.assetIds].sort().join()) return "Image";
  if (before.copy === after.copy) return null;
  const a = before.copy.trim().split(/\s+/);
  const b = after.copy.trim().split(/\s+/);
  const changed: [string, string][] = [];
  if (a.length === b.length) a.forEach((w, i) => w !== b[i] && changed.push([w, b[i]]));
  const typo = a.length === b.length && changed.every(([x, y]) => !/\d/.test(x + y) && lev(x.toLowerCase(), y.toLowerCase()) <= 2);
  if (typo) return null;
  // Anything beyond a typo is material: names and places are identifying text, everything else is treated as a claim.
  const diff = [...b.filter((w) => !a.includes(w)), ...a.filter((w) => !b.includes(w))];
  if (diff.some((w) => /\d|%|\$|guarantee|warrant|best|years?|cheapest|lowest|free/i.test(w))) return "Claim";
  if (diff.some((w) => /^[A-Z][a-z]/.test(w))) return "IdentifyingText";
  return "Claim";
}

/* ---------------------------- Scheduling ----------------------------- */

const formatters = new Map<string, Intl.DateTimeFormat>();
function wallClock(utcMs: number, tz: string): string {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    formatters.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function instantsFor(localDate: string, localTime: string, tz: string): number[] {
  const [y, m, d] = localDate.split("-").map(Number);
  const [hh, mm] = localTime.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  const target = `${localDate}T${localTime}`;
  const found = new Set<number>();
  for (let off = -14 * 60; off <= 14 * 60; off += 15) {
    const t = naive - off * 60_000;
    if (wallClock(t, tz) === target) found.add(t);
  }
  return [...found].sort((a, b) => a - b);
}

export type DstAdjustment = "none" | "moved_to_first_valid" | "first_occurrence";

/**
 * Local wall-clock time to an instant (34.Q01). A nonexistent spring-forward
 * time moves to the first valid time after the gap; a repeated autumn time
 * uses the first occurrence.
 */
export function resolveLocal(localDate: string, localTime: string, tz = MARKETING_TZ): { utc: string; adjustment: DstAdjustment; resolvedLocal: string } {
  const hits = instantsFor(localDate, localTime, tz);
  if (hits.length === 1) return { utc: new Date(hits[0]).toISOString(), adjustment: "none", resolvedLocal: `${localDate} ${localTime}` };
  if (hits.length > 1) return { utc: new Date(hits[0]).toISOString(), adjustment: "first_occurrence", resolvedLocal: `${localDate} ${localTime}` };
  const [hh, mm] = localTime.split(":").map(Number);
  for (let step = 1; step <= 180; step++) {
    const total = hh * 60 + mm + step;
    if (total >= 24 * 60) break;
    const t = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    const h = instantsFor(localDate, t, tz);
    if (h.length) return { utc: new Date(h[0]).toISOString(), adjustment: "moved_to_first_valid", resolvedLocal: `${localDate} ${t}` };
  }
  throw new Error("Unresolvable local time");
}

export function localLabel(utc: string, tz = MARKETING_TZ): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(utc));
}

/** Local date and time parts of an instant, for form fields. */
export function localParts(utc: string, tz = MARKETING_TZ) {
  const w = wallClock(new Date(utc).getTime(), tz);
  return { date: w.slice(0, 10), time: w.slice(11) };
}

/** Transition dates for a year in the configured zone: second Sunday of March, first Sunday of November. */
export function dstDates(year: number) {
  const nth = (month: number, n: number) => {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(1 + ((7 - first) % 7) + (n - 1) * 7).padStart(2, "0")}`;
  };
  return { springForward: nth(2, 2), fallBack: nth(10, 1) };
}

/**
 * No late post publishes automatically, even inside 30 minutes. More than
 * 30 minutes late is a missed post.
 */
export function lateness(scheduledUtc: string, nowIso: string): { minutes: number; state: "not_due" | "waiting" | "missed" } {
  const minutes = Math.floor((new Date(nowIso).getTime() - new Date(scheduledUtc).getTime()) / 60_000);
  if (minutes < 0) return { minutes, state: "not_due" };
  return { minutes, state: minutes > MISSED_AFTER_MIN ? "missed" : "waiting" };
}

/* --------------------------- Lead matching --------------------------- */

export const normPhone = (p?: string) => (p ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
export const normEmail = (e?: string) => (e ?? "").trim().toLowerCase();

export interface LeadContact {
  id: string;
  phone?: string;
  email?: string;
  lastActivityAt: string;
  /** Not sold, lost or archived. Missing = open. */
  open?: boolean;
}

/** A lead still in play (D5). */
export const isOpenLead = (stage: string) => stage !== "sold" && stage !== "lost" && stage !== "archived";

export type LeadMatch =
  | { kind: "new"; reason?: string }
  | { kind: "possible_duplicate"; leadId: string; on: "phone" | "email" }
  | { kind: "review"; phoneLeadId: string; emailLeadId: string };

/**
 * 2 Oct 2026 (D5). Phone first, then email, against open leads only. A match
 * still creates the lead, marked "Possible duplicate" with a link to the
 * other lead. Phone matching one lead and email another also puts it on the
 * review list. Never an automatic merge, and nothing is dropped.
 */
export function matchLead(leads: LeadContact[], sub: { phone?: string; email?: string }, nowIso: string): LeadMatch {
  void nowIso; // kept in the signature: the old 90-day window no longer applies
  const newest = (xs: LeadContact[]) => [...xs].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0];
  const open = leads.filter((l) => l.open !== false);
  const phone = normPhone(sub.phone);
  const email = normEmail(sub.email);
  const byPhone = phone ? newest(open.filter((l) => normPhone(l.phone) === phone)) : undefined;
  const byEmail = email ? newest(open.filter((l) => normEmail(l.email) === email)) : undefined;
  if (byPhone && byEmail && byPhone.id !== byEmail.id) return { kind: "review", phoneLeadId: byPhone.id, emailLeadId: byEmail.id };
  if (byPhone) return { kind: "possible_duplicate", leadId: byPhone.id, on: "phone" };
  if (byEmail) return { kind: "possible_duplicate", leadId: byEmail.id, on: "email" };
  return { kind: "new" };
}

export const MANDATORY_FIELDS = ["name", "phone", "email", "town", "message"] as const;

export function missingLeadFields(sub: Partial<Record<(typeof MANDATORY_FIELDS)[number], string>>): string[] {
  return MANDATORY_FIELDS.filter((f) => !(sub[f] ?? "").trim());
}
