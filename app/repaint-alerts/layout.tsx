'use client';

/* Features 27 and 29, repaint alerts and follow-ups. Switched off in New Features (dashboard): says so instead of showing the route. */
import { FeatureRouteGate } from '@/features/components/ui';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureRouteGate feature={[27, 29]}>{children}</FeatureRouteGate>;
}
