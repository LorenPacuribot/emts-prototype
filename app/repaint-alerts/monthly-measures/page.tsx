'use client';

import { Suspense } from 'react';
import { MonthlyMeasuresScreen } from '@/features/components/features/service/measures-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MonthlyMeasuresScreen />
    </Suspense>
  );
}
