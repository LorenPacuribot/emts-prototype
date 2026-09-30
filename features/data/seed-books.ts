/**
 * Estimate Master Books sample data (30 Sep call, BK).
 *
 * The journal is built by running business events through postingsFor, so
 * every seeded entry balances. The story:
 *  - Opening balances on 1 January.
 *  - JOB-2026-37: deposit invoice INV-2026-112 $2,000.00 paid by card and
 *    batched (fee $58.00), materials and a subcontractor billed, final invoice
 *    INV-2026-118 $5,958.00 (no tax on this job) moving the deposit into
 *    income, paid by cheque. Income for the job: $7,958.00; deposits held: $0.00.
 *  - JOB-2026-31: invoice with sales tax, paid; the tax is paid to the state.
 *  - Overheads, owner draw, a Gusto pay run.
 *  - JOB-2026-40: final invoice sent and unpaid (for write-off), a new deposit
 *    paid by card that has not reached the bank yet (Payments to deposit).
 */
import { CHART, cashLinesFor, postingsFor, type JournalEntry, type LedgerEvent, type LedgerAccount } from "@/features/lib/rules/ledger";
import { addDays } from "@/features/lib/rules/dates";

export interface BooksWriteOff {
  invoiceRef: string;
  amount: number;
  reason: string;
  by: string;
  at: string;
  entryId: string;
}

export interface BooksReconciliation {
  account: string;
  statementDate: string;
  statementBalance: number;
  at: string;
  by: string;
}

export interface BooksState {
  accounts: LedgerAccount[];
  journal: JournalEntry[];
  /** BK-C6: monthly budget per account number. */
  budget: Record<string, number>;
  writeOffs: BooksWriteOff[];
  reconciliations: BooksReconciliation[];
  /** BK-C5: the "Move from QuickBooks" wizard's finish. */
  movedFromQboAt?: string;
}

interface SeedEvent {
  days: number;
  event: LedgerEvent;
  ref: string;
  memo: string;
  party?: string;
  by?: string;
}

export function createBooksSeed(nowIso: string): BooksState {
  const day = (n: number) => addDays(nowIso, n).slice(0, 10);
  const year = new Date(nowIso).getFullYear();
  const events: SeedEvent[] = [
    { days: 0, ref: "OPENING", memo: "Opening balances", event: { kind: "opening_balances", balances: [
      { account: "1000", amount: 18500 }, { account: "1200", amount: 4200 }, { account: "2000", amount: 1850 }, { account: "2200", amount: 640 }, { account: "2300", amount: 920 },
    ] } },
    { days: -60, ref: "INV-2026-104", memo: "Final invoice", party: "Elena Marsh", event: { kind: "invoice", net: 3400, tax: 280.5, jobId: "JOB-2026-31" } },
    { days: -52, ref: "INV-2026-104", memo: "Payment received (transfer)", party: "Elena Marsh", event: { kind: "payment", amount: 3680.5, owed: 3680.5, jobId: "JOB-2026-31" } },
    { days: -45, ref: "CARD-2211", memo: "Fuel", party: "Shell", event: { kind: "card_purchase", amount: 186.4, account: "6000" } },
    { days: -41, ref: "INV-2026-112", memo: "Deposit invoice", party: "Hollis Family", event: { kind: "deposit_invoice", amount: 2000, jobId: "JOB-2026-37" } },
    { days: -40, ref: "INV-2026-112", memo: "Deposit paid by card", party: "Hollis Family", event: { kind: "card_payment", amount: 2000, owed: 2000, jobId: "JOB-2026-37" } },
    { days: -38, ref: "BATCH-0914", memo: "Card batch reached the bank", event: { kind: "card_batch", gross: 2000, fee: 58 } },
    { days: -33, ref: "CARD-2240", memo: "Estimating software", party: "Estimate Master", event: { kind: "card_purchase", amount: 79, account: "6500" } },
    { days: -31, ref: "BILL-7132-5581", memo: "Paint and primer", party: "Sherwin-Williams", event: { kind: "bill", amount: 1240, account: "5000", jobId: "JOB-2026-37" } },
    { days: -29, ref: "BILL-BD-311", memo: "Drywall repair", party: "Brightline Drywall", event: { kind: "bill", amount: 900, account: "5100", jobId: "JOB-2026-37" } },
    { days: -27, ref: "BILL-OPEN", memo: "Opening supplier balance paid", party: "Sherwin-Williams", event: { kind: "bill_paid", amount: 1850 } },
    { days: -25, ref: "CARD-STMT-08", memo: "Card bill paid", party: "Chase", event: { kind: "card_bill_paid", amount: 920 } },
    { days: -21, ref: "INV-2026-118", memo: "Final invoice", party: "Hollis Family", event: { kind: "invoice", net: 5958, tax: 0, jobId: "JOB-2026-37", depositsHeld: 2000 } },
    { days: -19, ref: "BILL-7132-5581", memo: "Bill paid", party: "Sherwin-Williams", event: { kind: "bill_paid", amount: 1240, account: "5000" } },
    { days: -18, ref: "TX-Q3", memo: "Sales tax paid to the state", party: "Texas Comptroller", event: { kind: "sales_tax_paid", amount: 920.5 } },
    { days: -16, ref: "DRAW-09", memo: "Owner draw", party: "Tim Skelly", event: { kind: "owner_draw", amount: 2500 } },
    { days: -14, ref: "GUSTO-0912", memo: "Gusto pay run", party: "Gusto", event: { kind: "payroll", wages: 6200, taxes: 520 } },
    { days: -12, ref: "INV-2026-118", memo: "Payment received (cheque)", party: "Hollis Family", event: { kind: "payment", amount: 5958, owed: 5958, jobId: "JOB-2026-37" } },
    { days: -10, ref: "BILL-ACME-2026", memo: "Liability insurance", party: "Acme Insurance", event: { kind: "bill", amount: 410, account: "6100" } },
    { days: -9, ref: "BILL-BD-322", memo: "Drywall repair", party: "Brightline Drywall", event: { kind: "bill", amount: 1200, account: "5100", jobId: "JOB-2026-40" } },
    { days: -9, ref: "BILL-OPW-77", memo: "Pressure washing", party: "Ortiz Pressure Washing", event: { kind: "bill", amount: 450, account: "5100", jobId: "JOB-2026-40" } },
    { days: -8, ref: "CARD-2267", memo: "Yard signs", party: "Signs Now", event: { kind: "card_purchase", amount: 250, account: "6400" } },
    { days: -6, ref: "INV-2026-121", memo: "Final invoice", party: "Nina Patel", event: { kind: "invoice", net: 4800, tax: 396, jobId: "JOB-2026-40" } },
    { days: -5, ref: "INV-2026-120", memo: "Deposit invoice", party: "Owen Brooks", event: { kind: "deposit_invoice", amount: 1500, jobId: "JOB-2026-41" } },
    { days: -3, ref: "INV-2026-120", memo: "Deposit paid by card", party: "Owen Brooks", event: { kind: "card_payment", amount: 1500, owed: 1500, jobId: "JOB-2026-41" } },
  ];
  const journal: JournalEntry[] = events.map((s, i) => {
    const date = s.days === 0 ? `${year}-01-01` : day(s.days);
    return {
      id: `JE-${i + 1}`, no: 1000 + i + 1, date, source: { kind: s.event.kind, ref: s.ref }, memo: s.memo, party: s.party,
      lines: postingsFor(s.event), cash: cashLinesFor(s.event), postedBy: s.event.kind === "payroll" ? "Gusto import" : "Grace Kim", postedAt: `${date}T15:00:00.000Z`,
    };
  });
  return {
    accounts: CHART.map((a) => ({ ...a })),
    journal,
    budget: { "4000": 14000, "5000": 2600, "5100": 1800, "6000": 250, "6300": 6000, "6400": 300, "6500": 100 },
    writeOffs: [],
    reconciliations: [],
  };
}
