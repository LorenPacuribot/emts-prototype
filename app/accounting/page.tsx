'use client';

import { Suspense } from 'react';
import { AccountingScreen } from '@/features/components/features/finance/accounting-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AccountingScreen />
    </Suspense>
  );
}
