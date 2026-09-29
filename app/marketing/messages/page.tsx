'use client';

import { Suspense } from 'react';
import { MessagesScreen } from '@/features/components/features/marketing/growth-screens';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MessagesScreen />
    </Suspense>
  );
}
