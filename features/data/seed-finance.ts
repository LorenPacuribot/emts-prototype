/**
 * Feature 33 seed: the accounting bridge, relative to "now".
 *
 * - Invoices from Phase 1 (INV-2026-1 paid with a $50 overpayment credit,
 *   INV-2026-2 edited in QuickBooks → variance flag, INV-2026-3 still queued).
 * - The Sherwin-Williams bill for JOB-2026-1-PO-01, billed for a gallon that
 *   hasn't arrived (match it to see the flag), its credit memo, and the card
 *   settlement that pays it.
 * - Change order CO-2026-1-01's supplemental invoice, rejected twice by
 *   QuickBooks (503) and escalated to the bookkeeper.
 * - Two QuickBooks receipts with no job (unallocated), a deleted check, fuel
 *   kept in overhead, a deposit still held as a liability, a $2,640 payment
 *   waiting for owner approval, and a correction posted out of a closed month.
 * - Reimbursements at each step, including a suspected duplicate.
 * - Books (patent 33): an operating account register with checks 1188-1190,
 *   bank and card feed lines to review (one matches check 1188, one is a
 *   transfer to exclude), four recurring overheads and a fuel-spend alert.
 */
import type { AccountMapping, CostCode, EstimateBaseline, ExchangeItem, FinanceRecord, MigrationTotal, ReimbursementClaim, Vendor } from "@/features/types";
import type { BankAccount, FeedTransaction, FinanceAlertRule, RecurringExpense, RegisterEntry } from "@/features/types/finance";
import { addDays, addMonths } from "@/features/lib/rules/dates";
import { lastExchangeRun, periodOf } from "@/features/lib/rules/finance";

/** Overhead codes the recurring expenses use (also added to older saved data, see books.ts). */
export const BOOK_COST_CODES = [
  { code: "INS", label: "Insurance — overhead" },
  { code: "OCC", label: "Rent and occupancy — overhead" },
  { code: "OFFICE", label: "Office and software — overhead" },
];

export function financeSeed(nowIso: string) {
  const d = (days: number) => addDays(nowIso, days);
  const p = (iso: string) => periodOf(iso);
  const lastMonth = p(addMonths(nowIso, -1));
  const twoMonths = p(addMonths(nowIso, -2));
  const midLastMonth = (() => {
    const x = new Date(addMonths(nowIso, -1));
    x.setDate(14);
    x.setHours(12, 0, 0, 0);
    return x.toISOString();
  })();
  const lastRun = lastExchangeRun(new Date(nowIso))?.toISOString() ?? d(-1);

  const r = (x: Omit<FinanceRecord, "period"> & { period?: string }): FinanceRecord => ({ period: p(x.date), ...x });

  const financeRecords: FinanceRecord[] = [
    r({ id: "FIN-1", type: "invoice", ref: "INV-2026-1", externalRef: "QBO-INV-1041", party: "Korah Singer", amount: 4160, salesTax: 343.2, date: d(-100), jobId: "JOB-2026-1", invoiceId: "INV-2026-1", origin: "estimate_master", paymentStatus: "paid", amountPaid: 4503.2, paymentDate: d(-95) }),
    r({ id: "FIN-2", type: "invoice", ref: "INV-2026-2", externalRef: "QBO-INV-1052", party: "Sam Sample", amount: 2233.33, salesTax: 184.25, date: d(-20), jobId: "JOB-2026-2", invoiceId: "INV-2026-2", origin: "estimate_master", paymentStatus: "unpaid",
      variance: { sent: 2283.33, current: 2233.33, at: d(-3) } }),
    r({ id: "FIN-3", type: "invoice", ref: "INV-2026-3", party: "Steven Omodth", amount: 4992.9, salesTax: 411.91, date: d(-2), jobId: "JOB-2026-5", invoiceId: "INV-2026-3", origin: "estimate_master", paymentStatus: "unpaid" }),
    r({ id: "FIN-16", type: "invoice", ref: "SUP-2026-1-01", party: "Korah Singer", amount: 1450, salesTax: 119.63, date: d(-28), jobId: "JOB-2026-1", origin: "estimate_master", paymentStatus: "unpaid", note: "Supplemental invoice for change order CO-2026-1-01." }),
    r({ id: "FIN-4", type: "deposit", ref: "DEP-2026-5", externalRef: "QBO-DEP-2019", party: "Steven Omodth", amount: 1664.3, date: d(-50), jobId: "JOB-2026-5", origin: "quickbooks", liability: true }),
    r({ id: "FIN-13", type: "payment", ref: "Check 5521 — Korah Singer", externalRef: "QBO-PMT-7712", party: "Korah Singer", amount: 4553.2, date: d(-95), jobId: "JOB-2026-1", paysRecordId: "FIN-1", origin: "quickbooks", accountCredit: 50, note: "Overpaid by $50.00 — held as account credit." }),
    r({ id: "FIN-5", type: "bill", ref: "SW 7132 invoice 88410-B", externalRef: "QBO-BILL-3301", party: "Sherwin-Williams #7132", amount: 1006, purchaseTax: 83, date: d(-6), jobId: "JOB-2026-1", poId: "JOB-2026-1-PO-01", costCode: "PAINT", origin: "quickbooks", paymentStatus: "paid", amountPaid: 1089, paymentDate: d(-3) }),
    r({ id: "FIN-6", type: "credit", ref: "SW credit memo CM-7132-221", externalRef: "QBO-CM-771", party: "Sherwin-Williams #7132", amount: 36, date: d(-4), jobId: "JOB-2026-1", creditOfRecordId: "FIN-5", poId: "JOB-2026-1-PO-01", costCode: "PAINT", origin: "quickbooks", note: "1 gal untinted primer returned (RET-1)." }),
    r({ id: "FIN-7", type: "card_settlement", ref: "Chase Visa ••4417 — statement 0918", externalRef: "QBO-CCP-5530", party: "Chase business card", amount: 1089, date: d(-3), paysRecordId: "FIN-5", origin: "quickbooks", note: "Pays SW 7132 invoice 88410-B. Not an expense." }),
    r({ id: "FIN-8", type: "bill", ref: "Brightline Drywall BD-2207", externalRef: "QBO-BILL-3288", party: "Brightline Drywall", amount: 640, date: d(-12), jobId: "JOB-2026-5", costCode: "SUB", origin: "quickbooks", paymentStatus: "unpaid" }),
    r({ id: "FIN-9", type: "receipt", ref: "Receipt 0544-31877", externalRef: "QBO-RCT-9120", party: "Home Depot #0544 — drop cloths and tape", amount: 86.4, purchaseTax: 7.13, date: d(-5), origin: "quickbooks" }),
    r({ id: "FIN-10", type: "receipt", ref: "Receipt 7248-40211", externalRef: "QBO-RCT-9118", party: "Sherwin-Williams #7248 — caulk and sundries for three jobs", amount: 214.37, purchaseTax: 17.69, date: d(-8), origin: "quickbooks" }),
    r({ id: "FIN-11", type: "check", ref: "Check 1188", externalRef: "QBO-CHK-1188", party: "Sunbelt Rentals — boom lift deposit", amount: 450, date: d(-9), jobId: "JOB-2026-1", costCode: "RENT", origin: "quickbooks", deletedInQbo: { at: d(-1) } }),
    r({ id: "FIN-17", type: "check", ref: "Check 1189", party: "Brightline Drywall", vendorId: "VEN-3", amount: 600, date: d(-12), jobId: "JOB-2026-5", costCode: "SUB", origin: "estimate_master", paymentMethod: "check", checkId: "REG-3", memo: "Drywall repair before paint" }),
    r({ id: "FIN-12", type: "receipt", ref: "Fuel card 3391", externalRef: "QBO-RCT-9125", party: "Shell — crew truck fuel", amount: 96.12, date: d(-2), costCode: "VEH", allocations: [{ overhead: true, amount: 96.12 }], origin: "quickbooks" }),
    r({ id: "FIN-14", type: "check", ref: "Check 1190", party: "Sherwin-Williams — September statement", amount: 2640.18, date: d(-1), origin: "estimate_master", approvalRequest: { by: "U-OFFICE", at: d(-1) }, note: "Above $2,500 — owner approval captured before it is recorded." }),
    { id: "FIN-15", type: "credit", ref: "COR-AUG-SUND", party: "Correction", amount: 45, date: midLastMonth, period: p(nowIso), postedFromClosedPeriod: lastMonth, jobId: "JOB-2026-1", origin: "estimate_master", note: "Sundries double-charged in a closed month. Posted to the current period." },
  ];

  const q = (x: Omit<ExchangeItem, "idempotencyKey">): ExchangeItem => ({ idempotencyKey: `${x.recordId}-v${x.version}`, ...x });
  const exchangeQueue: ExchangeItem[] = [
    q({ id: "EXQ-7", recordId: "FIN-6", version: 1, status: "sent", payload: { amount: 36, jobId: "JOB-2026-1", costCode: "PAINT", description: "Job allocation for credit CM-7132-221" }, queuedAt: d(-1), queuedBy: "U-OFFICE", sentAt: lastRun, attempts: [] }),
    q({ id: "EXQ-6", recordId: "FIN-8", version: 1, status: "queued", payload: { amount: 640, jobId: "JOB-2026-5", costCode: "SUB", description: "Job allocation for Brightline Drywall BD-2207" }, queuedAt: d(0), queuedBy: "U-OFFICE", attempts: [] }),
    q({ id: "EXQ-3", recordId: "FIN-3", version: 1, status: "queued", payload: { amount: 4992.9, jobId: "JOB-2026-5", description: "Invoice INV-2026-3" }, queuedAt: d(-2), queuedBy: "U-OFFICE", attempts: [] }),
    q({ id: "EXQ-4", recordId: "FIN-16", version: 1, status: "rejected", payload: { amount: 1450, jobId: "JOB-2026-1", description: "Supplemental invoice SUP-2026-1-01 (CO-2026-1-01)" }, queuedAt: d(-28), queuedBy: "U-OFFICE",
      sentAt: d(-27), attempts: [{ at: d(-28), ok: false, error: "503 Service Unavailable" }, { at: d(-27), ok: false, error: "503 Service Unavailable" }], escalatedAt: d(-27), simulateError: "503 Service Unavailable" }),
    q({ id: "EXQ-5", recordId: "FIN-5", version: 1, status: "accepted", payload: { amount: 1006, jobId: "JOB-2026-1", costCode: "PAINT", description: "Job allocation for SW 7132 invoice 88410-B" }, queuedAt: d(-6), queuedBy: "U-OFFICE", sentAt: d(-5), attempts: [{ at: d(-5), ok: true }] }),
    q({ id: "EXQ-2", recordId: "FIN-2", version: 1, status: "accepted", payload: { amount: 2283.33, jobId: "JOB-2026-2", description: "Invoice INV-2026-2" }, queuedAt: d(-20), queuedBy: "U-OFFICE", sentAt: d(-20), attempts: [{ at: d(-20), ok: true }] }),
    q({ id: "EXQ-1", recordId: "FIN-1", version: 1, status: "accepted", payload: { amount: 4160, jobId: "JOB-2026-1", description: "Invoice INV-2026-1" }, queuedAt: d(-100), queuedBy: "U-OFFICE", sentAt: d(-100), attempts: [{ at: d(-100), ok: true }] }),
  ];

  const reimbursements: ReimbursementClaim[] = [
    { id: "RMB-3", employeeId: "EMP-5", submittedBy: "U-OFFICE", amount: 38.5, date: d(-1), merchant: "Staples", description: "Printer ink for job binders", costCode: "SUND", receiptPhoto: "scan_0921.pdf", status: "submitted" },
    { id: "RMB-1", employeeId: "EMP-2", submittedBy: "U-CREW", amount: 42.18, date: d(-2), merchant: "Home Depot #0544", description: "Caulk and patching compound", jobId: "JOB-2026-1", costCode: "SUND", receiptPhoto: "IMG_2211.jpg", status: "submitted" },
    { id: "RMB-2", employeeId: "EMP-3", submittedBy: "U-CREW", amount: 86.4, date: d(-5), merchant: "Home Depot #0544", description: "Drop cloths and tape", jobId: "JOB-2026-1", costCode: "SUND", receiptPhoto: "IMG_2215.jpg", status: "crew_approved", crewApprovedBy: "U-CREW", crewApprovedAt: d(-4) },
    { id: "RMB-4", employeeId: "EMP-4", submittedBy: "U-CREW", amount: 24.99, date: d(-9), merchant: "Sherwin-Williams #7132", description: "Replacement sprayer tip", jobId: "JOB-2026-1", costCode: "SUND", receiptPhoto: "IMG_2190.jpg", status: "owner_approved",
      crewApprovedBy: "U-CREW", crewApprovedAt: d(-8), officeReviewedBy: "U-OFFICE", officeReviewedAt: d(-7), expenseRef: "EXP-8841" },
  ];

  const vendors: Vendor[] = [
    { id: "VEN-1", name: "Sherwin-Williams", status: "active", requestedBy: "U-OFFICE", requestedAt: d(-900), activatedBy: "U-OWNER", activatedAt: d(-899) },
    { id: "VEN-2", name: "Sunbelt Rentals", status: "active", requestedBy: "U-OFFICE", requestedAt: d(-600), activatedBy: "U-OWNER", activatedAt: d(-600) },
    { id: "VEN-3", name: "Brightline Drywall", status: "active", requestedBy: "U-OFFICE", requestedAt: d(-200), activatedBy: "U-OWNER", activatedAt: d(-199) },
    { id: "VEN-4", name: "Home Depot Pro", status: "active", requestedBy: "U-OFFICE", requestedAt: d(-500), activatedBy: "U-OWNER", activatedAt: d(-500) },
    { id: "VEN-5", name: "Graco Parts Direct", status: "requested", requestedBy: "U-OFFICE", requestedAt: d(-2) },
  ];

  const costCodes: CostCode[] = [
    { code: "PAINT", label: "Paint and primer", status: "approved", proposedBy: "U-BOOK", approvedBy: "U-OWNER", approvedAt: d(-400) },
    { code: "SUND", label: "Sundries and consumables", status: "approved", proposedBy: "U-BOOK", approvedBy: "U-OWNER", approvedAt: d(-400) },
    { code: "LAB", label: "Labour (allocated from Rule 3 totals)", status: "approved", proposedBy: "U-BOOK", approvedBy: "U-OWNER", approvedAt: d(-400) },
    { code: "SUB", label: "Subcontractors", status: "approved", proposedBy: "U-BOOK", approvedBy: "U-OWNER", approvedAt: d(-400) },
    { code: "RENT", label: "Equipment rental", status: "approved", proposedBy: "U-BOOK", approvedBy: "U-OWNER", approvedAt: d(-400) },
    { code: "VEH", label: "Vehicles and equipment — overhead", status: "approved", proposedBy: "U-BOOK", approvedBy: "U-OWNER", approvedAt: d(-400) },
    { code: "WARR", label: "Warranty rework", status: "proposed", proposedBy: "U-BOOK" },
    ...BOOK_COST_CODES.map((c) => ({ ...c, status: "approved" as const, proposedBy: "U-BOOK", approvedBy: "U-OWNER", approvedAt: d(-400) })),
  ];

  const bankAccounts: BankAccount[] = [
    { id: "BA-1", name: "Operating checking", kind: "checking", last4: "4471", openingBalance: 18250, openingDate: d(-40), nextCheckNumber: 1191 },
    { id: "BA-2", name: "Company Visa", kind: "credit_card", last4: "4417", openingBalance: 0, openingDate: d(-40) },
  ];
  const reg = (x: Omit<RegisterEntry, "accountId" | "createdBy" | "createdAt">): RegisterEntry => ({ accountId: "BA-1", createdBy: "U-OFFICE", createdAt: x.date, ...x });
  const checkRegister: RegisterEntry[] = [
    reg({ id: "REG-1", kind: "deposit", payee: "Korah Singer", amount: 4553.2, date: d(-38), purpose: "Check 5521 — INV-2026-1", status: "cleared", clearedAt: d(-36) }),
    reg({ id: "REG-2", kind: "check", number: 1188, payee: "Sunbelt Rentals", vendorId: "VEN-2", amount: 450, date: d(-9), purpose: "Boom lift deposit", jobId: "JOB-2026-1", costCode: "RENT", recordId: "FIN-11", status: "written" }),
    reg({ id: "REG-3", kind: "check", number: 1189, payee: "Brightline Drywall", vendorId: "VEN-3", amount: 600, date: d(-12), purpose: "Drywall repair before paint", jobId: "JOB-2026-5", costCode: "SUB", recordId: "FIN-17", status: "cleared", clearedAt: d(-10) }),
    reg({ id: "REG-4", kind: "check", number: 1190, payee: "Sherwin-Williams", vendorId: "VEN-1", amount: 2640.18, date: d(-1), purpose: "September statement", recordId: "FIN-14", status: "written" }),
  ];
  const ftx = (x: Omit<FeedTransaction, "status" | "origin" | "importedAt">): FeedTransaction => ({ status: "unreviewed", origin: "sandbox", importedAt: d(0), ...x });
  const feedTransactions: FeedTransaction[] = [
    ftx({ id: "FTX-1", source: "bank", accountId: "BA-1", externalId: "SBX-1", date: d(-6), description: "CHECK 1188", amount: -450 }),
    ftx({ id: "FTX-2", source: "bank", accountId: "BA-1", externalId: "SBX-2", date: d(-3), description: "ONLINE TRANSFER TO SAVINGS 8820", amount: -2000 }),
    ftx({ id: "FTX-3", source: "card", accountId: "BA-2", externalId: "SBX-3", date: d(-2), description: "GRACO PARTS DIRECT", amount: -129.99 }),
    ftx({ id: "FTX-4", source: "card", accountId: "BA-2", externalId: "SBX-4", date: d(-1), description: "SHELL OIL 57442", amount: -96.12 }),
    ftx({ id: "FTX-5", source: "card", accountId: "BA-2", externalId: "SBX-5", date: d(-1), description: "SUNBELT RENTALS RETURN CREDIT", amount: 75 }),
  ];
  const monthDay = (offsetDays: number) => d(offsetDays).slice(0, 10);
  const rec = (x: Omit<RecurringExpense, "active" | "createdBy" | "createdAt">): RecurringExpense => ({ active: true, createdBy: "U-BOOK", createdAt: d(-120), ...x });
  const recurringExpenses: RecurringExpense[] = [
    rec({ id: "REC-1", name: "General liability insurance", kind: "insurance", payee: "Hartwell Mutual", amount: 412.5, costCode: "INS", frequency: "monthly", startDate: monthDay(-117), reminderDays: 5, paymentMethod: "ach" }),
    rec({ id: "REC-2", name: "Crew truck lease", kind: "vehicle", payee: "Ford Credit", amount: 689, costCode: "VEH", frequency: "monthly", startDate: monthDay(-113), reminderDays: 3, paymentMethod: "ach" }),
    rec({ id: "REC-3", name: "Shop and storage rent", kind: "rent", payee: "Northgate Storage", amount: 1150, costCode: "OCC", frequency: "monthly", startDate: monthDay(-89), reminderDays: 5, paymentMethod: "check" }),
    rec({ id: "REC-4", name: "Estimate Master subscription", kind: "subscription", payee: "Estimate Master", amount: 149, costCode: "OFFICE", frequency: "monthly", startDate: monthDay(-100), reminderDays: 2, paymentMethod: "card" }),
  ];
  const financeAlertRules: FinanceAlertRule[] = [
    { id: "FAR-1", name: "Fuel and vehicle spend over $600 this month", metric: "category_spend", comparator: "above", threshold: 600, period: "month", costCode: "VEH", active: true, createdBy: "U-OWNER", createdAt: d(-60) },
    { id: "FAR-2", name: "Revenue below $10,000 this month", metric: "revenue", comparator: "below", threshold: 10000, period: "month", active: true, createdBy: "U-OWNER", createdAt: d(-60) },
  ];

  const accountMappings: AccountMapping[] = [
    { id: "MAP-A1", category: "Customer invoices", account: "4000 Painting Revenue", updatedBy: "U-BOOK", updatedAt: d(-400) },
    { id: "MAP-A2", category: "Paint and primer", account: "5010 Job Materials", updatedBy: "U-BOOK", updatedAt: d(-400) },
    { id: "MAP-A3", category: "Sundries and consumables", account: "5020 Job Supplies", updatedBy: "U-BOOK", updatedAt: d(-400) },
    { id: "MAP-A4", category: "Subcontractors", account: "5200 Subcontract Labor", updatedBy: "U-BOOK", updatedAt: d(-400) },
    { id: "MAP-A5", category: "Equipment rental", account: "5300 Equipment Rental", updatedBy: "U-BOOK", updatedAt: d(-400) },
    { id: "MAP-A6", category: "Vehicles and equipment", account: "6100 Vehicle Expense", updatedBy: "U-BOOK", updatedAt: d(-400) },
    { id: "MAP-A7", category: "Customer deposits", account: "2300 Customer Deposits (liability)", updatedBy: "U-BOOK", updatedAt: d(-400) },
    { id: "MAP-A8", category: "Sales tax collected", account: "2200 Sales Tax Payable", updatedBy: "U-BOOK", updatedAt: d(-400) },
  ];

  const year = new Date(nowIso).getFullYear();
  const totals: [MigrationTotal["category"], number, number][] = [
    ["revenue", 612400, 548900], ["materials", 118250, 104300], ["labour", 241800, 219500], ["subcontractors", 36700, 29900], ["overhead", 88400, 81200],
  ];
  const migrationTotals: MigrationTotal[] = totals.flatMap(([category, y1, y2], i) => [
    { id: `MIG-${year - 1}-${i}`, year: year - 1, category, amount: y1, batchId: "MIG-1" },
    { id: `MIG-${year - 2}-${i}`, year: year - 2, category, amount: y2, batchId: "MIG-1" },
  ]);

  // Estimate cost basis for the live jobs (features 21 and 33).
  const estimateBaselines: EstimateBaseline[] = [
    { jobId: "JOB-2026-1", approvedAt: d(-100), kind: "exterior", estimate: { labourHours: 160, labourCost: 5920, material: 2280, subcontractor: 0 } },
    { jobId: "JOB-2026-2", approvedAt: d(-60), kind: "interior", estimate: { labourHours: 90, labourCost: 3330, material: 1120, subcontractor: 0 } },
    { jobId: "JOB-2026-5", approvedAt: d(-50), kind: "interior", estimate: { labourHours: 58, labourCost: 2146, material: 690, subcontractor: 600 } },
  ];

  return {
    financeRecords,
    exchangeQueue,
    bankAccounts,
    checkRegister,
    feedTransactions,
    recurringExpenses,
    recurringOccurrences: [],
    financeAlertRules,
    financeNotices: [],
    otherIncome: [],
    reimbursements,
    vendors,
    costCodes,
    accountMappings,
    migrationTotals,
    estimateBaselines,
    financeSettings: {
      qbo: { connected: true, connectedBy: "U-OFFICE", connectedAt: d(-120), lastExchangeAt: lastRun, realm: "QBO-9130-4471" },
      closedPeriods: [twoMonths, lastMonth],
      gustoPostsJournal: true,
      migrationSignOff: { by: "U-BOOK", at: d(-60), batchId: "MIG-1" },
      jurisdiction: "Dallas County, TX",
    },
    counters: { fin: 17, exq: 7, rmb: 4, ven: 5, reg: 4, ftx: 5, rec: 4, far: 2 },
  };
}
