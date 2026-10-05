/** QA B-04: with Books as the destination, sent invoices and recorded payments post to the journal. */
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { ActionResult, Database, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { recordInvoicePayment, sendInvoice } from "@/features/lib/store/actions/invoices";
import { booksOf } from "@/features/lib/store/actions/ledger";
import { isBalanced } from "./ledger";

const NOW = "2026-10-05T15:00:00.000Z";

function run<A extends unknown[], R>(db: Database, userId: string, action: (db: Database, actor: User, ...args: A) => ActionResult<R>, ...args: A) {
  let result = { ok: false, error: "not run" } as ActionResult<R>;
  const next = produce(db, (draft) => {
    booksOf(draft as Database);
    result = action(draft as Database, draft.users.find((u) => u.id === userId)!, ...args);
  });
  return { db: next, result };
}

const draftInvoice = (db: Database) =>
  db.invoices.find((i) => i.status === "draft" && i.kind !== "credit_note" && db.customers.find((c) => c.id === db.jobs.find((j) => j.id === i.jobId)?.customerId)?.email)!;

describe("Books postings", () => {
  it("posts a sent invoice and its payment once each, balanced", () => {
    let db = produce(createSeed(NOW), (d) => { d.financeSettings.destination = "books"; });
    const inv = draftInvoice(db);
    expect(inv).toBeDefined();
    const sent = run(db, "U-OFFICE", sendInvoice, inv.id);
    expect(sent.result.ok).toBe(true);
    db = sent.db;
    const invEntries = db.books!.journal.filter((e) => e.source.kind === "invoice" && e.source.ref === inv.id);
    expect(invEntries).toHaveLength(1);
    expect(isBalanced(invEntries[0]!.lines)).toBe(true);

    // Sending again doesn't post twice.
    db = run(db, "U-OFFICE", sendInvoice, inv.id).db;
    expect(db.books!.journal.filter((e) => e.source.kind === "invoice" && e.source.ref === inv.id)).toHaveLength(1);

    const paid = run(db, "U-OFFICE", recordInvoicePayment, inv.id, { amount: 50, method: "check", reference: "1001" });
    expect(paid.result.ok).toBe(true);
    const pay = paid.db.books!.journal.filter((e) => e.source.kind === "payment" && e.memo === `Payment on ${inv.id}`);
    expect(pay).toHaveLength(1);
    expect(isBalanced(pay[0]!.lines)).toBe(true);
  });

  it("posts nothing when QuickBooks is the destination", () => {
    const db = produce(createSeed(NOW), (d) => { d.financeSettings.destination = "qbo"; });
    const inv = draftInvoice(db);
    const before = db.books?.journal.length ?? 0;
    const after = run(db, "U-OFFICE", sendInvoice, inv.id).db;
    expect(after.books!.journal.filter((e) => e.source.ref === inv.id)).toHaveLength(0);
    expect(after.books!.journal.length).toBeGreaterThanOrEqual(before);
  });
});
