'use client';

/*
  NEW report tabs, embedded from the feature prototype (features/):
    - Estimated vs Actual (feature 21), next to Jobs To Do
    - Estimating Feedback (feature 30), reads ?rate=
    - Job Margin, Income & Expense, Aged Receivables (feature 33, needs
      client confirmation), only for finance roles.
  Access follows the prototype's can() rules for the current demo user.
  The bodies read the prototype store; the bridge keeps it in sync with ours.
*/
import React from 'react';
import { Lock } from 'lucide-react';
import { useCurrentUser } from '@/features/lib/store';
import { can } from '@/features/lib/permissions';
import { ConfirmBadge, NewBadge } from '@/features/components/ui';
import { Performance } from '@/features/components/features/reports/job-performance-screen';
import { Feedback } from '@/features/components/features/reports/estimating-feedback-screen';
import { FinanceReportsBody } from '@/features/components/features/finance/reports-screen';

export type FeatureTabKey = 'job_performance' | 'estimating_feedback' | 'job_margin' | 'income_expense' | 'aged_receivables';

export const FINANCE_TABS: FeatureTabKey[] = ['job_margin', 'income_expense', 'aged_receivables'];

export const FEATURE_OF: Record<FeatureTabKey, number> = {
  job_performance: 21, estimating_feedback: 30, job_margin: 33, income_expense: 33, aged_receivables: 33,
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
  return (
    <div className="min-w-0">
      {FINANCE_TABS.includes(tab) && (
        <div className="mb-4">
          <ConfirmBadge />
        </div>
      )}
      {tab === 'job_performance' && <Performance />}
      {tab === 'estimating_feedback' && <Feedback />}
      {tab === 'job_margin' && <FinanceReportsBody view="margin" />}
      {tab === 'income_expense' && <FinanceReportsBody view="income" />}
      {tab === 'aged_receivables' && <FinanceReportsBody view="receivables" />}
    </div>
  );
}
