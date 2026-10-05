'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { AppHeader } from '@/components/Navigation';
import { SettingsSidebar } from '@/components/settings/SettingsSidebar';
import { SETTINGS_TITLES } from '@/lib/constants';
import { useCurrentUser as useFeatureUser } from '@/features/lib/store';
import { ROLE_LABEL } from '@/features/lib/permissions';
import { canOpenSettings } from '@/features/components/features/settings/settings-config';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const segment = pathname.split('/').filter(Boolean)[1] || '';
  const title = SETTINGS_TITLES[segment] || 'Settings';
  const user = useFeatureUser();
  // QA D-02: the page itself checks access, not only the sidebar, so a URL can't open it.
  const allowed = canOpenSettings(user, segment);
  return (
    <>
      {/* Mirrors the waste and deposit settings into the feature store. */}
      {/* No "Settings | Settings" on the settings landing page (N1). */}
      <AppHeader title={title} breadcrumbs={title === 'Settings' ? [] : [{ label: 'Settings', href: '/settings' }]} />
      <div className="flex-1 overflow-auto">
        <div className="flex min-h-full flex-col bg-gray-50/50 lg:flex-row">
          <SettingsSidebar />
          <main className="min-w-0 flex-1">
            {allowed ? children : (
              <div className="m-6 flex flex-col items-center rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
                <Lock className="h-8 w-8 text-gray-400" />
                <h1 className="mt-3 text-lg font-bold text-gray-900">You don&apos;t have access to {title}</h1>
                <p className="mt-1 max-w-md text-sm text-gray-600">
                  {user ? `${ROLE_LABEL[user.role]}s can't open or change this page.` : 'Sign in to open this page.'} Ask the business owner or office manager.
                </p>
                <Link href="/settings/my-profile" className="mt-4 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-bold text-primary-700 hover:border-primary-300">Go to My Profile</Link>
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
