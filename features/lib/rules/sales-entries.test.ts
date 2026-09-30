import { describe, expect, it } from "vitest";
import {
  changeOrderEntries, entriesAddUp, entryLabel, latestAcceptedValue, salesEntries, versionLineDiff,
  type SalesEstimate, type SalesVersion,
} from "./sales-entries";

let n = 0;
const v = (date: string, total: number, status: string, extra: Partial<SalesVersion> = {}): SalesVersion => ({ version: ++n, date, total, status, ...extra });
const est = (versions: SalesVersion[], taxRate = 0): SalesEstimate => ({ id: "e1", estimateNumber: "EST-2026-1", estimatorId: "u1", taxRate, versions });
const sum = (xs: { value: number }[]) => Math.round(xs.reduce((s, x) => s + x.value, 0) * 100) / 100;

describe("salesEntries", () => {
  it("books the original on its approval date", () => {
    const e = est([v("2026-09-01", 100, "Draft"), v("2026-09-01", 100, "Sent"), v("2026-09-01", 100, "Approved", { laborHours: 10 })]);
    expect(salesEntries(e)).toEqual([
      { estimateId: "e1", estimateNumber: "EST-2026-1", type: "original", n: 0, date: "2026-09-01", value: 100, hours: 10, estimatorId: "u1", versionRef: "v3" },
    ]);
  });

  it("books only the difference of an amendment, in the month of re-approval", () => {
    const e = est([
      v("2026-09-01", 100, "Approved", { laborHours: 10 }),
      v("2026-10-01", 150, "Draft", { laborHours: 14 }),
      v("2026-10-01", 150, "Sent", { laborHours: 14 }),
      v("2026-10-02", 150, "Approved", { laborHours: 14 }),
    ]);
    const entries = salesEntries(e);
    expect(entries.map((x) => [x.type, x.date, x.value, x.hours])).toEqual([
      ["original", "2026-09-01", 100, 10],
      ["amendment", "2026-10-02", 50, 4],
    ]);
    expect(entries.every((x) => x.estimateNumber === "EST-2026-1")).toBe(true);
    const sept = entries.filter((x) => x.date.startsWith("2026-09"));
    const oct = entries.filter((x) => x.date.startsWith("2026-10"));
    expect(sum(sept)).toBe(100);
    expect(sum(oct)).toBe(50);
  });

  it("books nothing when only a paint colour changed", () => {
    const e = est([v("2026-09-01", 100, "Approved", { laborHours: 10 }), v("2026-10-02", 100, "Approved", { laborHours: 10 })]);
    expect(salesEntries(e)).toHaveLength(1);
  });

  it("books a drop as a negative entry and leaves the earlier month alone", () => {
    const e = est([v("2026-09-01", 1000, "Approved", { laborHours: 20 }), v("2026-10-05", 700, "Approved", { laborHours: 16 })]);
    const [orig, drop] = salesEntries(e);
    expect(orig.value).toBe(1000);
    expect(drop).toMatchObject({ type: "amendment", n: 1, date: "2026-10-05", value: -300, hours: -4 });
  });

  it("ignores declined and abandoned amendments", () => {
    const e = est([
      v("2026-09-01", 100, "Approved"),
      v("2026-09-10", 180, "Draft"),
      v("2026-09-11", 180, "Sent"),
      v("2026-09-12", 180, "Rejected"),
    ]);
    expect(salesEntries(e)).toHaveLength(1);
    expect(latestAcceptedValue(e)).toBe(100);
  });

  it("takes sales tax out of the values", () => {
    const e = est([v("2026-09-01", 108.25, "Approved", { preTaxTotal: 100 }), v("2026-10-02", 162.38, "Approved")], 8.25);
    const entries = salesEntries(e);
    expect(entries[0].value).toBe(100);
    expect(entries[1].value).toBe(50);
  });

  it("uses an hours difference of 0 for versions saved without hours", () => {
    const e = est([v("2026-09-01", 100, "Approved"), v("2026-10-02", 150, "Approved")]);
    const entries = salesEntries(e, { fallbackHours: 12 });
    expect(entries.map((x) => x.hours)).toEqual([12, 0]);
  });

  it("numbers amendments that booked something", () => {
    const e = est([
      v("2026-09-01", 100, "Approved"),
      v("2026-09-05", 100, "Approved"),
      v("2026-09-10", 120, "Approved"),
      v("2026-09-20", 90, "Approved"),
    ]);
    expect(salesEntries(e).map(entryLabel)).toEqual(["Original", "Amendment 1", "Amendment 2"]);
  });

  it("entries always add up to the latest accepted total", () => {
    const totals = [100, 150, 150, 90.1, 333.33, 20, 1999.99];
    const versions = totals.flatMap((t, i) => [v(`2026-0${(i % 9) + 1}-10`, t + 5, "Draft"), v(`2026-0${(i % 9) + 1}-11`, t, i === 3 ? "Rejected" : "Approved", { laborHours: t / 10 })]);
    const e = est(versions);
    const entries = salesEntries(e);
    expect(entriesAddUp(entries, latestAcceptedValue(e))).toBe(true);
    expect(sum(entries)).toBe(1999.99);
  });

  it("an estimate never accepted has no entries", () => {
    const e = est([v("2026-09-01", 100, "Draft"), v("2026-09-02", 100, "Sent")]);
    expect(salesEntries(e)).toEqual([]);
    expect(latestAcceptedValue(e)).toBe(0);
  });
});

describe("entriesAddUp", () => {
  it("flags entries that don't match", () => {
    expect(entriesAddUp([{ value: 100 }, { value: 50 }], 150)).toBe(true);
    expect(entriesAddUp([{ value: 100 }], 150)).toBe(false);
  });
});

describe("changeOrderEntries", () => {
  it("books signed change orders by date, numbered per estimate", () => {
    const entries = changeOrderEntries([
      { id: "CO-2", estimateId: "e1", estimateNumber: "EST-1", date: "2026-10-09", net: -200, hours: -3 },
      { id: "CO-1", estimateId: "e1", estimateNumber: "EST-1", date: "2026-10-01", net: 400, hours: 5 },
      { id: "CO-3", estimateId: "e2", estimateNumber: "EST-2", date: "2026-10-05", net: 0, hours: 0 },
    ]);
    expect(entries.map((x) => [x.versionRef, x.type, x.n, x.value])).toEqual([
      ["CO-1", "change_order", 1, 400],
      ["CO-2", "change_order", 2, -200],
    ]);
    expect(entryLabel(entries[1])).toBe("Change order 2");
  });
});

describe("versionLineDiff", () => {
  it("lists lines added, removed and repriced", () => {
    const a = v("2026-09-01", 300, "Approved", { lines: [{ id: "l1", description: "Walls", total: 200 }, { id: "l2", description: "Trim", total: 100 }] });
    const b = v("2026-10-01", 350, "Approved", { lines: [{ id: "l1", description: "Walls", total: 250 }, { id: "l3", description: "Doors", total: 100 }] });
    const d = versionLineDiff(a, b)!;
    expect(d.added.map((l) => l.id)).toEqual(["l3"]);
    expect(d.removed.map((l) => l.id)).toEqual(["l2"]);
    expect(d.repriced).toEqual([{ line: { id: "l1", description: "Walls", total: 250 }, from: 200, to: 250 }]);
  });

  it("is undefined for versions saved without lines", () => {
    expect(versionLineDiff(v("2026-09-01", 1, "Approved"), v("2026-09-02", 2, "Approved"))).toBeUndefined();
  });
});
