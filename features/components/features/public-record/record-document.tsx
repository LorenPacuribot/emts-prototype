"use client";
/**
 * The customer's paint record: header, surface cards (latest first, earlier
 * applications under an expander), approved photos and the footer note.
 * Used by the public QR page, the customer PDF and the former-owner PDF.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Image as ImageIcon, PaintBucket, Phone } from "lucide-react";
import { dateLong } from "@/features/lib/format";
import { BUSINESS } from "@/features/lib/rules/property";
import { Logo } from "@/features/components/layout/icon-rail";
import { Badge, Swatch } from "@/features/components/ui";
import type { CustomerApplication } from "@/features/lib/rules/property";
import type { CustomerRecord } from "./customer-record";

export function RecordHeader({ record, subtitle }: { record: Pick<CustomerRecord, "address" | "cityLine">; subtitle?: string }) {
  return (
    <header className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-center gap-3">
        <Logo className="h-11 w-11" />
        <div>
          <div className="font-display text-base font-extrabold text-ink">{BUSINESS.name}</div>
          <a href={`tel:${BUSINESS.phone.replace(/\D/g, "")}`} className="flex items-center gap-1.5 text-sm font-semibold text-brand">
            <Phone className="h-3.5 w-3.5" /> {BUSINESS.phone}
          </a>
        </div>
      </div>
      <div className="sm:text-right">
        <div className="text-xxs font-bold uppercase tracking-[0.14em] text-gray-500">{subtitle ?? "Property paint record"}</div>
        <h1 className="font-display text-xl font-bold leading-tight text-ink">{record.address}</h1>
        <div className="text-sm text-gray-600">{record.cityLine}</div>
      </div>
    </header>
  );
}

function ApplicationFacts({ a, compact }: { a: CustomerApplication; compact?: boolean }) {
  const colour = a.colourName === "Unknown" ? "Colour not recorded" : `${a.colourName} · ${a.colourNumber}`;
  return (
    <div className="flex items-start gap-3">
      <Swatch hex={a.hex} size={compact ? "md" : "lg"} />
      <div className="min-w-0 text-sm">
        <div className={compact ? "font-semibold text-ink" : "font-display text-base font-bold text-ink"}>{colour}</div>
        <div className="text-gray-600">{a.manufacturer}{a.product && a.product !== "Unknown" ? ` · ${a.product}` : ""}</div>
        <dl className="mt-1.5 grid grid-cols-3 gap-x-4 text-xs">
          <div><dt className="text-gray-500">Sheen</dt><dd className="font-semibold text-ink">{a.sheen === "Unknown" ? "Not recorded" : a.sheen}</dd></div>
          <div><dt className="text-gray-500">Coats</dt><dd className="font-semibold text-ink">{a.coats || "—"}</dd></div>
          <div><dt className="text-gray-500">Completed</dt><dd className="font-semibold text-ink">{a.completedAt ? dateLong(a.completedAt) : "Not recorded"}</dd></div>
        </dl>
        {a.touchUpDates.length > 0 && <div className="mt-1 text-xs text-gray-500">Touched up {a.touchUpDates.map((d) => dateLong(d)).join(", ")}</div>}
        {a.verification === "unverified" && <div className="mt-1.5"><Badge tone="amber" className="whitespace-normal">Reported by the homeowner — not applied by us</Badge></div>}
      </div>
    </div>
  );
}

export function RecordBody({ record, printMode, onTouchUp }: { record: CustomerRecord; printMode?: boolean; onTouchUp?: (surfaceId: string, colourLabel: string) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <div className="space-y-6">
      {record.predecessor === "withheld_pending" || record.predecessor === "withheld_refused" ? (
        <p className="rounded-xl border border-line bg-gray-50 px-4 py-3 text-sm text-gray-600">Earlier work at this property is not available.</p>
      ) : record.predecessor === "spec_only" ? (
        <p className="rounded-xl border border-line bg-gray-50 px-4 py-3 text-sm text-gray-600">Earlier work from before your ownership is shown as a specification only.</p>
      ) : null}

      {record.areas.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-gray-600">No completed work is recorded for this property yet.</div>
      )}

      {record.areas.map(({ area, surfaces }) => (
        <section key={area.id} aria-labelledby={`area-${area.id}`}>
          <h2 id={`area-${area.id}`} className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
            {[area.building, area.unit, area.name].filter(Boolean).join(" · ")}
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {surfaces.map((s) => {
              const isOpen = printMode || open[s.surface.id];
              return (
                <article key={s.surface.id} className="min-w-0 break-inside-avoid rounded-2xl border border-line bg-white p-4 shadow-card">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-ink">{s.surface.name}</h3>
                    <span className="text-xs text-gray-500">{s.latestIsPredecessor ? "Earlier owner" : "Latest"} · this surface only</span>
                  </div>
                  <ApplicationFacts a={s.latest} />
                  {s.earlier.length > 0 && (
                    <div className="mt-3 border-t border-line pt-2">
                      {!printMode && (
                        <button
                          type="button"
                          onClick={() => setOpen({ ...open, [s.surface.id]: !isOpen })}
                          aria-expanded={!!isOpen}
                          className="flex items-center gap-1 rounded text-xs font-semibold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                        >
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          Earlier applications ({s.earlier.length})
                        </button>
                      )}
                      {printMode && <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Earlier applications</div>}
                      {isOpen && (
                        <div className="mt-2 space-y-3">
                          {s.earlier.map((e) => (
                            <div key={e.id} className="rounded-lg bg-gray-50 p-2.5">
                              {e.predecessor && <div className="mb-1 text-xxs font-bold uppercase tracking-wider text-gray-500">Before your ownership</div>}
                              <ApplicationFacts a={e} compact />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {onTouchUp && !printMode && s.latest.colourName !== "Unknown" && (
                    <button
                      type="button"
                      onClick={() => onTouchUp(s.surface.id, `${s.latest.colourName} ${s.latest.colourNumber}`)}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                    >
                      <PaintBucket className="h-3.5 w-3.5" /> Request touch-up paint for this surface
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {record.photos.length > 0 && (
        <section aria-labelledby="photos-h">
          <h2 id="photos-h" className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-gray-500">Photographs</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {record.photos.map((p) => (
              <figure key={p.id} className="w-44 shrink-0">
                <div className="flex h-28 items-center justify-center rounded-xl border border-line bg-gradient-to-br from-gray-100 to-gray-200 text-gray-500" role="img" aria-label={p.caption}>
                  <ImageIcon className="h-7 w-7" />
                </div>
                <figcaption className="mt-1 text-xs leading-snug text-gray-600">{p.caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function RecordFooter() {
  return (
    <footer className="border-t border-line pt-4 text-xs leading-relaxed text-gray-500">
      This record is a specification reference for the paint used at this property. It is not a guarantee of physical color match: paint
      ages, and batches and screens differ. Call {BUSINESS.name} on {BUSINESS.phone} with any questions.
    </footer>
  );
}
