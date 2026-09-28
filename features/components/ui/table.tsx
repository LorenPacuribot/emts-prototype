import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/features/lib/cn";

/** Table styled like the Pending Sales widget: grey header band, uppercase micro labels. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-line", className)}>
      <table className="w-full min-w-max border-collapse text-left text-[12.5px]">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-slate-50/80">{children}</thead>;
}

export function TH({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("border-b border-line px-3 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-400", className)} {...rest} />;
}

export function TR({ className, ...rest }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-line last:border-0 hover:bg-slate-50/60", className)} {...rest} />;
}

export function TD({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2.5 align-middle text-slate-700", className)} {...rest} />;
}
