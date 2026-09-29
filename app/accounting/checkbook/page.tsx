'use client';

import { Suspense } from 'react';
import { CheckbookScreen } from '@/features/components/features/finance/books-screens';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CheckbookScreen />
    </Suspense>
  );
}
