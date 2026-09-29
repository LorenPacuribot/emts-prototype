'use client';

import { Suspense } from 'react';
import { PromotionsScreen } from '@/features/components/features/marketing/growth-screens';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PromotionsScreen />
    </Suspense>
  );
}
