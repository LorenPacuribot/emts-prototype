"use client";
/**
 * X-M2 (30 Sep call): "Accounting destination" at the top of Settings ›
 * Accounting. None, QuickBooks Online, or Estimate Master Books. Choosing
 * Books confirms that QuickBooks will be disconnected. In the prototype both
 * QuickBooks and Books stay visible afterwards, for comparison.
 */
import { useState } from "react";
import { BookOpen, Landmark, MinusCircle } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { accountingDestination, setAccountingDestination } from "@/features/lib/store/actions/finance";
import { can } from "@/features/lib/permissions";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { Card, CardLabel, ConfirmDialog, NewBadge, VersionBadge } from "@/features/components/ui";

type Dest = "none" | "qbo" | "books";

const OPTIONS: { value: Dest; label: string; body: string; icon: typeof Landmark; isNew?: boolean }[] = [
  { value: "none", label: "None", body: "Keep the books somewhere else. Nothing is exchanged.", icon: MinusCircle },
  { value: "qbo", label: "QuickBooks Online", body: "QuickBooks owns the ledger. Invoices, payments and bills are exchanged.", icon: Landmark },
  { value: "books", label: "Estimate Master Books", body: "Keep the full books here: journal, bank, bills and reports.", icon: BookOpen, isNew: true },
];

export function AccountingDestinationCard() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const current = accountingDestination(db);
  const [confirm, setConfirm] = useState<Dest>();
  const allowed = user.role === "owner" || can(user, "finance.connect");

  const choose = (d: Dest) => {
    if (d === current || !allowed) return;
    if (d === "books" && db.financeSettings.qbo.connected) return setConfirm(d);
    apply(d);
  };
  const apply = (d: Dest) => {
    if (act(setAccountingDestination, d).ok) toast.success(`Accounting destination: ${OPTIONS.find((o) => o.value === d)!.label}`, d === "books" ? "QuickBooks is disconnected. Both stay visible in the prototype." : undefined);
  };

  return (
    <Card className="mb-6 max-w-3xl p-5" data-tour="qb-destination">
      <CardLabel icon={<Landmark />}>
        <span className="inline-flex items-center gap-1.5">Accounting destination <VersionBadge item="X-M2" /></span>
      </CardLabel>
      <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Accounting destination">
        {OPTIONS.map((o) => {
          const on = current === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!allowed}
              onClick={() => choose(o.value)}
              className={cn(
                "flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed",
                on ? "border-primary-300 bg-primary-50 ring-1 ring-primary-200" : "border-gray-200 bg-white hover:border-gray-300",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-bold text-ink">
                <span className={cn("flex h-4 w-4 items-center justify-center rounded-full border", on ? "border-primary-600" : "border-gray-300")}>
                  {on && <span className="h-2 w-2 rounded-full bg-primary-600" />}
                </span>
                <o.icon className="h-4 w-4 text-gray-500" /> {o.label}
                {o.isNew && <NewBadge />}
              </span>
              <span className="text-xs text-gray-500">{o.body}</span>
            </button>
          );
        })}
      </div>
      {!allowed && <p className="mt-2 text-xs text-gray-500">The owner or the office manager chooses this.</p>}
      <ConfirmDialog
        open={confirm === "books"}
        onOpenChange={(v) => !v && setConfirm(undefined)}
        title="Switch to Estimate Master Books?"
        body="Switch to Estimate Master Books? QuickBooks will be disconnected."
        confirmLabel="Switch to Books"
        onConfirm={() => { apply("books"); setConfirm(undefined); }}
      />
    </Card>
  );
}
