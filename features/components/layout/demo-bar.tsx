"use client";
/**
 * Demo bar: prototype-only controls, docked in the sidebar footer on desktop.
 * - Switch role, to demo the access rules.
 * - Pin the clock to business hours (contact window, supplier clock).
 * - Reset all data back to the demo seed.
 */
import { useState } from "react";
import { Compass, FlaskConical, RotateCcw, ChevronDown } from "lucide-react";
import { useStore } from "@/features/lib/store";
import { useDataActions } from "@/lib/store";
import { canResume, useTour } from "@/features/lib/tour";
import { useStartTour } from "@/features/components/tour/product-tour";
import { ROLE_LABEL } from "@/features/lib/permissions";
import { Button, ConfirmDialog, Select } from "@/features/components/ui";
import { cn } from "@/features/lib/cn";

export function DemoBar() {
  const { db, currentUserId, setUser, clockMode, setClock } = useStore();
  // Resets the replica store and the feature store together (lib/store.tsx).
  const { reset } = useDataActions();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const user = db.users.find((u) => u.id === currentUserId);
  const startTour = useStartTour();
  const tourStop = useTour((s) => s.stop);
  const resumable = useTour((s) => !s.active && canResume(s));

  return (
    // Desktop (lg): docked in the main sidebar's footer, below Logout, in the
    // slot the sidebar reserves for it (components/Sidebar.tsx), so it never
    // covers a nav item or page content. Phones and tablets: a 44px round
    // button raised clear of sticky bottom action bars.
    <div className="no-print fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-3 z-[65] lg:bottom-4 lg:left-4" data-tour="demo-bar">
      <div className={cn("rounded-2xl border border-gray-700 bg-ink text-white shadow-2xl", open ? "w-[min(280px,calc(100vw-1.5rem))]" : "w-auto lg:w-[72px]")}>
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            "flex w-full items-center text-left",
            open ? "gap-2 px-3.5 py-2.5" : "h-11 w-11 justify-center lg:h-auto lg:w-full lg:flex-col lg:gap-0.5 lg:px-1 lg:py-2",
          )}
          aria-expanded={open}
          aria-label="Prototype controls"
          title={open ? undefined : `Prototype controls · viewing as ${user ? ROLE_LABEL[user.role] : ""}`}
        >
          <FlaskConical className="h-4 w-4 shrink-0 text-green-400" />
          <span className={cn(open ? "text-xs font-bold" : "hidden text-xxs font-bold uppercase tracking-wide lg:block")}>Prototype</span>
          {open && <span className="truncate text-xs text-gray-400">· {user ? ROLE_LABEL[user.role] : ""}</span>}
          {open && <ChevronDown className="ml-auto h-4 w-4 text-gray-400" />}
        </button>
        {open && (
          <div className="space-y-3 border-t border-gray-700 px-3.5 pb-3.5 pt-3">
            <label className="block">
              <span className="text-xxs font-bold uppercase tracking-[0.14em] text-gray-400">Viewing as</span>
              <Select value={currentUserId} onChange={(e) => setUser(e.target.value)} className="mt-1 h-9 border-gray-600 bg-gray-800 text-white">
                {db.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {ROLE_LABEL[u.role]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="text-xxs font-bold uppercase tracking-[0.14em] text-gray-400">Clock</span>
              <Select value={clockMode} onChange={(e) => setClock(e.target.value as "real" | "business_hours")} className="mt-1 h-9 border-gray-600 bg-gray-800 text-white">
                <option value="real">Real time</option>
                <option value="business_hours">Pinned to 10:30 a.m. weekday</option>
              </Select>
            </label>
            <Button size="sm" variant="primary" className="w-full justify-center" onClick={() => { setOpen(false); startTour(resumable); }}>
              <Compass className="h-3.5 w-3.5" /> {resumable ? `Resume product tour (stop ${tourStop + 1})` : "Start product tour"}
            </Button>
            <Button size="sm" variant="secondary" className="w-full justify-center" onClick={() => setConfirm(true)}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset demo data
            </Button>
            <p className="text-xs leading-snug text-gray-400">Changes are saved in this browser only. Reset restores the clean demo story.</p>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Reset demo data?"
        body="Every change made in this browser is removed and the clean demo records come back. This cannot be undone."
        confirmLabel="Reset data"
        onConfirm={reset}
      />
    </div>
  );
}
