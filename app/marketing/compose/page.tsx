'use client';

import { Suspense } from 'react';
import { ComposeScreen } from '@/features/components/features/marketing/compose-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ComposeScreen />
    </Suspense>
  );
}
