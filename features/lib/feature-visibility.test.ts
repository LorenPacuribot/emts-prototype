import { describe, expect, it } from "vitest";
import { FEATURES } from "./feature-registry";
import {
  allCompleteRows, allMinimalRows, defaultRows, defaultVisibility, gateTarget, isOn, keyForFeature, keyForItem, withComplete, withMinimal,
} from "./feature-visibility";

describe("feature visibility", () => {
  it("defaults: master on, every Minimal on, every Complete off, badges hidden", () => {
    const d = defaultVisibility();
    expect(d.showNew).toBe(true);
    expect(d.showBadges).toBe(false);
    expect(Object.values(d.rows).every((r) => r.minimal && !r.complete)).toBe(true);
    expect(Object.keys(d.rows)).toHaveLength(FEATURES.length);
  });

  it("the master switch hides everything, and keeps the rows for when it comes back", () => {
    const rows = allCompleteRows();
    expect(isOn({ showNew: false, rows }, "f24")).toBe(false);
    expect(isOn({ showNew: false, rows }, "crm", "complete")).toBe(false);
    expect(isOn({ showNew: true, rows }, "crm", "complete")).toBe(true);
  });

  it("Complete implies Minimal", () => {
    const rows = withComplete(withMinimal(defaultRows(), "crm", false), "crm", true);
    expect(rows.crm).toEqual({ minimal: true, complete: true });
  });

  it("unticking Minimal unticks Complete; Complete can't be on while Minimal is off", () => {
    const rows = withMinimal(withComplete(defaultRows(), "crm", true), "crm", false);
    expect(rows.crm).toEqual({ minimal: false, complete: false });
    expect(isOn({ showNew: true, rows: { ...rows, crm: { minimal: false, complete: true } } }, "crm", "complete")).toBe(false);
  });

  it("a part with several features shows when any of them is on", () => {
    const rows = withMinimal(defaultRows(), "f3", false);
    expect(isOn({ showNew: true, rows }, ["f3", "f24"])).toBe(true);
    expect(isOn({ showNew: true, rows: withMinimal(rows, "f24", false) }, ["f3", "f24"])).toBe(false);
  });

  it("reset restores the defaults", () => {
    expect(defaultVisibility()).toEqual({ showNew: true, showBadges: false, rows: allMinimalRows() });
  });

  it("maps existing markers to features", () => {
    expect(keyForFeature(24)).toBe("f24");
    expect(keyForItem("CRM-C4")).toEqual({ key: "crm", part: "complete" });
    expect(keyForItem("BK-M10")).toEqual({ key: "bk", part: "minimal" });
    expect(keyForItem("X-M2")).toEqual({ key: "qb", part: "minimal" });
    expect(gateTarget({ feature: [3, 24] })).toEqual({ keys: ["f3", "f24"], part: "minimal" });
    expect(gateTarget({ item: "RP-C2" })).toEqual({ keys: ["rp"], part: "complete" });
  });
});
