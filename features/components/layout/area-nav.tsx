"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/features/lib/cn";
import Link from "next/link";

export type AreaPage = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number | string;
  active?: boolean;
  /** Extra marker after the label, such as a NEW badge. */
  marker?: ReactNode;
};
export type Area = { key: string; label: string; pages: AreaPage[] };
export type ElsewhereLink = { href: string; label: string; badge?: number | string; active?: boolean };

/** Sum of an area's numeric badges (a text badge such as "!" is shown as is). */
export function areaBadge(pages: AreaPage[]): number | string | undefined {
  const text = pages.find((p) => typeof p.badge === "string" && p.badge)?.badge;
  const sum = pages.reduce((s, p) => s + (typeof p.badge === "number" ? p.badge : 0), 0);
  return sum || text || undefined;
}

/** The area that holds the current page (the first area if none does). */
export function activeArea(areas: Area[]): Area | undefined {
  return areas.find((a) => a.pages.some((p) => p.active)) ?? areas[0];
}

/**
 * Two-level navigation for modules with more than seven pages (L1, L2):
 * areas as underline tabs on top, the chosen area's pages as a segmented row
 * below. The area holding the current page is open on load; choosing another
 * area only shows its pages (it doesn't navigate), then the user picks a page.
 * "Elsewhere" links, for pages that live in another module, sit to the right
 * of the areas. Both rows scroll sideways on phones and never wrap.
 * Keeps data-tour="subnav" so product-tour stops still land. `replace` swaps the
 * URL instead of adding a history entry (for pages that switch views by query).
 */
export function AreaNav({ label, areas, elsewhere = [], note, replace }: { label: string; areas: Area[]; elsewhere?: ElsewhereLink[]; note?: ReactNode; replace?: boolean }) {
  const visible = areas.filter((a) => a.pages.length > 0);
  const current = activeArea(visible);
  const [shown, setShown] = useState(current?.key);
  // Follow the current page when it changes (a page link was followed).
  useEffect(() => setShown(current?.key), [current?.key]);
  const open = visible.find((a) => a.key === shown) ?? current;
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rowRef = useRef<HTMLDivElement>(null);
  const activeHref = open?.pages.find((p) => p.active)?.href;
  // On a phone the page row scrolls: bring the current page into view (deep links).
  useEffect(() => {
    const row = rowRef.current;
    const el = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (row && el && row.scrollWidth > row.clientWidth) row.scrollLeft = el.offsetLeft - row.offsetLeft - 8;
  }, [activeHref]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + visible.length) % visible.length;
    tabRefs.current[next]?.focus();
    setShown(visible[next]!.key);
  };

  return (
    <div data-tour="subnav" className="no-print">
      {/* Top row: areas, and links to pages elsewhere in the app. */}
      <div className="-mx-4 flex items-end gap-6 overflow-x-auto border-b border-gray-200 px-4 no-scrollbar md:mx-0 md:px-0">
        <div role="tablist" aria-label={label} className="flex shrink-0 items-end gap-6">
          {visible.map((a, i) => {
            const selected = a.key === open?.key;
            const badge = areaBadge(a.pages);
            return (
              <button
                key={a.key}
                ref={(el) => { tabRefs.current[i] = el; }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${a.key}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setShown(a.key)}
                onKeyDown={(e) => onKey(e, i)}
                className={cn(
                  "-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 pb-3 pt-1 font-heading text-[17px] font-semibold transition-colors",
                  selected ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800",
                )}
              >
                {a.label}
                {badge !== undefined && (
                  <span className={cn("rounded-full px-2 py-0.5 font-sans text-xs font-bold", selected ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-600")}>{badge}</span>
                )}
              </button>
            );
          })}
        </div>
        {elsewhere.length > 0 && (
          <div className="ml-auto flex shrink-0 items-center gap-5 pb-3">
            {elsewhere.map((l) => (
              <Link key={l.href} href={l.href} replace={replace} scroll={replace ? false : undefined} aria-current={l.active ? "page" : undefined} className={cn("flex items-center gap-1 whitespace-nowrap text-sm font-semibold hover:text-primary-700", l.active ? "text-primary-700 underline underline-offset-4" : "text-gray-600")}>
                {l.label}
                {l.badge !== undefined && l.badge !== 0 && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">{l.badge}</span>}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Second row: the open area's pages, as a segmented row. */}
      {open && (
        <div ref={rowRef} role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${open.key}`} className="-mx-4 mt-3 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
          <div className="inline-flex gap-1 rounded-xl bg-gray-100 p-1">
            {open.pages.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                replace={replace}
                scroll={replace ? false : undefined}
                aria-current={p.active ? "page" : undefined}
                className={cn(
                  "flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-4 text-sm font-semibold transition-colors",
                  p.active ? "border-gray-200 bg-white text-ink shadow-sm" : "border-transparent text-gray-600 hover:bg-white/60 hover:text-ink",
                )}
              >
                <p.icon className="h-4 w-4" aria-hidden />
                {p.label}
                {p.marker}
                {p.badge !== undefined && p.badge !== 0 && p.badge !== "" && (
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", p.active ? "bg-primary-100 text-primary-700" : "bg-white text-gray-600")}>{p.badge}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
      {note && <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-gray-500">{note}</div>}
    </div>
  );
}
