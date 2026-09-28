'use client';

import { Suspense } from 'react';
import { AccountsScreen } from '@/features/components/features/marketing/accounts-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AccountsScreen />
    </Suspense>
  );
}
