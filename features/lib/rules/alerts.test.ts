/**
 * Features 27 and 29 — repaint alerts and follow-ups.
 * Each test names the acceptance criterion it checks.
 */
import { describe, expect, it } from "vitest";
import type { Application, Area, Database, LifespanLibrary, Surface } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { calcRepaintDate, noticeMonths } from "./lifespan";
import { attemptSchedule, clockPanel, inContactWindow, isConversation, recycleDate } from "./follow-up";
import {
  alertEscalation, alertQueueState, capBatch, clockSource, findDuplicateFollowUp, groupByWindow, groupNoticeBasis, monthKey, monthlyMeasures,
  planNightlyRun, snoozeUntil, suppressionFor, validateExtension,
} from "./alerts";
import { addDays, addMonths } from "./dates";

const lib: LifespanLibrary = {
  version: 3, updatedAt: "2026-01-01T00:00:00.000Z", updatedBy: "U-OWNER", southWestDeduction: 1, premiumBonus: 1, poorPrepDeduction: 2,
  defaults: [
    { roomType: "bedroom", years: 7 }, { roomType: "living_room", years: 7 }, { roomType: "hall_stairs", years: 5 }, { roomType: "kitchen", years: 5 },
    { roomType: "bathroom", years: 5 }, { roomType: "exterior_body", years: 7 }, { roomType: "exterior_trim", years: 5 },
  ],
  surfaceDefaults: [{ surfaceType: "ceiling", years: 10 }],
};
const app = (over: Partial<Application> = {}): Application => ({
  id: "APP-X", propertyId: "P", surfaceId: "S", manufacturer: "SW", colourName: "x", colourNumber: "x", hex: "#fff", product: "x", sheen: "Satin", coats: 2,
  completedAt: "2026-06-15T12:00:00.000Z", verification: "confirmed", photoCount: 0, touchUps: [], ...over,
});
const area = (over: Partial<Area> = {}): Area => ({ id: "A", propertyId: "P", name: "Room", kind: "interior", roomType: "bedroom", ...over });
const NOW = "2026-09-23T15:00:00.000Z";

describe("27 — expected repaint date", () => {
  it("15 June 2026 + 7 years = 15 June 2033", () => {
    expect(calcRepaintDate(app(), area(), lib).dueDate!.slice(0, 10)).toBe("2033-06-15");
  });
  it("29 February 2028 + 5 years keeps the day where possible, else the last day of the month", () => {
    const r = calcRepaintDate(app({ completedAt: "2028-02-29T12:00:00.000Z" }), area({ roomType: "kitchen" }), lib);
    expect(r.dueDate!.slice(0, 10)).toBe("2033-02-28");
  });
  it("31 January landing in a 30-day month uses the last day of that month", () => {
    expect(addMonths("2026-01-31T12:00:00.000Z", 87).slice(0, 10)).toBe("2033-04-30");
  });
  it("no completion date: no expected date, listed as a data gap by the nightly run", () => {
    expect(calcRepaintDate(app({ completedAt: undefined }), area(), lib).dueDate).toBeUndefined();
    const db = createSeed(NOW);
    const plan = planNightlyRun(db, NOW);
    expect(plan.unresolved.map((u) => u.applicationId)).toContain("APP-4041");
    expect(plan.calculations.find((c) => c.surfaceId === "SF-4041")).toBeUndefined();
  });
  it("south and west exposure deducts one year once", () => {
    const r = calcRepaintDate(app(), area({ kind: "exterior", roomType: "exterior_body", exposure: "west" }), lib);
    expect(r.years).toBe(6);
    expect(r.basis.filter((b) => b.includes("exposure"))).toHaveLength(1);
  });
  it("poor preparation deducts two years once, not four", () => {
    const r = calcRepaintDate(app({ prepQuality: "poor" }), area(), lib);
    expect(r.years).toBe(5);
  });
  it("premium tier on a south-facing exterior body: 7 − 1 + 1 = 7 years", () => {
    const r = calcRepaintDate(app({ productTier: "premium" }), area({ kind: "exterior", roomType: "exterior_body", exposure: "south" }), lib);
    expect(r.years).toBe(7);
  });
  it("ceilings default to ten years", () => {
    const r = calcRepaintDate(app(), area({ roomType: "living_room" }), lib, { type: "ceiling" } as Surface);
    expect(r.years).toBe(10);
  });
  it("commercial notice (9 months) takes precedence over exterior and interior", () => {
    expect(noticeMonths("commercial", "exterior").months).toBe(9);
    expect(noticeMonths("commercial", "interior").months).toBe(9);
    expect(groupNoticeBasis("commercial", ["exterior", "interior"])).toBe("commercial");
    expect(noticeMonths("single_family", "exterior").months).toBe(6);
    expect(noticeMonths("single_family", "interior").months).toBe(3);
  });
});

describe("27 — clock source", () => {
  it("touch-ups do not reset the interval", () => {
    const a = app({ touchUps: [{ date: "2029-01-01T00:00:00.000Z", note: "scuff" }] });
    expect(clockSource([a]).app!.completedAt).toBe(a.completedAt);
  });
  it("a partial repaint resets only its surface", () => {
    const db = createSeed(NOW);
    const before = planNightlyRun(db, NOW);
    db.applications.push({ ...db.applications.find((x) => x.id === "APP-3041")!, id: "APP-NEW", completedAt: NOW, touchUps: [] });
    const after = planNightlyRun(db, NOW);
    const changed = after.calculations.filter((c) => !before.calculations.some((b) => b.applicationId === c.applicationId));
    expect(changed.map((c) => c.surfaceId)).toEqual(["SF-3041"]);
  });
  it("unverified third-party work does not reset the clock and stays unverified", () => {
    const confirmed = app({ id: "A1", completedAt: "2020-01-01T00:00:00.000Z" });
    const third = app({ id: "A2", completedAt: "2025-01-01T00:00:00.000Z", verification: "unverified" });
    const src = clockSource([confirmed, third]);
    expect(src.app!.id).toBe("A1");
    expect(src.ignoredUnverified.map((x) => x.id)).toEqual(["A2"]);
  });
});

describe("27 — grouping", () => {
  it("1 Mar 2029 and 1 Sep 2029 group through 1 Mar 2030; 1 Apr 2030 falls outside", () => {
    const g = groupByWindow([{ dueDate: "2029-03-01T12:00:00.000Z" }, { dueDate: "2029-09-01T12:00:00.000Z" }, { dueDate: "2030-04-01T12:00:00.000Z" }]);
    expect(g).toHaveLength(2);
    expect(g[0].items).toHaveLength(2);
    expect(g[0].windowEnd.slice(0, 10)).toBe("2030-03-01");
  });
  it("the window end is inclusive", () => {
    const g = groupByWindow([{ dueDate: "2029-03-01T12:00:00.000Z" }, { dueDate: "2030-03-01T08:00:00.000Z" }]);
    expect(g).toHaveLength(1);
  });
  it("a later surface inside an open window joins it without moving the window end or the escalation clock", () => {
    const db = createSeed(NOW);
    const ra = db.repaintAlerts.find((x) => x.id === "RA-1001")!;
    const before = { end: ra.windowEnd, created: ra.createdAt };
    // 40 days on, the hall walls (due in ~120 days) enter their 3-month notice window.
    const plan = planNightlyRun(db, addDays(NOW, 40));
    const joined = plan.appendTo.find((x) => x.surface.surfaceId === "SF-3041");
    expect(joined?.alertId).toBe("RA-1001");
    expect(plan.newAlerts.some((x) => x.propertyId === "PROP-1003")).toBe(false);
    expect(ra.windowEnd).toBe(before.end);
    expect(ra.createdAt).toBe(before.created);
  });
});

describe("27 — nightly run", () => {
  it("two runs on one day create no duplicate", () => {
    const db = createSeed(NOW);
    const first = planNightlyRun(db, NOW);
    expect(first.newAlerts.length).toBeGreaterThan(0);
    // Apply the first run.
    first.newAlerts.forEach((a, i) => db.repaintAlerts.push({ id: `RA-T${i}`, createdAt: NOW, outcome: "open", ...a }));
    const second = planNightlyRun(db, NOW);
    expect(second.newAlerts).toHaveLength(0);
    expect(second.appendTo).toHaveLength(0);
  });
  it("after a failed run, the next run catches up the missed records once", () => {
    const db = createSeed(NOW);
    const missed = planNightlyRun(db, addDays(NOW, -1));
    const catchUp = planNightlyRun(db, NOW);
    expect(catchUp.newAlerts.map((a) => a.propertyId)).toEqual(expect.arrayContaining(missed.newAlerts.map((a) => a.propertyId)));
  });
  it("imported overdue records go to the backlog, not the live queue", () => {
    const db = createSeed(NOW);
    db.repaintAlerts = db.repaintAlerts.filter((a) => a.id !== "RA-1003");
    const plan = planNightlyRun(db, NOW);
    const created = plan.newAlerts.find((a) => a.propertyId === "PROP-1004");
    expect(created?.backlog).toBe(true);
  });
  it("latest application per surface only: a closeout today is not due", () => {
    const db = createSeed(NOW);
    db.applications.push({ ...db.applications.find((x) => x.id === "APP-4011")!, id: "APP-CLOSE", jobId: "JOB-2026-5", source: undefined, completedAt: NOW });
    const plan = planNightlyRun(db, NOW);
    expect(plan.skipped.find((s) => s.surfaceId === "SF-4011")?.reason).toBe("not_due");
  });
  it("opt-out does not suppress the internal alert", () => {
    const db = createSeed(NOW);
    const p = db.properties.find((x) => x.id === "PROP-1006")!;
    p.optOut = true;
    const plan = planNightlyRun(db, NOW);
    expect(plan.newAlerts.some((a) => a.propertyId === "PROP-1006")).toBe(true);
  });
});

describe("27 — suppression, escalation, snooze, backlog", () => {
  it("an open repaint estimate suppresses; an unrelated estimate does not", () => {
    const db = createSeed(NOW);
    db.jobs = db.jobs.filter((j) => j.propertyId !== "PROP-1002");
    expect(suppressionFor(db, "PROP-1002")).toBeUndefined(); // EST-2026-8 is not a repaint quote
    db.estimates.find((e) => e.id === "EST-2026-8")!.isRepaint = true;
    expect(suppressionFor(db, "PROP-1002")?.code).toBe("OpenRepaintEstimate");
  });
  it("an active job suppresses outreach", () => {
    const db = createSeed(NOW);
    expect(suppressionFor(db, "PROP-1001")?.code).toBe("ActiveJob");
  });
  it("sold-unreassigned and demolished properties are suppressed", () => {
    const db = createSeed(NOW);
    expect(suppressionFor(db, "PROP-1022")?.code).toBeUndefined();
    db.properties.find((x) => x.id === "PROP-1022")!.demolished = true;
    expect(suppressionFor(db, "PROP-1022")?.code).toBe("Demolished");
    db.properties.find((x) => x.id === "PROP-1022")!.soldUnreassigned = true;
    expect(suppressionFor(db, "PROP-1022")?.code).toBe("Sold");
  });
  it("viewed but not actioned for 14 days escalates to the owner (seed RA-1002 is 16 days old)", () => {
    const db = createSeed(NOW);
    const ra = db.repaintAlerts.find((a) => a.id === "RA-1002")!;
    expect(alertEscalation(ra, db.seededAt).escalated).toBe(true);
    expect(alertQueueState(db, ra, db.seededAt).escalated).toBe(true);
    const fresh = db.repaintAlerts.find((a) => a.id === "RA-1001")!;
    expect(alertEscalation(fresh, db.seededAt).escalated).toBe(false);
  });
  it("snooze options are 3, 6 or 12 months or a date", () => {
    expect(snoozeUntil("2026-01-15T12:00:00.000Z", 6)!.slice(0, 10)).toBe("2026-07-15");
    expect(snoozeUntil("2026-01-15T12:00:00.000Z", "date", "2026-03-01")).toBe("2026-03-01");
  });
  it("a backlog batch of 30 is capped at 25", () => {
    const r = capBatch(Array.from({ length: 30 }, (_, i) => i));
    expect(r.batch).toHaveLength(25);
    expect(r.capped).toBe(true);
    // 90-record backlog, 25 qualified, 65 remain.
    expect(90 - capBatch(Array.from({ length: 90 }, (_, i) => i)).batch.length).toBe(65);
  });
  it("a property with an open follow-up is a duplicate (skipped in a backlog batch)", () => {
    const db = createSeed(NOW);
    expect(findDuplicateFollowUp(db, "PROP-1007", ["SF-7031"], NOW)?.id).toBe("FU-1001");
    expect(findDuplicateFollowUp(db, "PROP-1023", ["SF-23011"], NOW)).toBeUndefined();
  });
  it("an extension of 30 months is rejected; 24 months is allowed", () => {
    expect(validateExtension("2027-01-10T12:00:00.000Z", "2029-07-10T12:00:00.000Z")).toMatch(/at most two years/);
    expect(validateExtension("2027-01-10T12:00:00.000Z", "2029-01-10T12:00:00.000Z")).toBeUndefined();
  });
});

describe("29 — contact window, attempts and recycling", () => {
  it("7:00 p.m. is permitted, 7:01 p.m. is blocked, Sundays are blocked", () => {
    expect(inContactWindow(new Date(2026, 8, 23, 19, 0)).ok).toBe(true);
    expect(inContactWindow(new Date(2026, 8, 23, 19, 1)).ok).toBe(false);
    expect(inContactWindow(new Date(2026, 8, 27, 10, 0)).ok).toBe(false);
  });
  it("day 14 on a Sunday moves to Monday; day 35 on a holiday moves to the next allowed day", () => {
    // Qualified Mon 7 Sep 2026? Use Mon 14 Sep 2026: day 14 = Sun 27 Sep → Mon 28 Sep.
    const s = attemptSchedule("2026-09-14T12:00:00.000Z");
    expect(s[1].planned.slice(0, 10)).toBe("2026-09-28");
    expect(s[1].movedFrom?.slice(0, 10)).toBe("2026-09-27");
    // Qualified 8 Sep 2026: day 35 = 12 Oct 2026 (Columbus Day) → 13 Oct.
    const h = attemptSchedule("2026-09-08T12:00:00.000Z");
    expect(h[2].planned.slice(0, 10)).toBe("2026-10-13");
  });
  it("exterior qualified in June recycles to 1 March next year; 15 February stays in the same year", () => {
    expect(recycleDate("2026-06-10T12:00:00.000Z", ["exterior"]).slice(0, 10)).toBe("2027-03-01");
    expect(recycleDate("2026-02-15T12:00:00.000Z", ["exterior"]).slice(0, 10)).toBe("2026-03-01");
  });
  it("mixed interior and exterior uses the earlier season date", () => {
    expect(recycleDate("2026-06-10T12:00:00.000Z", ["interior", "exterior"]).slice(0, 10)).toBe("2026-09-01");
  });
  it("an unsuccessful call is never a conversation", () => {
    expect(isConversation("no_answer")).toBe(false);
    expect(isConversation("left_message")).toBe(false);
    expect(isConversation("wrong_number")).toBe(false);
    expect(isConversation("reached")).toBe(true);
  });
});

describe("29 — escalation clocks", () => {
  const base = { alertCreatedAt: "2026-09-01T12:00:00.000Z", now: "2026-09-23T12:00:00.000Z" };
  it("an alert unqualified for 14 days escalates to the business owner", () => {
    const c = clockPanel(base);
    expect(c.driving).toBe("alert");
    expect(c.clocks[0].escalated).toBe(true);
    expect(c.clocks[0].escalatesTo).toBe("Business owner");
  });
  it("qualified and unassigned for three days escalates to the office manager", () => {
    const c = clockPanel({ ...base, qualifiedAt: "2026-09-20T12:00:00.000Z" });
    expect(c.driving).toBe("unassigned");
    expect(c.clocks[1].escalated).toBe(true);
  });
  it("assigned with no outcome for seven days escalates to the office manager", () => {
    const c = clockPanel({ ...base, qualifiedAt: "2026-09-02T12:00:00.000Z", assignedAt: "2026-09-15T12:00:00.000Z" });
    expect(c.driving).toBe("assigned");
    expect(c.clocks[2].escalated).toBe(true);
  });
  it("reassignment on day five restarts the assigned clock and not the alert clock", () => {
    const before = clockPanel({ ...base, qualifiedAt: "2026-09-02T12:00:00.000Z", assignedAt: "2026-09-18T12:00:00.000Z" });
    const after = clockPanel({ ...base, qualifiedAt: "2026-09-02T12:00:00.000Z", assignedAt: "2026-09-23T12:00:00.000Z" });
    expect(before.clocks[2].days).toBe(5);
    expect(after.clocks[2].days).toBe(0);
    expect(after.clocks[0].source).toBe(before.clocks[0].source);
    expect(after.clocks[0].days).toBe(before.clocks[0].days);
  });
});

describe("29 — monthly measures", () => {
  it("dollars won = signed value excluding tax and later change orders, in the signature month; counted once", () => {
    const db: Database = createSeed(NOW);
    const m = monthlyMeasures(db);
    const won = m.dollars.find((x) => x.followUpId === "FU-0990")!;
    expect(won.amount).toBe(12480);
    expect(monthKey(won.at)).toBe(monthKey(db.jobs.find((j) => j.id === "JOB-2026-1")!.contractSignedAt!));
    expect(m.dollars.filter((x) => x.followUpId === "FU-0990")).toHaveLength(1);
  });
  it("contacts count conversations only; attempts are counted separately", () => {
    const db = createSeed(NOW);
    const m = monthlyMeasures(db);
    expect(m.attempts.length).toBeGreaterThan(m.contacts.length);
  });
});
