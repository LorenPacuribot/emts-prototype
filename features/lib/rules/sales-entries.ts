/**
 * Sales entries (RP-M1, RP-M2, RP-C3): what an estimate adds to sales, and when.
 *
 * Reports used to date a whole sale by `approvedAt`, so re-approving an
 * amended estimate moved the full sale into the new month. Instead, each
 * accepted version of the estimate books only its difference:
 *   - the first accepted version is the `original` entry (its value and hours);
 *   - each later accepted version is an `amendment` entry worth
 *     (its value − the previous accepted value), dated on its re-approval;
 *   - no change in value or hours (a paint colour renamed) books nothing;
 *   - a drop books a negative entry, in the month of the re-approval.
 * Declined or abandoned amendments never reach Approved, so book nothing.
 * Values exclude sales tax. The entries of an estimate always add up to its
 * latest accepted value.
 *
 * Approved change orders (feature 24) book `change_order` entries of their
 * net, dated on the customer's signature.
 */

export type SalesEntryType = "original" | "amendment" | "change_order";

export interface SalesEntry {
  estimateId: string;
  estimateNumber: string;
  type: SalesEntryType;
  /** 0 for the original; 1, 2, … for amendments and change orders (each counted on its own). */
  n: number;
  /** ISO date the sale is booked on. */
  date: string;
  /** Pre-tax dollars, negative for a drop. */
  value: number;
  hours: number;
  estimatorId?: string;
  /** "v3" for an estimate version, or the change order id. */
  versionRef: string;
}

/** Line snapshot kept on each version, so an amendment can show what changed (RP-C1). */
export interface VersionLine {
  id: string;
  description: string;
  total: number;
}

/** The parts of an estimate version this rule reads (lib/types EstimateVersion). */
export interface SalesVersion {
  version: number;
  date: string;
  /** Grand total, tax included. */
  total: number;
  status: string;
  /** Pre-tax total when the version was saved. Older versions: derived from `total`. */
  preTaxTotal?: number;
  /** Labour hours when the version was saved. Older versions: hours difference of 0. */
  laborHours?: number;
  lines?: VersionLine[];
}

export interface SalesEstimate {
  id: string;
  estimateNumber: string;
  estimatorId?: string;
  /** Percent; used to take tax out of older versions saved without a pre-tax total. */
  taxRate: number;
  versions: SalesVersion[];
}

const ACCEPTED = "Approved";
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** A version's value without sales tax. */
export function versionValue(v: SalesVersion, taxRate: number): number {
  if (v.preTaxTotal !== undefined) return round2(v.preTaxTotal);
  return round2(taxRate ? v.total / (1 + taxRate / 100) : v.total);
}

/** Versions that reached Approved, in date order (version number breaks ties). */
export function acceptedVersions(e: Pick<SalesEstimate, "versions">): SalesVersion[] {
  return e.versions
    .filter((v) => v.status === ACCEPTED)
    .sort((a, b) => a.date.localeCompare(b.date) || a.version - b.version);
}

/** Pre-tax value of the latest accepted version; 0 if the estimate was never accepted. */
export function latestAcceptedValue(e: SalesEstimate): number {
  const last = acceptedVersions(e).at(-1);
  return last ? versionValue(last, e.taxRate) : 0;
}

/**
 * The sales entries of one estimate.
 * `fallbackHours` = hours for an original version saved before hours were recorded.
 */
export function salesEntries(e: SalesEstimate, opts: { fallbackHours?: number } = {}): SalesEntry[] {
  const out: SalesEntry[] = [];
  let prevValue = 0;
  let prevHours: number | undefined;
  let amendments = 0;
  for (const v of acceptedVersions(e)) {
    const value = versionValue(v, e.taxRate);
    const base = { estimateId: e.id, estimateNumber: e.estimateNumber, date: v.date, estimatorId: e.estimatorId, versionRef: `v${v.version}` };
    if (!out.length) {
      const hours = round2(v.laborHours ?? opts.fallbackHours ?? 0);
      out.push({ ...base, type: "original", n: 0, value, hours });
      prevValue = value;
      prevHours = hours;
      continue;
    }
    const dValue = round2(value - prevValue);
    // Hours are compared only when both versions recorded them.
    const dHours = v.laborHours !== undefined && prevHours !== undefined ? round2(v.laborHours - prevHours) : 0;
    prevValue = value;
    if (v.laborHours !== undefined) prevHours = v.laborHours;
    if (dValue === 0 && dHours === 0) continue;
    amendments += 1;
    out.push({ ...base, type: "amendment", n: amendments, value: dValue, hours: dHours });
  }
  return out;
}

/** True when the entries add up to the given value (RP-C4 flags estimates where they don't). */
export function entriesAddUp(entries: Pick<SalesEntry, "value">[], expected: number): boolean {
  return Math.abs(round2(entries.reduce((s, x) => s + x.value, 0)) - round2(expected)) < 0.005;
}

/** Signed change orders, reduced to what an entry needs. */
export interface SalesChangeOrder {
  id: string;
  estimateId: string;
  estimateNumber: string;
  estimatorId?: string;
  /** Date the customer signed. */
  date: string;
  /** Pre-tax net: additions − credits − approved discount. */
  net: number;
  hours: number;
}

/** Change-order entries, numbered per estimate in date order (RP-C3). */
export function changeOrderEntries(cos: SalesChangeOrder[]): SalesEntry[] {
  const count = new Map<string, number>();
  return [...cos]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .filter((c) => round2(c.net) !== 0 || round2(c.hours) !== 0)
    .map((c) => {
      const n = (count.get(c.estimateId) ?? 0) + 1;
      count.set(c.estimateId, n);
      return {
        estimateId: c.estimateId, estimateNumber: c.estimateNumber, type: "change_order" as const, n, date: c.date,
        value: round2(c.net), hours: round2(c.hours), estimatorId: c.estimatorId, versionRef: c.id,
      };
    });
}

/** "Original", "Amendment 2", "Change order 1". */
export function entryLabel(x: Pick<SalesEntry, "type" | "n">): string {
  if (x.type === "original") return "Original";
  return `${x.type === "amendment" ? "Amendment" : "Change order"} ${x.n}`;
}

export interface VersionLineDiff {
  added: VersionLine[];
  removed: VersionLine[];
  repriced: { line: VersionLine; from: number; to: number }[];
}

/**
 * Lines added, removed and repriced between two accepted versions (RP-C1).
 * Undefined when either version was saved before lines were recorded.
 */
export function versionLineDiff(prev: SalesVersion | undefined, next: SalesVersion | undefined): VersionLineDiff | undefined {
  if (!prev?.lines || !next?.lines) return undefined;
  const before = new Map(prev.lines.map((l) => [l.id, l]));
  const after = new Map(next.lines.map((l) => [l.id, l]));
  return {
    added: next.lines.filter((l) => !before.has(l.id)),
    removed: prev.lines.filter((l) => !after.has(l.id)),
    repriced: next.lines
      .filter((l) => before.has(l.id) && round2(before.get(l.id)!.total) !== round2(l.total))
      .map((l) => ({ line: l, from: before.get(l.id)!.total, to: l.total })),
  };
}

/** The accepted version an entry came from, and the one before it. */
export function entryVersions(e: Pick<SalesEstimate, "versions">, versionRef: string): { prev?: SalesVersion; next?: SalesVersion } {
  const list = acceptedVersions(e);
  const i = list.findIndex((v) => `v${v.version}` === versionRef);
  if (i < 0) return {};
  // Same pairing salesEntries uses: each accepted version against the one right before it.
  return { prev: list[i - 1], next: list[i] };
}
