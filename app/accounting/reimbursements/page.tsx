'use client';

import { Suspense } from 'react';
import { ReimbursementsScreen } from '@/features/components/features/finance/reimbursements-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReimbursementsScreen />
    </Suspense>
  );
}
