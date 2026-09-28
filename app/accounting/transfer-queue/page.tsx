'use client';

import { Suspense } from 'react';
import { QueueScreen } from '@/features/components/features/finance/queue-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <QueueScreen />
    </Suspense>
  );
}
