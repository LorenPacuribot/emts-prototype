'use client';

import { Suspense } from 'react';
import { BatchesScreen } from '@/features/components/features/workforce/batches-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BatchesScreen />
    </Suspense>
  );
}
