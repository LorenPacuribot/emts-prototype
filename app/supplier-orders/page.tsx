'use client';

import { Suspense } from 'react';
import { SupplierOrdersScreen } from '@/features/components/features/procurement/supplier-orders-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SupplierOrdersScreen />
    </Suspense>
  );
}
