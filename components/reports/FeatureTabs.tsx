'use client';

/*
  NEW report tabs, embedded from the feature prototype (features/):
    - Estimated vs Actual (feature 21), next to Jobs To Do
    - Estimating Feedback (feature 30), reads ?rate=
    - Job Margin, Income & Expense, Aged Receivables (feature 33, needs
      client confirmation), only for finance roles.
    - 30 Sep call (Books): Balance Sheet and Sales tax (BK-M6, BK-M13); in
      the Complete version Job Profit (BK-C3), 1099 Contractors and Budget
      (BK-C6). Every finance tab has a Cash / Accrual toggle (?basis=).
  Access follows the prototype's can() rules for the current demo user.
  The bodies read the prototype store; the bridge keeps it in sync with ours.
*/
import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BalanceSheetReport, BasisToggle, BudgetReport, ContractorsReport, JobProfitReport, SalesTaxReport } from '@/features/components/features/finance/books-reports';
import type { Basis } from '@/features/lib/rules/ledger';
import { Lock } from 'lucide-react';
import { useCurrentUser } from '@/features/lib/store';
import { can } from '@/features/lib/permissions';
import { ConfirmBadge, NewBadge } from '@/features/components/ui';
import { Performance } from '@/features/components/features/reports/job-performance-screen';
import { Feedback } from '@/features/components/features/reports/estimating-feedback-screen';
import { FinanceReportsBody } from '@/features/components/features/finance/reports-screen';

export type FeatureTabKey =
  | 'job_performance' | 'estimating_feedback' | 'job_margin' | 'income_expense' | 'aged_receivables'
  | 'balance_sheet' | 'sales_tax' | 'job_profit' | 'contractors' | 'budget';

export const FINANCE_TABS: FeatureTabKey[] = ['job_margin', 'income_expense', 'aged_receivables', 'balance_sheet', 'sales_tax', 'job_profit', 'contractors', 'budget'];

export const FEATURE_OF: Record<FeatureTabKey, number> = {
  job_performance: 21, estimating_feedback: 30, job_margin: 33, income_expense: 33, aged_receivables: 33,
  balance_sheet: 33, sales_tax: 33, job_profit: 33, contractors: 33, budget: 33,
};

/** Finance tabs are hidden for roles without finance.reports (like the prototype). */
export function useCanSeeFinanceReports() {
  const user = useCurrentUser();
  return can(user, 'finance.reports');
}

export function NewTabBadge({ tab }: { tab: FeatureTabKey }) {
  return <NewBadge feature={FEATURE_OF[tab]} className="ml-0.5" />;
}

export function FeatureTabBody({ tab }: { tab: FeatureTabKey }) {
  const finance = useCanSeeFinanceReports();
  if (FINANCE_TABS.includes(tab) && !finance) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl bg-white px-6 py-16 text-center shadow-lg">
        <Lock className="mb-3 h-8 w-8 text-gray-300" />
        <p className="font-bold text-gray-900">Finance reports are for the owner, the office manager and the bookkeeper.</p>
        <p className="mt-1 text-sm text-gray-500">Switch role in the Prototype bar to see them.</p>
      </div>
    );
  }
  return <FeatureTabInner tab={tab} />;
}

/** The finance tabs share one basis, kept in the URL (?basis=cash). Accrual by default. */
function useBasis(): [Basis, (b: Basis) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const basis: Basis = params.get('basis') === 'cash' ? 'cash' : 'accrual';
  const set = (b: Basis) => {
    const q = new URLSearchParams(params.toString());
    if (b === 'cash') q.set('basis', 'cash');
    else q.delete('basis');
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  return [basis, set];
}

function FeatureTabInner({ tab }: { tab: FeatureTabKey }) {
  const [basis, setBasis] = useBasis();
  return (
    <div className="min-w-0">
      {FINANCE_TABS.includes(tab) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <ConfirmBadge />
          <BasisToggle value={basis} onChange={setBasis} />
        </div>
      )}
      {tab === 'job_performance' && <Performance />}
      {tab === 'estimating_feedback' && <Feedback />}
      {tab === 'job_margin' && <FinanceReportsBody view="margin" basis={basis} />}
      {tab === 'income_expense' && <FinanceReportsBody view="income" basis={basis} />}
      {tab === 'aged_receivables' && <FinanceReportsBody view="receivables" basis={basis} />}
      {tab === 'balance_sheet' && <BalanceSheetReport basis={basis} />}
      {tab === 'sales_tax' && <SalesTaxReport basis={basis} />}
      {tab === 'job_profit' && <JobProfitReport basis={basis} />}
      {tab === 'contractors' && <ContractorsReport />}
      {tab === 'budget' && <BudgetReport basis={basis} />}
    </div>
  );
}
