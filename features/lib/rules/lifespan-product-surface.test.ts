/** Patent 27 — a repaint interval for a product on a particular surface, most specific first. */
import { describe, expect, it } from "vitest";
import type { LifespanLibrary } from "@/features/types";
import { libraryDefault } from "./lifespan";

const lib: LifespanLibrary = {
  version: 1, updatedAt: "2026-01-01T00:00:00.000Z", updatedBy: "U-OWNER", southWestDeduction: 1, premiumBonus: 1, poorPrepDeduction: 2,
  defaults: [{ roomType: "exterior_body", years: 7 }],
  surfaceDefaults: [{ surfaceType: "trim", years: 5 }],
  productDefaults: [
    { manufacturer: "Sherwin-Williams", productLine: "Duration", years: 8 },
    { manufacturer: "Sherwin-Williams", productLine: "Duration", product: "Duration Exterior Acrylic Latex", years: 9 },
    { manufacturer: "Sherwin-Williams", productLine: "Duration", product: "Duration Exterior Acrylic Latex", surfaceType: "trim", years: 6 },
    { manufacturer: "Sherwin-Williams", productLine: "Duration", surfaceType: "siding", years: 10 },
  ],
};
const x = { manufacturer: "Sherwin-Williams", productLine: "Duration", product: "Duration Exterior Acrylic Latex", roomType: "exterior_body" };

describe("Patent 27 — product × surface repaint intervals", () => {
  it("uses the product-on-surface entry first", () => {
    expect(libraryDefault(lib, { ...x, surfaceType: "trim" })).toMatchObject({ years: 6, basis: expect.stringContaining("on trim") });
  });
  it("then the product line on that surface", () => {
    expect(libraryDefault(lib, { ...x, product: "Other", surfaceType: "siding" }).years).toBe(10);
  });
  it("then the product, then the line, ignoring entries for other surfaces", () => {
    expect(libraryDefault(lib, { ...x, surfaceType: "body" }).years).toBe(9);
    expect(libraryDefault(lib, { ...x, product: "Other", surfaceType: "body" }).years).toBe(8);
  });
  it("falls back to the surface type and room defaults", () => {
    expect(libraryDefault(lib, { roomType: "exterior_body", surfaceType: "trim" }).years).toBe(5);
    expect(libraryDefault(lib, { roomType: "exterior_body", surfaceType: "body" }).years).toBe(7);
  });
});
