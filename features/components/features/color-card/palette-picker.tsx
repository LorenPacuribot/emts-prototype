"use client";
/**
 * Feature 3 — pick a colour from the manufacturer's preloaded palette.
 * Choosing one fills name, number and swatch. The free-text fields stay
 * editable, so a custom match or an off-palette colour can still be typed in.
 */
import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import type { PaletteColour } from "@/features/types";
import { useDb } from "@/features/lib/store";
import { cn } from "@/features/lib/cn";
import { Input, Select, Swatch } from "@/features/components/ui";
import { MANUFACTURERS } from "./constants";

export function PalettePicker({ manufacturer, onManufacturerChange, selectedNumber, onPick }: {
  manufacturer: string;
  /** Shows a manufacturer selector inside the picker when given. */
  onManufacturerChange?: (m: string) => void;
  selectedNumber?: string;
  onPick: (c: PaletteColour) => void;
}) {
  const palette = useDb((d) => d.palette ?? []);
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    return palette
      .filter((c) => c.manufacturer === manufacturer)
      .filter((c) => !term || [c.name, c.number, c.family ?? ""].some((v) => v.toLowerCase().includes(term)));
  }, [palette, manufacturer, q]);

  return (
    <div className="rounded-xl border border-line bg-gray-50/60 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        {onManufacturerChange && (
          <Select value={manufacturer} onChange={(e) => onManufacturerChange(e.target.value)} className="sm:w-48" aria-label="Palette manufacturer">
            {MANUFACTURERS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        )}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${manufacturer} colours by name or number`} className="pl-9" aria-label="Search palette" />
        </div>
      </div>
      <div className="mt-2 max-h-48 overflow-y-auto" role="listbox" aria-label={`${manufacturer} palette`}>
        {matches.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs italic text-gray-400">
            No {manufacturer} palette colour matches. Type the name and number below for a custom or off-palette colour.
          </p>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2">
            {matches.map((c) => {
              const active = c.number === selectedNumber;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => onPick(c)}
                  className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs hover:bg-white", active ? "border-brand bg-white" : "border-transparent")}
                >
                  <Swatch hex={c.hex} size="sm" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-ink">{c.name}</span> <span className="font-mono text-gray-500">{c.number}</span>
                  </span>
                  {active && <Check className="h-3.5 w-3.5 text-brand" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
