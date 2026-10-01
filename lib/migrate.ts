/*
  Brings data saved by an older release up to date with the current seed.
  lib/store.tsx calls this on load. Nothing the user changed is overwritten:
  - tableColumns: new system columns and preparation columns are added in
    their seed order; saved names and visibility are kept; a prep column
    keeps its saved production rate, and gets the seed rate when it had none.
    Columns the user added stay, after the seeded ones.
  - automatedMessages: new seeded messages (such as the lead stage messages)
    are added; saved messages are kept as they are.
  - pipelineStages (CRM-M2): saved stages join the Sales pipeline; the
    Production stages are added.
  - estimates (RP-M6): each sold estimate gets the version history reports
    need to book sales entries (features/lib/rules/sales-entries.ts).
*/
import type { Collections, Estimate, TableColumn } from './types';
import { estimateTotals, round2, versionSnapshot } from './calculations';
import { migratePipelineStages } from './crm';

export function migrateTableColumns(saved: TableColumn[], fresh: TableColumn[]): TableColumn[] {
  const byId = new Map(saved.map((c) => [c.id, c]));
  const seeded = [...fresh]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => {
      const s = byId.get(f.id);
      return s ? { ...f, ...s, prepRate: s.prepRate ?? f.prepRate, unit: s.unit ?? f.unit } : f;
    });
  const freshIds = new Set(fresh.map((c) => c.id));
  const custom = [...saved].filter((c) => !freshIds.has(c.id)).sort((a, b) => a.sortOrder - b.sortOrder);
  return [...seeded, ...custom].map((c, i) => ({ ...c, sortOrder: i + 1 }));
}

/** Adds seed rows whose id is missing from the saved list (appended, saved order kept). */
export function addMissingById<T extends { id: string }>(saved: T[], fresh: T[]): T[] {
  const have = new Set(saved.map((x) => x.id));
  const missing = fresh.filter((x) => !have.has(x.id));
  return missing.length ? [...saved, ...missing] : saved;
}

/**
 * Sold estimates saved before versions carried a snapshot (RP-M6). Safe to run
 * on every load: an estimate already up to date comes back unchanged.
 *  - no Approved version (approved on a prototype screen): one is added on
 *    the approval date;
 *  - the last Approved version has the current total but no snapshot: the
 *    snapshot is filled in;
 *  - the total changed and was re-approved after the last Approved version:
 *    that re-approval is added, so reports book only the difference.
 */
export function migrateEstimateVersions(e: Estimate): Estimate {
  if (e.status !== 'Approved') return e;
  const total = estimateTotals(e).total;
  const snapshot = versionSnapshot(e);
  const approved = e.versions.filter((v) => v.status === 'Approved').sort((a, b) => a.date.localeCompare(b.date) || a.version - b.version);
  const last = approved.at(-1);
  const add = (date: string, note: string): Estimate => ({
    ...e,
    versions: [...e.versions, { version: e.versions.reduce((m, v) => Math.max(m, v.version), 0) + 1, date, total, status: 'Approved', changedBy: 'Estimate Master', note, ...snapshot }],
  });
  if (!last) return add(e.approvedAt ?? e.updatedAt, 'Sale recorded for reports');
  if (round2(last.total) === total) {
    if (last.preTaxTotal !== undefined) return e;
    return { ...e, versions: e.versions.map((v) => (v === last ? { ...v, ...snapshot } : v)) };
  }
  if (e.approvedAt && e.approvedAt > last.date) return add(e.approvedAt, 'Re-approval recorded for reports');
  return e;
}

/**
 * 2 Oct 2026 (D7): the crew template is "Schedule Update (crew)" with the new
 * default subject. Saves that still have the old, untouched defaults move to
 * them; a subject someone changed is kept.
 */
function migrateCrewTemplate<T extends { id: string; name: string; subject?: string; availableVariables?: string[] }>(t: T, fresh: T[]): T {
  if (t.id !== 'am_crew_schedule') return t;
  const f = fresh.find((x) => x.id === t.id);
  if (!f) return t;
  return {
    ...t,
    name: t.name === 'Crew Schedule Update' ? f.name : t.name,
    subject: t.subject === 'Your schedule has changed' ? f.subject : t.subject,
    availableVariables: [...new Set([...(t.availableVariables ?? []), ...(f.availableVariables ?? [])])],
  };
}

export function migrateCollections(saved: Collections, fresh: Collections): Collections {
  const next = { ...saved };
  if (saved.tableColumns) next.tableColumns = migrateTableColumns(saved.tableColumns, fresh.tableColumns);
  if (saved.automatedMessages) next.automatedMessages = addMissingById(saved.automatedMessages, fresh.automatedMessages).map((t) => migrateCrewTemplate(t, fresh.automatedMessages));
  if (saved.estimates) next.estimates = saved.estimates.map(migrateEstimateVersions);
  if (saved.pipelineStages) next.pipelineStages = migratePipelineStages(saved.pipelineStages, fresh.pipelineStages);
  return next;
}
