'use client';

/*
  Service locations (patent 1, "Customer and Property Record"):
  - ServiceLocationModal: "Add Service Location" with Street, Unit/Lot, City,
    State and ZIP. Saving attaches the property to the customer, then
    geocodes it in the background for the map.
  - PropertyMapCard: the interactive map (OpenStreetMap) and "Get Directions".
  - useAddServiceLocation(): saves a location and geocodes it.
*/
import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, MapPin, Navigation } from 'lucide-react';
import type { Customer, ServiceLocation } from '@/lib/types';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import { uid } from '@/lib/utils';
import { addressText, directionsUrl, geocode, mapEmbedUrl, mapPageUrl, type AddressParts } from '@/lib/geo';

type Draft = { label: string; street: string; unit: string; city: string; state: string; zip: string };
const EMPTY: Draft = { label: '', street: '', unit: '', city: '', state: '', zip: '' };

export function ServiceLocationModal({
  open, onOpenChange, title = 'Add Service Location', initial, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  initial?: Partial<Draft>;
  onSave: (d: Draft) => void;
}) {
  const [f, setF] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  useEffect(() => {
    if (open) {
      setF({ ...EMPTY, ...initial });
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (k: keyof Draft, v: string) => setF((x) => ({ ...x, [k]: v }));

  const save = () => {
    const e: typeof errors = {};
    if (!f.street.trim()) e.street = 'Street is required';
    if (!f.city.trim()) e.city = 'City is required';
    if (!f.state.trim()) e.state = 'State is required';
    else if (!/^[A-Za-z]{2}$/.test(f.state.trim())) e.state = 'Use the 2-letter state code';
    if (f.zip.trim() && !/^\d{5}(-\d{4})?$/.test(f.zip.trim())) e.zip = 'Enter a 5-digit ZIP';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave({ label: f.label.trim(), street: f.street.trim(), unit: f.unit.trim(), city: f.city.trim(), state: f.state.trim().toUpperCase(), zip: f.zip.trim() });
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="The property or job-site address. It is saved on the customer record and shown on the map."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save}>Save</Button></>}
    >
      <div className="space-y-4">
        <Field label="Street" required error={errors.street}>
          <Input autoFocus value={f.street} invalid={!!errors.street} placeholder="1208 Oak Hollow Dr" onChange={(e) => set('street', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Unit / Lot"><Input value={f.unit} placeholder="Unit 4 / Lot 12" onChange={(e) => set('unit', e.target.value)} /></Field>
          <Field label="Label"><Input value={f.label} placeholder="Rental, Lake house…" onChange={(e) => set('label', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-[1fr_90px_110px] gap-4">
          <Field label="City" required error={errors.city}><Input value={f.city} invalid={!!errors.city} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label="State" required error={errors.state}><Input value={f.state} maxLength={2} invalid={!!errors.state} placeholder="TX" onChange={(e) => set('state', e.target.value)} /></Field>
          <Field label="ZIP" error={errors.zip}><Input value={f.zip} inputMode="numeric" invalid={!!errors.zip} onChange={(e) => set('zip', e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

/** Saves a new service location on the customer and geocodes it for the map. */
export function useAddServiceLocation() {
  const customers = useCollection('customers');
  // The geocoder answers later; read the customer from the latest render then.
  const latestRef = useRef(customers);
  latestRef.current = customers;
  const { toast } = useToast();
  return (customer: Customer, d: Omit<ServiceLocation, 'id' | 'createdAt'> & { label?: string }) => {
    const loc: ServiceLocation = {
      id: uid('sl'), label: d.label || undefined, street: d.street, unit: d.unit || undefined, city: d.city, state: d.state, zip: d.zip, createdAt: new Date().toISOString(),
    };
    customers.update(customer.id, { serviceLocations: [...(customer.serviceLocations ?? []), loc] });
    toast('Service location saved. Finding it on the map…');
    void geocode(loc).then((p) => {
      // Read the latest list: another edit may have happened while geocoding.
      const col = latestRef.current;
      const latest = col.get(customer.id);
      if (!latest) return;
      const list = latest.serviceLocations ?? [loc];
      col.update(customer.id, {
        serviceLocations: (list.some((l) => l.id === loc.id) ? list : [...list, loc]).map((l) =>
          l.id === loc.id ? { ...l, lat: p?.lat, lng: p?.lng, geocodedAt: new Date().toISOString() } : l,
        ),
      });
      if (!p) toast('Address saved, but it could not be found on the map. Directions still work.', 'info');
    });
    return loc;
  };
}

/** Geocodes an address on demand (primary address and lead addresses aren't stored with coordinates). */
function useGeocoded(a: AddressParts, known?: { lat?: number; lng?: number }) {
  const [point, setPoint] = useState<{ lat: number; lng: number } | null | undefined>(
    known?.lat !== undefined && known?.lng !== undefined ? { lat: known.lat, lng: known.lng } : undefined,
  );
  const key = addressText(a, false);
  useEffect(() => {
    if (known?.lat !== undefined && known?.lng !== undefined) {
      setPoint({ lat: known.lat, lng: known.lng });
      return;
    }
    let live = true;
    setPoint(undefined);
    if (!a.street) {
      setPoint(null);
      return;
    }
    void geocode(a).then((p) => live && setPoint(p ? { lat: p.lat, lng: p.lng } : null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, known?.lat, known?.lng]);
  return point;
}

/** Interactive map of a property with "Get Directions". Loads the map only when opened. */
export function PropertyMapCard({ address, known, compact }: { address: AddressParts; known?: { lat?: number; lng?: number }; compact?: boolean }) {
  const [show, setShow] = useState(!compact);
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
        <button type="button" onClick={() => setShow((v) => !v)} className="inline-flex items-center gap-1 text-primary-600 hover:underline">
          <MapPin className="h-3.5 w-3.5" /> {show ? 'Hide map' : 'Show map'}
        </button>
        <a href={directionsUrl(address, known?.lat !== undefined && known?.lng !== undefined ? { lat: known.lat, lng: known.lng } : undefined)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline">
          <Navigation className="h-3.5 w-3.5" /> Get Directions
        </a>
      </div>
      {show && <MapFrame address={address} known={known} />}
    </div>
  );
}

function MapFrame({ address, known }: { address: AddressParts; known?: { lat?: number; lng?: number } }) {
  const point = useGeocoded(address, known);
  if (point === undefined) return <div className="mt-2 flex h-40 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-500">Finding the address…</div>;
  if (point === null) {
    return (
      <div className="mt-2 rounded-lg border border-dashed border-gray-300 bg-white p-3 text-xs text-gray-500">
        This address couldn&apos;t be found on the map.{' '}
        <a href={mapPageUrl(address)} target="_blank" rel="noreferrer" className="font-semibold text-primary-600 hover:underline">Search the map</a>
      </div>
    );
  }
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-gray-200">
      <iframe title={`Map of ${addressText(address)}`} src={mapEmbedUrl(point)} className="h-44 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      <a href={mapPageUrl(address, point)} target="_blank" rel="noreferrer" className="flex items-center justify-end gap-1 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-500 hover:text-primary-600">
        Larger map <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
