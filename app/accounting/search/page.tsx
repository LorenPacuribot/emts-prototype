'use client';

import { Suspense } from 'react';
import { FinanceSearchScreen } from '@/features/components/features/finance/books-screens';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <FinanceSearchScreen />
    </Suspense>
  );
}
