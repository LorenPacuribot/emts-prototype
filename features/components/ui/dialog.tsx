"use client";
/**
 * Modal, side drawer and confirm dialog, built on Radix Dialog / AlertDialog.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as AlertPrimitive from "@radix-ui/react-alert-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/features/lib/cn";
import { Button } from "./button";

export function Modal({ open, onOpenChange, title, description, children, footer, size = "md" }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] data-[state=open]:animate-in-fade" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-2xl data-[state=open]:animate-in-pop",
            width,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <DialogPrimitive.Title className="font-display text-[17px] font-bold text-ink">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-[12.5px] text-slate-500">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-slate-50/60 px-6 py-3 rounded-b-2xl">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Right-side drawer used for record details (order detail, alert detail). */
export function Drawer({ open, onOpenChange, title, subtitle, children, footer, width = "max-w-2xl" }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/30 data-[state=open]:animate-in-fade" />
        <DialogPrimitive.Content className={cn("fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-white shadow-2xl data-[state=open]:animate-in-slide", width)}>
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-display text-[17px] font-bold text-ink">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description asChild>
                <div className="mt-1 text-[12.5px] text-slate-500">{subtitle}</div>
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-slate-50/60 px-6 py-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Confirmation for destructive or irreversible actions. */
export function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel = "Confirm", tone = "danger", onConfirm }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
}) {
  return (
    <AlertPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className="fixed inset-0 z-[60] bg-slate-900/40" />
        <AlertPrimitive.Content className="fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl data-[state=open]:animate-in-pop">
          <AlertPrimitive.Title className="font-display text-[17px] font-bold text-ink">{title}</AlertPrimitive.Title>
          <AlertPrimitive.Description asChild>
            <div className="mt-2 text-[13px] leading-relaxed text-slate-600">{body}</div>
          </AlertPrimitive.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertPrimitive.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertPrimitive.Cancel>
            <AlertPrimitive.Action asChild>
              <Button variant={tone === "danger" ? "dark" : "primary"} className={tone === "danger" ? "bg-red-600 hover:bg-red-700" : ""} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertPrimitive.Action>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
