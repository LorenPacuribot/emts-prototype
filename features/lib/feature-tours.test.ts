/**
 * Feature tours (components/tour/feature-tours.ts): one per new feature, in
 * the shape the client asked for, pointing only at anchors that exist.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { FEATURES } from "./feature-registry";
import { FEATURE_TOURS } from "@/features/components/tour/feature-tours";
import { flatSteps } from "@/features/components/tour/tour-steps";

const ROOT = path.resolve(__dirname, "../..");

/** Every `data-tour` name written in the app's .tsx files, plus the prefixes of template ones (`spec-${id}`). */
function anchors() {
  const names = new Set<string>();
  const prefixes = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".tsx")) {
        const src = readFileSync(p, "utf8");
        for (const m of src.matchAll(/data-tour=(?:"([^"]+)"|\{([^}]*)\})/g)) {
          if (m[1]) names.add(m[1]);
          for (const q of (m[2] ?? "").matchAll(/"([a-z0-9-]+)"/g)) names.add(q[1]);
          const t = (m[2] ?? "").match(/^`([a-z0-9-]+)\$\{/);
          if (t) prefixes.add(t[1]);
        }
      }
    }
  };
  for (const dir of ["app", "components", "features"]) walk(path.join(ROOT, dir));
  return { names, prefixes };
}

describe("Feature tours", () => {
  it("every new feature has its own tour, opening with an overview", () => {
    for (const f of FEATURES.filter((x) => x.built)) {
      const tour = FEATURE_TOURS[f.key];
      expect(tour, f.key).toBeDefined();
      expect(tour.key).toBe(f.key);
      expect(tour.before.length, `${f.key} before`).toBeGreaterThan(20);
      expect(tour.benefits.length, `${f.key} benefits`).toBeGreaterThan(0);
      const steps = flatSteps(tour);
      expect(steps[0].intro).toBe(true);
      expect(steps.length, `${f.key} steps`).toBeGreaterThan(2);
    }
  });

  it("core modules carry no version; 30 Sep call features tag every step Minimal or Complete", () => {
    for (const f of FEATURES) {
      for (const s of flatSteps(FEATURE_TOURS[f.key]).slice(1)) {
        if (f.group === "built") expect(s.version, `${f.key}: ${s.title}`).toBeUndefined();
        else expect(["minimal", "complete"], `${f.key}: ${s.title}`).toContain(s.version);
      }
    }
  });

  it("every step names its action and opens an app page", () => {
    for (const f of FEATURES) {
      for (const s of flatSteps(FEATURE_TOURS[f.key]).slice(1)) {
        expect(s.kind, `${f.key}: ${s.title}`).toBeDefined();
        expect(s.href.startsWith("/"), `${f.key}: ${s.href}`).toBe(true);
      }
    }
  });

  it("every highlighted area exists in the app", () => {
    const { names, prefixes } = anchors();
    const missing: string[] = [];
    for (const f of FEATURES) {
      for (const s of flatSteps(FEATURE_TOURS[f.key])) {
        if (!s.target) continue;
        if (!names.has(s.target) && ![...prefixes].some((p) => s.target!.startsWith(p))) missing.push(`${f.key}: ${s.target}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
