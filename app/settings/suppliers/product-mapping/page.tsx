'use client';

import { Suspense } from 'react';
import { ProductMappingScreen } from '@/features/components/features/procurement/product-mapping-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProductMappingScreen />
    </Suspense>
  );
}
