"use client";
import { useLayoutEffect, useRef, type ReactNode, type TdHTMLAttributes, type ThHTMLAttributes } from "react";
import { cn } from "@/features/lib/cn";
import { useRoomy } from "./roomy";

/**
 * Table styled like the Pending Sales widget: grey header band, uppercase
 * micro labels. Responsive (H8, see .rtable in app/globals.css): below md each
 * row is a stacked card, so every cell is labeled with its column header;
 * at md and up the first column is pinned while the table scrolls sideways.
 */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const roomy = useRoomy();
  // Copy each header's text onto its column's cells for the card layout (runs after every render, cheap).
  useLayoutEffect(() => {
    const table = ref.current?.querySelector(":scope > table");
    if (!table) return;
    const heads = Array.from(table.querySelectorAll(":scope > thead > tr:last-child > th")).map((th) => th.textContent?.trim() ?? "");
    for (const tr of Array.from(table.querySelectorAll(":scope > tbody > tr"))) {
      let col = 0;
      for (const td of Array.from(tr.children) as HTMLTableCellElement[]) {
        const span = td.colSpan || 1;
        const label = span === 1 ? heads[col] ?? "" : "";
        if (td.getAttribute("data-label") !== label) td.setAttribute("data-label", label);
        col += span;
      }
    }
  });
  return (
    <div ref={ref} className={cn("rtable overflow-x-auto rounded-xl border border-line", className)}>
      <table className={cn("w-full min-w-max border-collapse text-left", roomy ? "text-sm" : "text-xs")}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-gray-50/80">{children}</thead>;
}

export function TH({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  const roomy = useRoomy();
  return <th className={cn("border-b border-line px-3 py-2.5 text-xxs font-bold uppercase tracking-[0.12em] text-gray-500", roomy && "px-4 py-3 text-xs", className)} {...rest} />;
}

/**
 * Table row. With onClick (it opens a drawer or page), the row also looks and
 * works like a control (M8, A5): hover state, a trailing chevron, focusable
 * with Tab, and Enter or Space opens it.
 */
export function TR({ className, onClick, onKeyDown, ...rest }: React.HTMLAttributes<HTMLTableRowElement>) {
  if (!onClick) return <tr className={cn("border-b border-line last:border-0 hover:bg-gray-50/60", className)} onKeyDown={onKeyDown} {...rest} />;
  return (
    <tr
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented || e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); }
      }}
      className={cn(
        "cursor-pointer border-b border-line last:border-0 hover:bg-gray-50 focus-visible:bg-primary-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400/60",
        "[&>td:last-child]:relative [&>td:last-child]:pr-8 [&>td:last-child]:after:pointer-events-none [&>td:last-child]:after:absolute [&>td:last-child]:after:right-3 [&>td:last-child]:after:top-1/2 [&>td:last-child]:after:-translate-y-1/2 [&>td:last-child]:after:text-base [&>td:last-child]:after:text-gray-300 [&>td:last-child]:after:content-['›']",
        className,
      )}
      {...rest}
    />
  );
}

export function TD({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  const roomy = useRoomy();
  return <td className={cn("px-3 py-2.5 align-middle text-gray-700", roomy && "px-4 py-3.5", className)} {...rest} />;
}
