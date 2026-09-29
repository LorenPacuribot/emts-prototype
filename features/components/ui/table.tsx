import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/features/lib/cn";

/** Table styled like the Pending Sales widget: grey header band, uppercase micro labels. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-line", className)}>
      <table className="w-full min-w-max border-collapse text-left text-xs">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-gray-50/80">{children}</thead>;
}

export function TH({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("border-b border-line px-3 py-2.5 text-xxs font-bold uppercase tracking-[0.12em] text-gray-400", className)} {...rest} />;
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
  return <td className={cn("px-3 py-2.5 align-middle text-gray-700", className)} {...rest} />;
}
