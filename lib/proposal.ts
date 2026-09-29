/*
  Customer output settings (patent 11: Client Preview).

  An estimate's customer output is either the standard proposal or a
  Presentation Builder template linked to the estimate's template or type.
  Estimate.presentation stores what the estimator chose in Client Preview:
  the template, hidden content blocks (gear icon), lines left out, and parts
  of a line hidden with the line's ⋯ menu. The preview, the PDF and the
  customer's link all read these settings, so the customer sees exactly what
  was previewed.
*/
import type { Estimate, EstimateLineItem, EstimatePresentationSettings, Presentation, ProposalLinePart, ProposalSectionKey } from './types';
import { includedLine } from './calculations';

export const PROPOSAL_SECTIONS: { key: ProposalSectionKey; label: string; hint?: string }[] = [
  { key: 'customer', label: 'Property & customer info' },
  { key: 'scope', label: 'Surface-by-surface scope' },
  { key: 'linePrices', label: 'Line prices', hint: 'Price of each surface' },
  { key: 'areaTotals', label: 'Area totals' },
  { key: 'specs', label: 'Paint specifications', hint: 'The color card' },
  { key: 'optional', label: 'Optional items' },
  { key: 'pricing', label: 'Pricing & totals' },
  { key: 'notes', label: 'Notes & payment terms' },
  { key: 'terms', label: 'Terms & conditions' },
  { key: 'signature', label: 'Signature block' },
];

export const LINE_PARTS: { key: ProposalLinePart; label: string }[] = [
  { key: 'location', label: 'Location' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'colour', label: 'Color' },
  { key: 'product', label: 'Product' },
  { key: 'sheen', label: 'Sheen' },
  { key: 'coats', label: 'Coats' },
  { key: 'prep', label: 'Preparation' },
  { key: 'price', label: 'Price' },
];

export const settingsOf = (e: Pick<Estimate, 'presentation'>): EstimatePresentationSettings => e.presentation ?? {};

export const sectionShown = (s: EstimatePresentationSettings, key: string) => !(s.hiddenSections ?? []).includes(key);

export const lineShown = (s: EstimatePresentationSettings, lineId: string) => !(s.hiddenLines ?? []).includes(lineId);

export const partShown = (s: EstimatePresentationSettings, lineId: string, part: ProposalLinePart) => !(s.hiddenLineParts?.[lineId] ?? []).includes(part);

/** Included lines the customer sees (a line left out stays priced in the totals). */
export function customerLines(e: Pick<Estimate, 'lineItems' | 'presentation'>, areaId?: string): EstimateLineItem[] {
  const s = settingsOf(e);
  return e.lineItems.filter((l) => includedLine(l) && lineShown(s, l.id) && (!areaId || l.areaId === areaId));
}

export function optionalLines(e: Pick<Estimate, 'lineItems' | 'presentation'>): EstimateLineItem[] {
  const s = settingsOf(e);
  return e.lineItems.filter((l) => !includedLine(l) && lineShown(s, l.id));
}

/* ---------- toggles (pure: return new settings) ---------- */

const toggleIn = (list: string[] | undefined, v: string) => ((list ?? []).includes(v) ? (list ?? []).filter((x) => x !== v) : [...(list ?? []), v]);

export function toggleSection(s: EstimatePresentationSettings, key: string): EstimatePresentationSettings {
  return { ...s, hiddenSections: toggleIn(s.hiddenSections, key) };
}

export function toggleLine(s: EstimatePresentationSettings, lineId: string): EstimatePresentationSettings {
  return { ...s, hiddenLines: toggleIn(s.hiddenLines, lineId) };
}

export function toggleLinePart(s: EstimatePresentationSettings, lineId: string, part: ProposalLinePart): EstimatePresentationSettings {
  const cur = s.hiddenLineParts?.[lineId] ?? [];
  const next = cur.includes(part) ? cur.filter((p) => p !== part) : [...cur, part];
  const parts = { ...(s.hiddenLineParts ?? {}) };
  if (next.length) parts[lineId] = next;
  else delete parts[lineId];
  return { ...s, hiddenLineParts: parts };
}

/** "Show only X": hides every other part of the line. */
export function onlyLinePart(s: EstimatePresentationSettings, lineId: string, part: ProposalLinePart): EstimatePresentationSettings {
  return { ...s, hiddenLineParts: { ...(s.hiddenLineParts ?? {}), [lineId]: LINE_PARTS.map((p) => p.key).filter((k) => k !== part) } };
}

export function showWholeLine(s: EstimatePresentationSettings, lineId: string): EstimatePresentationSettings {
  const parts = { ...(s.hiddenLineParts ?? {}) };
  delete parts[lineId];
  return { ...s, hiddenLines: (s.hiddenLines ?? []).filter((x) => x !== lineId), hiddenLineParts: parts };
}

/* ---------- templates ---------- */

/** Presentation templates for this estimate: linked to its estimate template, or to its type. */
export function matchingTemplates(presentations: readonly Presentation[], e: Pick<Estimate, 'estimateTemplateId' | 'estimateType' | 'id'>): Presentation[] {
  return presentations.filter((p) => {
    if (p.estimateId && p.estimateId !== e.id) return false;
    if (p.templateIds?.length) return !!e.estimateTemplateId && p.templateIds.includes(e.estimateTemplateId);
    return p.scopes.includes(e.estimateType);
  });
}

/**
 * The template Client Preview uses: the one chosen, else the only matching
 * one; none (standard proposal) when the proposal was chosen or several
 * templates match and none was picked.
 */
export function chosenTemplate(presentations: readonly Presentation[], e: Pick<Estimate, 'estimateTemplateId' | 'estimateType' | 'id' | 'presentation'>): Presentation | undefined {
  const s = settingsOf(e);
  if (s.useProposal) return undefined;
  const list = matchingTemplates(presentations, e);
  return (s.templateId && list.find((p) => p.id === s.templateId)) || (list.length === 1 ? list[0] : undefined);
}
