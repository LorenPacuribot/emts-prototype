/*
  Customer view tracking for estimates.

  Every open of the customer link is recorded as one timestamp (oldest
  first). The replica client view (estimate.viewLog) and the prototype's
  public page (features Estimate.viewLog) keep their own logs; the screens
  merge both with viewSummary(), so an open counts once whichever page the
  customer used.
*/

/** Adds one open to a view log. Invalid timestamps are ignored. */
export function appendView(log: readonly string[] | undefined, at: string): string[] {
  const list = [...(log ?? [])];
  if (!at || Number.isNaN(Date.parse(at))) return list;
  list.push(at);
  return list.sort();
}

export interface ViewSummary {
  /** Number of opens. */
  count: number;
  /** Opens after the first one. */
  returns: number;
  firstAt?: string;
  lastAt?: string;
  /** Every open, oldest first. */
  all: string[];
}

/**
 * Merges view logs into one summary. The same timestamp in two logs is one
 * open (the bridge copies the first view across). `viewedAt` is used as a
 * one-entry log for estimates recorded before view logs existed.
 */
export function viewSummary(...logs: (readonly string[] | undefined)[]): ViewSummary {
  const all = [...new Set(logs.flatMap((l) => l ?? []).filter((x) => x && !Number.isNaN(Date.parse(x))))].sort();
  return { count: all.length, returns: Math.max(0, all.length - 1), firstAt: all[0], lastAt: all[all.length - 1], all };
}

/** A view log for an estimate, falling back to viewedAt for older records. */
export function viewLogOf(e: { viewLog?: string[]; viewedAt?: string } | undefined): string[] {
  if (!e) return [];
  if (e.viewLog?.length) return e.viewLog;
  return e.viewedAt ? [e.viewedAt] : [];
}

/** "Opened 3 times · first Sep 12, 2:14 PM · 2 returns" */
export function viewLabel(s: ViewSummary, fmt: (iso: string) => string): string {
  if (!s.count) return 'Not opened yet';
  const times = s.count === 1 ? 'Opened once' : `Opened ${s.count} times`;
  return `${times} · first ${fmt(s.firstAt!)}${s.returns ? ` · ${s.returns} return${s.returns === 1 ? '' : 's'}` : ''}`;
}
