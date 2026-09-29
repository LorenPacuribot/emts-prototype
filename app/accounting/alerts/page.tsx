'use client';

import { Suspense } from 'react';
import { AlertsScreen } from '@/features/components/features/finance/books-screens';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AlertsScreen />
    </Suspense>
  );
}
