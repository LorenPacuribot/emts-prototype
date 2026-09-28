'use client';

import { Suspense } from 'react';
import { FollowUpsScreen } from '@/features/components/features/service/follow-ups-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <FollowUpsScreen />
    </Suspense>
  );
}
