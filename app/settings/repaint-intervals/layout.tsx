'use client';

/* Feature 27, Settings › Repaint Intervals. Switched off in New Features (dashboard): says so instead of showing the route. */
import { FeatureRouteGate } from '@/features/components/ui';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureRouteGate feature={27}>{children}</FeatureRouteGate>;
}
