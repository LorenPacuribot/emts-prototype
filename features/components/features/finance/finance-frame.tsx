"use client";
/**
 * NEW (feature 33, host needs client confirmation). Hosts the finance screens:
 * - Accounting, Transfer Queue, Unallocated, Bills & Matching and
 *   Reimbursements: the standalone /accounting page (no live host).
 * - Vendors & Mappings: the NEW Settings › Accounting page, with the
 *   QuickBooks connection card (the live Payment Gateway pattern).
 * - Reports: Reports tabs (see reports-frame).
 * Estimators have no ledger or company-finance access (the rail item is
 * absent for them). Crew leads only see Reimbursements, to submit and
 * approve crew claims.
 */
import type { ReactNode } from "react";
import { ArrowLeftRight, BarChart3, Bell, BookOpen, FileCheck2, Inbox, Landmark, Lock, ReceiptText, Repeat, Search, Settings2, Wallet, Waves } from "lucide-react";
import type { User } from "@/features/types";
import { useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { Screen } from "@/features/components/layout/screen";
import { SubNav } from "@/features/components/layout/sub-nav";
import { Button, ConfirmBadge, EmptyState, NewBadge } from "@/features/components/ui";
import { SettingsShell } from "@/features/components/features/settings/settings-shell";
import { dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { CheckCircle2, Wifi } from "lucide-react";
import { unallocated } from "@/features/lib/store/actions/finance";

export const FINANCE_TABS = [
  { key: "accounting", label: "Accounting", path: "/accounting", icon: Landmark },
  { key: "queue", label: "Transfer Queue", path: "/accounting/transfer-queue", icon: ArrowLeftRight },
  { key: "unallocated", label: "Unallocated", path: "/accounting/unallocated", icon: Inbox },
  { key: "bills", label: "Bills & Matching", path: "/accounting/bills", icon: FileCheck2 },
  { key: "reimbursements", label: "Reimbursements", path: "/accounting/reimbursements", icon: ReceiptText },
  { key: "checkbook", label: "Checkbook", path: "/accounting/checkbook", icon: Wallet },
  { key: "feeds", label: "Bank & Card Feeds", path: "/accounting/feeds", icon: Waves },
  { key: "recurring", label: "Recurring Expenses", path: "/accounting/recurring", icon: Repeat },
  { key: "alerts", label: "Financial Alerts", path: "/accounting/alerts", icon: Bell },
  { key: "search", label: "Search the Books", path: "/accounting/search", icon: Search },
  { key: "reports", label: "Reports", path: "/reports?tab=job_margin", icon: BarChart3 },
  { key: "setup", label: "Vendors & Mappings", path: "/settings/accounting", icon: Settings2 },
] as const;

export type FinanceTabKey = (typeof FINANCE_TABS)[number]["key"];

export function canSeeFinanceTab(user: User, key: FinanceTabKey) {
  if (key === "reimbursements") return can(user, "finance.access") || user.role === "crew_lead";
  if (key === "reports") return can(user, "finance.reports");
  return can(user, "finance.access");
}

export function FinanceFrame({ tab, children }: { tab: FinanceTabKey; children: ReactNode }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const meta = FINANCE_TABS.find((t) => t.key === tab)!;
  const rejected = db.exchangeQueue.filter((q) => q.status === "rejected" && !q.supersededBy).length;
  const toCode = unallocated(db).length;
  const claims = db.reimbursements.filter((c) => ["submitted", "crew_approved", "office_reviewed"].includes(c.status)).length;
  const toReview = (db.feedTransactions ?? []).filter((t) => t.status === "unreviewed").length;
  const alerts = (db.financeNotices ?? []).filter((n) => !n.dismissedAt && !n.readAt && n.severity !== "info").length;

  if (tab === "setup") {
    return (
      <SettingsShell page="accounting" subtitle="QuickBooks Online connection, vendors, cost codes, account mappings, periods and migration.">
        <QuickBooksConnectionCard />
        {children}
      </SettingsShell>
    );
  }

  return (
    <Screen
      crumbs={[{ label: "Accounting", href: can(user, "finance.access") ? "/accounting" : "/accounting/reimbursements" }, { label: meta.label }]}
      sidebar={
        <SubNav
          header={
            <div className="hidden lg:block">
              <div className="flex items-center gap-2 font-display text-sm font-bold text-ink"><BookOpen className="h-4 w-4 text-brand" /> Accounting <NewBadge feature={33} /></div>
              <div className="mt-1"><ConfirmBadge /></div>
              <div className="mt-0.5 text-xs text-gray-500">QuickBooks Online owns the ledger. Estimate Master owns the job. Nothing here moves money.</div>
            </div>
          }
          groups={[
            {
              title: "Accounting",
              items: FINANCE_TABS.filter((t) => t.key !== "setup" && canSeeFinanceTab(user, t.key)).map((t) => ({
                href: t.path, label: t.label, icon: t.icon,
                badge: t.key === "queue" ? rejected || undefined : t.key === "unallocated" ? toCode || undefined : t.key === "reimbursements" ? claims || undefined : t.key === "feeds" ? toReview || undefined : t.key === "alerts" ? alerts || undefined : undefined,
              })),
            },
          ]}
        />
      }
    >
      {canSeeFinanceTab(user, tab) ? (
        children
      ) : (
        <EmptyState
          icon={<Lock />}
          title="Finance is restricted"
          body={user.role === "crew_lead" ? "Crew leads use Reimbursements, in the menu, to submit and approve crew claims. The rest of Finance is for the owner, office manager and bookkeeper." : "Company finance is for the business owner, office manager and bookkeeper. Estimators keep their own-job performance view under Reports."}
        />
      )}
    </Screen>
  );
}

/**
 * NEW (33): QuickBooks Online connection, following the live Payment Gateway
 * page (status banner, "Test Connection"). The connection itself is simulated.
 */
function QuickBooksConnectionCard() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const q = db.financeSettings.qbo;
  return (
    <div className="mb-8 max-w-3xl space-y-4">
      <div className={`flex gap-3 rounded-xl border p-4 ${q.connected ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
        <CheckCircle2 className={`h-5 w-5 shrink-0 ${q.connected ? "text-green-600" : "text-red-600"}`} />
        <div className="text-sm">
          <div className="font-bold text-gray-900">{q.connected ? "Connected" : "Not Verified"}</div>
          <div className="text-gray-600">{q.connected ? `Company ${q.realm} · connected ${dateTime(q.connectedAt)} · last exchange ${dateTime(q.lastExchangeAt)}` : "Connect QuickBooks Online to exchange invoices, payments and bills."}</div>
        </div>
      </div>
      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <div className="text-xxs font-bold uppercase tracking-widest text-gray-400">QuickBooks Online</div>
        <p className="text-sm text-gray-600">QuickBooks owns the ledger. Estimate Master sends invoices, payments, deposits and job allocations, and receives bills. Nothing here moves money.</p>
        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          <Button disabled={!can(user, "finance.connect")} onClick={() => toast.success("Connection OK", "QuickBooks answered (simulated).")}><Wifi className="h-4 w-4" /> Test Connection</Button>
        </div>
      </div>
    </div>
  );
}
