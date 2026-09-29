'use client';

/* Left navigation inside Settings. Sections and order match the live app; NEW pages come from features/. */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SETTINGS_NAV } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { ICONS } from '@/components/layout/icons';
import { useCurrentUser as useFeatureUser } from '@/features/lib/store';
import { can } from '@/features/lib/permissions';
import { SETTINGS_PERMISSIONS } from '@/features/components/features/settings/settings-config';
import { NewBadge } from '@/features/components/ui';

export function SettingsSidebar() {
  const pathname = usePathname() || '';
  const featureUser = useFeatureUser();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  // NEW pages follow the prototype's access rules (Prototype bar › Viewing as).
  const visible = (item: { id: string; isNew?: boolean }) => !item.isNew || !SETTINGS_PERMISSIONS[item.id] || can(featureUser, SETTINGS_PERMISSIONS[item.id]);
  return (
    <aside className="sticky top-0 z-20 w-full shrink-0 self-start border-b border-gray-200 bg-white shadow-sm lg:h-[calc(100vh-5rem)] lg:w-72 lg:border-b-0 lg:border-r lg:shadow-none">
      <div className="flex h-auto items-center gap-2 overflow-x-auto p-2 custom-scrollbar lg:h-full lg:flex-col lg:items-stretch lg:gap-1.5 lg:overflow-y-auto lg:px-6 lg:py-10 lg:pb-12">
        {SETTINGS_NAV.map((group, gi) => (
          <div key={group.section} className="contents">
            {gi > 0 && <div className="my-4 hidden h-px w-full bg-gray-100 lg:block" />}
            <h2 className="mb-3 mt-2 hidden px-2 text-xxs font-black uppercase tracking-[0.2em] text-gray-400 lg:block">{group.section}</h2>
            {group.items.filter(visible).map((item) => {
              const href = `/settings/${item.id}`;
              const active = isActive(href);
              const Icon = ICONS[item.icon]!;
              return (
                <Link
                  key={item.id}
                  href={href}
                  className={cn(
                    'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-4 py-3 transition-all lg:w-full lg:gap-3',
                    active
                      ? 'border-primary-100 bg-primary-50 font-bold text-primary-900 shadow-sm'
                      : 'border-transparent bg-transparent font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-primary-600' : 'text-gray-400')} />
                  <span className="min-w-0 flex-1 truncate text-sm leading-tight">{item.label}</span>
                  {item.isNew && <NewBadge feature={item.feature} />}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}

/**
 * Standard settings page wrapper: centered column with title, subtitle and actions.
 * <SettingsPage title="Surface Rates" subtitle="…" actions={<Button/>}>…</SettingsPage>
 */
export function SettingsPage({
  title, subtitle, actions, children, wide,
}: { title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn('mx-auto w-full px-4 py-8 md:px-8 lg:py-10', wide ? 'max-w-6xl' : 'max-w-4xl')}>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
          {subtitle && <p className="mt-2 text-base text-gray-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
