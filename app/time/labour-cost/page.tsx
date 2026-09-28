'use client';

import { Suspense } from 'react';
import { LabourCostScreen } from '@/features/components/features/workforce/labour-cost-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LabourCostScreen />
    </Suspense>
  );
}
