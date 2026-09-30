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

  it("flags possible duplicates with the reason", () => {
    const r = matchContacts(contacts, [
      q({ id: "Q2", displayName: "Robert Ray", email: "bob@x.co" }),
      q({ id: "Q3", displayName: "Cy Moe", email: "cymoe@old.co", phone: "9725550000" }),
      q({ id: "Q4", displayName: "Someone", phone: "214-555-0100" }),
    ]);
    expect(r.duplicates.map((d) => [d.qbo.id, d.customerId, d.reason])).toEqual([
      ["Q2", "C2", "Same email, different name"],
      ["Q3", "C3", "Same name, different email and phone"],
      ["Q4", "C1", "Same phone, different name"],
    ]);
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
    expect([r.matched.length, r.duplicates.length, r.qboOnly.length]).toEqual([6, 2, 2]);
    expect(r.willBeCreated.length).toBe(db.customers.filter((c) => !c.leadOnly).length - 8);
  });
});
