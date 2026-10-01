/**
 * QuickBooks contact matching (QB-M3, QB-C1). Pure.
 *
 * On first connection each QuickBooks customer is compared with the
 * Estimate Master contacts:
 *  - matched (2 Oct 2026, D2): already linked, or EITHER the same email
 *    (any case) OR the same display name;
 *  - possible duplicate only when the email matches one contact and the name
 *    matches a different one, or the name matches more than one contact. The
 *    office decides: link to that contact, or create a new one;
 *  - QuickBooks only: created in QuickBooks with nothing close here. These
 *    go to Customer Review (QB-C1);
 * and every contact with no QuickBooks customer "will be created".
 */
import type { Customer, QboCustomer } from "@/features/types";

const email = (v?: string) => (v ?? "").trim().toLowerCase();
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
    const open = contacts.filter((c) => !taken.has(c.id));
    const byEmail = email(q.email) ? open.find((c) => email(c.email) === email(q.email)) : undefined;
    const byName = open.filter((c) => name(c.name) === name(q.displayName));
    const nameClash = byName.length > 1;
    const split = !!byEmail && byName.length === 1 && byName[0]!.id !== byEmail.id;
    if (nameClash || split) {
      const target = byEmail ?? byName[0]!;
      out.duplicates.push({ qbo: q, customerId: target.id, reason: nameClash ? `Same name as ${byName.length} contacts` : `Email matches ${byEmail!.name}, name matches ${byName[0]!.name}` });
      taken.add(target.id);
      continue;
    }
    const match = byEmail ?? byName[0];
    if (match) {
      out.matched.push({ qbo: q, customerId: match.id });
      taken.add(match.id);
      continue;
    }
    out.qboOnly.push(q);
  }
  out.willBeCreated = contacts.filter((c) => !taken.has(c.id)).map((c) => ({ id: c.id, name: c.name }));
  return out;
}

/** Customers created in QuickBooks still waiting for a decision (QB-C1). */
export const customersToReview = (qbo: QboCustomer[]) => qbo.filter((q) => q.createdInQbo && !q.customerId && !q.review);
