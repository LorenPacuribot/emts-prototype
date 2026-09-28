'use client';

import { Suspense } from 'react';
import { MarketingReportScreen } from '@/features/components/features/marketing/reports-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MarketingReportScreen />
    </Suspense>
  );
}
