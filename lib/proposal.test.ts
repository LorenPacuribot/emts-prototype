import { describe, expect, it } from 'vitest';
import type { Estimate, EstimateLineItem, Presentation } from './types';
import {
  chosenTemplate, customerLines, lineShown, matchingTemplates, onlyLinePart, optionalLines, partShown, sectionShown, showWholeLine, toggleLine, toggleLinePart, toggleSection,
} from './proposal';

const line = (id: string, o: Partial<EstimateLineItem> = {}): EstimateLineItem => ({
  id, areaId: 'a1', description: id, surfaceType: 'Walls', quantity: 100, unit: 'sqft', unitPrice: 1, laborHours: 1, laborRate: 50, coats: 2, difficultyMultiplier: 1, total: 150, ...o,
});
const est = (o: Partial<Estimate> = {}) => ({
  id: 'E1', estimateTemplateId: 'tpl_int', estimateType: 'Interior', presentation: undefined,
  lineItems: [line('inc'), line('opt', { optional: true }), line('sel', { optional: true, selected: true })], ...o,
}) as Estimate;
const pres = (id: string, o: Partial<Presentation> = {}) => ({ id, title: id, scopes: [], sections: [], ...o }) as unknown as Presentation;

describe('Client Preview settings (patent 11)', () => {
  it('toggles sections, lines and line parts', () => {
    let s = toggleSection({}, 'pricing');
    expect(sectionShown(s, 'pricing')).toBe(false);
    s = toggleSection(s, 'pricing');
    expect(sectionShown(s, 'pricing')).toBe(true);

    s = toggleLine(s, 'inc');
    expect(lineShown(s, 'inc')).toBe(false);
    s = toggleLinePart(s, 'sel', 'price');
    expect(partShown(s, 'sel', 'price')).toBe(false);
    expect(partShown(s, 'sel', 'colour')).toBe(true);
    s = onlyLinePart(s, 'sel', 'price');
    expect(partShown(s, 'sel', 'price')).toBe(true);
    expect(partShown(s, 'sel', 'colour')).toBe(false);
    s = showWholeLine(showWholeLine(s, 'sel'), 'inc');
    expect(s.hiddenLineParts).toEqual({});
    expect(s.hiddenLines).toEqual([]);
  });

  it('keeps optional work separate from the scope the customer sees', () => {
    const e = est();
    expect(customerLines(e).map((l) => l.id)).toEqual(['inc', 'sel']);
    expect(optionalLines(e).map((l) => l.id)).toEqual(['opt']);
    expect(customerLines(est({ presentation: { hiddenLines: ['inc'] } })).map((l) => l.id)).toEqual(['sel']);
  });

  it('offers templates linked to the estimate template, else to its type', () => {
    const list = [
      pres('byTemplate', { templateIds: ['tpl_int'] }),
      pres('otherTemplate', { templateIds: ['tpl_ext'], scopes: ['Interior'] }),
      pres('byType', { scopes: ['Interior'] }),
      pres('forAnotherEstimate', { scopes: ['Interior'], estimateId: 'E2' }),
    ];
    expect(matchingTemplates(list, est()).map((p) => p.id)).toEqual(['byTemplate', 'byType']);
  });

  it('uses the chosen template, the only match, or the proposal', () => {
    const one = [pres('only', { scopes: ['Interior'] })];
    expect(chosenTemplate(one, est())?.id).toBe('only');
    expect(chosenTemplate(one, est({ presentation: { useProposal: true } }))).toBeUndefined();
    const two = [pres('a', { scopes: ['Interior'] }), pres('b', { scopes: ['Interior'] })];
    expect(chosenTemplate(two, est())).toBeUndefined();
    expect(chosenTemplate(two, est({ presentation: { templateId: 'b' } }))?.id).toBe('b');
    // A template that no longer matches falls back.
    expect(chosenTemplate(two, est({ presentation: { templateId: 'gone' } }))).toBeUndefined();
  });
});
