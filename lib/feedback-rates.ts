/*
  Approved estimating-feedback rates reach Settings > Surface Rates (patent 30:
  "click Apply Suggested Rate to update Settings > Surface Rates").

  A feedback combination names a surface type and interior/exterior; Surface
  Rates are named by the contractor ("Standard Walls (8ft)", group "Interior
  Walls"). The combination's matching rates move by the same proportion as the
  approved production rate, on every coat.
*/
import type { SurfaceRate } from './types';

const has = (s: string, word: string) => s.toLowerCase().includes(word);

/** Surface Rates a feedback combination (comboKey "surfaceType|interior|tier|method|condition") applies to. */
export function matchingSurfaceRates(rates: SurfaceRate[], comboKey: string): SurfaceRate[] {
  const [surfaceType = '', side = ''] = comboKey.split('|');
  const exterior = side === 'exterior';
  return rates.filter((r) => {
    const g = r.rateGroup ?? '';
    switch (surfaceType) {
      case 'walls': return exterior ? has(g, 'exterior') : has(g, 'interior') && has(g, 'wall');
      case 'siding': return has(r.name, 'siding');
      case 'body': return has(g, 'exterior');
      case 'ceiling': return has(r.name, 'ceiling');
      case 'trim': return has(g, 'trim');
      case 'door': return has(r.name, 'door') && !has(g, 'cabinet') && !has(r.name, 'trim');
      case 'cabinets': return has(g, 'cabinet');
      default: return false;
    }
  });
}

/** Each coat's rate scaled by `ratio`, rounded to one decimal; blank coats stay blank. */
export function scaledRates(r: SurfaceRate, ratio: number): Pick<SurfaceRate, 'rateCoat1' | 'rateCoat2' | 'rateCoat3' | 'rateCoat4'> {
  const s = (v: number) => (v ? Math.round(v * ratio * 10) / 10 : v);
  return { rateCoat1: s(r.rateCoat1), rateCoat2: s(r.rateCoat2), rateCoat3: s(r.rateCoat3), rateCoat4: s(r.rateCoat4) };
}
