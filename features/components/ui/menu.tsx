"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { MoreVertical } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/features/lib/cn";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Shown under the label when disabled, to explain why. */
  reason?: string;
}

/** Row actions menu (the "⋮" button). */
export function RowMenu({ items, label = "Actions" }: { items: MenuItem[]; label?: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={label}>
        <MoreVertical className="h-4 w-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-52 rounded-xl border border-line bg-white p-1 shadow-xl">
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-slate-100",
                item.danger ? "text-red-600" : "text-slate-700",
                item.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <span className="mt-0.5 [&>svg]:h-3.5 [&>svg]:w-3.5">{item.icon}</span>
              <span>
                {item.label}
                {item.disabled && item.reason && <span className="block text-[11px] text-slate-400">{item.reason}</span>}
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <TooltipPrimitive.Root delayDuration={150}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-[70] max-w-xs rounded-md bg-ink px-2 py-1 text-[11.5px] font-medium text-white shadow-lg">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;
