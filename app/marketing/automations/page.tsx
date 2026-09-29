'use client';

import { Suspense } from 'react';
import { AutomationsScreen } from '@/features/components/features/marketing/automations-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AutomationsScreen />
    </Suspense>
  );
}
