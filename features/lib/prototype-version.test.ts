import { describe, expect, it } from "vitest";
import { isCompleteItem, isVisible } from "./prototype-version";

describe("prototype version", () => {
  it("reads the version from the letter after the dash", () => {
    expect(isCompleteItem("CRM-C4")).toBe(true);
    expect(isCompleteItem("RP-C1")).toBe(true);
    expect(isCompleteItem("CRM-M3")).toBe(false);
    expect(isCompleteItem("X-M1")).toBe(false);
  });

  it("shows Minimal items in both versions", () => {
    expect(isVisible("CRM-M3", "minimal")).toBe(true);
    expect(isVisible("CRM-M3", "complete")).toBe(true);
  });

  it("shows Complete items only in the Complete version", () => {
    expect(isVisible("CRM-C4", "minimal")).toBe(false);
    expect(isVisible("CRM-C4", "complete")).toBe(true);
  });
});
