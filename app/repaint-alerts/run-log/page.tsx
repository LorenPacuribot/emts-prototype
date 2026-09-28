'use client';

import { Suspense } from 'react';
import { RunLogScreen } from '@/features/components/features/service/run-log-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RunLogScreen />
    </Suspense>
  );
}
