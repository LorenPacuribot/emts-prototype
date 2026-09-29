'use client';

import { Suspense } from 'react';
import { FeedsScreen } from '@/features/components/features/finance/books-screens';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <FeedsScreen />
    </Suspense>
  );
}
