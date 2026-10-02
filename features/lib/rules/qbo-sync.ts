/**
 * QuickBooks sync (2 Oct 2026, D1). Replaces the hourly exchange window.
 *
 * - Sync on save: a record is queued and sent when it is saved, any time of
 *   day, any day.
 * - A failed send retries automatically after 1, 5, 30 and 120 minutes. When
 *   the last of those retries fails, the record moves to Needs Attention,
 *   where a person retries it.
 * - Parents go first: Customer, then Project, then Invoice, then Payment. A
 *   child waits until its parent is accepted.
 * - Repeat sends keep the idempotency key, so QuickBooks never gets a
 *   duplicate.
 * - Sync starts only once the income account and every tax region are mapped.
 */
import type { ExchangeItem, FinanceRecordType } from "@/features/types";

/** Minutes before each automatic retry. */
export const RETRY_DELAYS_MIN = [1, 5, 30, 120] as const;
/** The first send plus one per retry. */
export const MAX_AUTO_ATTEMPTS = RETRY_DELAYS_MIN.length + 1;
export const SYNC_LOG_PAGE_SIZE = 25;
export const SYNC_LOG_DEFAULT_DAYS = 7;

export type SyncKind = NonNullable<ExchangeItem["kind"]>;
export const SYNC_ORDER: SyncKind[] = ["customer", "project", "invoice", "payment", "other"];

export const SYNC_KIND_LABEL: Record<SyncKind, string> = {
  customer: "Customer", project: "Project", invoice: "Invoice", payment: "Payment", other: "Other",
};

/** Which sync kind a finance record is. Deposits and refunds hang off the invoice like payments. */
export function syncKindOf(type: FinanceRecordType): SyncKind {
  if (type === "invoice") return "invoice";
  if (type === "payment" || type === "deposit" || type === "refund") return "payment";
  return "other";
}

/** The kind that must be accepted first. */
export function parentKind(kind: SyncKind): SyncKind | undefined {
  return kind === "project" ? "customer" : kind === "invoice" ? "project" : kind === "payment" ? "invoice" : undefined;
}

/** Parent first, then oldest first. */
export function parentFirst<T extends { kind: SyncKind; queuedAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => SYNC_ORDER.indexOf(a.kind) - SYNC_ORDER.indexOf(b.kind) || a.queuedAt.localeCompare(b.queuedAt));
}

export const failuresOf = (attempts: ExchangeItem["attempts"]) => attempts.filter((a) => !a.ok).length;

/**
 * When the next automatic retry runs after `failures` failed attempts, the
 * last at `lastFailureAt`. Undefined once the retries have run out.
 */
export function nextRetryAt(failures: number, lastFailureAt: string): string | undefined {
  const delay = RETRY_DELAYS_MIN[failures - 1];
  if (failures < 1 || delay === undefined) return undefined;
  return new Date(new Date(lastFailureAt).getTime() + delay * 60_000).toISOString();
}

/** The retries have run out: the record goes to Needs Attention. */
export function retriesExhausted(failures: number): boolean {
  return failures >= MAX_AUTO_ATTEMPTS;
}

/** Due to be sent now (queued, waiting on a parent, or a retry whose time has come). */
export function dueToSend(q: Pick<ExchangeItem, "status" | "supersededBy" | "needsAttentionAt" | "nextRetryAt">, at: string, force = false): boolean {
  if (q.supersededBy || q.needsAttentionAt) return false;
  if (q.status === "queued" || q.status === "waiting") return true;
  return q.status === "rejected" && !!q.nextRetryAt && (force || q.nextRetryAt <= at);
}

/* ------------------------------ Start sync ------------------------------ */

/**
 * Why sync can't start yet, or undefined when it can. Every sync option is
 * required (tab 1, Component 1): income account, deposit account, card
 * payment method, and a QuickBooks tax account for every tax region.
 */
export function startSyncBlocker(p: {
  incomeAccount?: string; depositAccount?: string; cardMethod?: string; regionIds: string[]; taxMap?: Record<string, string>;
}): string | undefined {
  if (p.regionIds.some((id) => !p.taxMap?.[id]?.trim())) return "Map every tax region first";
  if (!p.incomeAccount?.trim() || !p.depositAccount?.trim() || !p.cardMethod?.trim()) return "Set the income account, deposit account and card payment method first";
  return undefined;
}

/** Default start date for "Send contacts and jobs from a start date": the first of this month (YYYY-MM-DD). */
export function defaultSyncStartDate(nowIso: string): string {
  const d = new Date(nowIso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/* ------------------------------- Sync log ------------------------------- */

/** Sync Log results, as tab 1 names them. */
export const SYNC_RESULTS = ["Sent", "Updated", "Received", "Failed"] as const;
export type SyncResult = (typeof SYNC_RESULTS)[number];
/** Sync Log entries are kept for 12 months. */
export const SYNC_LOG_RETENTION_MONTHS = 12;

export interface SyncLogRow {
  key: string;
  at: string;
  kind: SyncKind;
  emNumber: string;
  /** Where the EM number links to. */
  href?: string;
  qboRef?: string;
  direction: "to_qbo" | "from_qbo";
  result: SyncResult;
  /** What came back from QuickBooks ("Amount changed", "Deleted in QuickBooks"…), or the error of a failed send. */
  detail?: string;
}

/** The oldest day (YYYY-MM-DD) the Sync Log still keeps. */
export function retentionStart(nowIso: string): string {
  const d = new Date(nowIso);
  d.setMonth(d.getMonth() - SYNC_LOG_RETENTION_MONTHS);
  return d.toISOString().slice(0, 10);
}

/**
 * Rows in the date range (inclusive, YYYY-MM-DD) and the chosen record type
 * and result, never older than 12 months, newest first.
 */
export function filterSyncLog(
  rows: SyncLogRow[],
  f: { from?: string; to?: string; kind?: SyncKind | ""; result?: SyncResult | ""; nowIso?: string } = {},
): SyncLogRow[] {
  const oldest = f.nowIso ? retentionStart(f.nowIso) : undefined;
  const from = oldest && (!f.from || f.from < oldest) ? oldest : f.from;
  return rows
    .filter((r) => (!from || r.at.slice(0, 10) >= from) && (!f.to || r.at.slice(0, 10) <= f.to))
    .filter((r) => (!f.kind || r.kind === f.kind) && (!f.result || r.result === f.result))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** One page of rows (page 1 first) and the page count. */
export function pageOf<T>(rows: T[], page: number, size = SYNC_LOG_PAGE_SIZE): { rows: T[]; pages: number; page: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { rows: rows.slice((p - 1) * size, p * size), pages, page: p };
}

/** Default Sync Log range: the last 7 days, ending today. */
export function defaultSyncLogRange(nowIso: string): { from: string; to: string } {
  const to = nowIso.slice(0, 10);
  const from = new Date(new Date(nowIso).getTime() - (SYNC_LOG_DEFAULT_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

/* ---------------------------- Needs Attention --------------------------- */

/** A QuickBooks error in plain words. */
export function plainReason(error?: string): string {
  const e = (error ?? "").toLowerCase();
  if (/503|unavailable|timeout|timed out/.test(e)) return "QuickBooks didn't answer. It may have been down for maintenance.";
  if (/401|403|auth|token/.test(e)) return "The QuickBooks connection has expired. Reconnect QuickBooks in Settings › Accounting.";
  if (/duplicate|already exists/.test(e)) return "QuickBooks already has a record with this number.";
  if (/closed|period/.test(e)) return "The date falls in a period that is closed in QuickBooks.";
  if (/account|mapping/.test(e)) return "A QuickBooks account this record needs isn't mapped.";
  if (/tax/.test(e)) return "The sales tax on this record doesn't match a mapped tax region.";
  return error ? `QuickBooks turned it down: ${error}.` : "QuickBooks turned it down.";
}

/* --------------------------- Contacts on save --------------------------- */

/** What QuickBooks holds for a contact. A change here sends an update. */
export const customerFingerprint = (c: { name?: string; email?: string; phone?: string }) =>
  [c.name ?? "", (c.email ?? "").trim().toLowerCase(), (c.phone ?? "").replace(/\D/g, "")].join("|");

/* ----------------------------- Activity log ----------------------------- */

/** The activity log lines tab 1 lists, word for word. */
export const qboLogText = {
  connect: (company: string, user: string, at: string) => `Finance: QuickBooks Online company ${company} connected by ${user} at ${at}.`,
  disconnect: (user: string, at: string) => `Finance: QuickBooks Online disconnected by ${user} at ${at}.`,
  options: (user: string, field: string, from: string, to: string) => `Finance: QuickBooks sync options changed by ${user}: ${field} from ${from} to ${to}.`,
  sent: (recordType: string, recordNo: string, qbRef: string) => `Finance: ${recordType} ${recordNo} sent to QuickBooks as ${qbRef}.`,
  failed: (recordType: string, recordNo: string, attempts: number, error: string) => `Finance: ${recordType} ${recordNo} failed to sync after ${attempts} attempts. Reason: ${error}.`,
  variance: (invoiceNo: string, sent: string, current: string) => `Finance: Invoice ${invoiceNo} amount changed in QuickBooks from ${sent} to ${current}.`,
  deleted: (qbRef: string, recordType: string, recordNo: string) => `Finance: QuickBooks record ${qbRef} reported deleted. ${recordType} ${recordNo} flagged for review.`,
  review: (qbName: string, outcome: "linked to contact" | "created as contact" | "ignored", user: string) => `Finance: QuickBooks Customer ${qbName} ${outcome} by ${user}.`,
};
