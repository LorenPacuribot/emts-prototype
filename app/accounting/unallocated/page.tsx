'use client';

import { Suspense } from 'react';
import { UnallocatedScreen } from '@/features/components/features/finance/unallocated-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <UnallocatedScreen />
    </Suspense>
  );
}
