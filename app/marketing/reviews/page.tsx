'use client';

import { Suspense } from 'react';
import { ReviewsScreen } from '@/features/components/features/marketing/growth-screens';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReviewsScreen />
    </Suspense>
  );
}
