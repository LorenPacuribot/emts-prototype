/*
  CRM pipelines, replica side (30 Sep call, CRM).

  - migratePipelineStages: stages saved before pipelines get their pipeline,
    system flag and lifecycle status; the Production stages are added.
  - newProductionCards: one card per sale (rules in features/lib/rules/lead-pipeline.ts).
  - withCrmBaseline: on first load (and Reset demo data) every existing sale
    gets its card, placed by the job's status, every lead gets its current
    stage as the first history entry, and events that already happened are
    marked as handled so no automation fires for old records.
*/
import { estimateTotals } from './calculations';
import type { Database, Job, Lead, PipelineStage, ProductionCard, StageMove } from './types';
import { automationEventKeys } from './automation';
import { pipelineColumns, productionCardsToCreate, salesColumnFor, stagePipeline } from '@/features/lib/rules/lead-pipeline';

const SALES_STATUS: Record<string, PipelineStage['leadStatus']> = {
  NEW: 'New', CONTACTED: 'Contacted', SCHEDULED: 'Scheduled', PENDING: 'Pending', SOLD: 'Sold', LOST: 'Lost', ARCHIVED: 'Archived',
};
const SALES_SYSTEM = ['NEW', 'SOLD', 'LOST', 'ARCHIVED'];

/** Saved stages without a pipeline are the original Sales stages. Missing seeded stages are added. */
export function migratePipelineStages(saved: PipelineStage[], fresh: PipelineStage[]): PipelineStage[] {
  const upgraded = saved.map((s): PipelineStage =>
    s.pipelineId ? s : {
      ...s, pipelineId: 'sales', system: SALES_SYSTEM.includes(s.stageId), leadStatus: SALES_STATUS[s.stageId],
      ...(s.stageId === 'ARCHIVED' ? { hidden: true } : {}),
    },
  );
  const have = new Set(upgraded.map((s) => s.id));
  return [...upgraded, ...fresh.filter((s) => !have.has(s.id))];
}

/** Production stage for a job already in progress when cards were introduced. */
const STAGE_FOR_JOB: Partial<Record<Job['status'], string>> = {
  Unscheduled: 'pp_colours', Confirmed: 'pp_colours', Scheduled: 'pp_scheduled', 'In Production': 'pp_progress',
  'Touch Up': 'pp_touchups', 'Ready for Inspection': 'pp_touchups', Completed: 'pp_complete', Marketing: 'pp_complete',
};

export const move = (pipelineId: string, stage: Pick<PipelineStage, 'id' | 'displayName'>, by: string, at: string): StageMove => ({
  pipelineId, stageId: stage.id, stageName: stage.displayName, by, at,
});

/**
 * Cards for sales that have none. `placeByJob` puts a sale whose job is
 * already under way on the matching stage (first load only); new sales start
 * on the first Production stage.
 */
export function newProductionCards(db: Database, at: string, opts: { placeByJob?: boolean; by?: string } = {}): ProductionCard[] {
  const c = db.collections;
  const cols = pipelineColumns(c.pipelineStages, 'production');
  const first = cols[0];
  if (!first) return [];
  return productionCardsToCreate(c.leads, c.estimates, c.productionCards).flatMap((n) => {
    const est = c.estimates.find((e) => e.id === n.estimateId);
    const job = c.jobs.find((j) => (est?.jobId && j.id === est.jobId) || (n.estimateId && j.estimateId === n.estimateId));
    if (job?.status === 'Cancelled') return [];
    const placed = opts.placeByJob && job ? cols.find((s) => s.id === STAGE_FOR_JOB[job.status]) : undefined;
    const stage = placed ?? first;
    const lead = c.leads.find((l) => l.id === n.leadId);
    const customer = c.customers.find((x) => x.id === (n.customerId ?? lead?.customerId));
    const customerName = customer ? `${customer.firstName} ${customer.lastName}`.trim() : lead ? `${lead.firstName} ${lead.lastName}`.trim() : '';
    return [{
      id: `pc_${n.saleKey}`, saleKey: n.saleKey, pipelineId: 'production', stageId: stage.id, title: est?.title ?? n.title, customerName,
      leadId: n.leadId, estimateId: n.estimateId, jobId: job?.id, value: est ? estimateTotals(est).taxable : job?.value ?? lead?.estimatedValue ?? 0,
      createdAt: at, history: [move('production', stage, opts.by ?? 'Automatic', at)],
    }];
  });
}

/** The lead's Sales stage now, if it differs from the last one recorded. */
export function unrecordedSalesMove(lead: Lead, stages: PipelineStage[], by: string, at: string): StageMove | undefined {
  if (lead.status === 'Archived') return undefined;
  const col = salesColumnFor(lead, pipelineColumns(stages, 'sales'));
  if (!col) return undefined;
  const last = [...(lead.stageHistory ?? [])].reverse().find((m) => m.pipelineId === 'sales');
  return last?.stageId === col.id ? undefined : move('sales', col, by, at);
}

export function withCrmBaseline(db: Database, at = new Date().toISOString()): Database {
  const c = db.collections;
  const leads = c.leads.map((l) => {
    if (l.stageHistory?.length) return l;
    const m = unrecordedSalesMove(l, c.pipelineStages, 'Imported', l.updatedAt || l.createdAt || at);
    return m ? { ...l, stageHistory: [m] } : l;
  });
  const withLeads = { ...db, collections: { ...c, leads } };
  const cards = newProductionCards(withLeads, at, { placeByJob: true, by: 'Imported' });
  const seen = new Set(c.automationEvents.map((e) => e.id));
  const events = automationEventKeys(withLeads).filter((k) => !seen.has(k)).map((id) => ({ id, at }));
  return {
    ...db,
    collections: {
      ...withLeads.collections,
      productionCards: [...c.productionCards, ...cards],
      automationEvents: [...c.automationEvents, ...events],
    },
  };
}

export { stagePipeline };

/** CRM-C2: a new pipeline starts with one custom stage and its system stage last. */
export function createPipeline(name: string, order: number, newId: (prefix: string) => string): { pipeline: import('./types').Pipeline; stages: PipelineStage[] } {
  const id = newId('pl');
  return {
    pipeline: { id, name, kind: 'custom', sortOrder: order },
    stages: [
      { id: newId('ps'), stageId: 'START', displayName: 'New', color: '#3B82F6', sortOrder: 1, pipelineId: id },
      { id: newId('ps'), stageId: 'DONE', displayName: 'Done', color: '#22C55E', sortOrder: 2, pipelineId: id, system: true },
    ],
  };
}
