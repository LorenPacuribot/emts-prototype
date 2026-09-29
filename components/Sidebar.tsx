'use client';

/*
  Main left sidebar. Same behavior as the live app:
  - Collapsed to icons (104px) by default; expands on hover to 320px.
  - The round toggle button pins it open.
  - Below the lg breakpoint it becomes a slide-in drawer (MobileSidebar).
  - The nav list scrolls with a visible thin scrollbar, and a fade plus a
    chevron at the bottom edge says more items are below (short laptop screens).
  - Keyboard focus inside the rail expands it too, so labels are readable.
  - The footer keeps a slot for the Prototype bar (features/components/layout/demo-bar.tsx).
*/
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, X } from 'lucide-react';
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

/** True when the scroll area has content above / below its visible edge. */
function useScrollEdges() {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ above: false, below: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const above = el.scrollTop > 2;
    const below = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setEdges((e) => (e.above === above && e.below === below ? e : { above, below }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [update]);
  return { ref, edges, update };
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
  const scroll = useScrollEdges();

  return (
    <aside className={cn('hidden lg:block h-screen sticky top-0 z-[60] shrink-0 transition-[width] duration-300 print:hidden', collapsed ? 'w-[104px]' : 'w-80')}>
      <div
        className={cn(
          'group h-full bg-white border-r border-gray-200 flex flex-col py-5 transition-all duration-300',
          collapsed ? 'w-[104px] hover:w-80 has-[:focus-visible]:w-80 absolute top-0 left-0 hover:shadow-2xl has-[:focus-visible]:shadow-2xl z-[60]' : 'w-full relative',
        )}
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-8 -right-3 z-[70] flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md opacity-0 transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 hover:text-primary-600"
          title={collapsed ? 'Pin Sidebar' : 'Collapse Sidebar'}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>

        <Link href="/dashboard" className={cn('mx-4 mb-5 flex h-12 shrink-0 items-center px-3', collapsed ? 'justify-center group-hover:justify-start group-has-[:focus-visible]:justify-start' : 'justify-start')}>
          <span className={cn(collapsed ? 'block group-hover:hidden group-has-[:focus-visible]:hidden' : 'hidden')}>
            <LogoIcon className="h-12 w-12" />
          </span>
          <span className={cn(collapsed ? 'hidden group-hover:block group-has-[:focus-visible]:block' : 'block')}>
            <LogoFull />
          </span>
        </Link>

        <div className="relative min-h-0 flex-1">
          <div ref={scroll.ref} onScroll={scroll.update} className="h-full w-full overflow-y-auto overscroll-contain px-4 custom-scrollbar">
            <nav className="flex w-full flex-col gap-1 pb-4" aria-label="Main">
              {(MAIN_NAV as readonly NavItem[]).map((item) => (
                <SidebarItem key={item.href} item={item} collapsed={collapsed} active={isActive(item.href)} />
              ))}
              <div className="mx-4 my-2 h-px bg-gray-100" />
              {/* Group label for the new modules. It shows whenever the rail is expanded. */}
              <div
                className={cn(
                  'overflow-hidden whitespace-nowrap px-4 text-xxs font-black uppercase tracking-[0.2em] text-gray-400 transition-opacity',
                  collapsed
                    ? 'h-0 opacity-0 group-hover:h-auto group-hover:pb-1 group-hover:opacity-100 group-has-[:focus-visible]:h-auto group-has-[:focus-visible]:pb-1 group-has-[:focus-visible]:opacity-100'
                    : 'pb-1 opacity-100',
                )}
              >
                Operations
              </div>
              <div className="flex flex-col gap-1" data-tour="rail-new">
                {newNav.map((item) => (
                  <SidebarItem key={item.href} item={item} collapsed={collapsed} active={isActive(item.href)} isNew />
                ))}
              </div>
            </nav>
          </div>
          {/* Scroll cues: a fade at the top once scrolled, and a fade plus chevron while more items are below. */}
          <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white to-transparent transition-opacity', scroll.edges.above ? 'opacity-100' : 'opacity-0')} />
          <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center bg-gradient-to-t from-white via-white/80 to-transparent pb-0.5 transition-opacity', scroll.edges.below ? 'opacity-100' : 'opacity-0')}>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-1 border-t border-gray-100 px-4 pt-3">
          {(BOTTOM_NAV as readonly NavItem[]).map((item) => (
            <SidebarItem key={item.href} item={item} collapsed={collapsed} active={isActive(item.href)} />
          ))}
          <SidebarItem
            item={{ href: '', label: 'Logout', icon: 'LogOut' }}
            collapsed={collapsed}
            active={false}
            onClick={signOut}
          />
          {/* Slot for the Prototype bar (fixed bottom-left on desktop), so it never covers Logout. */}
          <div aria-hidden className="h-12 shrink-0" />
        </div>
      </div>
    </aside>
  );
}

function SidebarItem({ item, collapsed, active, onClick, isNew }: { item: NavItem; collapsed: boolean; active: boolean; onClick?: () => void; isNew?: boolean }) {
  const Icon = ICONS[item.icon] ?? LogOut;
  const className = cn(
    'relative w-full shrink-0 flex items-center px-4 py-2.5 rounded-xl font-medium transition-all duration-200 overflow-hidden whitespace-nowrap group/item border',
    active
      ? 'bg-primary-50 text-primary-700 shadow-sm border-primary-100 font-bold'
      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50 border-transparent',
    collapsed ? 'justify-center group-hover:justify-start group-has-[:focus-visible]:justify-start gap-0 group-hover:gap-4 group-has-[:focus-visible]:gap-4' : 'gap-4 justify-start',
  );
  const content = (
    <>
      <Icon className={cn('h-6 w-6 shrink-0', active ? 'text-primary-700' : 'text-gray-400 group-hover/item:text-gray-600')} />
      <span className={cn('flex items-center gap-2 transition-all duration-300', collapsed ? 'w-0 opacity-0 group-hover:w-auto group-hover:opacity-100 group-has-[:focus-visible]:w-auto group-has-[:focus-visible]:opacity-100' : 'w-auto opacity-100')}>
        {item.label}
        {isNew && <NewBadge feature={item.feature} />}
      </span>
      {isNew && collapsed && <span aria-hidden className="absolute left-[34px] top-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white transition-opacity group-hover:opacity-0 group-has-[:focus-visible]:opacity-0" />}
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className={className} title={collapsed ? item.label : undefined}>
        {content}
      </button>
    );
  }
  return (
    <Link href={item.href} className={className} title={collapsed ? (isNew ? `${item.label} (new)` : item.label) : undefined} aria-current={active ? 'page' : undefined}>
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
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto custom-scrollbar" aria-label="Main">
          {([
            ...MAIN_NAV.map((item) => ({ item, group: false })),
            ...newNav.map((item, i) => ({ item, group: i === 0 })),
            ...BOTTOM_NAV.map((item) => ({ item, group: false })),
          ] as { item: NavItem; group: boolean }[]).map(({ item, group }) => {
            const Icon = ICONS[item.icon]!;
            const active = isActive(item.href);
            return (
              <React.Fragment key={item.href}>
                {/* Same group label as the desktop rail. */}
                {group && <div className="px-4 pb-1 pt-3 text-xxs font-black uppercase tracking-[0.2em] text-gray-400">Operations</div>}
                <button
                  onClick={() => go(item.href)}
                  aria-current={active ? 'page' : undefined}
                  className={cn('flex shrink-0 items-center gap-4 rounded-xl px-4 py-3 text-left font-medium', active ? 'bg-primary-50 text-primary-700 font-bold' : 'text-gray-600 hover:bg-gray-50')}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              </React.Fragment>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
