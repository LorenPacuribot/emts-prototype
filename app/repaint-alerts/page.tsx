'use client';

import { Suspense } from 'react';
import { AlertsScreen } from '@/features/components/features/service/alerts-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AlertsScreen />
    </Suspense>
  );
}
