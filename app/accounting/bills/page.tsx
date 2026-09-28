'use client';

import { Suspense } from 'react';
import { BillsScreen } from '@/features/components/features/finance/bills-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BillsScreen />
    </Suspense>
  );
}
