'use client';

import { Suspense } from 'react';
import { MileageScreen } from '@/features/components/features/workforce/mileage-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MileageScreen />
    </Suspense>
  );
}
