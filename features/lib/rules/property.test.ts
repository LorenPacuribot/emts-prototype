/**
 * Features 25 and 26 — tests mapped to acceptance criteria.
 */
import { describe, expect, it } from "vitest";
import type { Application, CloseoutRow } from "@/features/types";
import {
  actualLabel, challengeFor, closeoutBlockers, closeoutRowGaps, correctionNeedsNotice, deviceClass, inPeriod, newestFirst, photoShareable,
  predecessorAccess, purgeDueDate, refIsSafe, scopeApplications, toCustomerApplication, touchUpRateLimited, unreachableCheck, validateTouchUp, verifyCaller,
} from "./property";
import { randomRef } from "@/features/lib/store/helpers";

const row = (over: Partial<CloseoutRow> = {}): CloseoutRow => ({
  surfaceId: "SF-1",
  painted: true,
  manufacturer: "Sherwin-Williams",
  colourName: "Agreeable Gray",
  colourNumber: "SW 7029",
  hex: "#D1CBC1",
  product: "Cashmere",
  sheen: "Eggshell",
  coats: 2,
  completedAt: "2026-09-20T00:00:00.000Z",
  unknowns: [],
  confirmedBy: "U-CREW",
  ...over,
});

const app = (over: Partial<Application> = {}): Application => ({
  id: "APP-1", propertyId: "P", surfaceId: "SF-1", manufacturer: "SW", colourName: "Alabaster", colourNumber: "SW 7008", hex: "#eee",
  product: "Emerald", sheen: "Satin", coats: 2, completedAt: "2024-05-01T00:00:00.000Z", verification: "confirmed", photoCount: 2, touchUps: [],
  actualHours: 9, actualGallons: 3, tintFormula: "B1 4Y2", confirmedBy: "U-CREW", ...over,
});

describe("Feature 25 — closeout (component 25.2)", () => {
  it("AC: a painted surface with no sheen blocks closeout and the surface is named", () => {
    const blockers = closeoutBlockers(["SF-1", "SF-2"], [row(), row({ surfaceId: "SF-2", sheen: undefined })]);
    expect(blockers).toEqual([{ surfaceId: "SF-2", missing: ["sheen"] }]);
  });
  it("AC: one surface without a completion date is listed when closing", () => {
    const blockers = closeoutBlockers(["SF-1"], [row({ completedAt: undefined })]);
    expect(blockers[0].missing).toContain("completion date");
  });
  it("lists surfaces in scope with no checklist row, so nothing is silently omitted", () => {
    expect(closeoutBlockers(["SF-9"], [])[0].surfaceId).toBe("SF-9");
  });
  it("AC: missing production hours do not block, and show as Not recorded rather than zero", () => {
    expect(closeoutBlockers(["SF-1"], [row({ actualHours: undefined, actualGallons: undefined })])).toEqual([]);
    expect(actualLabel(undefined, "hrs")).toBe("Not recorded");
    expect(actualLabel(0, "hrs")).toBe("0 hrs");
  });
  it("an owner-approved Unknown satisfies the field; a plain Unknown does not", () => {
    expect(closeoutRowGaps(row({ sheen: "Unknown" }))).toEqual(["sheen"]);
    expect(closeoutRowGaps(row({ sheen: "Unknown", unknowns: [{ field: "sheen", kind: "legacy", approvedBy: "U-OWNER", reason: "r", at: "x" }] }))).toEqual([]);
  });
  it("a surface marked not painted needs no facts", () => {
    expect(closeoutRowGaps(row({ painted: false, sheen: undefined, completedAt: undefined }))).toEqual([]);
  });
  it("unconfirmed rows block the close", () => {
    expect(closeoutBlockers(["SF-1"], [row({ confirmedBy: undefined })])[0].missing).toEqual(["crew lead confirmation"]);
  });
});

describe("Feature 25 — corrections (component 25.3)", () => {
  it("AC: a sheen or colour correction queues a customer notice", () => {
    expect(correctionNeedsNotice("Sheen")).toBe(true);
    expect(correctionNeedsNotice("Colour")).toBe(true);
    expect(correctionNeedsNotice("Location")).toBe(true);
  });
  it("AC: a photograph or date correction queues no notice", () => {
    expect(correctionNeedsNotice("Photographs")).toBe(false);
    expect(correctionNeedsNotice("Completion date")).toBe(false);
  });
});

describe("Feature 25 — predecessor consent (25.Q01)", () => {
  it("AC: two attempts over ten days cannot be declared unreachable", () => {
    const r = unreachableCheck([
      { at: "2026-09-01T10:00:00Z", channel: "phone" },
      { at: "2026-09-11T10:00:00Z", channel: "email" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.problems).toContain("2 of 3 attempts logged");
  });
  it("three attempts over 14 days on one channel is still blocked", () => {
    const r = unreachableCheck([
      { at: "2026-09-01T10:00:00Z", channel: "phone" },
      { at: "2026-09-08T10:00:00Z", channel: "phone" },
      { at: "2026-09-15T10:00:00Z", channel: "phone" },
    ]);
    expect(r.ok).toBe(false);
  });
  it("three attempts over 14 days across two channels passes", () => {
    const r = unreachableCheck([
      { at: "2026-09-01T10:00:00Z", channel: "phone" },
      { at: "2026-09-08T10:00:00Z", channel: "email" },
      { at: "2026-09-15T10:00:00Z", channel: "letter" },
    ]);
    expect(r.ok).toBe(true);
  });
  it("AC: a refusal withholds everything; no consent hides predecessor history", () => {
    expect(predecessorAccess({ id: "o", customerId: "c", start: "x", predecessorConsent: "refused" }, false)).toBe("withheld_refused");
    expect(predecessorAccess({ id: "o", customerId: "c", start: "x" }, false)).toBe("withheld_pending");
    expect(predecessorAccess({ id: "o", customerId: "c", start: "x", predecessorConsent: "unreachable_spec_only" }, false)).toBe("spec_only");
  });
  it("AC 26: a new buyer's link only carries their own period's work", () => {
    const period = { id: "o2", customerId: "c", start: "2026-08-01T00:00:00Z" };
    const old = app({ id: "A-old", completedAt: "2020-01-01T00:00:00Z" });
    const mine = app({ id: "A-new", completedAt: "2026-09-01T00:00:00Z" });
    const { own, earlier } = scopeApplications([old, mine], period, false);
    expect(own.map((a) => a.id)).toEqual(["A-new"]);
    expect(earlier.map((a) => a.id)).toEqual(["A-old"]);
    expect(inPeriod(old, { start: "2019-01-01T00:00:00Z", end: "2021-01-01T00:00:00Z" }, false)).toBe(true);
  });
});

describe("Feature 26 — customer-safe record", () => {
  it("AC: the customer copy has no hours, gallons, tint formula or crew name", () => {
    const c = toCustomerApplication(app());
    expect(Object.keys(c)).not.toEqual(expect.arrayContaining(["actualHours"]));
    expect("actualHours" in c).toBe(false);
    expect("actualGallons" in c).toBe(false);
    expect("tintFormula" in c).toBe(false);
    expect("confirmedBy" in c).toBe(false);
  });
  it("AC: latest application first for each surface", () => {
    const list = newestFirst([app({ id: "A1", completedAt: "2019-01-01" }), app({ id: "A2", completedAt: "2025-01-01" })]);
    expect(list[0].id).toBe("A2");
  });
  it("AC: a photograph with a house number needs owner approval and a release before it is shared", () => {
    expect(photoShareable({ selected: true, identifying: true })).toBe(false);
    expect(photoShareable({ selected: true, identifying: true, ownerApprovedBy: "U-OWNER" })).toBe(false);
    expect(photoShareable({ selected: true, identifying: true, ownerApprovedBy: "U-OWNER", releaseRef: "REL-1" })).toBe(true);
    expect(photoShareable({ selected: true, identifying: false })).toBe(true);
    expect(photoShareable({ selected: false, identifying: false })).toBe(false);
  });
  it("the link reference is not derivable from the property ID or address", () => {
    for (let i = 0; i < 20; i++) expect(refIsSafe(randomRef(), "PROP-1003", "420 Cedar Hollow Ln")).toBe(true);
    expect(refIsSafe("prop1003abcdefgh", "PROP-1003", "420 Cedar Hollow Ln")).toBe(false);
    expect(refIsSafe("x420cedarhollowx", "PROP-1003", "420 Cedar Hollow Ln")).toBe(false);
  });
  it("AC: address plus only one further detail fails verification", () => {
    const facts = { ownerNames: ["Elena Marsh"], jobYears: [2019, 2023], coloursAndRooms: ["Agreeable Gray", "Living Room"] };
    expect(verifyCaller({ addressMatches: true, contractName: "Elena Marsh" }, facts).passed).toBe(false);
    expect(verifyCaller({ addressMatches: true, contractName: "elena marsh", jobYear: "about 2022" }, facts)).toEqual({ passed: true, matched: ["contract name", "approximate job year"] });
    expect(verifyCaller({ addressMatches: false, contractName: "Elena Marsh", colourOrRoom: "living room" }, facts).passed).toBe(false);
  });
  it("AC: the per-link touch-up rate limit blocks the fourth request in an hour", () => {
    const nowIso = "2026-09-23T12:00:00Z";
    const times = ["2026-09-23T11:10:00Z", "2026-09-23T11:30:00Z", "2026-09-23T11:50:00Z"];
    expect(touchUpRateLimited(times.slice(0, 2), nowIso)).toBe(false);
    expect(touchUpRateLimited(times, nowIso)).toBe(true);
    expect(touchUpRateLimited(["2026-09-23T10:00:00Z", ...times.slice(1)], nowIso)).toBe(false);
  });
  it("AC: a touch-up request with no phone and no email is blocked", () => {
    const { answer } = challengeFor("abc");
    expect(validateTouchUp({ name: "A", phone: "", email: "", challenge: answer }, answer).contact).toBeTruthy();
    expect(validateTouchUp({ name: "A", phone: "555", email: "", challenge: answer }, answer)).toEqual({});
    expect(validateTouchUp({ name: "A", phone: "555", email: "", challenge: "0" }, answer).challenge).toBeTruthy();
  });
  it("AC: analytics store coarse device type only", () => {
    expect(deviceClass("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("mobile");
    expect(deviceClass("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe("tablet");
    expect(deviceClass("Mozilla/5.0 (Windows NT 10.0)")).toBe("desktop");
  });
  it("AC 25: the backup purge is scheduled within 35 days", () => {
    expect(purgeDueDate("2026-09-01T00:00:00.000Z")).toBe("2026-10-06T00:00:00.000Z");
  });
});
