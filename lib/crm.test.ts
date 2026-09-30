import { beforeEach, describe, expect, it } from 'vitest';
import { createSeed } from '@/features/data/seed';
import { useStore } from '@/features/lib/store';
import { createInitialDatabase } from './sampleData';
import { applyOps, resetBridge, runSync } from './bridge/sync';
import { migratePipelineStages, newProductionCards, unrecordedSalesMove, withCrmBaseline } from './crm';
import { automationEvents, prepareMessages, ruleActions, runAutomations, approvalLabel } from './automation';
import { pipelineStages } from './data/settings-config';
import type { AutomationRule, Database, PipelineStage } from './types';

beforeEach(() => {
  resetBridge();
  useStore.setState({ db: createSeed('2026-06-10T15:00:00.000Z'), currentUserId: 'U-OFFICE' });
});

const loaded = (): Database => {
  const db = createInitialDatabase();
  return withCrmBaseline(applyOps(db, runSync(db, { baseline: true })));
};

let n = 0;
const opts = { at: '2026-09-30T10:00:00Z', orgName: 'Paint Pro', newId: () => `pm${++n}` };

describe('production cards on load', () => {
  it('every sale has exactly one card, and running again adds none', () => {
    const db = loaded();
    const sold = db.collections.estimates.filter((e) => e.status === 'Approved');
    expect(sold.length).toBeGreaterThan(0);
    const keys = db.collections.productionCards.map((c) => c.saleKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of sold) expect(keys).toContain(e.id);
    expect(newProductionCards(db, opts.at)).toEqual([]);
  });

  it('gives every lead its current stage as the first history entry', () => {
    const db = loaded();
    const active = db.collections.leads.filter((l) => l.status !== 'Archived');
    expect(active.every((l) => l.stageHistory?.length === 1)).toBe(true);
    expect(active.every((l) => !unrecordedSalesMove(l, db.collections.pipelineStages, 'x', opts.at))).toBe(true);
  });
});

describe('saved stages from before pipelines', () => {
  it('join Sales with their system flags; Production is added', () => {
    const old = [
      { id: 'ps_new', stageId: 'NEW', displayName: 'Fresh', color: '#000', sortOrder: 1 },
      { id: 'ps_sold', stageId: 'SOLD', displayName: 'Won', color: '#000', sortOrder: 5 },
    ] as PipelineStage[];
    const next = migratePipelineStages(old, pipelineStages);
    expect(next.find((s) => s.id === 'ps_new')).toMatchObject({ displayName: 'Fresh', pipelineId: 'sales', system: true, leadStatus: 'New' });
    expect(next.filter((s) => s.pipelineId === 'production')).toHaveLength(6);
  });
});

describe('automations', () => {
  it('old events are handled on load, so nothing fires for them', () => {
    const db = loaded();
    expect(runAutomations(db, opts)).toEqual({ events: [], messages: [] });
  });

  it('an unapproved rule never sends; it only adds to the approval queue', () => {
    const db = loaded();
    const e = db.collections.estimates.find((x) => x.status !== 'Approved' && x.status !== 'Rejected')!;
    const next: Database = { ...db, collections: { ...db.collections, estimates: db.collections.estimates.map((x) => (x.id === e.id ? { ...x, status: 'Approved' } : x)) } };
    const r = runAutomations(next, opts);
    expect(r.events.map((x) => x.id)).toEqual([`estimate_accepted:${e.id}`]);
    expect(r.messages.length).toBeGreaterThan(0);
    expect(r.messages.every((m) => m.status === 'waiting' && !m.auto)).toBe(true);
  });

  it('an approved rule sends without asking', () => {
    const db = loaded();
    const rule: AutomationRule = { ...db.collections.automationRules[0]!, approval: { byId: 'u', by: 'Tim Skelly', at: opts.at } };
    const ev = { ...automationEvents(db)[0]!, trigger: 'estimate_accepted' as const, value: 9000 };
    const msgs = prepareMessages(ev, [rule], [], opts);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ status: 'sent', auto: true, channel: 'email' });
    expect(approvalLabel(rule.approval)).toMatch(/^Approved · Tim Skelly · /);
    expect(approvalLabel(undefined)).toBe('Ask me first');
  });

  it('follows the yes / no branch of a condition', () => {
    const rule = loaded().collections.automationRules[0]!;
    const ev = { key: 'k', trigger: 'estimate_accepted' as const, firstName: 'A', customerName: 'A B', email: 'a@b.co', phone: '2145550100', projectName: 'P', value: 0, source: '', serviceType: '' };
    expect(ruleActions(rule, { ...ev, value: 9000 }).map((x) => x.id)).toEqual(['n3']);
    expect(ruleActions(rule, { ...ev, value: 100 }).map((x) => x.id)).toEqual(['n4']);
    expect(ruleActions({ ...rule, active: false }, ev)).toEqual([]);
    expect(ruleActions(rule, { ...ev, trigger: 'job_complete' })).toEqual([]);
  });

  it('templates tied to a trigger wait too, unless approved', () => {
    const db = loaded();
    const t = { ...db.collections.automatedMessages.find((x) => x.id === 'am_accept')!, ruleTrigger: 'estimate_accepted' as const };
    const ev = { key: 'k', trigger: 'estimate_accepted' as const, firstName: 'A', customerName: 'A B', email: 'a@b.co', phone: '', projectName: 'P', value: 0, source: '', serviceType: '' };
    expect(prepareMessages(ev, [], [t], opts)[0]).toMatchObject({ status: 'waiting', sourceKind: 'template' });
    expect(prepareMessages(ev, [], [{ ...t, approval: { byId: 'u', by: 'T', at: opts.at } }], opts)[0]).toMatchObject({ status: 'sent' });
  });
});

describe('rule editor', () => {
  it('reads and writes the same linked steps', async () => {
    const { draftToNodes, ruleToDraft } = await import('./automation');
    const rule = loaded().collections.automationRules[0]!;
    const d = ruleToDraft(rule);
    expect(d).toMatchObject({ trigger: 'estimate_accepted', condition: { field: 'estimate_value', op: 'over', value: '5000' } });
    expect(d.then.channel).toBe('email');
    expect(d.otherwise?.channel).toBe('sms');
    const back = draftToNodes(d);
    expect(ruleToDraft({ ...rule, ...back })).toEqual(d);
    expect(draftToNodes({ ...d, condition: undefined, otherwise: undefined }).nodes.map((n) => n.kind)).toEqual(['trigger', 'action']);
  });
});
