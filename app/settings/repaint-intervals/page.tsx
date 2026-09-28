'use client';

import { Suspense } from 'react';
import { LifespanLibraryScreen } from '@/features/components/features/service/lifespan-library-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LifespanLibraryScreen />
    </Suspense>
  );
}
