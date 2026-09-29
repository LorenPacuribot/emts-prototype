'use client';

import { Suspense } from 'react';
import { SocialInboxScreen } from '@/features/components/features/marketing/inbox-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SocialInboxScreen />
    </Suspense>
  );
}
