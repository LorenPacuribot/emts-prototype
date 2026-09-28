'use client';

import { Suspense } from 'react';
import { SuppliersScreen } from '@/features/components/features/procurement/suppliers-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SuppliersScreen />
    </Suspense>
  );
}
