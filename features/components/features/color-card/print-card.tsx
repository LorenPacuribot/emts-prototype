"use client";
/**
 * Component 3.5 — Print And Export.
 * Crew card: by room/elevation with surface, colour, sheen, coats, primer, sequence.
 * Customer card: swatch, colour name and number, sheen and location only.
 */
import { useRef, useState } from "react";
import { Printer } from "lucide-react";
import { useDb } from "@/features/lib/store";
import { byId, propertyAddress } from "@/features/lib/selectors";
import { printElement } from "@/features/lib/export";
import { Button, Modal, PillTabs, Swatch } from "@/features/components/ui";

export type CardLayout = "crew" | "customer";

export function PrintCardModal({ open, onOpenChange, jobId, initial = "crew" }: { open: boolean; onOpenChange: (v: boolean) => void; jobId: string; initial?: CardLayout }) {
  const [layout, setLayout] = useState<CardLayout>(initial);
  const ref = useRef<HTMLDivElement>(null);
  const db = useDb((d) => d);
  const job = byId(db.jobs, jobId)!;
  const property = byId(db.properties, job.propertyId);
  const specs = db.specs.filter((s) => s.jobId === jobId && s.state !== "superseded");
  const rows = specs.flatMap((s) =>
    s.surfaceIds.map((sid) => {
      const surface = byId(db.surfaces, sid)!;
      return { spec: s, colour: byId(db.colours, s.colourId)!, surface, area: byId(db.areas, surface.areaId)! };
    }),
  );
  const byArea = rows.reduce<Record<string, typeof rows>>((acc, r) => ((acc[r.area.name] ??= []).push(r), acc), {});

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Print colour card"
      description="Print, or choose “Save as PDF” in the print dialog to export."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="primary" onClick={() => printElement(ref.current, `${job.id} ${layout} card`)}>
            <Printer className="h-4 w-4" /> Print / Save PDF
          </Button>
        </>
      }
    >
      <PillTabs
        className="mb-4"
        value={layout}
        onChange={setLayout}
        options={[
          { value: "crew", label: "Crew card" },
          { value: "customer", label: "Customer card" },
        ]}
      />
      <div ref={ref} className="rounded-xl border border-line p-6 font-sans">
        <div className="mb-4 flex items-start justify-between border-b border-line pb-3">
          <div>
            <div className="font-display text-lg font-bold">{layout === "crew" ? "Crew colour card" : "Your colour selections"}</div>
            <div className="text-[12px] text-slate-500">
              {job.name} · {propertyAddress(property, true)}
            </div>
          </div>
          <div className="text-right text-[11px] text-slate-500">
            {job.id}
            <br />
            Card v{job.cardVersion}
          </div>
        </div>
        {rows.length === 0 && <p className="text-[13px] italic text-slate-400">No surfaces assigned yet.</p>}
        {layout === "crew"
          ? Object.entries(byArea).map(([area, list]) => (
              <div key={area} className="mb-4">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{area}</div>
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                      <th className="border-b py-1">Surface</th>
                      <th className="border-b py-1">Colour</th>
                      <th className="border-b py-1">Sheen</th>
                      <th className="border-b py-1">Coats</th>
                      <th className="border-b py-1">Primer</th>
                      <th className="border-b py-1">Sequence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.spec.id + r.surface.id}>
                        <td className="border-b py-1.5 pr-2">{r.surface.name}</td>
                        <td className="border-b py-1.5 pr-2">
                          <span className="inline-flex items-center gap-1.5">
                            <Swatch hex={r.colour.hex} size="sm" /> {r.colour.name} {r.colour.number}
                          </span>
                        </td>
                        <td className="border-b py-1.5 pr-2">{r.spec.sheen ?? "—"}</td>
                        <td className="border-b py-1.5 pr-2">{r.spec.coats ?? "—"}</td>
                        <td className="border-b py-1.5 pr-2">{r.spec.primer ?? "—"}</td>
                        <td className="border-b py-1.5">{r.spec.coatSequence.join(" → ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          : (
            <div className="grid gap-3 sm:grid-cols-2">
              {rows.map((r) => (
                <div key={r.spec.id + r.surface.id} className="flex items-center gap-3 rounded-lg border border-line p-3">
                  <Swatch hex={r.colour.hex} size="lg" />
                  <div className="text-[12.5px]">
                    <div className="font-bold">
                      {r.colour.name} · {r.colour.number}
                    </div>
                    <div className="text-slate-600">{r.spec.sheen ?? "Sheen to be confirmed"}</div>
                    <div className="text-slate-500">
                      {r.area.name} — {r.surface.name}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        {layout === "customer" && <p className="mt-4 text-[10.5px] text-slate-400">On-screen swatches are a guide only and are not a guarantee of physical colour match.</p>}
      </div>
    </Modal>
  );
}
