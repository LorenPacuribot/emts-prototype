'use client';

/* Feature 22, Employee Hours and Payroll. Switched off in New Features (dashboard): says so instead of showing the route. */
import { FeatureRouteGate } from '@/features/components/ui';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureRouteGate feature={22}>{children}</FeatureRouteGate>;
}
