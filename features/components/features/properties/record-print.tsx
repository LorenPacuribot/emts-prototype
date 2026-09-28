"use client";
/**
 * Property paint record PDF (print), staff and customer variants.
 * The customer variant is built by buildCustomerRecord, so hours, costs,
 * internal notes and the product data sheet link are absent from it.
 */
import { useRef, useState } from "react";
import { Printer } from "lucide-react";
import type { Property } from "@/features/types";
import { useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId, currentOwnership, propertyAddress } from "@/features/lib/selectors";
import { printElement } from "@/features/lib/export";
import { dateLong } from "@/features/lib/format";
import { actualLabel, newestFirst } from "@/features/lib/rules/property";
import { toast } from "@/features/lib/toast";
import { Banner, Button, Modal, PillTabs, Swatch } from "@/features/components/ui";
import { buildCustomerRecord } from "@/features/components/features/public-record/customer-record";
import { RecordBody, RecordFooter, RecordHeader } from "@/features/components/features/public-record/record-document";
import { colourText } from "./property-shared";

export type RecordVariant = "staff" | "customer";

export function PropertyRecordModal({ open, onClose, property, initial = "staff" }: { open: boolean; onClose: () => void; property: Property; initial?: RecordVariant }) {
  const [variant, setVariant] = useState<RecordVariant>(initial);
  const ref = useRef<HTMLDivElement>(null);
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const seeCosts = can(user, "property.seeCosts");
  const period = currentOwnership(property);
  const record = buildCustomerRecord(db, property, period.id);
  const areas = db.areas.filter((a) => a.propertyId === property.id);

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      size="lg"
      title="Property paint record"
      description="Print, or choose “Save as PDF” in the print dialog."
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            onClick={() => {
              printElement(ref.current, `${property.id} ${variant} paint record`);
              toast.success("PDF ready", "Use “Save as PDF” in the print dialog.");
            }}
          >
            <Printer className="h-4 w-4" /> Print / Save PDF
          </Button>
        </>
      }
    >
      <PillTabs
        className="mb-4"
        value={variant}
        onChange={setVariant}
        options={[
          { value: "staff", label: "Staff record" },
          { value: "customer", label: "Customer variant" },
        ]}
      />
      {variant === "customer" && (
        <Banner tone="info" className="mb-4" title="Customer variant">
          Colours, products, sheen, locations, dates and approved photographs only. No hours, costs, margin, internal notes or data sheet links. Scoped to {byId(db.customers, period.customerId)?.name}&apos;s ownership period.
        </Banner>
      )}
      <div ref={ref} className="rounded-xl border border-line bg-white p-6">
        {variant === "customer" ? (
          <div className="space-y-6">
            <RecordHeader record={record} />
            <RecordBody record={record} printMode />
            <RecordFooter />
          </div>
        ) : (
          <div>
            <div className="mb-4 flex items-start justify-between border-b border-line pb-3">
              <div>
                <div className="font-display text-lg font-bold">Property paint record — staff</div>
                <div className="text-[12px] text-slate-500">{propertyAddress(property, true)}</div>
              </div>
              <div className="text-right text-[11px] text-slate-500">
                {property.id}
                <br />
                Printed {dateLong(new Date().toISOString())}
              </div>
            </div>
            {areas.map((area) => {
              const surfaces = db.surfaces.filter((s) => s.areaId === area.id);
              return (
                <div key={area.id} className="mb-4 break-inside-avoid">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{[area.building, area.unit, area.name].filter(Boolean).join(" · ")}</div>
                  <table className="w-full border-collapse text-[11.5px]">
                    <thead>
                      <tr className="text-left text-[9.5px] uppercase tracking-wider text-slate-400">
                        <th className="border-b py-1 pr-2">Surface</th>
                        <th className="border-b py-1 pr-2">Colour</th>
                        <th className="border-b py-1 pr-2">Product · sheen · coats</th>
                        <th className="border-b py-1 pr-2">Completed</th>
                        <th className="border-b py-1 pr-2">Status</th>
                        {seeCosts && <th className="border-b py-1 pr-2">Hours / gallons (staff-only)</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {surfaces.flatMap((s) => {
                        const apps = newestFirst(db.applications.filter((a) => a.surfaceId === s.id));
                        if (!apps.length) return [<tr key={s.id}><td className="border-b py-1 pr-2">{s.name}</td><td colSpan={seeCosts ? 5 : 4} className="border-b py-1 italic text-slate-400">No applications recorded</td></tr>];
                        return apps.map((a, i) => (
                          <tr key={a.id}>
                            <td className="border-b py-1 pr-2">{i === 0 ? <span className={s.removedAt ? "line-through" : ""}>{s.name}{s.removedAt ? ` (removed ${dateLong(s.removedAt)})` : ""}</span> : ""}</td>
                            <td className="border-b py-1 pr-2"><span className="inline-flex items-center gap-1"><Swatch hex={a.hex} size="sm" /> {colourText(a)}</span></td>
                            <td className="border-b py-1 pr-2">{a.product} · {a.sheen} · {a.coats}</td>
                            <td className="border-b py-1 pr-2">{a.completedAt ? dateLong(a.completedAt) : "Not recorded"}</td>
                            <td className="border-b py-1 pr-2">{a.verification === "confirmed" ? "Confirmed" : `Unverified — ${a.source ?? ""}`}</td>
                            {seeCosts && <td className="border-b py-1 pr-2">{actualLabel(a.actualHours, "hrs")} / {actualLabel(a.actualGallons, "gal")}</td>}
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
