'use client';

import { Suspense } from 'react';
import { RecurringScreen } from '@/features/components/features/finance/books-screens';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RecurringScreen />
    </Suspense>
  );
}
