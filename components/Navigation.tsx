'use client';

/*
  Top bar (AppHeader in the live app): back/forward arrows, breadcrumbs,
  and the current page title in a bordered pill. A user menu sits on the right.

  Most pages use <PageShell> instead of rendering this directly.
*/
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, LogOut, Menu, Settings, User } from 'lucide-react';
import { useCurrentUser } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useMobileMenu } from './Sidebar';
import { Avatar } from './ui/display';
import { DropdownMenu } from './ui/menu';
import { useToast } from './ui/toast';

export interface Crumb {
  label: string;
  href?: string;
}

export function AppHeader({ title, breadcrumbs = [], backHref }: { title: string; breadcrumbs?: (string | Crumb)[]; backHref?: string }) {
  const router = useRouter();
  const { setOpen } = useMobileMenu();
  const [hasHistory, setHasHistory] = useState(false);
  const user = useCurrentUser();
  const { toast } = useToast();

  useEffect(() => setHasHistory(window.history.length > 1), []);
  const canGoBack = hasHistory || !!backHref;

  return (
    <header className="sticky top-0 z-40 flex h-16 md:h-20 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 md:px-6 shadow-sm print:hidden">
      <div className="flex min-w-0 items-center gap-3 md:gap-4">
        <button onClick={() => setOpen(true)} className="-ml-2 rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden" aria-label="Open menu">
          <Menu className="h-6 w-6" />
        </button>
        <div className="flex items-center gap-2 text-gray-400">
          <button
            type="button"
            onClick={() => (hasHistory ? router.back() : backHref && router.push(backHref))}
            disabled={!canGoBack}
            className={cn('rounded-full p-2 transition-colors', canGoBack ? 'text-gray-600 hover:bg-gray-100' : 'pointer-events-none text-gray-200')}
            aria-label="Go back"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <button type="button" onClick={() => router.forward()} className="hidden rounded-full p-2 text-gray-300 hover:bg-gray-100 md:block" aria-label="Go forward">
            <ArrowRight className="h-6 w-6" />
          </button>
        </div>
        <div className="h-6 w-px bg-gray-200 md:h-8" />
        <div className="flex min-w-0 items-center gap-2 md:gap-3 text-base md:text-lg font-medium text-gray-600">
          {breadcrumbs.map((c, i) => {
            const crumb = typeof c === 'string' ? { label: c } : c;
            return (
              <React.Fragment key={i}>
                {crumb.href ? (
                  <Link href={crumb.href} className="hidden md:inline hover:text-gray-900">{crumb.label}</Link>
                ) : (
                  <span className="hidden md:inline">{crumb.label}</span>
                )}
                <span className="hidden md:inline text-gray-300">|</span>
              </React.Fragment>
            );
          })}
          <span className="truncate rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-bold text-gray-900 shadow-sm md:px-3 md:text-base">{title}</span>
        </div>
      </div>

      <DropdownMenu
        items={[
          { label: 'My Profile', icon: <User />, onClick: () => router.push('/settings/my-profile') },
          { label: 'Settings', icon: <Settings />, onClick: () => router.push('/settings') },
          { label: 'Logout', icon: <LogOut />, separatorBefore: true, onClick: () => toast('Logout is disabled in this replica (no authentication).', 'info') },
        ]}
        trigger={
          <button className="flex items-center gap-2 rounded-full p-1 hover:bg-gray-100" aria-label="User menu">
            <Avatar name={`${user.firstName} ${user.lastName}`} color={user.color} size="sm" />
            <span className="hidden pr-2 text-sm font-semibold text-gray-700 xl:block">{user.firstName} {user.lastName}</span>
          </button>
        }
      />
    </header>
  );
}

/**
 * Standard page frame: header on top, scrolling content below.
 * <PageShell title="Estimates">…</PageShell>
 */
export function PageShell({
  title, breadcrumbs, backHref, children, contentClassName, noPadding,
}: {
  title: string;
  breadcrumbs?: (string | Crumb)[];
  backHref?: string;
  children: React.ReactNode;
  contentClassName?: string;
  noPadding?: boolean;
}) {
  return (
    <>
      <AppHeader title={title} breadcrumbs={breadcrumbs} backHref={backHref} />
      <main className="flex-1 overflow-auto">
        <div className={cn(!noPadding && 'px-4 py-6 md:px-8 md:py-8 lg:px-9', contentClassName)}>{children}</div>
      </main>
    </>
  );
}
