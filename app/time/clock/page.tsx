'use client';

import { Suspense } from 'react';
import { ClockScreen } from '@/features/components/features/workforce/clock-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ClockScreen />
    </Suspense>
  );
}
