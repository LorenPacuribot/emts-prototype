/**
 * Features 25 and 26 — property paint record and customer QR record.
 *
 * Pure rules only. Screens and store actions call these so the same rule
 * decides the closeout block, the customer-safe field list, the consent
 * fallback, caller verification and the touch-up rate limit everywhere.
 */
import type { Application, CloseoutRow, ConsentAttempt, OwnershipPeriod, SharedPhoto, UnknownException } from "@/features/types";
import { DAY_MS } from "./dates";

/** Business details for printed cards and the public page (the owner supplies these). */
export const BUSINESS = {
  name: "Estimate Master Painting",
  phone: "(214) 555-0199",
  email: "office@estimatemaster.app",
};

/* ------------------------------------------------------------------ */
/* Closeout (component 25.2)                                           */
/* ------------------------------------------------------------------ */

export type CloseoutField = "colour" | "sheen" | "coats" | "completedAt";

export const CLOSEOUT_FIELD_LABEL: Record<CloseoutField, string> = {
  colour: "manufacturer and colour",
  sheen: "sheen",
  coats: "coats",
  completedAt: "completion date",
};

function hasUnknown(unknowns: UnknownException[], field: UnknownException["field"]) {
  return unknowns.some((u) => u.field === field);
}

/**
 * Missing required facts for one closeout row. A surface that was not painted
 * needs nothing. An owner-approved Unknown satisfies its field.
 */
export function closeoutRowGaps(row: Pick<CloseoutRow, "painted" | "manufacturer" | "colourName" | "colourNumber" | "sheen" | "coats" | "completedAt" | "unknowns">): CloseoutField[] {
  if (!row.painted) return [];
  const gaps: CloseoutField[] = [];
  const colourOk = hasUnknown(row.unknowns, "colour") || (!!row.manufacturer.trim() && !!row.colourName.trim() && !!row.colourNumber.trim() && row.colourName !== "Unknown");
  if (!colourOk) gaps.push("colour");
  const sheenOk = hasUnknown(row.unknowns, "sheen") || (!!row.sheen && row.sheen !== "Unknown");
  if (!sheenOk) gaps.push("sheen");
  if (!row.coats || row.coats < 1 || !Number.isInteger(row.coats)) gaps.push("coats");
  const dateOk = hasUnknown(row.unknowns, "completedAt") || !!row.completedAt;
  if (!dateOk) gaps.push("completedAt");
  return gaps;
}

export interface CloseoutBlocker {
  surfaceId: string;
  missing: string[];
}

/**
 * Can the office manager close the job? Every surface in the approved scope
 * must have a row, every painted row must be complete and crew-confirmed.
 * Missing optional actuals never block.
 */
export function closeoutBlockers(scopeSurfaceIds: string[], rows: CloseoutRow[]): CloseoutBlocker[] {
  const blockers: CloseoutBlocker[] = [];
  for (const sid of scopeSurfaceIds) {
    const row = rows.find((r) => r.surfaceId === sid);
    if (!row) {
      blockers.push({ surfaceId: sid, missing: ["completion date", "crew lead confirmation"] });
      continue;
    }
    const missing: string[] = closeoutRowGaps(row).map((g) => CLOSEOUT_FIELD_LABEL[g]);
    if (!row.confirmedBy) missing.push("crew lead confirmation");
    if (missing.length) blockers.push({ surfaceId: sid, missing });
  }
  return blockers;
}

/** "Not recorded" — never zero, never an estimate. */
export function actualLabel(value: number | undefined, unit: string): string {
  return value === undefined || value === null ? "Not recorded" : `${value} ${unit}`;
}

/* ------------------------------------------------------------------ */
/* Corrections (component 25.3, Rule 4)                                */
/* ------------------------------------------------------------------ */

export type CorrectionField = "Colour" | "Product" | "Sheen" | "Coats" | "Location" | "Completion date" | "Photographs";

export const CORRECTION_FIELDS: CorrectionField[] = ["Colour", "Product", "Sheen", "Coats", "Location", "Completion date", "Photographs"];

/** Shared-record corrections that need a customer notice (Rule 4). Dates and photos do not. */
export function correctionNeedsNotice(field: string): boolean {
  return ["colour", "product", "sheen", "coats", "location"].includes(field.toLowerCase());
}

/* ------------------------------------------------------------------ */
/* Ownership and predecessor consent (component 25.4, 25.Q01)          */
/* ------------------------------------------------------------------ */

export interface UnreachableCheck {
  ok: boolean;
  attempts: number;
  days: number;
  channels: string[];
  problems: string[];
}

/** Unreachable = three documented attempts over 14 days across at least two channels. */
export function unreachableCheck(attempts: Pick<ConsentAttempt, "at" | "channel">[]): UnreachableCheck {
  const sorted = [...attempts].sort((a, b) => a.at.localeCompare(b.at));
  const channels = Array.from(new Set(sorted.map((a) => a.channel)));
  const days = sorted.length >= 2 ? Math.floor((new Date(sorted[sorted.length - 1].at).getTime() - new Date(sorted[0].at).getTime()) / DAY_MS) : 0;
  const problems: string[] = [];
  if (sorted.length < 3) problems.push(`${sorted.length} of 3 attempts logged`);
  if (days < 14) problems.push(`attempts span ${days} of 14 days`);
  if (channels.length < 2) problems.push(`${channels.length} of 2 channels used`);
  return { ok: problems.length === 0, attempts: sorted.length, days, channels, problems };
}

export type PredecessorAccess = "none_needed" | "full" | "spec_only" | "withheld_pending" | "withheld_refused";

/** What predecessor history the current owner may see (feature 25 Access Validations). */
export function predecessorAccess(period: OwnershipPeriod, isFirstPeriod: boolean): PredecessorAccess {
  if (isFirstPeriod) return "none_needed";
  switch (period.predecessorConsent) {
    case "granted":
      return "full";
    case "unreachable_spec_only":
      return "spec_only";
    case "refused":
      return "withheld_refused";
    default:
      return "withheld_pending";
  }
}

/** Is this application inside the ownership period? Undated work only counts for the first period. */
export function inPeriod(app: Pick<Application, "completedAt">, period: Pick<OwnershipPeriod, "start" | "end">, isFirstPeriod: boolean): boolean {
  if (!app.completedAt) return isFirstPeriod;
  if (isFirstPeriod && app.completedAt < period.start) return true; // work before the first recorded owner stays with them
  if (app.completedAt < period.start) return false;
  if (period.end && app.completedAt > period.end) return false;
  return true;
}

/** Split applications into the period's own work and earlier (predecessor) work. */
export function scopeApplications<T extends Pick<Application, "completedAt">>(apps: T[], period: OwnershipPeriod, isFirstPeriod: boolean) {
  const own = apps.filter((a) => inPeriod(a, period, isFirstPeriod));
  const earlier = apps.filter((a) => !own.includes(a) && (!a.completedAt || a.completedAt < period.start));
  return { own, earlier };
}

/* ------------------------------------------------------------------ */
/* Customer-safe view (25 Visibility, 26 visible fields)               */
/* ------------------------------------------------------------------ */

/** The only application fields a customer view may contain. */
export interface CustomerApplication {
  id: string;
  surfaceId: string;
  manufacturer: string;
  colourName: string;
  colourNumber: string;
  hex: string;
  product: string;
  sheen: string;
  coats: number;
  completedAt?: string;
  verification: "confirmed" | "unverified";
  touchUpDates: string[];
}

/**
 * Build the customer copy of an application. Fields are copied one by one,
 * so hours, gallons, costs, tint formula, notes, crew names and data sheet
 * links are absent rather than hidden.
 */
export function toCustomerApplication(app: Application): CustomerApplication {
  return {
    id: app.id,
    surfaceId: app.surfaceId,
    manufacturer: app.manufacturer,
    colourName: app.colourName,
    colourNumber: app.colourNumber,
    hex: app.hex,
    product: app.product,
    sheen: app.sheen,
    coats: app.coats,
    completedAt: app.completedAt,
    verification: app.verification,
    touchUpDates: app.touchUps.map((t) => t.date),
  };
}

/** Newest first. Undated applications sort last. */
export function newestFirst<T extends Pick<Application, "completedAt" | "id">>(apps: T[]): T[] {
  return [...apps].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "") || b.id.localeCompare(a.id));
}

/** A photo may appear on the customer page only when selected and, if identifying, owner-approved with a release. */
export function photoShareable(p: Pick<SharedPhoto, "selected" | "identifying" | "ownerApprovedBy" | "releaseRef" | "deletedAt">): boolean {
  if (p.deletedAt || !p.selected) return false;
  if (!p.identifying) return true;
  return !!p.ownerApprovedBy && !!p.releaseRef?.trim();
}

/* ------------------------------------------------------------------ */
/* QR links (feature 26)                                               */
/* ------------------------------------------------------------------ */

/** The link reference must not be derivable from the property ID or address. */
export function refIsSafe(ref: string, propertyId: string, address: string): boolean {
  if (ref.length < 12) return false;
  const lower = ref.toLowerCase();
  const idDigits = propertyId.replace(/\D/g, "");
  const street = address.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (idDigits && lower.includes(idDigits)) return false;
  if (lower.includes(propertyId.toLowerCase())) return false;
  if (street.length >= 4 && lower.includes(street.slice(0, 6))) return false;
  return true;
}

export interface CallerClaims {
  addressMatches: boolean;
  contractName?: string;
  jobYear?: string;
  colourOrRoom?: string;
}

export interface CallerFacts {
  ownerNames: string[];
  jobYears: number[];
  coloursAndRooms: string[];
}

/**
 * 26.Q01 replacement-link verification: address plus two of contract name,
 * approximate job year, and a colour or room from the record.
 */
export function verifyCaller(claims: CallerClaims, facts: CallerFacts) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const matched: string[] = [];
  if (claims.contractName && facts.ownerNames.some((n) => norm(n) === norm(claims.contractName!))) matched.push("contract name");
  const year = Number(claims.jobYear?.match(/\d{4}/)?.[0]);
  if (year && facts.jobYears.some((y) => Math.abs(y - year) <= 1)) matched.push("approximate job year");
  if (claims.colourOrRoom && facts.coloursAndRooms.some((c) => norm(c).includes(norm(claims.colourOrRoom!)) && norm(claims.colourOrRoom!).length >= 3)) matched.push("colour or room");
  const passed = claims.addressMatches && matched.length >= 2;
  return { passed, matched };
}

/* ------------------------------------------------------------------ */
/* Touch-up request (component 26.3)                                   */
/* ------------------------------------------------------------------ */

export const TOUCHUP_LIMIT_PER_HOUR = 3;

/** Per-link rate limit: at most 3 requests in any rolling hour. */
export function touchUpRateLimited(requestTimes: string[], nowIso: string, limit = TOUCHUP_LIMIT_PER_HOUR): boolean {
  const cutoff = new Date(nowIso).getTime() - 60 * 60 * 1000;
  return requestTimes.filter((t) => new Date(t).getTime() > cutoff).length >= limit;
}

/** Simple challenge question derived from the link, so it is stable per visit. */
export function challengeFor(ref: string): { question: string; answer: string } {
  const sum = Array.from(ref).reduce((a, c) => a + c.charCodeAt(0), 0);
  const a = (sum % 6) + 2;
  const b = (Math.floor(sum / 7) % 5) + 3;
  return { question: `What is ${a} + ${b}?`, answer: String(a + b) };
}

export function validateTouchUp(input: { name: string; phone: string; email: string; challenge: string }, expected: string) {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = "Please enter your name.";
  if (!input.phone.trim() && !input.email.trim()) errors.contact = "Please give a phone number or an email address.";
  if (input.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) errors.email = "That email address doesn't look right.";
  if (input.challenge.trim() !== expected) errors.challenge = "That answer isn't right. Please try again.";
  return errors;
}

/** Coarse device type only (26 analytics). */
export function deviceClass(userAgent: string): "mobile" | "tablet" | "desktop" {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobi|iphone|android/.test(ua)) return "mobile";
  return "desktop";
}

/** Personal-data purge from backups is due within 35 days. */
export function purgeDueDate(fromIso: string): string {
  return new Date(new Date(fromIso).getTime() + 35 * DAY_MS).toISOString();
}
