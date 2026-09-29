/*
  Geocoding, map and directions for service locations (patent 1, step 5).

  - geocode(): OpenStreetMap Nominatim (no API key; one request per saved
    address, never in a loop, as its usage policy asks).
  - mapEmbedUrl(): OpenStreetMap embed centred on the point with a marker.
  - directionsUrl(): Google Maps directions to the address (opens the app on
    phones). Works without coordinates, so directions are always available.
*/

export interface GeoPoint {
  lat: number;
  lng: number;
  /** The address as the geocoder matched it. */
  label?: string;
}

export type AddressParts = { street: string; unit?: string; city: string; state: string; zip: string };

export function addressText(a: AddressParts, withUnit = true): string {
  const street = withUnit && a.unit ? `${a.street} ${a.unit}` : a.street;
  return [street, a.city, [a.state, a.zip].filter(Boolean).join(' ')].map((s) => s?.trim()).filter(Boolean).join(', ');
}

/** Looks an address up; undefined when it can't be found or the service can't be reached. */
export async function geocode(a: AddressParts, fetchImpl: typeof fetch = fetch): Promise<GeoPoint | undefined> {
  // The unit number confuses geocoders; the building is what matters for the map.
  const q = addressText(a, false);
  if (!q) return undefined;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return undefined;
    const rows = (await res.json()) as { lat?: string; lon?: string; display_name?: string }[];
    const hit = rows[0];
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
    return { lat, lng, label: hit?.display_name };
  } catch {
    return undefined;
  }
}

/** OpenStreetMap embed with a marker; about 400 m across. */
export function mapEmbedUrl(p: { lat: number; lng: number }, span = 0.004): string {
  const bbox = [p.lng - span, p.lat - span / 2, p.lng + span, p.lat + span / 2].map((n) => n.toFixed(6)).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

/** Full map page for the point (or a search for the address). */
export function mapPageUrl(a: AddressParts, p?: { lat: number; lng: number }): string {
  return p
    ? `https://www.openstreetmap.org/?mlat=${p.lat.toFixed(6)}&mlon=${p.lng.toFixed(6)}#map=18/${p.lat.toFixed(6)}/${p.lng.toFixed(6)}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(addressText(a, false))}`;
}

/** Turn-by-turn directions to the property. */
export function directionsUrl(a: AddressParts, p?: { lat: number; lng: number }): string {
  const dest = p ? `${p.lat.toFixed(6)},${p.lng.toFixed(6)}` : addressText(a);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}
