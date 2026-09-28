'use client';

import { Suspense } from 'react';
import { ReturnsScreen } from '@/features/components/features/procurement/returns-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReturnsScreen />
    </Suspense>
  );
}
