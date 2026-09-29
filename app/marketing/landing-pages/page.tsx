'use client';

import { Suspense } from 'react';
import { LandingPagesScreen } from '@/features/components/features/marketing/landing-pages-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LandingPagesScreen />
    </Suspense>
  );
}
