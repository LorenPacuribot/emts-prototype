"use client";
/**
 * Product tour overlay: one short tour per new feature.
 *
 * Each tour opens with an overview card (what the feature solves, the flow
 * before it, and its Minimal and Complete versions, or "core module"), then
 * draws a spotlight around each step's `data-tour` anchor with a callout that
 * says how it was done before, what you do here and where the result shows.
 * The page stays fully clickable. The tour pauses while a dialog or drawer is
 * open, and offers a way back if the visitor navigates off the step's page.
 *
 * Mounted once in AppShell. The tours live in ./feature-tours.ts.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock, Compass, List, MapPin, MousePointerClick, ToggleRight, UserRound, X } from "lucide-react";
import type { Role } from "@/features/types";
import { useCurrentUser, useDb, useStore } from "@/features/lib/store";
import { useNav } from "@/features/lib/navigation";
import { ROLE_LABEL } from "@/features/lib/permissions";
import { useTour } from "@/features/lib/tour";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { FEATURES, featureDef, type FeatureDef, type FeatureKey } from "@/features/lib/feature-registry";
import { useVisibility } from "@/features/lib/feature-visibility";
import { Button } from "@/features/components/ui";
import { FEATURE_TOURS } from "./feature-tours";
import { STEP_KIND_LABEL, flatSteps, normalisePath, parseHref, type FlatStep, type StepKind } from "./tour-steps";

type Box = { top: number; left: number; width: number; height: number };

const CARD_WIDTH = 380;
const INTRO_WIDTH = 480;
const GAP = 12;
const PAD = 6;
const TOP_BAR = 60;

/** "F34" for a patent feature, "CRM" for a 30 Sep call feature. */
export const featureTag = (f: FeatureDef) => (f.number ? `F${f.number}` : f.prefix ?? "");

/** Start a feature's tour from its overview, or resume where it was left. */
export function useStartTour() {
  const nav = useNav();
  return (feature: FeatureKey, resume = false) => {
    const s = useTour.getState();
    const steps = flatSteps(FEATURE_TOURS[feature]);
    const step = resume && s.feature === feature ? Math.min(s.step, steps.length - 1) : 0;
    s.go(feature, step);
    nav.push(steps[step].href);
  };
}

export function ProductTour() {
  const active = useTour((s) => s.active && !!s.feature);
  return active ? <TourRunner /> : null;
}

const KIND_TONE: Record<StepKind, string> = {
  add: "bg-green-50 text-green-800 ring-green-200",
  update: "bg-blue-50 text-blue-800 ring-blue-200",
  delete: "bg-red-50 text-red-800 ring-red-200",
  approve: "bg-purple-50 text-purple-800 ring-purple-200",
  send: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  view: "bg-gray-100 text-gray-700 ring-gray-200",
};

function KindChip({ kind }: { kind: StepKind }) {
  return <span className={cn("inline-flex items-center rounded px-1.5 py-px text-xxs font-bold uppercase tracking-wider ring-1 ring-inset", KIND_TONE[kind])}>{STEP_KIND_LABEL[kind]}</span>;
}

function VersionChip({ version }: { version: "minimal" | "complete" }) {
  return <span className={cn("inline-flex items-center rounded px-1.5 py-px text-xxs font-black uppercase tracking-wider text-white", version === "complete" ? "bg-purple-700" : "bg-primary-700")}>{version === "complete" ? "Complete" : "Minimal"}</span>;
}

function TourRunner() {
  const { feature, step, restoreUserId, setRestore, go, complete, exit, finish } = useTour();
  const key = feature!;
  const def = featureDef(key);
  const tour = FEATURE_TOURS[key];
  const steps = flatSteps(tour);
  const nav = useNav();
  const search = useSearchParams();
  const user = useCurrentUser();
  const users = useDb((d) => d.users);
  const setUser = useStore((s) => s.setUser);
  const clockMode = useStore((s) => s.clockMode);
  const setClock = useStore((s) => s.setClock);
  const vis = useVisibility();
  const dialogOpen = useDialogOpen();
  const [showSteps, setShowSteps] = useState(false);

  const index = Math.min(step, steps.length - 1);
  const cur = steps[index];
  const here = normalisePath(nav.pathname) === "/" ? "/dashboard" : normalisePath(nav.pathname);
  const onRoute = (href: string) => {
    const t = parseHref(href);
    return t.path === here && [...t.query.entries()].every(([k, v]) => search.get(k) === v);
  };
  const onStep = onRoute(cur.href);
  const { rect, missing } = useTargetRect(cur.intro ? undefined : cur.target, `${key}.${index}`, onStep && !dialogOpen);

  const cardRef = useRef<HTMLDivElement>(null);
  const cardSize = useSize(cardRef);
  const viewport = useViewport();

  const goTo = (j: number) => {
    go(key, j);
    setShowSteps(false);
    if (!onRoute(steps[j].href)) nav.push(steps[j].href);
  };
  const toursOn = FEATURES.filter((f) => FEATURE_TOURS[f.key] && vis.showNew && vis.rows[f.key]?.minimal);
  const nextFeature = toursOn[toursOn.findIndex((f) => f.key === key) + 1];
  const done = () => {
    complete(key);
    finish();
    toast.success(`${def.name}: tour complete`, "Pick another feature from Feature tours on the dashboard.");
    nav.push("/dashboard#feature-tours");
  };
  const startNext = () => {
    if (!nextFeature) return done();
    complete(key);
    const first = flatSteps(FEATURE_TOURS[nextFeature.key])[0];
    go(nextFeature.key, 0);
    setShowSteps(false);
    nav.push(first.href);
  };
  const next = () => (index < steps.length - 1 ? goTo(index + 1) : done());
  const back = () => index > 0 && goTo(index - 1);

  // A step that asked for another role is over: switch back to whoever was viewing before.
  useEffect(() => {
    if (!restoreUserId || cur.role) return;
    const prev = users.find((u) => u.id === restoreUserId);
    setRestore(undefined);
    if (prev && prev.id !== user.id) {
      setUser(prev.id);
      toast.info(`Back to viewing as ${ROLE_LABEL[prev.role]}`, prev.name);
    }
    // Runs only when the step changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen || !onStep) return;
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
  const tag = featureTag(def);

  if (dialogOpen) {
    return (
      <div className={cn(cardBase, "left-1/2 top-[72px] flex -translate-x-1/2 items-center gap-2 px-3.5 py-2 text-xs text-gray-600")} role="status">
        <Compass className="h-3.5 w-3.5 text-brand" /> Tour paused while this window is open.
      </div>
    );
  }

  if (!onStep) {
    return (
      <div className={cn(cardBase, "bottom-4 right-4 w-[min(340px,calc(100vw-32px))] p-4")} role="complementary" aria-label="Feature tour">
        <div className="flex items-start gap-3">
          <Compass className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-ink">You&apos;ve left the tour&apos;s page</div>
            <p className="mt-0.5 text-xs text-gray-500">{def.number ? `${tag} ` : ""}{def.name}, step {index + 1} of {steps.length}: {cur.title}. Explore freely, then jump back when you&apos;re ready.</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="primary" onClick={() => nav.push(cur.href)}>Back to the tour</Button>
              <Button size="sm" variant="ghost" onClick={exit}>Exit tour</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const role: Role | undefined = cur.role;
  const roleUser = role && role !== user.role ? users.find((u) => u.role === role) : undefined;
  const target = rect ? spotlightBox(rect, viewport) : null;
  const width = cur.intro ? INTRO_WIDTH : CARD_WIDTH;
  const pos = placeCard(target, cardSize, viewport, width);
  const isLast = index === steps.length - 1;
  const featureOff = !(vis.showNew && vis.rows[key]?.minimal);
  const completeOff = cur.version === "complete" && !featureOff && !vis.rows[key]?.complete;

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
        className={cn(cardBase, "flex max-h-[calc(100vh-96px)] flex-col p-4 transition-[top,left] duration-200")}
        style={{ ...pos, width: `min(${width}px, calc(100vw - 24px))` }}
        role="complementary"
        aria-label="Feature tour"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-ink px-1.5 py-0.5 text-xs font-bold text-white">{tag}</span>
          <span className="min-w-0 flex-1 truncate text-xxs font-bold uppercase tracking-[0.14em] text-gray-500">
            {def.name} · Step {index + 1} of {steps.length}
          </span>
          <button onClick={() => setShowSteps(!showSteps)} className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-ink" aria-label="All steps" aria-expanded={showSteps}>
            <List className="h-3.5 w-3.5" />
          </button>
          <button onClick={exit} className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-ink" aria-label="Exit tour">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto px-1">
          {showSteps ? (
            <StepList steps={steps} index={index} onPick={goTo} />
          ) : cur.intro ? (
            <Overview def={def} steps={steps} />
          ) : (
            <>
              {(cur.kind || cur.version) && <div className="flex flex-wrap gap-1.5">{cur.kind && <KindChip kind={cur.kind} />}{cur.version && <VersionChip version={cur.version} />}</div>}
              <h2 className="mt-1.5 font-display text-base font-bold leading-snug text-ink">{cur.title}</h2>
              {cur.before && (
                <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-600">
                  <span className="font-semibold text-gray-500">Before: </span>{cur.before}
                </div>
              )}
              <p className="mt-2 text-xs leading-relaxed text-gray-700">{cur.body}</p>
              {cur.bullets && (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-gray-600">
                  {cur.bullets.map((b) => <li key={b}>{b}</li>)}
                </ul>
              )}
              {cur.shows && (
                <div className="mt-2 flex gap-2 rounded-lg bg-green-50/70 px-3 py-2 text-xs leading-relaxed text-green-900">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span><strong>Where it shows: </strong>{cur.shows}</span>
                </div>
              )}
              {cur.tryIt && (
                <div className="mt-2 flex gap-2 rounded-lg bg-brand-soft/60 px-3 py-2 text-xs text-blue-900">
                  <MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span><strong>Try it:</strong> {cur.tryIt}</span>
                </div>
              )}
            </>
          )}
          {!showSteps && (
            <>
              {featureOff && (
                <Notice icon={<ToggleRight className="h-3.5 w-3.5 shrink-0" />} action={<Button size="sm" onClick={() => { vis.setShowNew(true); vis.setMinimal(key, true); }}>Switch on</Button>}>
                  This feature is switched off in New Features, so its screens are hidden.
                </Notice>
              )}
              {completeOff && (
                <Notice icon={<ToggleRight className="h-3.5 w-3.5 shrink-0" />} action={<Button size="sm" onClick={() => vis.setComplete(key, true)}>Show Complete</Button>}>
                  This step is in the Complete version, which is switched off in New Features.
                </Notice>
              )}
              {roleUser && role && (
                <Notice icon={<UserRound className="h-3.5 w-3.5 shrink-0" />} action={
                  <Button size="sm" onClick={() => {
                    if (!restoreUserId) setRestore(user.id);
                    setUser(roleUser.id);
                    toast.info(`Viewing as ${ROLE_LABEL[role]}`, "The tour switches back after this step.");
                  }}>Switch</Button>
                }>
                  Best seen as {ROLE_LABEL[role]}.
                </Notice>
              )}
              {cur.action === "pin_clock" && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {clockMode === "business_hours" ? (
                    <span className="flex-1 font-semibold text-green-700">Clock pinned to 10:30 a.m. on a weekday.</span>
                  ) : (
                    <>
                      <span className="flex-1">This feature runs on business hours. The clock is on real time.</span>
                      <Button size="sm" onClick={() => setClock("business_hours")}>Pin to 10:30 a.m.</Button>
                    </>
                  )}
                </div>
              )}
              {missing && !completeOff && !featureOff && (
                <p className="mt-2 text-xs italic text-gray-500">{cur.absentNote ?? "The highlighted area isn't showing right now. It can depend on your role or on changes made to the demo data."}</p>
              )}
            </>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="flex flex-wrap gap-1" aria-label={`Step ${index + 1} of ${steps.length}`}>
            {steps.map((_, j) => (
              <button key={j} onClick={() => goTo(j)} className={cn("h-1.5 rounded-full transition-all", j === index ? "w-4 bg-brand" : "w-1.5 bg-gray-200 hover:bg-gray-300")} aria-label={`Step ${j + 1}`} />
            ))}
          </div>
          <div className="ml-auto flex shrink-0 gap-1.5">
            {index > 0 && (
              <Button size="sm" variant="ghost" onClick={back} aria-label="Back">
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
            )}
            {isLast && nextFeature && <Button size="sm" onClick={startNext}>Next: {featureTag(nextFeature)}</Button>}
            <Button size="sm" variant="primary" onClick={next}>
              {isLast ? "Finish" : cur.intro ? "Start" : "Next"} {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function Notice({ icon, action, children }: { icon: ReactNode; action: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
      {icon}
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="text-xxs font-bold uppercase tracking-[0.14em] text-gray-500">{label}</h3>
      <div className="mt-1 text-xs leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

/** The opening card: what it solves, the flow before, the versions, and the steps ahead. */
function Overview({ def, steps }: { def: FeatureDef; steps: FlatStep[] }) {
  const tour = FEATURE_TOURS[def.key];
  const core = def.group === "built";
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {core
          ? <span className="inline-flex items-center rounded bg-green-700 px-1.5 py-px text-xxs font-black uppercase tracking-wider text-white">Core module</span>
          : <><VersionChip version="minimal" /><VersionChip version="complete" /></>}
      </div>
      <h2 className="mt-1.5 font-display text-lg font-bold leading-snug text-ink">{def.name}</h2>
      <Section label="What it solves">
        <p>{tour.solves}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">{tour.benefits.map((b) => <li key={b}>{b}</li>)}</ul>
      </Section>
      <Section label="Before">
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-gray-600">{tour.before}</p>
      </Section>
      {core ? (
        <Section label="Core module">
          <p>This is a core module. It is delivered as one package, not split into Minimal and Complete versions. It includes:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{def.parts.minimal.map((p) => <li key={p}>{p}</li>)}</ul>
        </Section>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-2.5">
            <VersionChip version="minimal" />
            <p className="mt-1 text-xs text-gray-600">The smallest build that solves the problem.</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-gray-700">{def.parts.minimal.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
          <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-2.5">
            <VersionChip version="complete" />
            <p className="mt-1 text-xs text-gray-600">Everything in Minimal, plus:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-gray-700">{def.parts.complete.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        </div>
      )}
      <Section label="How to use it">
        <ol className="space-y-1">
          {steps.slice(1).map((s, i) => (
            <li key={i} className="flex flex-wrap items-center gap-1.5">
              <span className="w-4 shrink-0 text-right text-gray-400">{i + 1}.</span>
              {s.kind && <KindChip kind={s.kind} />}
              <span>{s.title}</span>
              {s.version === "complete" && <VersionChip version="complete" />}
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}

function StepList({ steps, index, onPick }: { steps: FlatStep[]; index: number; onPick: (j: number) => void }) {
  return (
    <ol className="space-y-0.5">
      {steps.map((s, j) => (
        <li key={j}>
          <button onClick={() => onPick(j)} className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-gray-50", j === index && "bg-brand-soft font-semibold text-brand")}>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">{j + 1}</span>
            <span className="flex-1">{s.title}</span>
            {s.kind && <KindChip kind={s.kind} />}
          </button>
        </li>
      ))}
    </ol>
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
          scrollIntoFrame(el!, r);
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

function scrollIntoFrame(el: HTMLElement, r: DOMRect) {
  const vh = window.innerHeight;
  if (r.top >= TOP_BAR + GAP && r.bottom <= vh - GAP) return;
  const tall = r.height > vh - 220;
  // Pages scroll inside the app shell's content panel, not the window, so let the
  // browser scroll whichever ancestors hold the target.
  el.scrollIntoView({ behavior: "smooth", block: tall ? "start" : "center" });
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
function placeCard(t: Box | null, card: { w: number; h: number }, vp: { w: number; h: number }, width = CARD_WIDTH): CSSProperties {
  const w = Math.min(width, vp.w - 24);
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
