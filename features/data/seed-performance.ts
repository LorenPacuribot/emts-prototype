/**
 * Features 21 and 30 seed: completed jobs from before the live jobs.
 *
 * Generated deterministically (fixed pseudo-random seed), so every reset is
 * identical relative to "now".
 *
 * Feature 30 evidence (one surface and product combination per job):
 * - A  Interior walls, standard, roll — 11 eligible, crews faster than the
 *      current rate (about +20%, shown prominently). Plus the ineligible cases: 399 sq ft,
 *      19 months old, a mixed job, an unverified job, zero hours, and one the
 *      estimating manager excluded (rework-heavy).
 * - B  Exterior siding, premium, spray — 9 eligible. Coverage 330 against 350
 *      (the 30.A16 worked example is one of them).
 * - C  Interior trim, premium, brush — 7 eligible: Insufficient evidence.
 * - D  Ceilings, standard, roll — rejected 45 days ago; 2 new jobs since.
 * - E  Interior walls, premium, roll — rate approved 95 days ago; day-90 review due.
 * - F  Exterior siding, standard, roll, rough — approved 125 days ago; review overdue (escalated).
 *
 * Feature 21 examples, all completed this month (and ineligible for 30, so
 * they don't move any rate): 40 → 50 hours, exactly +10% ($400), +10.1%,
 * $600 under, a zero estimate, a missing actual, two change orders, an
 * out-of-scope line and pending hours.
 */
import type { CompletedJobRecord, EvidenceCombo } from "@/features/types";
import { addDays } from "@/features/lib/rules/dates";

export interface ComboDef {
  key: string;
  label: string;
  base: Omit<EvidenceCombo, "measuredSqft" | "applicationHours" | "prepHours" | "travelHours" | "setupHours" | "reworkHours" | "consumedGal" | "spillsGal">;
  /** Rate the estimate was built with (sq ft per hour) and the crews' real rate. */
  estProd: number;
  realProd: number;
  estCov: number;
  realCov: number;
}

export const COMBOS: ComboDef[] = [
  { key: "A", label: "Walls · Interior · Standard · Roll · Sound", base: { surfaceType: "walls", exterior: false, tier: "standard", method: "roll", condition: "sound", product: "Cashmere Interior Acrylic Latex", coats: 2, wasteAllowance: 0.05 }, estProd: 120, realProd: 142, estCov: 400, realCov: 386 },
  { key: "B", label: "Siding · Exterior · Premium · Spray · Sound", base: { surfaceType: "siding", exterior: true, tier: "premium", method: "spray", condition: "sound", product: "Duration Exterior Acrylic Latex", coats: 2, wasteAllowance: 0.1 }, estProd: 260, realProd: 255, estCov: 350, realCov: 330 },
  { key: "C", label: "Trim · Interior · Premium · Brush · Sound", base: { surfaceType: "trim", exterior: false, tier: "premium", method: "brush", condition: "sound", product: "Emerald Urethane Trim Enamel", coats: 2, wasteAllowance: 0.05 }, estProd: 45, realProd: 38, estCov: 400, realCov: 380 },
  { key: "D", label: "Ceiling · Interior · Standard · Roll · Sound", base: { surfaceType: "ceiling", exterior: false, tier: "standard", method: "roll", condition: "sound", product: "ProMar 200 Interior", coats: 1, wasteAllowance: 0.05 }, estProd: 110, realProd: 134, estCov: 400, realCov: 395 },
  { key: "E", label: "Walls · Interior · Premium · Roll · Sound", base: { surfaceType: "walls", exterior: false, tier: "premium", method: "roll", condition: "sound", product: "Emerald Interior Acrylic Latex", coats: 2, wasteAllowance: 0.05 }, estProd: 100, realProd: 116, estCov: 400, realCov: 392 },
  { key: "F", label: "Siding · Exterior · Standard · Roll · Rough", base: { surfaceType: "siding", exterior: true, tier: "standard", method: "roll", condition: "rough", product: "SuperPaint Exterior", coats: 2, wasteAllowance: 0.15 }, estProd: 130, realProd: 148, estCov: 250, realCov: 246 },
];

export function comboKeyOf(c: Pick<EvidenceCombo, "surfaceType" | "exterior" | "tier" | "method" | "condition">): string {
  return `${c.surfaceType}|${c.exterior ? "exterior" : "interior"}|${c.tier}|${c.method}|${c.condition}`;
}

/** Tiny deterministic generator (mulberry32). */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ADDRESSES = [
  "14 Wren Hollow, Plano", "882 Kessler Pkwy, Dallas", "3 Birchwood Ct, Allen", "5510 Mockingbird Ln, Dallas", "27 Hillcrest Dr, Richardson", "901 Ridgeview Ave, Frisco",
  "46 Lake Forest Dr, Garland", "1207 Elm Grove, McKinney", "318 Prairie Wind, Wylie", "72 Cottonwood Cir, Carrollton", "2250 Commerce St, Dallas", "65 Timberline Rd, Mesquite",
];

const RATE_PER_HOUR = 37;
const MATERIAL_PER_GAL = 58;

export function performanceSeed(nowIso: string): CompletedJobRecord[] {
  const r = rng(20260923);
  const vary = (x: number, spread: number) => x * (1 + (r() * 2 - 1) * spread);
  const d = (days: number) => addDays(nowIso, days);
  const records: CompletedJobRecord[] = [];
  const counters: Record<number, number> = {};
  const idFor = (completedAt: string) => {
    const y = new Date(completedAt).getFullYear();
    counters[y] = (counters[y] ?? 60) + 1;
    return `JOB-${y}-${counters[y]}`;
  };

  function job(def: ComboDef, opts: { daysAgo: number; sqft?: number; verified?: boolean; zeroHours?: boolean; extra?: EvidenceCombo; name?: string }) {
    const sqft = Math.round(opts.sqft ?? vary(1300, 0.45));
    const prod = vary(def.realProd, 0.07);
    const app = opts.zeroHours ? 0 : Math.round((sqft / prod) * 10) / 10;
    const coatSqft = sqft * def.base.coats;
    const cov = vary(def.realCov, 0.025);
    const gal = Math.round(((coatSqft * (1 + def.base.wasteAllowance)) / cov) * 100) / 100;
    const spills = Math.round(r() * 30) / 100;
    const combo: EvidenceCombo = {
      ...def.base, measuredSqft: sqft, applicationHours: app, prepHours: Math.round(app * 0.28 * 10) / 10, travelHours: Math.round(vary(1.5, 0.4) * 10) / 10,
      setupHours: Math.round(vary(0.8, 0.4) * 10) / 10, reworkHours: Math.round(r() * 12) / 10, consumedGal: gal, spillsGal: spills, wasteAllowance: def.base.wasteAllowance,
    };
    const combos = opts.extra ? [combo, opts.extra] : [combo];
    const estHours = combos.reduce((a, c) => a + (c.measuredSqft / (c === combo ? def.estProd : 45)) * 1.28, 0) + 2.3;
    const estGal = combos.reduce((a, c) => a + (c.measuredSqft * c.coats * (1 + c.wasteAllowance)) / (c === combo ? def.estCov : 400), 0);
    const actHours = combos.reduce((a, c) => a + c.applicationHours + c.prepHours + c.travelHours + c.setupHours + c.reworkHours, 0);
    const actGal = combos.reduce((a, c) => a + c.consumedGal, 0);
    const completedAt = d(-opts.daysAgo);
    const start = addDays(completedAt, -Math.max(2, Math.round(actHours / 16)));
    records.push({
      id: idFor(completedAt), name: opts.name ?? `${def.base.exterior ? "Exterior" : "Interior"} repaint — ${def.base.surfaceType}`, propertyLabel: ADDRESSES[records.length % ADDRESSES.length],
      startedAt: start, completedAt, kind: def.base.exterior ? "exterior" : "interior", estimatorId: records.length % 3 === 0 ? "U-SENIOR" : "U-EST", crewLeadId: "U-CREW",
      verified: opts.verified ?? true, combinations: combos,
      estimate: { labourHours: Math.round(estHours * 10) / 10, labourCost: Math.round(estHours * RATE_PER_HOUR), material: Math.round(estGal * MATERIAL_PER_GAL), subcontractor: 0 },
      changes: { labourHours: 0, labourCost: 0, material: 0, subcontractor: 0 },
      actual: { labourHours: Math.round(actHours * 10) / 10, labourCost: Math.round(actHours * RATE_PER_HOUR), material: Math.round(actGal * MATERIAL_PER_GAL), subcontractor: 0 },
    });
  }

  const [A, B, C, D, E, F] = COMBOS;
  // A — 11 eligible, spread over the last 17 months.
  [25, 48, 70, 96, 130, 170, 205, 250, 300, 360, 420].forEach((days) => job(A, { daysAgo: days }));
  // A — ineligible cases, each listed with the check it fails.
  job(A, { daysAgo: 60, sqft: 399, name: "Interior repaint — small bedroom (399 sq ft)" });
  job(A, { daysAgo: 578, name: "Interior repaint — walls (19 months ago)" });
  job(A, { daysAgo: 90, extra: { ...C.base, measuredSqft: 180, applicationHours: 4.8, prepHours: 1.2, travelHours: 0, setupHours: 0, reworkHours: 0, consumedGal: 1.1, spillsGal: 0 }, name: "Interior repaint — walls and trim (mixed)" });
  job(A, { daysAgo: 110, verified: false, name: "Interior repaint — walls (actuals unverified)" });
  job(A, { daysAgo: 140, zeroHours: true, name: "Interior repaint — walls (hours not recorded)" });
  job(A, { daysAgo: 185, name: "Interior repaint — walls (heavy rework)" });
  // B — 9 eligible, one of them the 30.A16 worked example.
  [30, 65, 95, 140, 190, 240, 290, 350].forEach((days) => job(B, { daysAgo: days }));
  records.push({
    id: idFor(d(-400)), name: "Exterior repaint — siding (30.A16 example)", propertyLabel: "5510 Mockingbird Ln, Dallas", startedAt: d(-404), completedAt: d(-400), kind: "exterior",
    estimatorId: "U-EST", crewLeadId: "U-CREW", verified: true,
    combinations: [{ ...B.base, measuredSqft: 1500, coats: 2, applicationHours: 5.9, prepHours: 1.6, travelHours: 1.2, setupHours: 0.7, reworkHours: 0, consumedGal: 10, spillsGal: 0.2, wasteAllowance: 0.1 }],
    estimate: { labourHours: 9.4, labourCost: 348, material: 548, subcontractor: 0 }, changes: { labourHours: 0, labourCost: 0, material: 0, subcontractor: 0 },
    actual: { labourHours: 9.4, labourCost: 348, material: 580, subcontractor: 0 },
  });
  // C — 7 eligible: not enough.
  [40, 80, 120, 160, 220, 280, 330].forEach((days) => job(C, { daysAgo: days }));
  // D — 8 before the rejection 45 days ago, 2 since.
  [60, 85, 115, 150, 200, 260, 320, 380].forEach((days) => job(D, { daysAgo: days }));
  [12, 30].forEach((days) => job(D, { daysAgo: days }));
  // E and F — enough evidence, rates already approved.
  [100, 130, 160, 190, 230, 270, 310, 360, 410].forEach((days) => job(E, { daysAgo: days }));
  [130, 150, 175, 205, 245, 285, 335, 390].forEach((days) => job(F, { daysAgo: days }));

  /* --------------------- Feature 21 examples (this month) --------------------- */
  const n = new Date(nowIso);
  const monthStart = new Date(n.getFullYear(), n.getMonth(), 1, 12).getTime();
  const span = Math.max(1, n.getTime() - monthStart);
  const inMonth = (i: number, of: number) => new Date(monthStart + (span * (i + 1)) / (of + 1)).toISOString();
  const mixed: EvidenceCombo[] = [
    { ...A.base, measuredSqft: 420, applicationHours: 3, prepHours: 1, travelHours: 0.5, setupHours: 0.5, reworkHours: 0, consumedGal: 2.3, spillsGal: 0 },
    { ...C.base, measuredSqft: 90, applicationHours: 2.4, prepHours: 0.6, travelHours: 0, setupHours: 0, reworkHours: 0, consumedGal: 0.6, spillsGal: 0 },
  ];
  const ex = (i: number, name: string, estimate: CompletedJobRecord["estimate"], actual: CompletedJobRecord["actual"], extra: Partial<CompletedJobRecord> = {}): CompletedJobRecord => {
    const completedAt = inMonth(i, 9);
    return {
      id: idFor(completedAt), name, propertyLabel: ADDRESSES[(i + 3) % ADDRESSES.length], startedAt: addDays(completedAt, -3), completedAt, kind: i % 2 ? "exterior" : "interior",
      estimatorId: i % 3 === 0 ? "U-SENIOR" : "U-EST", crewLeadId: "U-CREW", verified: true, combinations: mixed, estimate, changes: { labourHours: 0, labourCost: 0, material: 0, subcontractor: 0 }, actual, ...extra,
    };
  };
  records.push(
    ex(0, "Interior repaint — family room (40 → 50 hours)", { labourHours: 40, labourCost: 1480, material: 600, subcontractor: 0 }, { labourHours: 50, labourCost: 1850, material: 610, subcontractor: 0 }),
    ex(1, "Exterior trim refresh (exactly +10%)", { labourHours: 81, labourCost: 3000, material: 1000, subcontractor: 0 }, { labourHours: 89.2, labourCost: 3300, material: 1100, subcontractor: 0 }),
    ex(2, "Interior repaint — hallway (+10.1%)", { labourHours: 60, labourCost: 2220, material: 780, subcontractor: 0 }, { labourHours: 66.1, labourCost: 2446, material: 857, subcontractor: 0 }),
    ex(3, "Exterior repaint — full house (under budget)", { labourHours: 190, labourCost: 7030, material: 2970, subcontractor: 0 }, { labourHours: 178, labourCost: 6590, material: 2810, subcontractor: 0 }),
    ex(4, "Warranty call — touch-up visit (zero estimate)", { labourHours: 0, labourCost: 0, material: 0, subcontractor: 0 }, { labourHours: 8, labourCost: 296, material: 54, subcontractor: 0 }),
    ex(5, "Exterior repaint — duplex (actual not reconciled)", { labourHours: 120, labourCost: 4440, material: 1850, subcontractor: 0 }, undefined),
    ex(6, "Interior repaint — two approved change orders", { labourHours: 150, labourCost: 5550, material: 2650, subcontractor: 0 }, { labourHours: 185, labourCost: 6845, material: 2955, subcontractor: 0 },
      { changes: { labourHours: 34, labourCost: 1260, material: 540, subcontractor: 0 } }),
    ex(7, "Exterior repaint — with warranty rework", { labourHours: 98, labourCost: 3626, material: 1540, subcontractor: 0 }, { labourHours: 101, labourCost: 3737, material: 1500, subcontractor: 0 },
      { outOfScope: { label: "Warranty rework on the 2023 porch — outside the compared scope", hours: 6, cost: 222 } }),
    ex(8, "Interior repaint — kitchen (hours pending)", { labourHours: 44, labourCost: 1628, material: 520, subcontractor: 0 }, { labourHours: 41, labourCost: 1517, material: 505, subcontractor: 0 }, { pendingHours: 6 }),
  );
  return records;
}
