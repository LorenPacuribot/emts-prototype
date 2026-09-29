"use client";
/**
 * NEW (feature 26) — public customer QR paint record (component 26.2).
 * Route: /paint-record/view?token= (the live /paint-record/[token], added to PUBLIC_ROUTES like /estimates/view). No login, no app shell.
 *
 * - Active link: permitted record for its ownership period only.
 * - Revoked link: "Record has moved" and the business phone. No data.
 * - Unknown reference: not found.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { Download, Phone, SearchX, Truck } from "lucide-react";
import { act, useDb } from "@/features/lib/store";
import { recordOpen } from "@/features/lib/store/actions/qr";
import { recordPassportOpen } from "@/features/lib/store/actions/passport";
import { currentOwnership } from "@/features/lib/selectors";
import { useParam } from "@/features/lib/navigation";
import { useHydrated } from "@/features/lib/hooks";
import { printElement } from "@/features/lib/export";
import { BUSINESS, deviceClass } from "@/features/lib/rules/property";
import { byId } from "@/features/lib/selectors";
import { Logo } from "@/features/components/layout/icon-rail";
import { Button, Skeleton, Toaster } from "@/features/components/ui";
import { buildCustomerRecord } from "./customer-record";
import { RecordBody, RecordFooter, RecordHeader } from "./record-document";
import { TouchUpModal, type TouchUpPrefill } from "./touch-up-form";

export function PublicRecordScreen() {
  const hydrated = useHydrated();
  return (
    <div className="min-h-screen bg-canvas">
      {hydrated ? (
        <Suspense fallback={<PageSkeleton />}>
          <PublicRecord />
        </Suspense>
      ) : (
        <PageSkeleton />
      )}
      <Toaster />
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-16" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-3xl px-4 py-6 md:py-10">{children}</main>;
}

function PublicRecord() {
  // Live pattern /paint-record/view/[token]; ?ref= kept for links printed before the move.
  const token = useParam("token");
  const legacyRef = useParam("ref");
  const ref = token ?? legacyRef;
  const db = useDb((d) => d);
  const link = ref ? db.qrLinks.find((l) => l.ref === ref) : undefined;
  const passport = ref && !link ? (db.paintPassports ?? []).find((p) => p.ref === ref) : undefined;
  const counted = useRef(false);
  const docRef = useRef<HTMLDivElement>(null);
  const [touchUp, setTouchUp] = useState<TouchUpPrefill>();

  useEffect(() => {
    if (!ref || counted.current) return;
    counted.current = true;
    act(recordOpen, ref, deviceClass(navigator.userAgent));
    act(recordPassportOpen, ref);
  }, [ref]);

  useEffect(() => {
    document.title = passport && !passport.revokedAt ? "Your paint passport" : link && !link.revokedAt ? "Your paint record" : "Paint record";
  }, [link, passport]);

  if (passport && !passport.revokedAt) return <PassportView passport={passport} />;

  if (!link) {
    return (
      <Shell>
        <div className="rounded-2xl border border-line bg-white p-8 text-center shadow-card">
          <SearchX className="mx-auto h-8 w-8 text-gray-300" />
          <h1 className="mt-3 font-display text-xl font-bold text-ink">Record not found</h1>
          <p className="mt-2 text-sm text-gray-600">This link doesn&apos;t match a paint record. Check the address on your card, or call us.</p>
          <PhoneButton />
        </div>
      </Shell>
    );
  }

  if (link.revokedAt || passport?.revokedAt) {
    // Revoked: moved message and phone only. No history, surfaces or photographs are read.
    return (
      <Shell>
        <div className="rounded-2xl border border-line bg-white p-8 text-center shadow-card">
          <Logo className="mx-auto h-12 w-12" />
          <div className="mt-2 font-display text-sm font-extrabold text-ink">{BUSINESS.name}</div>
          <Truck className="mx-auto mt-6 h-8 w-8 text-gray-300" />
          <h1 className="mt-3 font-display text-2xl font-bold text-ink">Record has moved</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600">This paint record is no longer available at this link. Please call us and we&apos;ll help.</p>
          <PhoneButton />
        </div>
      </Shell>
    );
  }

  const property = byId(db.properties, link.propertyId)!;
  const record = buildCustomerRecord(db, property, link.ownershipPeriodId);

  return (
    <Shell>
      <div ref={docRef} className="space-y-6 rounded-2xl border border-line bg-white p-5 shadow-card md:p-8">
        <RecordHeader record={record} />
        <div className="no-print flex flex-wrap gap-2">
          <Button onClick={() => printElement(docRef.current, `Paint record — ${record.address}`)}>
            <Download className="h-4 w-4" /> Download PDF
          </Button>
          <Button variant="primary" onClick={() => setTouchUp({})}>Request touch-up paint</Button>
        </div>
        <RecordBody record={record} onTouchUp={(surfaceId, colourLabel) => setTouchUp({ surfaceId, colourLabel })} />
        <RecordFooter />
      </div>
      <p className="mt-4 text-center text-xs text-gray-500">Read-only record. No login needed. Anyone with this link can view it.</p>
      <TouchUpModal prefill={touchUp} onClose={() => setTouchUp(undefined)} linkRef={link.ref} record={record} />
    </Shell>
  );
}

function PhoneButton() {
  return (
    <a href={`tel:${BUSINESS.phone.replace(/\D/g, "")}`} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-base font-bold text-white shadow-sm hover:bg-brand-dark">
      <Phone className="h-4 w-4" /> {BUSINESS.phone}
    </a>
  );
}

/** Customer Paint Passport (patent 26): the chosen jobs, one record per property the customer owns now. */
function PassportView({ passport }: { passport: import("@/features/types").PaintPassport }) {
  const db = useDb((d) => d);
  const docRef = useRef<HTMLDivElement>(null);
  const properties = db.properties.filter((p) => currentOwnership(p)?.customerId === passport.customerId && db.applications.some((a) => a.propertyId === p.id && a.jobId && passport.jobIds.includes(a.jobId)));
  const records = properties.map((p) => buildCustomerRecord(db, p, currentOwnership(p)!.id, { jobIds: passport.jobIds })).filter((r) => r.areas.length);
  const customer = byId(db.customers, passport.customerId);
  return (
    <Shell>
      <div ref={docRef} className="space-y-6 rounded-2xl border border-line bg-white p-5 shadow-card md:p-8">
        <div className="flex items-center gap-3">
          <Logo className="h-10 w-10" />
          <div>
            <div className="font-display text-xl font-bold text-ink">Paint Passport</div>
            <div className="text-sm text-gray-500">{customer?.name ? `For ${customer.name} · ` : ""}{passport.jobIds.length} job{passport.jobIds.length === 1 ? "" : "s"} · from {BUSINESS.name}</div>
          </div>
        </div>
        <div className="no-print">
          <Button onClick={() => printElement(docRef.current, "Paint passport")}><Download className="h-4 w-4" /> Download PDF</Button>
        </div>
        {records.length === 0 ? (
          <p className="text-sm text-gray-600">There is nothing to show on this passport any more. Please call us and we&apos;ll help.</p>
        ) : records.map((record) => (
          <section key={record.propertyId} className="space-y-4 border-t border-line pt-6 first:border-t-0 first:pt-0">
            <RecordHeader record={record} />
            <RecordBody record={record} />
          </section>
        ))}
        <RecordFooter />
      </div>
      <p className="mt-4 text-center text-xs text-gray-500">Read-only passport. No login needed. Anyone with this link can view it.</p>
    </Shell>
  );
}
