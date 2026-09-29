/**
 * Patent 24 — a change order line can carry its own labour and material
 * breakdown; the cost before markup is then derived from it.
 */
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { ActionResult, Database, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { saveLine } from "@/features/lib/store/actions/change-orders";

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
