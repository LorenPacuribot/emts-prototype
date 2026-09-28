'use client';

import { Suspense } from 'react';
import { PublicEstimateScreen } from '@/features/components/features/estimates/view/public-estimate-screen';

/* Customer-facing page (feature prototype): covers the app sidebar like the replica's client views. */
export default function Page() {
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-gray-50 print:static print:overflow-visible">
      <Suspense fallback={null}>
        <PublicEstimateScreen />
      </Suspense>
    </div>
  );
}
