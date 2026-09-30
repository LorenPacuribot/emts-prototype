'use client';

/* Feature 33 (Accounting) and Estimate Master Books. Switched off in New Features (dashboard): says so instead of showing the route. */
import { FeatureRouteGate } from '@/features/components/ui';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureRouteGate feature={33} featureKey="bk">{children}</FeatureRouteGate>;
}
