"use client";
/**
 * Demo bar: prototype-only controls, pinned bottom-left.
 * - Switch role, to demo the access rules.
 * - Pin the clock to business hours (contact window, supplier clock).
 * - Reset all data back to the demo seed.
 */
import { useState } from "react";
import { Compass, FlaskConical, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";
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
    <div className="no-print fixed bottom-3 left-3 z-[65] sm:bottom-4 sm:left-4 lg:left-[120px]" data-tour="demo-bar">
      <div className={cn("rounded-2xl border border-slate-700 bg-ink text-white shadow-2xl", open ? "w-[min(280px,calc(100vw-1.5rem))]" : "w-auto")}>
        <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left sm:px-3.5" aria-expanded={open} aria-label="Prototype controls">
          <FlaskConical className="h-4 w-4 text-emerald-400" />
          {/* Phones: a compact pill so it covers less of the page. */}
          <span className={cn("text-[12px] font-bold", !open && "hidden sm:inline")}>Prototype</span>
          <span className={cn("truncate text-[11px] text-slate-400", !open && "hidden sm:inline")}>· {user ? ROLE_LABEL[user.role] : ""}</span>
          {open ? <ChevronDown className="ml-auto h-4 w-4 text-slate-400" /> : <ChevronUp className="ml-auto hidden h-4 w-4 text-slate-400 sm:block" />}
        </button>
        {open && (
          <div className="space-y-3 border-t border-slate-700 px-3.5 pb-3.5 pt-3">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Viewing as</span>
              <Select value={currentUserId} onChange={(e) => setUser(e.target.value)} className="mt-1 h-9 border-slate-600 bg-slate-800 text-white">
                {db.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {ROLE_LABEL[u.role]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Clock</span>
              <Select value={clockMode} onChange={(e) => setClock(e.target.value as "real" | "business_hours")} className="mt-1 h-9 border-slate-600 bg-slate-800 text-white">
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
            <p className="text-[10.5px] leading-snug text-slate-400">Changes are saved in this browser only. Reset restores the clean demo story.</p>
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
