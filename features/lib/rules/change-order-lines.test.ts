/**
 * Patent 24 — a change order line can carry its own labour and material
 * breakdown; the cost before markup is then derived from it.
 */
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { ActionResult, Database, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { applyChangeOrder, recordApproval, saveLine } from "@/features/lib/store/actions/change-orders";
import { changeOrderHours, lineLabourHours } from "@/features/lib/rules/change-order-effects";
import { invoiceLinesTotal } from "@/features/lib/rules/invoice-lines";
import { addDays } from "@/features/lib/rules/dates";
import { now } from "@/features/lib/clock";

const NOW = "2026-06-10T15:00:00.000Z";
const CO = "CO-2026-1-05";

function run<A extends unknown[], R>(db: Database, userId: string, action: (db: Database, actor: User, ...args: A) => ActionResult<R>, ...args: A) {
  let result: ActionResult<R> = { ok: false, error: "not run" };
  const next = produce(db, (draft) => {
    result = action(draft as Database, draft.users.find((u) => u.id === userId)!, ...args);
  });
  return { db: next, result };
}
const idOf = (r: ActionResult<unknown>) => (r.ok ? String(r.value) : "");
const lineOf = (db: Database, id: string) => db.changeOrders.find((c) => c.id === CO)!.lines.find((l) => l.id === id)!;

describe("Patent 24 — change order labour / material breakdown", () => {
  it("derives the cost from hours × rate + material, ignoring a stale typed cost", () => {
    const r = run(createSeed(NOW), "U-EST", saveLine, CO, { kind: "add", description: "Porch rail", cost: 999, laborHours: 6, laborRate: 45, materialCost: 82.5 });
    expect(r.result.ok).toBe(true);
    const l = lineOf(r.db, idOf(r.result));
    expect(l.cost).toBe(352.5);
    expect(l).toMatchObject({ laborHours: 6, laborRate: 45, materialCost: 82.5 });
  });

  it("keeps a single cost when no breakdown is given", () => {
    const r = run(createSeed(NOW), "U-EST", saveLine, CO, { kind: "add", description: "Porch rail", cost: 120 });
    const l = lineOf(r.db, idOf(r.result));
    expect(l.cost).toBe(120);
    expect(l.laborHours).toBeUndefined();
    expect(l.materialCost).toBeUndefined();
  });

  it("needs a rate for labour hours, and refuses negative parts", () => {
    const db = createSeed(NOW);
    expect(run(db, "U-EST", saveLine, CO, { kind: "add", description: "x", cost: 0, laborHours: 4 }).result).toMatchObject({ ok: false, field: "laborRate" });
    expect(run(db, "U-EST", saveLine, CO, { kind: "add", description: "x", cost: 0, materialCost: -5 }).result).toMatchObject({ ok: false, field: "materialCost" });
  });
});

describe("Patent 24 — approving a change order applies it to the job", () => {
  it("raises required hours from the labour breakdown and adds a line to the draft invoice", () => {
    const t = now();
    let db = createSeed(t);
    const co = db.changeOrders.find((c) => c.id === "CO-2026-1-03")!;
    const jobId = co.jobId;
    db = produce(db, (d) => {
      const c = d.changeOrders.find((x) => x.id === co.id)!;
      c.lines = c.lines.map((l, i) => ({ ...l, laborHours: i === 0 ? 5 : 3, laborRate: 45, materialCost: 50 }));
      c.linkExpiresAt = addDays(t, 5);
      for (const l of c.links ?? []) l.expiresAt = addDays(t, 5);
      // A draft scope invoice for the job, as acceptance now creates.
      d.invoices = d.invoices.filter((i) => !(i.jobId === jobId && i.kind === "standard"));
      d.invoices.push({ id: "INV-T", jobId, kind: "standard", status: "draft", createdAt: t, lines: [{ id: "INV-T-a", description: "Scope", quantity: 1, rate: 1000 }], taxRatePct: 8.5, discount: 0, amount: 1085 });
    });
    const before = changeOrderHours(db, jobId);
    const r = run(db, "U-OFFICE", recordApproval, co.id, { signer: co.signer ?? "Korah Singer", channel: "portal", evidenceRef: "PS-1" });
    expect(r.result.ok ? "ok" : r.result.error).toBe("ok");
    // Approval alone changes nothing on the job (patent 24: then click Apply Change Order).
    expect(changeOrderHours(r.db, jobId)).toBeCloseTo(before, 2);
    expect(r.db.invoices.find((i) => i.id === "INV-T")!.amount).toBe(1085);
    const applied = run(r.db, "U-OFFICE", applyChangeOrder, co.id);
    expect(applied.result.ok).toBe(true);
    expect(run(applied.db, "U-OFFICE", applyChangeOrder, co.id).result.ok).toBe(false);
    expect(run(r.db, "U-CREW", applyChangeOrder, co.id).result.ok).toBe(false);
    Object.assign(r, applied);
    expect(changeOrderHours(r.db, jobId)).toBeCloseTo(before + 8, 2);
    const inv = r.db.invoices.find((i) => i.id === "INV-T")!;
    const coLine = inv.lines!.find((l) => l.changeOrderId === co.id)!;
    expect(coLine).toBeDefined();
    expect(inv.amount).toBeCloseTo(invoiceLinesTotal(inv), 2);
    expect(inv.amount - 1085).toBeCloseTo(r.db.changeOrders.find((c) => c.id === co.id)!.billing!.amount, 1);
  });

  it("a removed surface without a labour breakdown gives back that surface's hours", () => {
    const db = createSeed(NOW);
    const spec = db.specs.find((s) => s.surfaceIds.length)!;
    const surface = db.surfaces.find((s) => s.id === spec.surfaceIds[0])!;
    expect(lineLabourHours(db, { id: "x", kind: "remove", description: "gone", cost: 0, surfaceId: surface.id })).toBeLessThanOrEqual(0);
    expect(lineLabourHours(db, { id: "y", kind: "add", description: "new", cost: 0, laborHours: 4 })).toBe(4);
  });
});
