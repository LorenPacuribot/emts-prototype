'use client';

/*
  Main left sidebar. Same behavior as the live app:
  - Collapsed to icons (104px) by default; expands on hover to 320px.
  - The round toggle button pins it open.
  - Below the lg breakpoint it becomes a slide-in drawer (MobileSidebar).
*/
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, LogOut, X } from 'lucide-react';
import { BOTTOM_NAV, MAIN_NAV, NEW_NAV } from '@/lib/constants';
import { useCurrentUser as useFeatureUser } from '@/features/lib/store';
import { NewBadge } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { ICONS } from './layout/icons';
import { LogoFull, LogoIcon } from './layout/Logo';
import { useSignOut } from './auth/AuthGate';

type NavItem = { href: string; label: string; icon: string; feature?: number | number[]; hiddenFor?: readonly string[] };

/** NEW modules visible to the current prototype role (Prototype bar › Viewing as). */
function useNewNav(): NavItem[] {
  const role = useFeatureUser().role;
  return NEW_NAV.filter((i) => !i.hiddenFor?.includes(role));
}

function useIsActive() {
  const pathname = usePathname() || '';
  return (href: string) => pathname === href || pathname.startsWith(href + '/');
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(true);
  const isActive = useIsActive();
  const signOut = useSignOut();
  const newNav = useNewNav();

  return (
    <aside className={cn('hidden lg:block h-screen sticky top-0 z-[60] shrink-0 transition-[width] duration-300 print:hidden', collapsed ? 'w-[104px]' : 'w-80')}>
      <div
        className={cn(
          'group h-full bg-white border-r border-gray-200 flex flex-col justify-between py-5 transition-all duration-300',
          collapsed ? 'w-[104px] hover:w-80 absolute top-0 left-0 hover:shadow-2xl z-[60]' : 'w-full relative',
        )}
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-8 -right-3 z-[70] flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary-600"
          title={collapsed ? 'Pin Sidebar' : 'Collapse Sidebar'}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>

        <div className="flex w-full flex-col overflow-y-auto px-4 no-scrollbar">
          <Link href="/dashboard" className={cn('mb-8 flex h-12 items-center px-3', collapsed ? 'justify-center group-hover:justify-start' : 'justify-start')}>
            <span className={cn(collapsed ? 'block group-hover:hidden' : 'hidden')}>
              <LogoIcon className="h-12 w-12" />
            </span>
            <span className={cn(collapsed ? 'hidden group-hover:block' : 'block')}>
              <LogoFull />
            </span>
          </Link>
          <nav className="mb-6 flex w-full flex-col gap-1">
            {(MAIN_NAV as readonly NavItem[]).map((item) => (
              <SidebarItem key={item.href} item={item} collapsed={collapsed} active={isActive(item.href)} />
            ))}
            <div className="mx-4 my-3 h-px bg-gray-100" />
            <div className="flex flex-col gap-1" data-tour="rail-new">
              {newNav.map((item) => (
                <SidebarItem key={item.href} item={item} collapsed={collapsed} active={isActive(item.href)} isNew />
              ))}
            </div>
          </nav>
        </div>

        <div className="mt-auto flex w-full flex-col gap-1 border-t border-gray-100 px-4 pt-4">
          {(BOTTOM_NAV as readonly NavItem[]).map((item) => (
            <SidebarItem key={item.href} item={item} collapsed={collapsed} active={isActive(item.href)} />
          ))}
          <SidebarItem
            item={{ href: '', label: 'Logout', icon: 'LogOut' }}
            collapsed={collapsed}
            active={false}
            onClick={signOut}
          />
        </div>
      </div>
    </aside>
  );
}

function SidebarItem({ item, collapsed, active, onClick, isNew }: { item: NavItem; collapsed: boolean; active: boolean; onClick?: () => void; isNew?: boolean }) {
  const Icon = ICONS[item.icon] ?? LogOut;
  const className = cn(
    'relative w-full flex items-center px-4 py-3 rounded-xl font-medium transition-all duration-200 overflow-hidden whitespace-nowrap group/item border',
    active
      ? 'bg-primary-50 text-primary-700 shadow-sm border-primary-100 font-bold'
      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50 border-transparent',
    collapsed ? 'justify-center group-hover:justify-start gap-0 group-hover:gap-4' : 'gap-4 justify-start',
  );
  const content = (
    <>
      <Icon className={cn('h-6 w-6 shrink-0', active ? 'text-primary-700' : 'text-gray-400 group-hover/item:text-gray-600')} />
      <span className={cn('flex items-center gap-2 transition-all duration-300', collapsed ? 'w-0 opacity-0 group-hover:w-auto group-hover:opacity-100' : 'w-auto opacity-100')}>
        {item.label}
        {isNew && <NewBadge feature={item.feature} />}
      </span>
      {isNew && collapsed && <span className="absolute left-[34px] top-2 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white transition-opacity group-hover:opacity-0" />}
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className={className} title={collapsed ? item.label : ''}>
        {content}
      </button>
    );
  }
  return (
    <Link href={item.href} className={className} title={collapsed ? item.label : ''}>
      {content}
    </Link>
  );
}

/* ---------- Mobile drawer ---------- */

const MobileCtx = React.createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => {} });

export function MobileMenuProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <MobileCtx.Provider value={{ open, setOpen }}>{children}</MobileCtx.Provider>;
}

export const useMobileMenu = () => React.useContext(MobileCtx);

export function MobileSidebar() {
  const { open, setOpen } = useMobileMenu();
  const isActive = useIsActive();
  const router = useRouter();
  const newNav = useNewNav();
  if (!open) return null;
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  return (
    <div className="fixed inset-0 z-[120] lg:hidden">
      <div className="absolute inset-0 bg-gray-900/40" onClick={() => setOpen(false)} />
      <div className="absolute left-0 top-0 flex h-full w-80 max-w-[85vw] flex-col bg-white p-4 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <LogoFull />
          <button onClick={() => setOpen(false)} className="rounded-full p-2 text-gray-500 hover:bg-gray-100" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {([...MAIN_NAV, ...newNav, ...BOTTOM_NAV] as readonly NavItem[]).map((item) => {
            const Icon = ICONS[item.icon]!;
            const active = isActive(item.href);
            return (
              <button
                key={item.href}
                onClick={() => go(item.href)}
                className={cn('flex items-center gap-4 rounded-xl px-4 py-3 text-left font-medium', active ? 'bg-primary-50 text-primary-700 font-bold' : 'text-gray-600 hover:bg-gray-50')}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
