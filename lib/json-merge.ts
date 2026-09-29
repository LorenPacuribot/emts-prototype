/*
  Three-way merge for the shared JSON blobs (lib/remote-state.ts).

  When two people save the same blob, the second save is refused and this
  merges "base" (what both started from), "mine" and "theirs":
  - objects merge key by key;
  - arrays of records with an `id` merge record by record, so two people
    editing different estimates, leads or jobs both keep their work;
  - anything else changed on both sides differently is a conflict: their
    value is kept and the path is reported so the person can redo it.
*/

export interface MergeResult {
  value: unknown;
  /** Paths where both sides changed the same value; theirs was kept. */
  conflicts: string[];
}

export interface MergeOptions {
  /** Treat arrays of strings/numbers as sets (tombstone lists). */
  setArrays?: boolean;
  /** Per-browser values (who is viewing, clock mode): this side's value is kept without a conflict. */
  mineWins?: string[];
}

type Obj = Record<string, unknown>;
const ABSENT = Symbol('absent');
type Val = unknown | typeof ABSENT;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const idOf = (v: unknown): string | undefined => (isObj(v) && (typeof v.id === 'string' || typeof v.id === 'number') ? String(v.id) : undefined);
const isRecordArray = (v: unknown): v is Obj[] => Array.isArray(v) && v.every((x) => idOf(x) !== undefined);
const isPrimitiveArray = (v: unknown): v is (string | number)[] => Array.isArray(v) && v.every((x) => typeof x === 'string' || typeof x === 'number');

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => deepEqual(x, bb[i]));
  }
  const ka = Object.keys(a as Obj);
  const kb = Object.keys(b as Obj);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual((a as Obj)[k], (b as Obj)[k]));
}

const same = (a: Val, b: Val) => (a === ABSENT || b === ABSENT ? a === b : deepEqual(a, b));

export function merge3(base: unknown, mine: unknown, theirs: unknown, opts: MergeOptions = {}): MergeResult {
  const conflicts: string[] = [];
  const value = mergeAt(base, mine, theirs, '', conflicts, opts);
  return { value: value === ABSENT ? null : value, conflicts };
}

function mergeAt(base: Val, mine: Val, theirs: Val, path: string, conflicts: string[], opts: MergeOptions): Val {
  if (same(mine, theirs)) return mine;
  if (opts.mineWins?.includes(path)) return mine;
  // ID counters only move forward: keep the higher one so new IDs don't repeat.
  if (typeof mine === 'number' && typeof theirs === 'number' && /(^|\.)counters\./.test(path)) return Math.max(mine, theirs);
  if (same(base, mine)) return theirs;
  if (same(base, theirs)) return mine;
  if (isObj(base) && isObj(mine) && isObj(theirs)) return mergeObjects(base, mine, theirs, path, conflicts, opts);
  if (isRecordArray(base) && isRecordArray(mine) && isRecordArray(theirs)) return mergeRecords(base, mine, theirs, path, conflicts, opts);
  if (opts.setArrays && isPrimitiveArray(base) && isPrimitiveArray(mine) && isPrimitiveArray(theirs)) return mergeSets(base, mine, theirs);
  // A brand-new object on both sides (e.g. a collection added in code) can still merge key by key.
  if (base === ABSENT && isObj(mine) && isObj(theirs)) return mergeObjects({}, mine, theirs, path, conflicts, opts);
  if (base === ABSENT && isRecordArray(mine) && isRecordArray(theirs)) return mergeRecords([], mine, theirs, path, conflicts, opts);
  conflicts.push(path || '(whole record)');
  return theirs;
}

function mergeObjects(base: Obj, mine: Obj, theirs: Obj, path: string, conflicts: string[], opts: MergeOptions): Obj {
  const out: Obj = {};
  const keys = new Set([...Object.keys(theirs), ...Object.keys(mine), ...Object.keys(base)]);
  for (const k of keys) {
    const get = (o: Obj): Val => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : ABSENT);
    const v = mergeAt(get(base), get(mine), get(theirs), path ? `${path}.${k}` : k, conflicts, opts);
    if (v !== ABSENT) out[k] = v;
  }
  return out;
}

function mergeRecords(base: Obj[], mine: Obj[], theirs: Obj[], path: string, conflicts: string[], opts: MergeOptions): Obj[] {
  const index = (arr: Obj[]) => new Map(arr.map((x) => [idOf(x)!, x]));
  const b = index(base);
  const m = index(mine);
  const t = index(theirs);
  const merged = new Map<string, Obj>();
  const ids = new Set([...t.keys(), ...m.keys(), ...b.keys()]);
  for (const id of ids) {
    const v = mergeAt(b.has(id) ? b.get(id) : ABSENT, m.has(id) ? m.get(id) : ABSENT, t.has(id) ? t.get(id) : ABSENT, `${path}[${id}]`, conflicts, opts);
    if (v !== ABSENT) merged.set(id, v as Obj);
  }
  // Keep their order; put records only this side added next to where they were added.
  const order = theirs.map((x) => idOf(x)!).filter((id) => merged.has(id));
  let after: string | undefined;
  for (const x of mine) {
    const id = idOf(x)!;
    if (!order.includes(id) && merged.has(id)) {
      const at = after === undefined ? 0 : order.indexOf(after) + 1;
      order.splice(at, 0, id);
    }
    if (order.includes(id)) after = id;
  }
  for (const id of merged.keys()) if (!order.includes(id)) order.push(id);
  return order.map((id) => merged.get(id)!);
}

function mergeSets(base: (string | number)[], mine: (string | number)[], theirs: (string | number)[]) {
  const b = new Set(base);
  const removed = new Set(base.filter((x) => !mine.includes(x)));
  const out = theirs.filter((x) => !removed.has(x));
  for (const x of mine) if (!b.has(x) && !out.includes(x)) out.push(x);
  return out;
}

/** Merges two JSON strings against their common base. Invalid JSON: theirs wins as one conflict. */
export function mergeJson(base: string | null, mine: string | null, theirs: string | null, opts: MergeOptions = {}): { value: string | null; conflicts: string[] } {
  if (mine === theirs) return { value: mine, conflicts: [] };
  if (base === mine) return { value: theirs, conflicts: [] };
  if (base === theirs) return { value: mine, conflicts: [] };
  if (mine === null || theirs === null) return { value: theirs, conflicts: ['(whole record)'] };
  try {
    const parse = (s: string | null) => (s === null ? ABSENT : JSON.parse(s));
    const conflicts: string[] = [];
    const res = mergeAt(parse(base), JSON.parse(mine), JSON.parse(theirs), '', conflicts, opts);
    return { value: JSON.stringify(res), conflicts };
  } catch {
    return { value: theirs, conflicts: ['(whole record)'] };
  }
}

/** "estimates[EST-2026-10].status" → "estimates EST-2026-10" for messages. */
export function describeConflict(path: string): string {
  const m = path.match(/([A-Za-z]+)\[([^\]]+)\]/g);
  if (m?.length) {
    const last = m[m.length - 1]!.match(/([A-Za-z]+)\[([^\]]+)\]/)!;
    return `${last[1]} ${last[2]}`;
  }
  return path.split('.').slice(-1)[0] || path;
}
