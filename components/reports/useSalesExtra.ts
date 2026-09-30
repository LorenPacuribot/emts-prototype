'use client';

/*
  Change-order sales entries for the reports and dashboard (RP-C3).
  Complete version only: in Minimal, reports book estimates and their
  amendments, and change orders stay on the job.
*/
import { useMemo } from 'react';
import { useDb } from '@/lib/store';
import { useDb as useFeatureDb } from '@/features/lib/store';
import { useIsOn } from '@/features/lib/feature-visibility';
import { changeOrderSalesEntries } from '@/features/lib/sales-entries';
import type { SalesEntry } from '@/features/lib/rules/sales-entries';

const NONE: SalesEntry[] = [];

export function useSalesExtra(): SalesEntry[] {
  const complete = useIsOn({ item: 'RP-C3' });
  const pdb = useFeatureDb((d) => d);
  const estimates = useDb().collections.estimates;
  return useMemo(() => {
    if (!complete) return NONE;
    const numbers = new Map(estimates.map((e) => [e.id, e.estimateNumber]));
    return changeOrderSalesEntries(pdb, (id) => numbers.get(id) ?? id);
  }, [complete, pdb, estimates]);
}
