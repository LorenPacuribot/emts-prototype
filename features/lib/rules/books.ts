/**
 * Feature 33 books (patent §33): checkbook register balances, recurring
 * expense schedules, feed matching, financial alerts and search across every
 * finance record. Pure: the store actions and screens share these.
 */
import type { Database, FinanceRecord } from "@/features/types";
import type {
  AlertDefaults, BankAccount, FeedTransaction, FinanceAlert, FinanceAlertRule, Frequency, RecurringExpense, RegisterEntry,
} from "@/features/types/finance";
import { roundMoney } from "./rounding";

export const DEFAULT_ALERTS: AlertDefaults = { highExpenseFactor: 0.5, rollingMonths: 3, marginDropPts: 5 };
export const DEFAULT_AR_TERMS = 30;
const DAY = 86_400_000;

const dayOf = (iso: string) => iso.slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(dayOf(b)) - Date.parse(dayOf(a))) / DAY);

/* ------------------------------ Register ----------------------------- */

export interface RegisterLine { entry: RegisterEntry; balance: number }

/** Running balance, oldest first. Voided lines stay listed and count zero. */
export function registerLines(account: BankAccount, entries: RegisterEntry[]): { lines: RegisterLine[]; balance: number; cleared: number } {
  let balance = account.openingBalance;
  let cleared = account.openingBalance;
  const lines = entries
    .filter((e) => e.accountId === account.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((entry) => {
      if (entry.status !== "void") {
        const signed = entry.kind === "deposit" ? entry.amount : -entry.amount;
        balance = roundMoney(balance + signed);
        if (entry.status === "cleared") cleared = roundMoney(cleared + signed);
      }
      return { entry, balance };
    });
  return { lines, balance, cleared };
}

/* ------------------------------ Recurring ---------------------------- */

const STEP_MONTHS: Record<Exclude<Frequency, "weekly">, number> = { monthly: 1, quarterly: 3, annual: 12 };

/** Adds months keeping the start's day of month, clamped to short months (31 Jan → 28/29 Feb). */
function addMonthsClamped(startDay: string, months: number): string {
  const [y, m, d] = startDay.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Due dates (YYYY-MM-DD) from the schedule that fall inside [from, to]. */
export function recurringDueDates(rec: Pick<RecurringExpense, "startDate" | "endDate" | "frequency">, from: string, to: string): string[] {
  const start = dayOf(rec.startDate);
  const end = rec.endDate ? dayOf(rec.endDate) : undefined;
  const out: string[] = [];
  for (let i = 0; i < 1000; i++) {
    const due = rec.frequency === "weekly"
      ? new Date(Date.parse(start) + i * 7 * DAY).toISOString().slice(0, 10)
      : addMonthsClamped(start, i * STEP_MONTHS[rec.frequency]);
    if (due > dayOf(to) || (end && due > end)) break;
    if (due >= dayOf(from)) out.push(due);
  }
  return out;
}

/** Annualised cost of a schedule (for the monthly total). */
export function monthlyEquivalent(rec: Pick<RecurringExpense, "amount" | "frequency">): number {
  const perYear = { weekly: 52, monthly: 12, quarterly: 4, annual: 1 }[rec.frequency];
  return roundMoney((rec.amount * perYear) / 12);
}

/* -------------------------------- Feeds ------------------------------ */

/** Existing records a feed line probably is: same amount (to the cent), within 5 days. */
export function feedMatches(db: Pick<Database, "financeRecords">, txn: FeedTransaction): FinanceRecord[] {
  const target = Math.abs(txn.amount);
  const moneyOut = txn.amount < 0;
  return db.financeRecords.filter((r) => {
    if (r.voidedAt || r.deletedInQbo || r.feedTxnId) return false;
    const out = ["bill", "receipt", "check", "card_settlement", "refund"].includes(r.type);
    if (out !== moneyOut) return false;
    const gross = roundMoney(r.amount + (r.purchaseTax ?? 0) + (r.salesTax ?? 0));
    return (Math.abs(gross - target) < 0.005 || Math.abs(r.amount - target) < 0.005) && Math.abs(daysBetween(r.date, txn.date)) <= 5;
  });
}

/** Parses a bank CSV export: date, description, amount (or debit/credit columns). */
export function parseFeedCsv(text: string): { rows: { date: string; description: string; amount: number }[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: { date: string; description: string; amount: number }[] = [];
  const errors: string[] = [];
  if (!lines.length) return { rows, errors: ["The file is empty."] };
  const split = (l: string) => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim()).filter((_, i, a) => i < a.length - 1 || a[i] !== "");
  const head = split(lines[0]!).map((h) => h.toLowerCase());
  const hasHeader = head.some((h) => /date|description|amount|debit|credit/.test(h));
  const col = (name: RegExp) => head.findIndex((h) => name.test(h));
  const iDate = hasHeader ? col(/date/) : 0;
  const iDesc = hasHeader ? col(/desc|payee|memo|name/) : 1;
  const iAmt = hasHeader ? col(/^amount/) : 2;
  const iDebit = hasHeader ? col(/debit|withdraw/) : -1;
  const iCredit = hasHeader ? col(/credit|deposit/) : -1;
  lines.slice(hasHeader ? 1 : 0).forEach((l, n) => {
    const c = split(l);
    const num = (i: number) => (i >= 0 && c[i] ? Number(c[i]!.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1")) : NaN);
    const rawDate = c[iDate] ?? "";
    const us = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    const date = us ? `${us[3]!.length === 2 ? `20${us[3]}` : us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}` : rawDate.slice(0, 10);
    let amount = num(iAmt);
    if (Number.isNaN(amount) && (iDebit >= 0 || iCredit >= 0)) amount = (Number.isNaN(num(iCredit)) ? 0 : num(iCredit)) - (Number.isNaN(num(iDebit)) ? 0 : Math.abs(num(iDebit)));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return void errors.push(`Line ${n + (hasHeader ? 2 : 1)}: date "${rawDate}" not recognised`);
    if (Number.isNaN(amount) || amount === 0) return void errors.push(`Line ${n + (hasHeader ? 2 : 1)}: no amount`);
    rows.push({ date, description: c[iDesc] || "(no description)", amount: roundMoney(amount) });
  });
  return { rows, errors };
}

/* -------------------------------- Alerts ----------------------------- */

const periodStart = (nowIso: string, p: FinanceAlertRule["period"]): string => {
  const d = new Date(nowIso);
  if (p === "week") return new Date(d.getTime() - ((d.getDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
  const m = p === "month" ? d.getMonth() : p === "quarter" ? Math.floor(d.getMonth() / 3) * 3 : 0;
  return `${d.getFullYear()}-${String(m + 1).padStart(2, "0")}-01`;
};

const COSTS = ["bill", "receipt", "check"];
const liveCost = (r: FinanceRecord) => COSTS.includes(r.type) && !r.voidedAt && !r.deletedInQbo && !r.approvalRequest && !r.paysRecordId;
const gross = (r: FinanceRecord) => roundMoney(r.amount + (r.purchaseTax ?? 0));
const monthKey = (iso: string) => iso.slice(0, 7);

/** Value of a contractor rule's metric over its current period. */
export function ruleValue(db: Database, rule: FinanceAlertRule, nowIso: string): number {
  const from = periodStart(nowIso, rule.period);
  const inPeriod = (iso: string) => dayOf(iso) >= from && dayOf(iso) <= dayOf(nowIso);
  const costs = db.financeRecords.filter((r) => liveCost(r) && inPeriod(r.date));
  const revenue = roundMoney(db.financeRecords.filter((r) => r.type === "invoice" && !r.deletedInQbo && inPeriod(r.date)).reduce((a, r) => a + r.amount, 0));
  const vendorName = rule.vendorId ? db.vendors.find((v) => v.id === rule.vendorId)?.name : undefined;
  switch (rule.metric) {
    case "total_expenses": return roundMoney(costs.reduce((a, r) => a + gross(r), 0));
    case "category_spend": return roundMoney(costs.filter((r) => r.costCode === rule.costCode).reduce((a, r) => a + gross(r), 0));
    case "vendor_spend": return roundMoney(costs.filter((r) => r.vendorId === rule.vendorId || (!!vendorName && r.party.toLowerCase().includes(vendorName.toLowerCase()))).reduce((a, r) => a + gross(r), 0));
    case "revenue": return revenue;
    case "gross_margin": {
      const cost = costs.reduce((a, r) => a + gross(r), 0);
      return revenue ? roundMoney(((revenue - cost) / revenue) * 100) : 0;
    }
    case "ar_overdue": return roundMoney(overdueReceivables(db, nowIso).reduce((a, x) => a + x.open, 0));
    case "ap_overdue": return roundMoney(overduePayables(db, nowIso).reduce((a, x) => a + x.open, 0));
    case "other_income": return roundMoney((db.otherIncome ?? []).filter((i) => !i.voidedAt && inPeriod(i.date)).reduce((a, i) => a + i.amount, 0));
  }
}

export function overdueReceivables(db: Database, nowIso: string) {
  const terms = db.financeSettings.arTermsDays ?? DEFAULT_AR_TERMS;
  return db.financeRecords
    .filter((r) => r.type === "invoice" && !r.deletedInQbo && r.paymentStatus !== "paid")
    .map((r) => ({ r, open: roundMoney(r.amount + (r.salesTax ?? 0) - (r.amountPaid ?? 0)), days: daysBetween(r.date, nowIso) - terms }))
    .filter((x) => x.open > 0.005 && x.days > 0);
}

export function billDueDate(db: Database, r: FinanceRecord): string {
  if (r.dueDate) return dayOf(r.dueDate);
  const v = db.vendors.find((x) => x.id === r.vendorId || x.name === r.party);
  return new Date(Date.parse(dayOf(r.date)) + (v?.termsDays ?? 30) * DAY).toISOString().slice(0, 10);
}

export function overduePayables(db: Database, nowIso: string) {
  return db.financeRecords
    .filter((r) => r.type === "bill" && !r.deletedInQbo && !r.voidedAt && r.paymentStatus !== "paid")
    .map((r) => ({ r, open: roundMoney(gross(r) - (r.amountPaid ?? 0)), days: daysBetween(billDueDate(db, r), nowIso) }))
    .filter((x) => x.open > 0.005 && x.days > 0);
}

/**
 * Every alert that holds right now. Keys are stable, so the same condition
 * raises one notice however often this runs.
 * `margins` supplies each in-progress job's projected and estimated margin.
 */
export function evaluateAlerts(db: Database, nowIso: string, margins: { jobId: string; projected: number | null; estimated: number | null }[] = []): FinanceAlert[] {
  const cfg = { ...DEFAULT_ALERTS, ...db.financeSettings.alertDefaults };
  const out: FinanceAlert[] = [];
  const thisMonth = monthKey(nowIso);

  // High expense: this month's spend in a cost code above the rolling average of earlier months.
  const costs = db.financeRecords.filter(liveCost);
  const codes = [...new Set(costs.map((r) => r.costCode).filter(Boolean))] as string[];
  const months = Array.from({ length: cfg.rollingMonths }, (_, i) => {
    const d = new Date(nowIso);
    d.setDate(1);
    d.setMonth(d.getMonth() - (i + 1));
    return monthKey(d.toISOString());
  });
  for (const code of codes) {
    const spend = (m: string) => costs.filter((r) => r.costCode === code && monthKey(r.date) === m).reduce((a, r) => a + gross(r), 0);
    const now = roundMoney(spend(thisMonth));
    const avg = roundMoney(months.reduce((a, m) => a + spend(m), 0) / months.length);
    if (avg > 0 && now > avg * (1 + cfg.highExpenseFactor)) {
      const label = db.costCodes.find((c) => c.code === code)?.label ?? code;
      out.push({ key: `high_expense:${code}:${thisMonth}`, kind: "high_expense", severity: "warn", title: `${label} spend is high this month`, detail: `$${now.toFixed(2)} so far against a ${cfg.rollingMonths}-month average of $${avg.toFixed(2)}.`, href: "/accounting/search?q=" + encodeURIComponent(code), value: now, threshold: avg });
    }
  }

  for (const x of overdueReceivables(db, nowIso)) {
    out.push({ key: `overdue_ar:${x.r.id}`, kind: "overdue_ar", severity: x.days > 30 ? "critical" : "warn", title: `${x.r.ref} is ${x.days} day${x.days === 1 ? "" : "s"} overdue`, detail: `${x.r.party} owes $${x.open.toFixed(2)}.`, href: "/reports?tab=aged_receivables", value: x.open });
  }
  for (const x of overduePayables(db, nowIso)) {
    out.push({ key: `overdue_ap:${x.r.id}`, kind: "overdue_ap", severity: x.days > 30 ? "critical" : "warn", title: `Bill ${x.r.ref} to ${x.r.party} is ${x.days} day${x.days === 1 ? "" : "s"} past due`, detail: `$${x.open.toFixed(2)} unpaid.`, href: "/accounting/bills", value: x.open });
  }
  for (const m of margins) {
    if (m.projected === null || m.estimated === null) continue;
    const drop = roundMoney((m.estimated - m.projected) * 100);
    if (drop >= cfg.marginDropPts) {
      out.push({ key: `declining_margin:${m.jobId}`, kind: "declining_margin", severity: drop >= cfg.marginDropPts * 2 ? "critical" : "warn", title: `${m.jobId} margin is slipping`, detail: `Projected ${(m.projected * 100).toFixed(1)}% against ${(m.estimated * 100).toFixed(1)}% estimated (${drop.toFixed(1)} points down).`, href: `/jobs/${m.jobId}` });
    }
  }
  for (const o of db.recurringOccurrences ?? []) {
    if (o.status !== "expected") continue;
    const rec = (db.recurringExpenses ?? []).find((r) => r.id === o.recurringId);
    if (!rec?.active) continue;
    const days = daysBetween(nowIso, o.dueDate);
    if (days <= rec.reminderDays) {
      out.push({ key: `recurring_due:${o.id}`, kind: "recurring_due", severity: days < 0 ? "warn" : "info", title: days < 0 ? `${rec.name} was due ${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? `${rec.name} is due today` : `${rec.name} is due in ${days} day${days === 1 ? "" : "s"}`, detail: `$${o.amount.toFixed(2)} to ${rec.payee}. Post it once paid.`, href: "/accounting/recurring", value: o.amount });
    }
  }
  for (const rule of db.financeAlertRules ?? []) {
    if (!rule.active) continue;
    const v = ruleValue(db, rule, nowIso);
    const hit = rule.comparator === "above" ? v > rule.threshold : v < rule.threshold;
    if (hit) {
      const unit = rule.metric === "gross_margin" ? "%" : "";
      const fmt = (n: number) => (unit ? `${n.toFixed(1)}%` : `$${n.toFixed(2)}`);
      out.push({ key: `rule:${rule.id}:${periodStart(nowIso, rule.period)}`, kind: "rule", severity: "warn", title: rule.name, detail: `${fmt(v)} this ${rule.period}, ${rule.comparator} your limit of ${fmt(rule.threshold)}.`, href: "/accounting/alerts", value: v, threshold: rule.threshold });
    }
  }
  return out;
}

/* -------------------------------- Search ----------------------------- */

export type SearchKind = "record" | "check" | "feed" | "recurring" | "income" | "vendor" | "claim";
export interface SearchHit { kind: SearchKind; id: string; title: string; detail: string; amount?: number; date?: string; href: string; matched: string[] }

/** Flattens every value on a record (nested too) into searchable text, with the field it came from. */
function fields(obj: unknown, prefix = ""): [string, string][] {
  if (obj === null || obj === undefined) return [];
  if (typeof obj !== "object") return [[prefix, String(obj)]];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => fields(v, prefix ? `${prefix}.${k}` : k));
}

/**
 * Search by any field: every word must appear somewhere on the record
 * (reference, party, amount, job, cost code, memo, dates, vendor...). Amounts
 * match "1006", "1,006" and "1006.00".
 */
export function searchFinance(db: Database, query: string, limit = 200): SearchHit[] {
  const words = query.toLowerCase().replace(/[$,]/g, "").split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const vendorName = (id?: string) => (id ? db.vendors.find((v) => v.id === id)?.name : undefined);
  const test = (obj: object, extra: string[] = []): string[] | null => {
    const f = [...fields(obj), ...extra.map((e) => ["name", e] as [string, string])].map(([k, v]) => [k, v.toLowerCase()] as const);
    const numeric = f.flatMap(([k, v]) => (/^-?\d+(\.\d+)?$/.test(v) ? [[k, Number(v).toFixed(2)] as const] : []));
    const all = [...f, ...numeric];
    const matched = new Set<string>();
    for (const w of words) {
      const hit = all.find(([, v]) => v.includes(w));
      if (!hit) return null;
      matched.add(hit[0].split(".")[0]!);
    }
    return [...matched];
  };
  const hits: SearchHit[] = [];
  const add = (h: Omit<SearchHit, "matched">, obj: object, extra: string[] = []) => {
    const m = test(obj, extra);
    if (m) hits.push({ ...h, matched: m });
  };
  for (const r of db.financeRecords) add({ kind: "record", id: r.id, title: `${r.ref} · ${r.party}`, detail: [r.type.replace("_", " "), r.jobId, r.costCode, r.memo ?? r.note].filter(Boolean).join(" · "), amount: r.amount, date: r.date, href: r.type === "bill" ? "/accounting/bills" : "/accounting" }, r, [vendorName(r.vendorId) ?? ""]);
  for (const e of db.checkRegister ?? []) add({ kind: "check", id: e.id, title: `${e.kind === "check" ? `Check #${e.number}` : "Deposit"} · ${e.payee}`, detail: [e.purpose, e.jobId, e.costCode, e.status].filter(Boolean).join(" · "), amount: e.kind === "check" ? -e.amount : e.amount, date: e.date, href: "/accounting/checkbook" }, e, [vendorName(e.vendorId) ?? ""]);
  for (const t of db.feedTransactions ?? []) add({ kind: "feed", id: t.id, title: t.description, detail: [t.source === "bank" ? "Bank feed" : "Card feed", t.status, t.costCode, t.jobId].filter(Boolean).join(" · "), amount: t.amount, date: t.date, href: "/accounting/feeds" }, t);
  for (const r of db.recurringExpenses ?? []) add({ kind: "recurring", id: r.id, title: `${r.name} · ${r.payee}`, detail: `${r.frequency} · ${r.costCode}${r.active ? "" : " · paused"}`, amount: -r.amount, href: "/accounting/recurring" }, r);
  for (const i of db.otherIncome ?? []) add({ kind: "income", id: i.id, title: `${i.source}`, detail: i.kind.replace("_", " "), amount: i.amount, date: i.date, href: "/accounting" }, i);
  for (const v of db.vendors) add({ kind: "vendor", id: v.id, title: v.name, detail: [v.status, v.category, v.termsDays ? `net ${v.termsDays}` : undefined].filter(Boolean).join(" · "), href: "/settings/accounting" }, v);
  for (const c of db.reimbursements) add({ kind: "claim", id: c.id, title: `${c.id} · ${c.merchant}`, detail: [c.description, c.jobId, c.costCode, c.status.replace("_", " ")].filter(Boolean).join(" · "), amount: -c.amount, date: c.date, href: "/accounting/reimbursements" }, c);
  return hits.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, limit);
}
