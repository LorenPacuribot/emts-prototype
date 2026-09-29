"use client";
/**
 * Product tour overlay.
 *
 * Draws a spotlight around the current step's `data-tour` anchor and a
 * callout next to it. The page stays fully clickable, so visitors can try
 * each rule between steps. The tour pauses while a dialog or drawer is open,
 * and offers a way back if the visitor navigates off the tour's route.
 *
 * Mounted once in AppShell. The script lives in ./tour-steps.ts.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Check, Clock, Compass, List, MousePointerClick, UserRound, X } from "lucide-react";
import type { Role } from "@/features/types";
import { useCurrentUser, useDb, useStore } from "@/features/lib/store";
import { useNav, useParam } from "@/features/lib/navigation";
import { ROLE_LABEL } from "@/features/lib/permissions";
import { useTour } from "@/features/lib/tour";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { Button } from "@/features/components/ui";
import { TOUR, normalisePath, parseHref } from "./tour-steps";

type Box = { top: number; left: number; width: number; height: number };

const CARD_WIDTH = 360;
const GAP = 12;
const PAD = 6;
const TOP_BAR = 60;

/** Start the tour from the first stop, or resume where it was left. */
export function useStartTour() {
  const nav = useNav();
  return (resume = false) => {
    const s = useTour.getState();
    const stop = resume ? s.stop : 0;
    const step = resume ? s.step : 0;
    s.go(stop, step);
    nav.push(TOUR[stop].href);
  };
}

export function ProductTour() {
  const active = useTour((s) => s.active);
  return active ? <TourRunner /> : null;
}

function TourRunner() {
  const { stop, step, completed, restoreUserId, setRestore, go, complete, exit, finish } = useTour();
  const nav = useNav();
  const id = useParam("id");
  const rep = useParam("rep");
  const user = useCurrentUser();
  const users = useDb((d) => d.users);
  const setUser = useStore((s) => s.setUser);
  const clockMode = useStore((s) => s.clockMode);
  const setClock = useStore((s) => s.setClock);
  const dialogOpen = useDialogOpen();
  const [showStops, setShowStops] = useState(false);

  const stopDef = TOUR[Math.min(stop, TOUR.length - 1)];
  const stepDef = stopDef.steps[Math.min(step, stopDef.steps.length - 1)];
  const here = { path: normalisePath(nav.pathname) === "/" ? "/dashboard" : normalisePath(nav.pathname), id, rep };
  const onRoute = (i: number) => {
    const t = parseHref(TOUR[i].href);
    return t.path === here.path && t.id === here.id && t.rep === here.rep;
  };
  const onStop = onRoute(stop);
  const { rect, missing } = useTargetRect(stepDef.target, `${stop}.${step}`, onStop && !dialogOpen);

  const cardRef = useRef<HTMLDivElement>(null);
  const cardSize = useSize(cardRef);
  const viewport = useViewport();

  const goTo = (i: number, j: number) => {
    go(i, j);
    setShowStops(false);
    if (!onRoute(i)) nav.push(TOUR[i].href);
  };
  const next = () => {
    if (step < stopDef.steps.length - 1) return go(stop, step + 1);
    complete(stopDef.id);
    if (stop < TOUR.length - 1) return goTo(stop + 1, 0);
    finish();
    toast.success("Tour complete", "Restart it any time from the dashboard or the Prototype bar.");
  };
  const back = () => {
    if (step > 0) return go(stop, step - 1);
    if (stop > 0) goTo(stop - 1, TOUR[stop - 1].steps.length - 1);
  };

  // A step that asked for another role is over: switch back to whoever was viewing before.
  useEffect(() => {
    if (!restoreUserId || stepDef.role) return;
    const back = users.find((u) => u.id === restoreUserId);
    setRestore(undefined);
    if (back && back.id !== user.id) {
      setUser(back.id);
      toast.info(`Back to viewing as ${ROLE_LABEL[back.role]}`, back.name);
    }
    // Runs only when the step changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen || !onStop) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      // No Escape shortcut: Escape already closes drawers and menus, and would end the tour with them.
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const cardBase = "no-print fixed z-[75] rounded-2xl border border-gray-200 bg-white shadow-2xl";

  // A dialog or drawer is open: step out of its way.
  if (dialogOpen) {
    return (
      <div className={cn(cardBase, "left-1/2 top-[72px] flex -translate-x-1/2 items-center gap-2 px-3.5 py-2 text-xs text-gray-600")} role="status">
        <Compass className="h-3.5 w-3.5 text-brand" /> Tour paused while this window is open.
      </div>
    );
  }

  // Visitor navigated away from the stop's screen.
  if (!onStop) {
    return (
      <div className={cn(cardBase, "bottom-4 right-4 w-[min(340px,calc(100vw-32px))] p-4")} role="complementary" aria-label="Product tour">
        <div className="flex items-start gap-3">
          <Compass className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-ink">You&apos;ve left the tour route</div>
            <p className="mt-0.5 text-xs text-gray-500">
              Stop {stop + 1} of {TOUR.length}: {stopDef.title}. Explore freely, then jump back when you&apos;re ready.
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="primary" onClick={() => nav.push(stopDef.href)}>Back to the tour</Button>
              <Button size="sm" variant="ghost" onClick={exit}>Exit tour</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const role: Role | undefined = stepDef.role ?? stopDef.role;
  const roleUser = role && role !== user.role ? users.find((u) => u.role === role) : undefined;
  const target = rect ? spotlightBox(rect, viewport) : null;
  const pos = placeCard(target, cardSize, viewport);
  const isLast = stop === TOUR.length - 1 && step === stopDef.steps.length - 1;
  const nextStop = step === stopDef.steps.length - 1 && !isLast ? TOUR[stop + 1] : undefined;

  return (
    <>
      {target && (
        <div
          aria-hidden
          className="no-print pointer-events-none fixed z-[74] rounded-xl ring-2 ring-brand transition-all duration-200"
          style={{ top: target.top, left: target.left, width: target.width, height: target.height, boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.45)" }}
        />
      )}
      <div
        ref={cardRef}
        className={cn(cardBase, "p-4 transition-[top,left] duration-200")}
        style={{ ...pos, width: `min(${CARD_WIDTH}px, calc(100vw - 24px))` }}
        role="complementary"
        aria-label="Product tour"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          {stopDef.feature && <span className="rounded-md bg-ink px-1.5 py-0.5 text-xs font-bold text-white">F{stopDef.feature}</span>}
          <span className="text-xxs font-bold uppercase tracking-[0.14em] text-gray-400">
            Stop {stop + 1} of {TOUR.length} · {stopDef.title}
          </span>
          <button onClick={() => setShowStops(!showStops)} className="ml-auto rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-ink" aria-label="All stops" aria-expanded={showStops}>
            <List className="h-3.5 w-3.5" />
          </button>
          <button onClick={exit} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-ink" aria-label="Exit tour">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {showStops ? (
          <ol className="mt-3 max-h-[50vh] space-y-0.5 overflow-y-auto">
            {TOUR.map((s, i) => (
              <li key={s.id}>
                <button
                  onClick={() => goTo(i, 0)}
                  className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-gray-50", i === stop && "bg-brand-soft font-semibold text-brand")}
                >
                  <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold", completed.includes(s.id) ? "bg-green-500 text-white" : "bg-gray-100 text-gray-500")}>
                    {completed.includes(s.id) ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className="flex-1">{s.title}</span>
                  {s.feature && <span className="text-xs text-gray-400">F{s.feature}</span>}
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <>
            <h2 className="mt-2 font-display text-base font-bold leading-snug text-ink">{stepDef.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-600">{stepDef.body}</p>
            {stepDef.bullets && (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-gray-600">
                {stepDef.bullets.map((b) => <li key={b}>{b}</li>)}
              </ul>
            )}
            {stepDef.tryIt && (
              <div className="mt-3 flex gap-2 rounded-lg bg-brand-soft/60 px-3 py-2 text-xs text-blue-900">
                <MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span><strong>Try it:</strong> {stepDef.tryIt}</span>
              </div>
            )}
            {roleUser && role && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <UserRound className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">Best seen as {ROLE_LABEL[role]}.</span>
                <Button
                  size="sm"
                  onClick={() => {
                    if (stepDef.role && !restoreUserId) setRestore(user.id);
                    setUser(roleUser.id);
                    toast.info(`Viewing as ${ROLE_LABEL[role]}`, stepDef.role ? "The tour switches back after this step." : roleUser.name);
                  }}
                >
                  Switch
                </Button>
              </div>
            )}
            {stepDef.action === "pin_clock" && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {clockMode === "business_hours" ? (
                  <span className="flex-1 font-semibold text-green-700">Clock pinned to 10:30 a.m. on a weekday.</span>
                ) : (
                  <>
                    <span className="flex-1">Clock is on real time.</span>
                    <Button size="sm" onClick={() => setClock("business_hours")}>Pin to 10:30 a.m.</Button>
                  </>
                )}
              </div>
            )}
            {missing && (
              <p className="mt-3 text-xs italic text-gray-400">
                The highlighted area isn&apos;t showing right now. It can depend on your role or on changes made to the demo data.
              </p>
            )}
          </>
        )}

        <div className="mt-4 flex items-center gap-2">
          <div className="flex gap-1" aria-label={`Step ${step + 1} of ${stopDef.steps.length}`}>
            {stopDef.steps.map((_, j) => (
              <button key={j} onClick={() => go(stop, j)} className={cn("h-1.5 rounded-full transition-all", j === step ? "w-4 bg-brand" : "w-1.5 bg-gray-200 hover:bg-gray-300")} aria-label={`Step ${j + 1}`} />
            ))}
          </div>
          <div className="ml-auto flex gap-1.5">
            {(stop > 0 || step > 0) && (
              <Button size="sm" variant="ghost" onClick={back} aria-label="Back">
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={next}>
              {isLast ? "Finish" : nextStop ? <>Next: {nextStop.title}</> : "Next"} {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Tracks the on-screen box of `[data-tour=name]` every frame, so the
 * spotlight follows scrolling, expanding panels and layout shifts.
 * Scrolls the anchor into view once per step.
 */
function useTargetRect(name: string | undefined, key: string, enabled: boolean) {
  const [rect, setRect] = useState<Box | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setRect(null);
    setMissing(false);
    if (!enabled || !name) return;
    let raf = 0;
    let last = "";
    let scrolled = false;
    let flaggedMissing = false;
    const started = performance.now();
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
      const r = el?.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) {
        if (!scrolled) {
          scrolled = true;
          scrollIntoFrame(r);
        }
        const k = `${Math.round(r.top)}|${Math.round(r.left)}|${Math.round(r.width)}|${Math.round(r.height)}`;
        if (k !== last) {
          last = k;
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          if (flaggedMissing) {
            flaggedMissing = false;
            setMissing(false);
          }
        }
      } else {
        if (last) {
          last = "";
          setRect(null);
        }
        if (!flaggedMissing && performance.now() - started > 1500) {
          flaggedMissing = true;
          setMissing(true);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [name, key, enabled]);

  return { rect, missing: enabled && !!name && missing };
}

function scrollIntoFrame(r: DOMRect) {
  const vh = window.innerHeight;
  if (r.top >= TOP_BAR + GAP && r.bottom <= vh - GAP) return;
  const tall = r.height > vh - 220;
  const delta = tall ? r.top - (TOP_BAR + 24) : r.top + r.height / 2 - vh / 2 - 60;
  window.scrollBy({ top: delta, behavior: "smooth" });
}

/** Padded spotlight box, clipped to the visible viewport. */
function spotlightBox(r: Box, vp: { w: number; h: number }): Box | null {
  const top = Math.max(r.top - PAD, 0);
  const left = Math.max(r.left - PAD, 0);
  const bottom = Math.min(r.top + r.height + PAD, vp.h);
  const right = Math.min(r.left + r.width + PAD, vp.w);
  if (bottom <= top || right <= left) return null;
  return { top, left, width: right - left, height: bottom - top };
}

/** Below the target, else above, else beside it, else pinned bottom-right. Centred when there's no target. */
function placeCard(t: Box | null, card: { w: number; h: number }, vp: { w: number; h: number }): CSSProperties {
  const w = Math.min(CARD_WIDTH, vp.w - 24);
  const h = card.h || 240;
  const clampX = (x: number) => Math.min(Math.max(x, 12), vp.w - w - 12);
  const clampY = (y: number) => Math.min(Math.max(y, TOP_BAR + GAP), vp.h - h - 12);
  if (!t) return { top: Math.max(TOP_BAR + 24, (vp.h - h) / 2), left: (vp.w - w) / 2 };
  const bottom = t.top + t.height;
  const right = t.left + t.width;
  if (vp.h - bottom - GAP >= h + 12) return { top: bottom + GAP, left: clampX(t.left) };
  if (t.top - GAP - TOP_BAR >= h) return { top: t.top - GAP - h, left: clampX(t.left) };
  if (vp.w - right - GAP >= w + 12) return { top: clampY(t.top), left: right + GAP };
  if (t.left - GAP >= w + 12) return { top: clampY(t.top), left: t.left - GAP - w };
  return { top: vp.h - h - 16, left: vp.w - w - 16 };
}

function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
  return size;
}

function useViewport() {
  const [vp, setVp] = useState({ w: typeof window === "undefined" ? 1280 : window.innerWidth, h: typeof window === "undefined" ? 800 : window.innerHeight });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}

/** True while any Radix dialog, drawer or confirm dialog is open. */
function useDialogOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => setOpen(!!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] });
    return () => mo.disconnect();
  }, []);
  return open;
}
