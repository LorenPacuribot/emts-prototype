'use client';

/*
  NEW feature glue for the replica Contact Details page (features 25, 26, 28).
  The replica contact has the same id as its prototype customer; the
  prototype's properties are this contact's service locations.

  - PaintHistoryHost: the NEW "Paint History" tab (?tab=paint-history,
    &location=, &view=history|owners|qr|reorders), the prototype's own tab body.
  - LocationPaintChips: paint-record count and QR state on a service location card.
  - useImportedJobs: completed jobs imported into the paint history (no replica job).
  - JobFeatureActions: "Generate QR Code" (26) and "New Estimate from History" (28)
    on a Job History card.
  Contacts with no prototype twin render a small empty state or nothing.
*/
import React, { useState } from 'react';
import Link from 'next/link';
import { FilePlus2, MapPin, QrCode } from 'lucide-react';
import type { Property } from '@/features/types';
import { useCurrentUser, useDb } from '@/features/lib/store';
import { byId, currentOwnership, propertyAddress } from '@/features/lib/selectors';
import { can } from '@/features/lib/permissions';
import { contactHref } from '@/features/lib/hrefs';
import { NewBadge } from '@/features/components/ui';
import { PaintHistoryTab } from '@/features/components/features/contacts/details/paint-history-tab';
import { contactLocations } from '@/features/components/features/contacts/details/contact-shared';
import { NewEstimateFromHistoryModal } from '@/features/components/features/future-estimate/new-estimate-from-history-modal';

export function PaintHistoryHost({ customerId }: { customerId: string }) {
  const db = useDb((d) => d);
  const customer = byId(db.customers, customerId);
  if (!customer) {
    return (
      <div className="flex min-h-[300px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 bg-white py-12 text-center">
        <MapPin className="h-6 w-6 text-gray-300" />
        <p className="italic text-gray-400">No paint history recorded for this contact yet.</p>
        <p className="text-xs text-gray-400">Paint history is kept per service location once a job is closed out.</p>
      </div>
    );
  }
  return <PaintHistoryTab customer={customer} />;
}

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

/** Paint records and QR link state for the prototype property at this street. */
export function LocationPaintChips({ customerId, street }: { customerId: string; street?: string }) {
  const db = useDb((d) => d);
  const property = contactLocations(db, customerId).find((p) => norm(p.address) === norm(street));
  if (!property) return null;
  const apps = db.applications.filter((a) => a.propertyId === property.id).length;
  const period = currentOwnership(property);
  const qr = db.qrLinks.find((q) => q.propertyId === property.id && q.ownershipPeriodId === period.id && !q.revokedAt);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <Link
        href={contactHref(customerId, 'paint-history', { location: property.id })}
        scroll={false}
        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
      >
        {apps} paint records <NewBadge feature={25} />
      </Link>
      {qr && (
        <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">
          <QrCode className="h-3 w-3" /> QR link active
        </span>
      )}
    </div>
  );
}

export interface ImportedJob {
  id: string;
  title: string;
  address: string;
  value: number;
  completedAt: string;
  propertyId: string;
}

/** Completed jobs imported into the paint history for this contact's locations (no live job record). */
export function useImportedJobs(customerId: string, liveIds: Set<string>): ImportedJob[] {
  const db = useDb((d) => d);
  const locations = contactLocations(db, customerId);
  const locIds = new Set(locations.map((p) => p.id));
  return (db.historicalJobs ?? [])
    .filter((h) => locIds.has(h.propertyId) && !liveIds.has(h.id))
    .map((h) => ({
      id: h.id,
      title: h.name,
      address: propertyAddress(byId(db.properties, h.propertyId)),
      value: Object.values(h.linePrices).reduce((a, b) => a + b, 0),
      completedAt: h.completedAt,
      propertyId: h.propertyId,
    }));
}

/**
 * NEW actions on a Job History card. `jobId` is a replica job (its prototype twin
 * gives the service location); `propertyId` is given directly for an imported job.
 */
export function JobFeatureActions({ customerId, jobId, propertyId }: { customerId: string; jobId?: string; propertyId?: string }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const pid = propertyId ?? byId(db.jobs, jobId)?.propertyId;
  const property: Property | undefined = byId(db.properties, pid);
  if (!property) return null;
  const hasHistory = db.applications.some((a) => a.propertyId === property.id);
  const showQr = can(user, 'qr.generate');
  const showHistory = hasHistory && can(user, 'repeat.build');
  if (!showQr && !showHistory) return null;
  const btn = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-50';
  return (
    <div className="flex flex-wrap gap-2">
      {showQr && (
        <Link href={contactHref(customerId, 'paint-history', { location: property.id, view: 'qr' })} className={btn}>
          <QrCode className="h-3.5 w-3.5" /> Generate QR Code <NewBadge feature={26} />
        </Link>
      )}
      {showHistory && (
        <button type="button" onClick={() => setOpen(true)} data-tour="new-estimate-from-history" className={btn}>
          <FilePlus2 className="h-3.5 w-3.5" /> New Estimate from History <NewBadge feature={28} />
        </button>
      )}
      {open && <NewEstimateFromHistoryModal open={open} onOpenChange={setOpen} property={property} />}
    </div>
  );
}
