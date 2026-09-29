/*
  Brings data saved by an older release up to date with the current seed.
  lib/store.tsx calls this on load. Nothing the user changed is overwritten:
  - tableColumns: new system columns and preparation columns are added in
    their seed order; saved names and visibility are kept; a prep column
    keeps its saved production rate, and gets the seed rate when it had none.
    Columns the user added stay, after the seeded ones.
  - automatedMessages: new seeded messages (such as the lead stage messages)
    are added; saved messages are kept as they are.
*/
import type { Collections, TableColumn } from './types';

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

export function migrateCollections(saved: Collections, fresh: Collections): Collections {
  const next = { ...saved };
  if (saved.tableColumns) next.tableColumns = migrateTableColumns(saved.tableColumns, fresh.tableColumns);
  if (saved.automatedMessages) next.automatedMessages = addMissingById(saved.automatedMessages, fresh.automatedMessages);
  return next;
}
