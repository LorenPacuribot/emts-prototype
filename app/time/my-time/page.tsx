'use client';

import { Suspense } from 'react';
import { MyTimeScreen } from '@/features/components/features/workforce/my-time-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MyTimeScreen />
    </Suspense>
  );
}
