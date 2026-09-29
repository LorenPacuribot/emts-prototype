"use client";
/**
 * NEW — "Paint History" tab on Contact Details (/contacts/[id]?tab=paint-history).
 *
 * The live app has no Properties module: a property is a ServiceLocation
 * under the contact. So the paint history is filtered by location
 * (&location=) and split into views (&view=):
 *   history   — feature 25 paint record (surfaces, applications, corrections, print)
 *   owners    — feature 25 owners, consent and structure changes
 *   qr        — feature 26 QR links, photo sharing and touch-up requests
 *   reorders  — feature 28 touch-up reorders
 * "New Estimate from History" (feature 28) opens from here too.
 */
import { useState } from "react";
import { FilePlus2, History, MapPin, PaintBucket, QrCode, UserCheck } from "lucide-react";
import type { Customer } from "@/features/types";
import { useCurrentUser, useDb } from "@/features/lib/store";
import { useNav, useParam } from "@/features/lib/navigation";
import { contactHref } from "@/features/lib/hrefs";
import { can } from "@/features/lib/permissions";
import { cn } from "@/features/lib/cn";
import { Banner, Button, EmptyState, NewBadge, Select } from "@/features/components/ui";
import { PaintHistoryPanel } from "@/features/components/features/properties/paint-history-screen";
import { OwnershipPanel } from "@/features/components/features/properties/ownership-screen";
import { QrLinksPanel } from "@/features/components/features/properties/qr-links-screen";
import { ReordersPanel } from "@/features/components/features/future-estimate/reorders-screen";
import { NewEstimateFromHistoryModal } from "@/features/components/features/future-estimate/new-estimate-from-history-modal";
import { contactLocations, formerLocations } from "./contact-shared";

const VIEWS = [
  { key: "history", label: "Paint History", icon: <History className="h-4 w-4" />, feature: 25 },
  { key: "owners", label: "Owners & Consent", icon: <UserCheck className="h-4 w-4" />, feature: 25 },
  { key: "qr", label: "QR Links", icon: <QrCode className="h-4 w-4" />, feature: 26 },
  { key: "reorders", label: "Touch-Up Reorders", icon: <PaintBucket className="h-4 w-4" />, feature: 28 },
] as const;
type View = (typeof VIEWS)[number]["key"];

export function PaintHistoryTab({ customer }: { customer: Customer }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const nav = useNav();
  const locations = contactLocations(db, customer.id);
  const former = formerLocations(db, customer.id).filter((p) => !locations.includes(p));
  const locationParam = useParam("location");
  const viewParam = useParam("view") as View | undefined;
  const followUpParam = useParam("followUp");
  const property = locations.find((p) => p.id === locationParam) ?? locations[0];
  const view: View = viewParam && VIEWS.some((v) => v.key === viewParam) ? viewParam : "history";
  const [fromHistory, setFromHistory] = useState(useParam("newEstimate") === "1");
  const go = (patch: { location?: string; view?: View }) => nav.push(contactHref(customer.id, "paint-history", { location: patch.location ?? property?.id ?? "", view: patch.view ?? view }));

  if (!property) {
    return (
      <div className="space-y-4">
        <EmptyState icon={<MapPin />} title="No service locations for this contact." body="Paint history is kept per service location." />
        {former.length > 0 && <Banner tone="info" title="Previously owned">{former.map((p) => p.address).join(", ")}. Their paint history stays with the address and its new owner.</Banner>}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-tour="paint-history-tab">
      {/* One bar (H6): the service location, then the four views, then the one primary action. */}
      <div className="rounded-2xl border border-green-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
            {locations.length > 1 ? (
              <Select value={property.id} onChange={(e) => go({ location: e.target.value })} className="h-9 w-auto max-w-[18rem] text-sm font-semibold" aria-label="Service location">
                {locations.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}
              </Select>
            ) : (
              <span className="truncate text-sm font-semibold text-gray-900" title="Service location">{property.address}</span>
            )}
            <NewBadge feature={25} />
          </div>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 custom-scrollbar" role="tablist" aria-label="Paint history views" data-tour="subnav">
            {VIEWS.map((v) => (
              <button key={v.key} role="tab" aria-selected={view === v.key} onClick={() => go({ view: v.key })}
                className={cn("flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold", view === v.key ? "bg-white text-primary-700 shadow-sm ring-1 ring-black/5" : "text-gray-500 hover:text-gray-900")}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
          {can(user, "repeat.build") && db.applications.some((a) => a.propertyId === property.id) && (
            <Button variant="primary" className="shrink-0" onClick={() => setFromHistory(true)} data-tour="new-estimate-from-history">
              <FilePlus2 className="h-4 w-4" /> New Estimate from History <NewBadge feature={28} className="bg-white/90 text-emerald-700" />
            </Button>
          )}
        </div>
      </div>
      {former.length > 0 && view === "history" && <Banner tone="info">Previously owned by {customer.name}: {former.map((p) => p.address).join(", ")}. That history now belongs to the address and its current owner.</Banner>}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-6">
        {view === "history" && <PaintHistoryPanel property={property} />}
        {view === "owners" && <OwnershipPanel property={property} />}
        {view === "qr" && <QrLinksPanel property={property} />}
        {view === "reorders" && <ReordersPanel property={property} />}
      </div>
      <NewEstimateFromHistoryModal open={fromHistory} onOpenChange={setFromHistory} property={property} followUpId={followUpParam} />
    </div>
  );
}
