'use client';

import { Suspense } from 'react';
import { PublicRecordScreen } from '@/features/components/features/public-record/public-record-screen';

/* Customer-facing page (feature prototype): covers the app sidebar like the replica's client views. */
export default function Page() {
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-gray-50 print:static print:overflow-visible">
      <Suspense fallback={null}>
        <PublicRecordScreen />
      </Suspense>
    </div>
  );
}
