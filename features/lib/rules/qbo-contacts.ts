/**
 * QuickBooks contact matching (QB-M3, QB-C1). Pure.
 *
 * On first connection each QuickBooks customer is compared with the
 * Estimate Master contacts:
 *  - matched: already linked, or the same email and the same name;
 *  - possible duplicate: the same email or phone under another name, or the
 *    same name with a different email and phone. The office decides: link to
 *    that contact, or create a new one;
 *  - QuickBooks only: created in QuickBooks with nothing close here. These
 *    go to Customer Review (QB-C1);
 * and every contact with no QuickBooks customer "will be created".
 */
import type { Customer, QboCustomer } from "@/features/types";

const email = (v?: string) => (v ?? "").trim().toLowerCase();
const phone = (v?: string) => (v ?? "").replace(/\D/g, "").slice(-10);
const name = (v?: string) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export interface ContactMatch {
  matched: { qbo: QboCustomer; customerId: string }[];
  duplicates: { qbo: QboCustomer; customerId: string; reason: string }[];
  qboOnly: QboCustomer[];
  willBeCreated: Pick<Customer, "id" | "name">[];
}

export function matchContacts(contacts: Pick<Customer, "id" | "name" | "email" | "phone">[], qbo: QboCustomer[]): ContactMatch {
  const out: ContactMatch = { matched: [], duplicates: [], qboOnly: [], willBeCreated: [] };
  const taken = new Set<string>();
  for (const q of qbo) {
    if (q.customerId) {
      out.matched.push({ qbo: q, customerId: q.customerId });
      taken.add(q.customerId);
      continue;
    }
    const exact = contacts.find((c) => !taken.has(c.id) && email(c.email) && email(c.email) === email(q.email) && name(c.name) === name(q.displayName));
    if (exact) {
      out.matched.push({ qbo: q, customerId: exact.id });
      taken.add(exact.id);
      continue;
    }
    const sameContact = contacts.find((c) => !taken.has(c.id) && ((email(c.email) && email(c.email) === email(q.email)) || (phone(c.phone) && phone(c.phone) === phone(q.phone))));
    const sameName = contacts.find((c) => !taken.has(c.id) && name(c.name) === name(q.displayName));
    const dup = sameContact ?? sameName;
    if (dup) {
      out.duplicates.push({ qbo: q, customerId: dup.id, reason: sameContact ? (email(dup.email) === email(q.email) ? "Same email, different name" : "Same phone, different name") : "Same name, different email and phone" });
      taken.add(dup.id);
      continue;
    }
    out.qboOnly.push(q);
  }
  out.willBeCreated = contacts.filter((c) => !taken.has(c.id)).map((c) => ({ id: c.id, name: c.name }));
  return out;
}

/** Customers created in QuickBooks still waiting for a decision (QB-C1). */
export const customersToReview = (qbo: QboCustomer[]) => qbo.filter((q) => q.createdInQbo && !q.customerId && !q.review);
