'use client';

/* Estimate Master Books, the journal (BK-M3). Switched off in New Features (dashboard): says so instead of showing the route. */
import { FeatureRouteGate } from '@/features/components/ui';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureRouteGate featureKey="bk">{children}</FeatureRouteGate>;
}
