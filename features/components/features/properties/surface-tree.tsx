"use client";
/**
 * Component 25.1 — Property structure and surface tree.
 * Building and unit, then room or elevation, then surface. Single-family
 * properties collapse the building and unit levels. Removed surfaces stay in
 * the tree, struck through with their removal date.
 */
import { useState } from "react";
import { Building2, ChevronDown, ChevronRight, DoorOpen, Layers, Trash2 } from "lucide-react";
import type { Application, Area, Surface } from "@/features/types";
import { cn } from "@/features/lib/cn";
import { dateLong } from "@/features/lib/format";
import { EmptyState, RowMenu, Tooltip } from "@/features/components/ui";

export function SurfaceTree({ areas, surfaces, apps, selected, onSelect, canEdit, onRemove }: {
  areas: Area[];
  surfaces: Surface[];
  apps: Application[];
  selected?: string;
  onSelect: (id: string) => void;
  canEdit: boolean;
  onRemove: (s: Surface) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  if (areas.length === 0) return <EmptyState icon={<Layers />} title="No rooms or elevations recorded" body="Surfaces are added from a job's measured scope." />;

  const multi = areas.some((a) => a.building || a.unit);
  const groups = multi
    ? Array.from(new Set(areas.map((a) => `${a.building ?? "Main"}|${a.unit ?? ""}`))).map((k) => {
        const [building, unit] = k.split("|");
        return { key: k, label: [building, unit].filter(Boolean).join(" · "), areas: areas.filter((a) => `${a.building ?? "Main"}|${a.unit ?? ""}` === k) };
      })
    : [{ key: "all", label: "", areas }];

  const toggle = (k: string) => setCollapsed({ ...collapsed, [k]: !collapsed[k] });

  return (
    <div className="space-y-1" role="tree" aria-label="Surfaces">
      {groups.map((g) => (
        <div key={g.key}>
          {g.label && (
            <button onClick={() => toggle(g.key)} className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left text-xs font-bold text-ink hover:bg-gray-50" aria-expanded={!collapsed[g.key]}>
              {collapsed[g.key] ? <ChevronRight className="h-3.5 w-3.5 text-gray-500" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-500" />}
              <Building2 className="h-3.5 w-3.5 text-brand" /> {g.label}
            </button>
          )}
          {!collapsed[g.key] && (
            <div className={cn(g.label && "ml-3 border-l border-line pl-2")}>
              {g.areas.map((area) => {
                const list = surfaces.filter((s) => s.areaId === area.id);
                const isCollapsed = collapsed[area.id];
                return (
                  <div key={area.id} role="treeitem" aria-expanded={!isCollapsed}>
                    <button onClick={() => toggle(area.id)} className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left text-xs font-semibold text-gray-700 hover:bg-gray-50">
                      {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-gray-500" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-500" />}
                      <DoorOpen className="h-3.5 w-3.5 text-gray-500" />
                      <span className="flex-1">{area.name}</span>
                      <span className="text-xs font-medium text-gray-500">{area.kind === "exterior" ? "Elevation" : "Room"}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="ml-4 space-y-0.5 border-l border-line pl-2">
                        {list.length === 0 && <div className="px-2 py-1 text-xs italic text-gray-500">No surfaces</div>}
                        {list.map((s) => {
                          const count = apps.filter((a) => a.surfaceId === s.id).length;
                          const active = selected === s.id;
                          return (
                            <div key={s.id} className={cn("group flex items-center gap-1 rounded-lg border", active ? "border-blue-100 bg-brand-soft" : "border-transparent hover:bg-gray-50")}>
                              <button onClick={() => onSelect(s.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left" aria-current={active || undefined}>
                                <span className={cn("min-w-0 flex-1 truncate text-xs", active ? "font-semibold text-brand" : "text-gray-700", s.removedAt && "text-gray-500 line-through")}>{s.name}</span>
                                {s.removedAt ? (
                                  <Tooltip content={s.removedReason ?? "Removed"}>
                                    <span className="whitespace-nowrap text-xs font-semibold text-red-500">Removed {dateLong(s.removedAt)}</span>
                                  </Tooltip>
                                ) : (
                                  <span className={cn("rounded-full px-1.5 text-xs font-bold", count ? "bg-gray-100 text-gray-500" : "text-gray-300")}>{count}</span>
                                )}
                              </button>
                              {canEdit && !s.removedAt && (
                                <span className="opacity-60 group-hover:opacity-100">
                                  <RowMenu label={`Actions for ${s.name}`} items={[{ label: "Mark surface removed", icon: <Trash2 />, danger: true, onSelect: () => onRemove(s) }]} />
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
