/**
 * Patent 28 — a repeat estimate shows last time's actual gallons and labour
 * hours as reference figures, with the same access rule for both.
 */
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { ActionResult, Database, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { startRepeatEstimate } from "@/features/lib/store/actions/future-estimate";

const NOW = "2026-06-10T15:00:00.000Z";

function run<A extends unknown[], R>(db: Database, userId: string, action: (db: Database, actor: User, ...args: A) => ActionResult<R>, ...args: A) {
  let result: ActionResult<R> = { ok: false, error: "not run" };
  const next = produce(db, (draft) => {
    result = action(draft as Database, draft.users.find((u) => u.id === userId)!, ...args);
  });
  return { db: next, result };
}

describe("Patent 28 — prior actuals on repeat lines", () => {
  it("copies prior actual hours alongside prior gallons", () => {
    const db = createSeed(NOW);
    const app = db.applications.find((a) => a.id === "APP-3051")!;
    const r = run(db, "U-OWNER", startRepeatEstimate, app.propertyId, [app.id], { acknowledgedOpen: true });
    expect(r.result.ok).toBe(true);
    const rep = r.db.repeatEstimates.find((x) => x.id === (r.result as { value?: string }).value)!;
    const line = rep.lines.find((l) => l.sourceApplicationId === app.id)!;
    expect(line.priorActualGal).toBe(7);
    expect(line.priorActualHours).toBe(22);
  });
});
