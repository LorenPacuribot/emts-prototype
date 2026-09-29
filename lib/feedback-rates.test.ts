import { describe, expect, it } from 'vitest';
import { matchingSurfaceRates, scaledRates } from './feedback-rates';
import type { SurfaceRate } from './types';

const rate = (name: string, rateGroup: string, c1 = 100): SurfaceRate => ({ id: name, name, rateGroup, unit: 'sqft', defaultCoats: 2, rateCoat1: c1, rateCoat2: c1 + 20, rateCoat3: 0, rateCoat4: 0, useMultipliers: true, sortOrder: 1 });
const rates = [rate('Standard Walls (8ft)', 'Interior Walls'), rate('Accent Wall', 'Interior Walls'), rate('Standard Siding', 'Exterior Walls'), rate('Stucco', 'Exterior Walls'), rate('Flat Ceiling', 'Ceilings & Floors'), rate('Door Trim', 'Trim & Molding'), rate('Cabinet Doors', 'Cabinets')];

describe('Patent 30 — approved feedback rates reach Surface Rates', () => {
  it('matches a combination to the contractor\'s named surface rates', () => {
    expect(matchingSurfaceRates(rates, 'walls|interior|standard|roll|sound').map((r) => r.name)).toEqual(['Standard Walls (8ft)', 'Accent Wall']);
    expect(matchingSurfaceRates(rates, 'siding|exterior|premium|spray|sound').map((r) => r.name)).toEqual(['Standard Siding']);
    expect(matchingSurfaceRates(rates, 'ceiling|interior|standard|roll|sound').map((r) => r.name)).toEqual(['Flat Ceiling']);
    expect(matchingSurfaceRates(rates, 'trim|interior|premium|brush|sound').map((r) => r.name)).toEqual(['Door Trim']);
    expect(matchingSurfaceRates(rates, 'cabinets|interior|standard|spray|sound').map((r) => r.name)).toEqual(['Cabinet Doors']);
  });
  it('scales every set coat by the same proportion and leaves blank coats blank', () => {
    expect(scaledRates(rate('x', 'y', 120), 142 / 120)).toEqual({ rateCoat1: 142, rateCoat2: 165.7, rateCoat3: 0, rateCoat4: 0 });
  });
});
