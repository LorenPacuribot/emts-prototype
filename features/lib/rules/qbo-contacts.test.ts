import { describe, expect, it } from "vitest";
import { createSeed } from "@/features/data/seed";
import type { QboCustomer } from "@/features/types";
import { customersToReview, matchContacts } from "./qbo-contacts";

const q = (p: Partial<QboCustomer>): QboCustomer => ({ id: "Q1", displayName: "Ann Lee", balance: 0, active: true, lastUpdatedAt: "2026-09-01", ...p });

describe("matchContacts", () => {
  const contacts = [
    { id: "C1", name: "Ann Lee", email: "ann@x.co", phone: "(214) 555-0100" },
    { id: "C2", name: "Bob Ray", email: "bob@x.co", phone: "(214) 555-0200" },
    { id: "C3", name: "Cy Moe", email: "cy@x.co", phone: "" },
  ];

  it("matches the same email and name", () => {
    const r = matchContacts(contacts, [q({ email: "ANN@x.co " })]);
    expect(r.matched.map((m) => m.customerId)).toEqual(["C1"]);
    expect(r.willBeCreated.map((c) => c.id)).toEqual(["C2", "C3"]);
  });

  // 2 Oct 2026 (D2): EITHER the email OR the exact display name matches.
  it("matches the same name when neither side has an email", () => {
    const r = matchContacts([{ id: "C5", name: "Dee Fox", email: "", phone: "" }], [q({ id: "Q5", displayName: "Dee Fox" })]);
    expect(r.matched.map((m) => m.customerId)).toEqual(["C5"]);
    expect(r.duplicates).toHaveLength(0);
  });

  it("matches the same email under a different name", () => {
    const r = matchContacts(contacts, [q({ id: "Q2", displayName: "Robert Ray", email: "bob@x.co" })]);
    expect(r.matched.map((m) => m.customerId)).toEqual(["C2"]);
    expect(r.duplicates).toHaveLength(0);
  });

  it("flags a possible duplicate when the email matches one contact and the name another", () => {
    const r = matchContacts(contacts, [q({ id: "Q6", displayName: "Bob Ray", email: "ann@x.co" })]);
    expect(r.matched).toHaveLength(0);
    expect(r.duplicates.map((d) => [d.qbo.id, d.customerId, d.reason])).toEqual([["Q6", "C1", "Email matches Ann Lee, name matches Bob Ray"]]);
  });

  it("flags a possible duplicate when the name matches more than one contact", () => {
    const twins = [...contacts, { id: "C4", name: "Ann Lee", email: "ann.lee@other.co", phone: "" }];
    const r = matchContacts(twins, [q({ id: "Q7", displayName: "Ann Lee" })]);
    expect(r.duplicates.map((d) => [d.qbo.id, d.reason])).toEqual([["Q7", "Same name as 2 contacts"]]);
  });

  it("no longer matches on phone alone", () => {
    const r = matchContacts(contacts, [q({ id: "Q4", displayName: "Someone", phone: "214-555-0100" })]);
    expect(r.matched).toHaveLength(0);
    expect(r.duplicates).toHaveLength(0);
    expect(r.qboOnly.map((x) => x.id)).toEqual(["Q4"]);
  });

  it("keeps customers created in QuickBooks apart", () => {
    const r = matchContacts(contacts, [q({ id: "Q9", displayName: "Harbor HOA", email: "hoa@x.co", createdInQbo: true })]);
    expect(r.qboOnly.map((x) => x.id)).toEqual(["Q9"]);
    expect(customersToReview(r.qboOnly)).toHaveLength(1);
    expect(customersToReview([{ ...r.qboOnly[0]!, review: { status: "ignored", by: "u", at: "x" } }])).toHaveLength(0);
  });

  it("gives the seeded counts the migration step shows", () => {
    const db = createSeed("2026-06-10T15:00:00.000Z");
    const r = matchContacts(db.customers.filter((c) => !c.leadOnly), db.qboCustomers ?? []);
    expect([r.matched.length, r.duplicates.length, r.qboOnly.length]).toEqual([7, 1, 2]);
    expect(r.willBeCreated.length).toBe(db.customers.filter((c) => !c.leadOnly).length - 8);
  });
});
