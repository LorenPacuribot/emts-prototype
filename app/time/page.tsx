'use client';

import { Suspense } from 'react';
import { TimeReviewScreen } from '@/features/components/features/workforce/time-review-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TimeReviewScreen />
    </Suspense>
  );
}
