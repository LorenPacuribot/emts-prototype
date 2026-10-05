'use client';

import { Suspense } from 'react';
import { AutomationsHome } from '@/components/automations/AutomationsHome';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AutomationsHome />
    </Suspense>
  );
}
