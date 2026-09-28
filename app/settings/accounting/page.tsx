'use client';

import { Suspense } from 'react';
import { SetupScreen } from '@/features/components/features/finance/setup-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SetupScreen />
    </Suspense>
  );
}
