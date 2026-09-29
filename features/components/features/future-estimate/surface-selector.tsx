"use client";
/**
 * Component 28.1 — Historical Surface Selector.
 * Prior jobs newest first, each expandable to its surfaces. Selection is
 * manual: nothing is preselected and there is no "select all latest".
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, History, Lock, X } from "lucide-react";
import type { Database, Property } from "@/features/types";
import { dateLong } from "@/features/lib/format";
import { historyGroups, ownershipContext, type HistoryItem } from "@/features/lib/store/actions/future-estimate";
import { cn } from "@/features/lib/cn";
import { Badge, Button, Checkbox, EmptyState, IdChip, Swatch, Tooltip } from "@/features/components/ui";
import { UnverifiedBadge } from "./shared";

export function SurfaceSelector({ db, property, selected, onChange, lockedSurfaceIds = [] }: {
  db: Database;
  property: Property;
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Surfaces already on the estimate. */
  lockedSurfaceIds?: string[];
}) {
  const groups = historyGroups(db, property);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (groups.length === 0) {
    const ctx = ownershipContext(db, property);
    if (ctx.hiddenCount > 0) {
      return <EmptyState icon={<Lock />} title="No history is available for the current ownership period." body="Prior-owner work is hidden until the seller consents (see the restriction above). Start a standard estimate with a new site visit." />;
    }
    return <EmptyState icon={<History />} title="No completed work is recorded at this property yet." body="Start a standard estimate instead, or log prior work on the Paint History tab." />;
  }

  const selectedItems = groups.flatMap((g) => g.items).filter((i) => selected.includes(i.app.id));
  const surfaceTaken = (item: HistoryItem) =>
    lockedSurfaceIds.includes(item.app.surfaceId) || selectedItems.some((s) => s.app.surfaceId === item.app.surfaceId && s.app.id !== item.app.id);

  const blockReason = (item: HistoryItem) => {
    if (item.removed) return "Surface marked Removed — can't be selected";
    if (lockedSurfaceIds.includes(item.app.surfaceId)) return "Already on this estimate";
    if (surfaceTaken(item)) return "Same surface already selected from another job";
    return undefined;
  };

  const toggle = (id: string, v: boolean) => onChange(v ? [...selected, id] : selected.filter((x) => x !== id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <span>
          {selected.length === 0 ? "Nothing selected. Tick each surface you want to requote." : `${selected.length} surface${selected.length === 1 ? "" : "s"} selected from ${new Set(selectedItems.map((s) => s.app.jobId ?? s.app.id)).size} source${new Set(selectedItems.map((s) => s.app.jobId ?? s.app.id)).size === 1 ? "" : "s"}.`}
        </span>
        {selected.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onChange([])}>
            <X className="h-3.5 w-3.5" /> Clear selection
          </Button>
        )}
      </div>
      {groups.map((g) => {
        const isOpen = open[g.key] ?? true;
        const count = g.items.filter((i) => selected.includes(i.app.id)).length;
        const byArea = g.items.reduce<Record<string, HistoryItem[]>>((acc, i) => ((acc[i.area?.name ?? "Other"] ??= []).push(i), acc), {});
        return (
          <div key={g.key} className="overflow-hidden rounded-xl border border-line">
            <button
              onClick={() => setOpen({ ...open, [g.key]: !isOpen })}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 bg-white px-3 py-3 text-left hover:bg-gray-50 sm:px-4"
            >
              {isOpen ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-sm font-bold text-ink">{g.label}</span>
                  {g.unverified && <UnverifiedBadge note="recorded from customer" />}
                </div>
                <div className="text-xs text-gray-500">
                  {g.date ? `Completed ${dateLong(g.date)}` : "Completion date not recorded"} · {g.items.length} surface{g.items.length === 1 ? "" : "s"}
                </div>
              </div>
              {count > 0 && <Badge tone="blue">{count} selected</Badge>}
            </button>
            {isOpen && (
              <div className="space-y-3 border-t border-line bg-gray-50/50 p-3 sm:p-4">
                {Object.entries(byArea).map(([areaName, items]) => {
                  const selectable = items.filter((i) => !blockReason(i) || selected.includes(i.app.id));
                  const allOn = selectable.length > 0 && selectable.every((i) => selected.includes(i.app.id));
                  return (
                    <div key={areaName}>
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xxs font-bold uppercase tracking-[0.12em] text-gray-500">{areaName}</span>
                        {selectable.length > 1 && (
                          <button
                            className="text-xs font-semibold text-brand hover:underline"
                            onClick={() => {
                              const ids = selectable.map((i) => i.app.id);
                              onChange(allOn ? selected.filter((x) => !ids.includes(x)) : Array.from(new Set([...selected, ...ids])));
                            }}
                          >
                            {allOn ? "Clear this room" : "Select all surfaces in this room"}
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {items.map((item) => (
                          <SurfaceRow key={item.app.id} item={item} checked={selected.includes(item.app.id)} reason={blockReason(item)} onToggle={(v) => toggle(item.app.id, v)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SurfaceRow({ item, checked, reason, onToggle }: { item: HistoryItem; checked: boolean; reason?: string; onToggle: (v: boolean) => void }) {
  const { app, surface, removed } = item;
  const disabled = !!reason && !checked;
  const row = (
    <div className={cn("flex items-start gap-3 rounded-lg border bg-white px-3 py-2.5", checked ? "border-brand/40 bg-brand-soft/30" : "border-line", disabled && "opacity-60")}>
      <div className="pt-0.5">
        <Checkbox checked={checked} disabled={disabled} onCheckedChange={onToggle} label={<span className="sr-only">Select {surface?.name}</span>} />
      </div>
      <Swatch hex={app.hex} size="sm" className="mt-0.5" />
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-[1.4fr_1.4fr_1.6fr_0.8fr_0.5fr_1fr]">
        <div className={cn("col-span-2 font-semibold text-ink sm:col-span-1", removed && "line-through")}>
          {surface?.name ?? app.surfaceId}
          <span className="ml-1 font-normal text-gray-500">{surface?.areaSqft ?? "—"} sq ft</span>
        </div>
        <div className="text-gray-700">
          {app.colourName} <span className="text-gray-500">{app.colourNumber}</span>
        </div>
        <div className="text-gray-600">{app.product}</div>
        <div className="text-gray-600">{app.sheen}</div>
        <div className="text-gray-600">{app.coats} coat{app.coats === 1 ? "" : "s"}</div>
        <div className="text-gray-500">{app.completedAt ? dateLong(app.completedAt) : "Date not recorded"}</div>
        <div className="col-span-2 flex flex-wrap gap-1 sm:col-span-6">
          <IdChip>{app.id}</IdChip>
          {app.verification === "unverified" && <UnverifiedBadge note={app.source} />}
          {item.access === "spec_only" && <Badge tone="purple" icon={<Lock className="h-3 w-3" />}>Specification only</Badge>}
          {removed && <Badge tone="gray">Removed {surface?.removedAt ? dateLong(surface.removedAt) : ""}</Badge>}
          {reason && !removed && !checked && <span className="text-xs italic text-gray-500">{reason}</span>}
        </div>
      </div>
    </div>
  );
  return disabled && removed ? <Tooltip content={reason}>{row}</Tooltip> : row;
}
