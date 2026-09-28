'use client';

import { Suspense } from 'react';
import { MediaScreen } from '@/features/components/features/marketing/media-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MediaScreen />
    </Suspense>
  );
}
