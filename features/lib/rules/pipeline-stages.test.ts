import { describe, expect, it } from "vitest";
import { pipelineStages } from "@/lib/data/settings-config";
import type { Lead, PipelineStage } from "@/lib/types";
import {
  MAX_STAGES, deleteStageProblem, insertStage, leavesSold, moveStage, pipelineColumns, productionCardsToCreate, salesColumnFor,
  stageCounts, stageNameProblem, stageOrderProblem,
} from "./lead-pipeline";

const sales = () => pipelineColumns(pipelineStages, "sales");
const production = () => pipelineColumns(pipelineStages, "production");
const custom = (id: string, name = id): PipelineStage => ({ id, stageId: id.toUpperCase(), displayName: name, color: "#000000", sortOrder: 0, pipelineId: "sales" });
const names = (cols: PipelineStage[]) => cols.map((s) => s.displayName);

describe("pipeline stages", () => {
  it("seeds Sales and Production in the agreed order", () => {
    expect(names(sales())).toEqual(["New Leads", "Contacted", "Estimate Scheduled", "Pending", "Sold", "Lost"]);
    expect(names(production())).toEqual(["Pick Colours", "Ready to Schedule", "Scheduled", "In Progress", "Touch-ups", "Complete"]);
    expect(stageOrderProblem(sales())).toBeUndefined();
    expect(stageOrderProblem(production())).toBeUndefined();
  });

  it("adds a stage above Sold, and above Complete on Production", () => {
    const r = insertStage(sales(), custom("ps_quote", "Quote Sent"));
    expect(r.ok && names(r.columns)).toEqual(["New Leads", "Contacted", "Estimate Scheduled", "Pending", "Quote Sent", "Sold", "Lost"]);
    const p = insertStage(production(), { ...custom("pp_inspect", "Inspection"), pipelineId: "production" });
    expect(p.ok && names(p.columns).slice(-2)).toEqual(["Inspection", "Complete"]);
  });

  it("caps a pipeline at 12 stages", () => {
    let cols = sales();
    for (let i = 0; cols.length < MAX_STAGES; i++) {
      const r = insertStage(cols, custom(`x${i}`));
      if (!r.ok) throw new Error(r.error);
      cols = r.columns;
    }
    const over = insertStage(cols, custom("one_more"));
    expect(over).toEqual({ ok: false, error: "A pipeline can have at most 12 stages." });
  });

  it("system stages can't move; custom stages stay between them", () => {
    expect(moveStage(sales(), "ps_sold", 1)).toEqual({ ok: false, error: "System stages can't be moved." });
    expect(moveStage(sales(), "ps_contacted", 0).ok).toBe(false);
    expect(moveStage(sales(), "ps_contacted", 5).ok).toBe(false);
    const r = moveStage(sales(), "ps_pending", 1);
    expect(r.ok && names(r.columns)).toEqual(["New Leads", "Pending", "Contacted", "Estimate Scheduled", "Sold", "Lost"]);
  });

  it("a stage with cards cannot be deleted", () => {
    expect(deleteStageProblem({ system: false }, 3)).toBe("Move the 3 cards in this stage first.");
    expect(deleteStageProblem({ system: false }, 1)).toBe("Move the 1 card in this stage first.");
    expect(deleteStageProblem({ system: true }, 0)).toBe("System stages can't be deleted.");
    expect(deleteStageProblem({ system: false }, 0)).toBeUndefined();
  });

  it("checks stage names", () => {
    expect(stageNameProblem(" ", [])).toBe("Enter a stage name.");
    expect(stageNameProblem("Sold", ["sold"])).toBe("Each stage needs a unique name.");
    expect(stageNameProblem("Quote Sent", ["Sold"])).toBeUndefined();
  });
});

describe("where a lead sits", () => {
  const lead = (p: Partial<Lead>) => ({ status: "Contacted", ...p }) as Lead;
  const withQuote = () => { const r = insertStage(sales(), custom("ps_quote", "Quote Sent")); if (!r.ok) throw new Error(); return r.columns; };

  it("on the stage for its status", () => {
    expect(salesColumnFor(lead({}), sales())?.id).toBe("ps_contacted");
  });

  it("on a custom stage it was moved into, until its status changes", () => {
    const cols = withQuote();
    expect(salesColumnFor(lead({ stageId: "ps_quote", stageStatus: "Contacted" }), cols)?.id).toBe("ps_quote");
    expect(salesColumnFor(lead({ status: "Pending", stageId: "ps_quote", stageStatus: "Contacted" }), cols)?.id).toBe("ps_pending");
  });

  it("counts cards per stage for the delete guard", () => {
    const cols = withQuote();
    const counts = stageCounts(cols, [{ id: "sales", kind: "sales" }], [lead({ stageId: "ps_quote", stageStatus: "Contacted" }), lead({}), lead({ status: "Archived" })], []);
    expect(counts.ps_quote).toBe(1);
    expect(counts.ps_contacted).toBe(1);
  });
});

describe("production cards", () => {
  const leads = [{ id: "L1", status: "Sold" as const, estimateId: "E1", firstName: "Ann", lastName: "Lee", customerId: "C1" }];
  const estimates = [{ id: "E1", status: "Approved" as const, leadId: "L1", customerId: "C1", title: "Interior", jobId: "J1" }];

  it("Sold creates exactly one card, even when the lead and the estimate both say sold", () => {
    const made = productionCardsToCreate(leads, estimates, []);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ saleKey: "E1", leadId: "L1", estimateId: "E1" });
  });

  it("re-approval never duplicates it", () => {
    expect(productionCardsToCreate(leads, estimates, [{ saleKey: "E1" }])).toEqual([]);
  });

  it("a card removed on purpose is not recreated", () => {
    expect(productionCardsToCreate(leads, estimates, [], ["E1"])).toEqual([]);
  });

  it("a lead sold without an estimate gets a card of its own", () => {
    expect(productionCardsToCreate([{ ...leads[0]!, estimateId: undefined }], [], [])[0]).toMatchObject({ saleKey: "L1", title: "Ann Lee" });
  });

  it("asks only when leaving Sold", () => {
    expect(leavesSold("Sold", "Contacted")).toBe(true);
    expect(leavesSold("Contacted", "Sold")).toBe(false);
  });
});
