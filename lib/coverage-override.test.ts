import { describe, expect, it } from 'vitest';
import { coverageFor, deriveLine, lineGallons, usesCoverageFallback } from './estimating';
import type { EstimateLineItem, PaintProduct, SurfaceRate } from './types';

const paint = { id: 'p1', name: 'Duration', coverageCoat1: 400, coverageCoat2: 400 } as PaintProduct;
const sr = { id: 'sr1', name: 'Stucco', rateGroup: 'Exterior Walls', unit: 'sqft', defaultCoats: 2, rateCoat1: 80, rateCoat2: 0, rateCoat3: 0, rateCoat4: 0, useMultipliers: false, sortOrder: 1, coverageOverrides: [{ paintProductId: 'p1', coverageCoat1: 200, coverageCoat2: 250 }] } as SurfaceRate;
const line = { unit: 'sqft', quantity: 1000, coats: 2, condition: 'smooth' } as Pick<EstimateLineItem, 'unit' | 'quantity' | 'coatingAreaSqft' | 'coats' | 'condition'>;

describe('Patent 8 — coverage for a product on a particular surface', () => {
  it('uses the surface rate override ahead of the product coverage', () => {
    expect(lineGallons(line, paint)).toBe(5);
    expect(lineGallons(line, coverageFor(paint, sr))).toBe(9);
    expect(coverageFor(paint, { coverageOverrides: [] })).toBe(paint);
  });
  it('deriveLine applies the override for the line surface', () => {
    const l = deriveLine({ ...line, id: 'l1', areaId: 'a', description: '', surfaceType: 'Stucco', paintProductId: 'p1', laborHours: 0 } as unknown as EstimateLineItem, { surfaceRates: [sr], paints: [paint] });
    expect(l.gallons).toBe(9);
  });
  it('flags a product with no coverage anywhere', () => {
    expect(usesCoverageFallback({ coverageCoat1: 0 })).toBe(true);
    expect(usesCoverageFallback(coverageFor({ ...paint, coverageCoat1: 0 }, sr))).toBe(false);
    expect(usesCoverageFallback(undefined)).toBe(false);
  });
});

describe('Patent 8 step 3 — rates as hours per 100 units', () => {
  it('converts both ways and keeps 0 as unset', async () => {
    const { hoursPer100, unitsPerHourFromHours } = await import('./estimating');
    expect(hoursPer100(150)).toBe(0.667);
    expect(unitsPerHourFromHours(0.5)).toBe(200);
    expect(unitsPerHourFromHours(hoursPer100(125))).toBe(125);
    expect(hoursPer100(0)).toBe(0);
    expect(unitsPerHourFromHours(0)).toBe(0);
  });
});
