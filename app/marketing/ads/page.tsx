'use client';

import { Suspense } from 'react';
import { AdsScreen } from '@/features/components/features/marketing/ads-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdsScreen />
    </Suspense>
  );
}
