import { describe, expect, it } from 'vitest';
import { describeConflict, merge3, mergeJson } from './json-merge';

describe('three-way merge of shared data', () => {
  const base = { collections: { leads: [{ id: 'L-1', name: 'Ann', stage: 'new' }, { id: 'L-2', name: 'Bo', stage: 'new' }] }, counters: { lead: 2 } };

  it("keeps both people's edits to different records", () => {
    const mine = { ...base, collections: { leads: [{ id: 'L-1', name: 'Ann', stage: 'contacted' }, base.collections.leads[1]] } };
    const theirs = { ...base, collections: { leads: [base.collections.leads[0], { id: 'L-2', name: 'Bo', stage: 'sold' }] } };
    const r = merge3(base, mine, theirs);
    expect(r.conflicts).toEqual([]);
    expect(r.value).toEqual({ ...base, collections: { leads: [{ id: 'L-1', name: 'Ann', stage: 'contacted' }, { id: 'L-2', name: 'Bo', stage: 'sold' }] } });
  });

  it('keeps edits to different fields of the same record', () => {
    const mine = { ...base, collections: { leads: [{ id: 'L-1', name: 'Ann Lee', stage: 'new' }, base.collections.leads[1]] } };
    const theirs = { ...base, collections: { leads: [{ id: 'L-1', name: 'Ann', stage: 'sold' }, base.collections.leads[1]] } };
    expect(merge3(base, mine, theirs)).toEqual({ value: { ...base, collections: { leads: [{ id: 'L-1', name: 'Ann Lee', stage: 'sold' }, base.collections.leads[1]] } }, conflicts: [] });
  });

  it('reports a clash on the same field and keeps theirs', () => {
    const mine = { ...base, collections: { leads: [{ id: 'L-1', name: 'Ann', stage: 'lost' }, base.collections.leads[1]] } };
    const theirs = { ...base, collections: { leads: [{ id: 'L-1', name: 'Ann', stage: 'sold' }, base.collections.leads[1]] } };
    const r = merge3(base, mine, theirs);
    expect(r.conflicts).toEqual(['collections.leads[L-1].stage']);
    expect((r.value as typeof base).collections.leads[0]!.stage).toBe('sold');
    expect(describeConflict(r.conflicts[0]!)).toBe('leads L-1');
  });

  it('merges records added on both sides, deletions, and keeps the higher ID counter', () => {
    const mine = { collections: { leads: [{ id: 'L-3', name: 'Cy', stage: 'new' }, ...base.collections.leads] }, counters: { lead: 3 } };
    const theirs = { collections: { leads: [base.collections.leads[0], { id: 'L-4', name: 'Di', stage: 'new' }] }, counters: { lead: 4 } };
    const r = merge3(base, mine, theirs);
    expect(r.conflicts).toEqual([]);
    expect((r.value as typeof base).collections.leads.map((l) => l.id)).toEqual(['L-3', 'L-1', 'L-4']);
    expect((r.value as typeof base).counters.lead).toBe(4);
  });

  it('keeps per-browser fields without a clash and merges tombstone sets', () => {
    const r = merge3({ state: { currentUserId: 'A' } }, { state: { currentUserId: 'B' } }, { state: { currentUserId: 'C' } }, { mineWins: ['state.currentUserId'] });
    expect(r).toEqual({ value: { state: { currentUserId: 'B' } }, conflicts: [] });
    expect(mergeJson('["a","b"]', '["a","b","c"]', '["b","d"]', { setArrays: true })).toEqual({ value: '["b","d","c"]', conflicts: [] });
  });

  it('short-cuts when only one side changed', () => {
    expect(mergeJson('1', '2', '1')).toEqual({ value: '2', conflicts: [] });
    expect(mergeJson('1', '1', '3')).toEqual({ value: '3', conflicts: [] });
  });
});
