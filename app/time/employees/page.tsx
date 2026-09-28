'use client';

import { Suspense } from 'react';
import { EmployeesScreen } from '@/features/components/features/workforce/employees-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EmployeesScreen />
    </Suspense>
  );
}
