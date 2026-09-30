"use client";
/**
 * QB-M3 (30 Sep call): the first-connection "Match your contacts" step, in the
 * migration section of Settings › Accounting. QuickBooks customers are compared
 * with the contacts here (features/lib/rules/qbo-contacts.ts): Matched, Will be
 * created in QuickBooks, and Possible duplicates. Each duplicate needs a choice:
 * link to the suggested contact, or create a new one.
 */
import { useMemo } from "react";
import { CheckCircle2, Users } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { completeContactMatch, decideContactMatch } from "@/features/lib/store/actions/finance";
import { matchContacts } from "@/features/lib/rules/qbo-contacts";
import { can } from "@/features/lib/permissions";
import { dateLong } from "@/features/lib/format";
import { userName } from "@/features/lib/store/helpers";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { Badge, Button, Card, CardLabel, NewBadge, VersionBadge } from "@/features/components/ui";

export function MatchContactsCard() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const cm = db.financeSettings.contactMatch;
  const m = useMemo(() => matchContacts(db.customers.filter((c) => !c.leadOnly), db.qboCustomers ?? []), [db.customers, db.qboCustomers]);
  const allowed = can(user, "finance.migration") || can(user, "finance.connect") || user.role === "owner";
  const nameOf = (id: string) => db.customers.find((c) => c.id === id)?.name ?? id;
  const open = m.duplicates.filter((d) => !cm?.decisions[d.qbo.id]).length;

  const finish = () => {
    const links = [
      ...m.matched.map((x) => ({ qboId: x.qbo.id, customerId: x.customerId, duplicate: false })),
      ...m.duplicates.map((x) => ({ qboId: x.qbo.id, customerId: x.customerId, duplicate: true })),
    ];
    const r = act(completeContactMatch, links);
    if (r.ok) toast.success("Contacts matched", `${m.willBeCreated.length} contacts will be created in QuickBooks with the next exchange.`);
  };

  const tile = (label: string, n: number, tone: string) => (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</div>
      <div className={cn("mt-1 font-heading text-2xl font-extrabold tabular-nums", tone)}>{n}</div>
    </div>
  );

  return (
    <Card className="p-4">
      <CardLabel icon={<Users />}>
        <span className="inline-flex items-center gap-1.5">Match your contacts <VersionBadge item="QB-M3" /></span>
      </CardLabel>
      <p className="mt-1 text-xs text-gray-500">First connection: each QuickBooks customer is matched to a contact here, so nobody is created twice.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {tile("Matched", m.matched.length, "text-green-700")}
        {tile("Will be created", m.willBeCreated.length, "text-ink")}
        {tile("Possible duplicates", m.duplicates.length, m.duplicates.length ? "text-amber-700" : "text-ink")}
      </div>
      {m.duplicates.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
          {m.duplicates.map((d) => {
            const choice = cm?.decisions[d.qbo.id];
            return (
              <li key={d.qbo.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink">QuickBooks: {d.qbo.displayName} <span className="font-normal text-gray-500">{d.qbo.email}</span></div>
                  <div className="text-gray-500">{d.reason} as <b className="text-gray-700">{nameOf(d.customerId)}</b></div>
                </div>
                {cm?.completedAt ? (
                  <Badge tone="green">{choice === "create" ? "Created as new" : `Linked to ${nameOf(d.customerId)}`}</Badge>
                ) : (
                  <span className="flex gap-1" role="radiogroup" aria-label={`${d.qbo.displayName}: link or create`}>
                    {(["link", "create"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={choice === c}
                        disabled={!allowed}
                        onClick={() => act(decideContactMatch, d.qbo.id, c)}
                        className={cn("rounded-lg border px-2.5 py-1 font-semibold", choice === c ? "border-primary-300 bg-primary-50 text-primary-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300")}
                      >
                        {c === "link" ? "Link to this customer" : "Create new"}
                      </button>
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {cm?.completedAt ? (
          <p className="flex items-center gap-1.5 text-xs text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> Matched by {userName(db, cm.completedBy)} on {dateLong(cm.completedAt)}.</p>
        ) : (
          <p className="text-xs text-gray-500">{open ? `Choose Link or Create new for ${open} possible ${open === 1 ? "duplicate" : "duplicates"}.` : "Ready to finish."}</p>
        )}
        {!cm?.completedAt && allowed && <Button size="sm" variant="primary" disabled={open > 0} onClick={finish}>Finish matching</Button>}
      </div>
    </Card>
  );
}
