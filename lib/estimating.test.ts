import { describe, expect, it } from 'vitest';
import type { EstimateLineItem, PaintProduct, SurfaceRate, TableColumn } from './types';
import {
  applicationHours, coatHours, coatRate, deriveLine, lineGallons, materialPerUnit, preparationHours, prepEntryHours, prepSummary,
} from './estimating';

const walls: SurfaceRate = {
  id: 'sr', name: 'Walls', rateGroup: 'Interior Walls', unit: 'sqft', defaultCoats: 2,
  rateCoat1: 100, rateCoat2: 200, rateCoat3: 0, rateCoat4: 0, useMultipliers: true, sortOrder: 1,
};
const paint: PaintProduct = {
  id: 'p', name: 'SuperPaint', brandId: 'b', category: 'Paint', finish: 'Eggshell', coverageCoat1: 300, coverageCoat2: 400,
  pricePerGallon: 60, isActive: true, isFavorite: false,
};
const line = (o: Partial<EstimateLineItem> = {}): EstimateLineItem => ({
  id: 'l', areaId: 'a', description: 'Walls', surfaceType: 'Walls', quantity: 1200, unit: 'sqft', unitPrice: 0,
  laborHours: 0, laborRate: 50, coats: 2, difficultyMultiplier: 1, total: 0, paintProductId: 'p', ...o,
});
const col = (o: Partial<TableColumn>): TableColumn => ({ id: 'c', name: 'Prep', columnType: 'CHECKBOX', isVisible: true, isSystem: false, sortOrder: 10, ...o });

describe('per-coat production rates (patent 8)', () => {
  it('uses each coat its own rate and falls back to the nearest earlier coat', () => {
    const rates = [100, 200, 0, 0];
    expect(coatRate(rates, 1)).toBe(100);
    expect(coatRate(rates, 2)).toBe(200);
    // Coat 3 left blank: coat 2's rate, not an error or zero.
    expect(coatRate(rates, 3)).toBe(200);
    expect(coatRate(rates, 6)).toBe(200);
    expect(coatRate([0, 0, 0, 0], 1)).toBe(0);
  });

  it('sums the coats for the row total', () => {
    expect(coatHours(1200, 3, [100, 200, 0, 0])).toEqual([12, 6, 6]);
    expect(applicationHours(line({ coats: 3 }), walls)).toBe(24);
  });

  it('scales application time by the surface condition', () => {
    expect(applicationHours(line({ coats: 2, condition: 'rough' }), walls)).toBe(22.5);
  });
});

describe('gallons and material (patent 9, 18)', () => {
  it('uses first-coat and later-coat coverage', () => {
    // 1200/300 + 1200/400 = 4 + 3
    expect(lineGallons(line(), paint)).toBe(7);
  });

  it('needs more paint on porous surfaces', () => {
    expect(lineGallons(line({ condition: 'porous' }), paint)).toBeCloseTo(9.33, 2);
  });

  it('uses the explicit coating area for length and count lines', () => {
    expect(lineGallons(line({ unit: 'lnft', quantity: 100 }), paint)).toBe(0);
    expect(lineGallons(line({ unit: 'lnft', quantity: 100, coatingAreaSqft: 600 }), paint)).toBe(3.5);
  });

  it('prices material per unit from the gallons', () => {
    // 7 gal x $60 / 1200 sq ft
    expect(materialPerUnit(line(), paint)).toBe(0.35);
    expect(materialPerUnit(line({ quantity: 0 }), paint)).toBe(0.35);
    expect(materialPerUnit(line(), undefined)).toBe(0);
  });
});

describe('preparation (patent 7)', () => {
  const wash = col({ id: 'wash', name: 'Wash', columnType: 'CHECKBOX', prepRate: 600 });
  const scrape = col({ id: 'scrape', name: 'Scrape', columnType: 'QUANTITY', unit: 'Percent', prepRate: 60 });
  const extra = col({ id: 'extra', name: 'Prep (Hrs)', columnType: 'HOURS', unit: 'hr' });
  const system = col({ id: 'sys', name: 'Coats', columnType: 'SYSTEM', isSystem: true });

  it('prices each prep entry', () => {
    expect(prepEntryHours(wash, true, line())).toBe(2);
    expect(prepEntryHours(wash, false, line())).toBe(0);
    expect(prepEntryHours(scrape, 25, line())).toBe(5);
    expect(prepEntryHours(extra, 1.5, line())).toBe(1.5);
    expect(prepEntryHours({ ...wash, prepRate: undefined }, true, line())).toBe(0);
  });

  it('keeps preparation separate from application in the line', () => {
    const cols = [wash, scrape, extra, system];
    const l = deriveLine(line({ prep: { wash: true, scrape: 25, extra: 1.5, gone: true } }), { surfaceRates: [walls], tableColumns: cols, paints: [paint] });
    expect(l.prepHours).toBe(8.5);
    expect(l.applicationHours).toBe(18);
    expect(l.laborHours).toBe(26.5);
    expect(l.gallons).toBe(7);
    expect(preparationHours(line(), cols)).toBe(0);
    expect(prepSummary(l, cols)).toEqual(['Wash', 'Scrape 25%', 'Prep (Hrs) 1.5 hr']);
  });

  it('keeps typed hours for a surface that is not in Surface Rates', () => {
    const l = deriveLine(line({ surfaceType: 'Custom', laborHours: 5 }), { surfaceRates: [walls] });
    expect(l.applicationHours).toBe(5);
    expect(l.laborHours).toBe(5);
  });
});
