'use client';

import { Suspense } from 'react';
import { CampaignsScreen } from '@/features/components/features/marketing/campaigns-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CampaignsScreen />
    </Suspense>
  );
}
