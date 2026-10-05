"use client";
/**
 * QB-C1 (30 Sep call, Complete version): Customer Review in Unallocated.
 * Customers created in QuickBooks (not sent from Estimate Master) wait here:
 * link to a contact, create as a contact, or ignore.
 */
import { useState } from "react";
import { UserCheck } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { reviewQboCustomer } from "@/features/lib/store/actions/finance";
import { customersToReview } from "@/features/lib/rules/qbo-contacts";
import { can } from "@/features/lib/permissions";
import { dateLong, money } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { Badge, Button, Card, CardLabel, EmptyState, NewBadge, Select, Table, TD, TH, THead, TR, VersionBadge } from "@/features/components/ui";

export function CustomerReview() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [linkTo, setLinkTo] = useState<Record<string, string>>({});
  const all = db.qboCustomers ?? [];
  const waiting = customersToReview(all);
  const done = all.filter((q) => q.createdInQbo && q.review);
  const allowed = can(user, "finance.code") || can(user, "finance.migration") || user.role === "owner";
  const contacts = db.customers.filter((c) => !c.leadOnly).sort((a, b) => a.name.localeCompare(b.name));

  const decide = (id: string, action: "link" | "create" | "ignore", name: string) => {
    const r = act(reviewQboCustomer, id, action, linkTo[id]);
    if (r.ok) toast.success(action === "link" ? `${name} linked` : action === "create" ? `${name} added as a contact` : `${name} ignored`);
  };

  return (
    <Card className="p-4" data-tour="qb-review">
      <CardLabel icon={<UserCheck />}>
        <span className="inline-flex items-center gap-1.5">Customers created in QuickBooks <VersionBadge item="QB-C1" /></span>
      </CardLabel>
      <p className="mt-1 text-xs text-gray-500">Someone added these in QuickBooks. Link each one to a contact here, add it as a contact, or ignore it.</p>
      <div className="mt-3">
        {waiting.length === 0 ? <EmptyState icon={<UserCheck />} title="Nothing to review" body="New customers made in QuickBooks appear here after an exchange." /> : (
          <Table>
            <THead><tr><TH>QuickBooks customer</TH><TH>Contact details</TH><TH className="text-right">Balance</TH><TH>Added</TH><TH className="text-right">Actions</TH></tr></THead>
            <tbody>
              {waiting.map((q) => (
                <TR key={q.id}>
                  <TD className="font-semibold">{q.displayName}<div className="text-xs font-normal text-gray-500">{q.id}</div></TD>
                  <TD className="text-xs">{q.email}<div className="text-gray-500">{q.phone}</div></TD>
                  <TD className="text-right tabular-nums">{money(q.balance)}</TD>
                  <TD>{dateLong(q.lastUpdatedAt)}</TD>
                  <TD className="text-right">
                    {allowed && (
                      <span className="inline-flex flex-wrap justify-end gap-1.5">
                        <Select aria-label={`Contact to link ${q.displayName} to`} value={linkTo[q.id] ?? ""} onChange={(e) => setLinkTo({ ...linkTo, [q.id]: e.target.value })} className="h-8 w-40">
                          <option value="">Choose contact…</option>
                          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                        <Button size="sm" disabled={!linkTo[q.id]} onClick={() => decide(q.id, "link", q.displayName)}>Link to contact</Button>
                        <Button size="sm" variant="primary" onClick={() => decide(q.id, "create", q.displayName)}>Create as contact</Button>
                        <Button size="sm" variant="secondary" onClick={() => decide(q.id, "ignore", q.displayName)}>Ignore</Button>
                      </span>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      {done.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-gray-600">
          {done.map((q) => (
            <li key={q.id} className="flex items-center gap-2">
              <Badge tone={q.review!.status === "ignored" ? "gray" : "green"}>{q.review!.status === "linked" ? "Linked" : q.review!.status === "created" ? "Created" : "Ignored"}</Badge>
              {q.displayName}{q.customerId ? ` → ${db.customers.find((c) => c.id === q.customerId)?.name ?? q.customerId}` : ""}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
