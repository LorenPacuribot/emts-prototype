'use client';

import { Suspense } from 'react';
import { InsightsScreen } from '@/features/components/features/marketing/insights-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <InsightsScreen />
    </Suspense>
  );
}
