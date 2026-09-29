import { describe, expect, it } from 'vitest';
import { addressText, directionsUrl, geocode, mapEmbedUrl } from './geo';

const home = { street: '1208 Oak Hollow Dr', unit: 'Unit 4', city: 'Austin', state: 'TX', zip: '78704' };

describe('service location map helpers', () => {
  it('formats the address with and without the unit', () => {
    expect(addressText(home)).toBe('1208 Oak Hollow Dr Unit 4, Austin, TX 78704');
    expect(addressText(home, false)).toBe('1208 Oak Hollow Dr, Austin, TX 78704');
  });

  it('geocodes without the unit and validates the answer', async () => {
    let asked = '';
    const ok = (async (url: string) => {
      asked = url;
      return new Response(JSON.stringify([{ lat: '30.25', lon: '-97.76', display_name: 'Oak Hollow' }]));
    }) as unknown as typeof fetch;
    expect(await geocode(home, ok)).toEqual({ lat: 30.25, lng: -97.76, label: 'Oak Hollow' });
    expect(decodeURIComponent(asked)).toContain('1208 Oak Hollow Dr, Austin, TX 78704');
    expect(decodeURIComponent(asked)).not.toContain('Unit 4');

    const none = (async () => new Response('[]')) as unknown as typeof fetch;
    expect(await geocode(home, none)).toBeUndefined();
    const bad = (async () => new Response(JSON.stringify([{ lat: 'x', lon: '1' }]))) as unknown as typeof fetch;
    expect(await geocode(home, bad)).toBeUndefined();
    const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await geocode(home, down)).toBeUndefined();
  });

  it('builds map and directions links', () => {
    expect(mapEmbedUrl({ lat: 30.25, lng: -97.76 })).toContain('marker=30.250000,-97.760000');
    expect(directionsUrl(home)).toContain(encodeURIComponent('1208 Oak Hollow Dr Unit 4'));
    expect(directionsUrl(home, { lat: 30.25, lng: -97.76 })).toContain(encodeURIComponent('30.250000,-97.760000'));
  });
});
