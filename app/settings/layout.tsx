'use client';

import { usePathname } from 'next/navigation';
import { AppHeader } from '@/components/Navigation';
import { SettingsSidebar } from '@/components/settings/SettingsSidebar';
import { SETTINGS_TITLES } from '@/lib/constants';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const segment = pathname.split('/').filter(Boolean)[1] || '';
  const title = SETTINGS_TITLES[segment] || 'Settings';
  return (
    <>
      {/* Mirrors the waste and deposit settings into the feature store. */}
      <AppHeader title={title} breadcrumbs={[{ label: 'Settings', href: '/settings' }]} />
      <div className="flex-1 overflow-auto">
        <div className="flex min-h-full flex-col bg-gray-50/50 lg:flex-row">
          <SettingsSidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </>
  );
}
