/** Lead sources (2 Oct 2026, D6). */
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_SOURCES, activeSourceNames, deactivateBlocker, defaultSources, deleteBlocker, leadSourceFor, renamed, resolveSource, validateSourceName,
} from "./lead-sources";

const list = defaultSources();

describe("D6 — the organisation's list", () => {
  it("starts with the eight built-in sources and the four an admin added", () => {
    expect(list.filter((s) => s.builtIn).map((s) => s.name)).toEqual([...BUILT_IN_SOURCES]);
    expect(list.filter((s) => !s.builtIn).map((s) => s.name)).toEqual(["Nextdoor", "Thumbtack", "Angi", "Yard Sign"]);
  });
  it("needs a name, at most 30 characters, unique (any case or spacing)", () => {
    expect(validateSourceName("  ", list)).toBe("Enter a name.");
    expect(validateSourceName("x".repeat(31), list)).toMatch(/30 characters/);
    expect(validateSourceName("x".repeat(30), list)).toBeUndefined();
    expect(validateSourceName("yard-sign", list)).toBe("That source already exists.");
    expect(validateSourceName("Truck wrap", list)).toBeUndefined();
    // Renaming a source to its own name (or a new case of it) is fine.
    const yard = list.find((s) => s.name === "Yard Sign")!;
    expect(validateSourceName("Yard sign", list, yard.id)).toBeUndefined();
  });
  it("never deletes a built-in source, or one with leads (deactivate it instead)", () => {
    const web = list.find((s) => s.name === "Website")!;
    const angi = list.find((s) => s.name === "Angi")!;
    expect(deleteBlocker(web, 0)).toMatch(/Built-in/);
    expect(deleteBlocker(angi, 3)).toBe("This source has leads. Deactivate it instead.");
    expect(deleteBlocker(angi, 0)).toBeUndefined();
    expect(deactivateBlocker(web)).toBeDefined();
    expect(deactivateBlocker(angi)).toBeUndefined();
  });
  it("tracked links offer only active sources", () => {
    const withOff = list.map((s) => (s.name === "Angi" ? { ...s, active: false } : s));
    expect(activeSourceNames(withOff)).not.toContain("Angi");
    expect(activeSourceNames(withOff)).toContain("Thumbtack");
  });
});

describe("D6 — resolving a source", () => {
  it("matches the list ignoring case and spacing; anything else is Other", () => {
    expect(resolveSource("Repaint Alert", list)).toBe("Repaint alert");
    expect(resolveSource("yard_sign", list)).toBe("Yard Sign");
    expect(resolveSource("Existing Customer", list)).toBe("Other");
    expect(resolveSource(undefined, list)).toBe("Other");
  });
  it("a rename keeps the old name, so leads that carry it keep their source", () => {
    const angi = list.find((s) => s.name === "Angi")!;
    const next = list.map((s) => (s.id === angi.id ? renamed(s, "Angi Leads") : s));
    expect(resolveSource("Angi", next)).toBe("Angi Leads");
    expect(resolveSource("Angi Leads", next)).toBe("Angi Leads");
  });
  it("a link tag resolves against the active sources", () => {
    expect(leadSourceFor({ src: "nextdoor" }, list)).toBe("Nextdoor");
    expect(leadSourceFor({ src: "fb" }, list)).toBe("Facebook");
    const renamed = list.map((s) => (s.name === "Thumbtack" ? { ...s, name: "Thumbtack Pro" } : s));
    expect(leadSourceFor({ src: "thumbtack-pro" }, renamed)).toBe("Thumbtack Pro");
    const off = list.map((s) => (s.name === "Angi" ? { ...s, active: false } : s));
    expect(leadSourceFor({ src: "angi" }, off)).toBe("Other");
  });
});
