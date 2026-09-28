'use client';

import { Suspense } from 'react';
import { ContentCalendarScreen } from '@/features/components/features/marketing/calendar-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ContentCalendarScreen />
    </Suspense>
  );
}
