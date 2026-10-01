'use client';

import { Suspense } from 'react';
import { NeedsAttentionScreen } from '@/features/components/features/finance/queue-screen';

/* Accounting › Needs Attention (2 Oct 2026, D1). */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <NeedsAttentionScreen />
    </Suspense>
  );
}
