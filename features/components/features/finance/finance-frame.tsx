"use client";
/**
 * NEW (feature 33, host needs client confirmation). Hosts the finance screens:
 * - Accounting, Sync Log, Needs Attention, Unallocated, Bills & Matching and
 *   Reimbursements: the standalone /accounting page (no live host).
 * - Vendors & Mappings: the NEW Settings › Accounting page, with the
 *   QuickBooks connection card (the live Payment Gateway pattern).
 * - Reports: Reports tabs (see reports-frame).
 * Estimators have no ledger or company-finance access (the rail item is
 * absent for them). Crew leads only see Reimbursements, to submit and
 * approve crew claims.
 */
import { AccountingDestinationCard } from "./destination-card";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowLeftRight, BarChart3, Bell, FileCheck2, Inbox, Landmark, Lock, ReceiptText, Repeat, Search, Settings2, Wallet, Waves, BookOpen } from "lucide-react";
import type { User } from "@/features/types";
import { useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { PageHeaderBelow, Screen } from "@/features/components/layout/screen";
import { AreaNav, type Area } from "@/features/components/layout/area-nav";
import { ConfirmBadge, EmptyState, FeatureGate, VersionBadge } from "@/features/components/ui";
import { useFeatureFilter } from "@/features/lib/feature-visibility";
import { SettingsShell } from "@/features/components/features/settings/settings-shell";
import { unallocated } from "@/features/lib/store/actions/finance";
import { useNeedsAttentionCount } from "./qbo-sync-parts";
import { QboConnectionCard } from "./qbo-connection-card";

export const FINANCE_TABS = [
  { key: "accounting", label: "Accounting", path: "/accounting", icon: Landmark },
  { key: "journal", label: "Journal", path: "/accounting/journal", icon: BookOpen },
  { key: "queue", label: "Sync Log", path: "/accounting/transfer-queue", icon: ArrowLeftRight },
  { key: "attention", label: "Needs Attention", path: "/accounting/needs-attention", icon: AlertTriangle },
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

/** The Accounting navigation's areas (L2). Reports and Vendors & Mappings live elsewhere. */
const FINANCE_AREAS: { key: string; label: string; pages: FinanceTabKey[] }[] = [
  { key: "overview", label: "Overview", pages: ["accounting", "journal", "alerts", "search"] },
  { key: "money", label: "Money in and out", pages: ["queue", "attention", "unallocated", "bills", "reimbursements"] },
  { key: "banking", label: "Banking", pages: ["checkbook", "feeds", "recurring"] },
];

/** Shorter names in the navigation only; page titles and breadcrumbs keep the full ones. */
const NAV_LABEL: Partial<Record<FinanceTabKey, string>> = { alerts: "Alerts", search: "Search", recurring: "Recurring" };

export function canSeeFinanceTab(user: User, key: FinanceTabKey) {
  if (key === "reimbursements") return can(user, "finance.access") || user.role === "crew_lead";
  if (key === "reports") return can(user, "finance.reports");
  return can(user, "finance.access");
}

export function FinanceFrame({ tab, children }: { tab: FinanceTabKey; children: ReactNode }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const meta = FINANCE_TABS.find((t) => t.key === tab)!;
  const attention = useNeedsAttentionCount();
  const toCode = unallocated(db).length;
  const claims = db.reimbursements.filter((c) => ["submitted", "crew_approved", "office_reviewed"].includes(c.status)).length;
  const toReview = (db.feedTransactions ?? []).filter((t) => t.status === "unreviewed").length;
  const alerts = (db.financeNotices ?? []).filter((n) => !n.dismissedAt && !n.readAt && n.severity !== "info").length;
  // New Features (dashboard): Journal is Books (bk); finance reports are feature 33;
  // the QuickBooks cards follow feature 33 or the QuickBooks integration.
  const featureOn = useFeatureFilter();
  const pageOn = (key: FinanceTabKey) => (key === "journal" ? featureOn({ featureKey: "bk" }) : key === "reports" ? featureOn({ feature: 33 }) : true);
  const qboCardsOn = featureOn({ feature: 33, featureKey: "qb" });

  if (tab === "setup") {
    return (
      <SettingsShell page="accounting" subtitle="QuickBooks connection, vendors, cost codes, account mappings, periods and migration.">
        <FeatureGate item="X-M2"><AccountingDestinationCard /></FeatureGate>
        {qboCardsOn && <QboConnectionCard />}
        {children}
      </SettingsShell>
    );
  }

  // Two levels (L2): Overview, Money in and out, Banking, then the chosen area's pages.
  // Role filtering is unchanged: an area with no page the user can see is hidden.
  const badgeFor = (key: FinanceTabKey) =>
    key === "attention" ? attention || undefined : key === "unallocated" ? toCode || undefined : key === "reimbursements" ? claims || undefined : key === "feeds" ? toReview || undefined : key === "alerts" ? alerts || undefined : undefined;
  const page = (key: FinanceTabKey) => {
    const t = FINANCE_TABS.find((x) => x.key === key)!;
    return { href: t.path, label: NAV_LABEL[key] ?? t.label, icon: t.icon, active: key === tab, badge: badgeFor(key), ...(key === "journal" ? { marker: <VersionBadge item="BK-M3" /> } : {}) };
  };
  const areas: Area[] = FINANCE_AREAS.map((a) => ({ key: a.key, label: a.label, pages: a.pages.filter((k) => canSeeFinanceTab(user, k) && pageOn(k)).map(page) })).filter((a) => a.pages.length > 0);
  const elsewhere = [
    ...(canSeeFinanceTab(user, "reports") && pageOn("reports") ? [{ href: FINANCE_TABS.find((t) => t.key === "reports")!.path, label: "Reports" }] : []),
    ...(canSeeFinanceTab(user, "setup") ? [{ href: FINANCE_TABS.find((t) => t.key === "setup")!.path, label: "Vendors & mappings" }] : []),
  ];
  const tabs = <AreaNav label="Accounting areas" areas={areas} elsewhere={elsewhere} note={<><ConfirmBadge /> <span>Nothing here moves money.</span></>} />;
  const area = FINANCE_AREAS.find((a) => (a.pages as readonly FinanceTabKey[]).includes(tab));

  return (
    <Screen roomy crumbs={[{ label: "Accounting", href: can(user, "finance.access") ? "/accounting" : "/accounting/reimbursements" }, ...(area ? [{ label: area.label }] : []), { label: meta.label }]}>
      {canSeeFinanceTab(user, tab) ? (
        <PageHeaderBelow.Provider value={tabs}>{children}</PageHeaderBelow.Provider>
      ) : (
        <>
        <div className="mb-6">{tabs}</div>
        <EmptyState
          icon={<Lock />}
          title="Finance is restricted"
          body={user.role === "crew_lead" ? "Crew leads use Reimbursements, in the tabs above, to submit and approve crew claims. The rest of Finance is for the owner, office manager and bookkeeper." : "Company finance is for the business owner, office manager and bookkeeper. Estimators keep their own-job performance view under Reports."}
        />
        </>
      )}
    </Screen>
  );
}

