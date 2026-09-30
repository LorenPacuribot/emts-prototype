'use client';

import { Suspense } from 'react';
import { JournalScreen } from '@/features/components/features/finance/journal-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <JournalScreen />
    </Suspense>
  );
}
