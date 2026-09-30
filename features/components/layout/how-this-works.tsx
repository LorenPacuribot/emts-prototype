"use client";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/features/lib/cn";

/**
 * "How this works": the rules and detail that used to make page subtitles
 * run long (L4). A small button beside the page title opens them in a panel
 * under the subtitle. Works with a tap, a click or the keyboard, unlike a
 * hover-only tooltip. Returns the button and the panel, wired to one state;
 * both are null when there are no details.
 */
export function useHowThisWorks(details: ReactNode | undefined) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!details) return { button: null, panel: null };
  const button = (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={id}
      onClick={() => setOpen((v) => !v)}
      className="no-print inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 align-middle text-[13px] font-semibold text-gray-600 transition-colors hover:border-primary-300 hover:text-primary-700"
    >
      <Info className="h-3.5 w-3.5" aria-hidden /> How this works
      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
    </button>
  );
  const panel = (
    <div id={id} hidden={!open} className="mt-3 max-w-[65ch] rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-gray-700">
      {details}
    </div>
  );
  return { button, panel };
}
