'use client';

import { Suspense } from 'react';
import { SuppliersScreen } from '@/features/components/features/procurement/suppliers-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <div className="px-6 pt-4 text-sm"><a href="/api/supplier-access" className="font-semibold text-primary-700 underline">Sign in for live supplier access</a><span className="ml-2 text-gray-500">Use your supplier administrator credentials.</span></div>
      <SuppliersScreen />
    </Suspense>
  );
}
