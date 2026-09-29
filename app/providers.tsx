'use client';

import { DataProvider } from '@/lib/store';
import { RemoteStateGate } from '@/components/RemoteStateGate';
import { ToastProvider } from '@/components/ui/toast';
import { MobileMenuProvider } from '@/components/Sidebar';
import { FeatureShell } from '@/features/components/layout/app-shell';
import { FeatureSettingsSync } from '@/components/settings/FeatureSettingsSync';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <RemoteStateGate>
      <DataProvider>
        <ToastProvider>
          <MobileMenuProvider>
            <FeatureShell>
              {/* Waste and deposit settings the features read (lib/bridge covers records). */}
              <FeatureSettingsSync />
              {children}
            </FeatureShell>
          </MobileMenuProvider>
        </ToastProvider>
      </DataProvider>
    </RemoteStateGate>
  );
}
