"use client";
/**
 * Main sidebar, matching the live Sidebar.tsx: 104px of icons that expands
 * on hover to show labels. New standalone pages sit in their own group.
 */
import { HelpCircle, LogOut, Settings } from "lucide-react";
import { AppLink, useNav } from "@/features/lib/navigation";
import { useCurrentUser } from "@/features/lib/store";
import { cn } from "@/features/lib/cn";
import { LogoIcon } from "@/components/layout/Logo";
import { ConfirmBadge, NewBadge } from "@/features/components/ui";
import { LIVE_ITEMS, MOVING_ITEMS, NEW_ITEMS, isActiveItem, visibleFor, type RailItem } from "./nav-config";

function Item({ item, pathname }: { item: RailItem; pathname: string }) {
  const active = isActiveItem(pathname, item);
  const Icon = item.icon;
  return (
    <AppLink
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-12 items-center gap-4 rounded-xl px-[26px] transition-colors",
        active ? "bg-primary-50 text-primary-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
      <span className="flex min-w-0 items-center gap-2 whitespace-nowrap text-sm font-semibold opacity-0 transition-opacity group-hover/side:opacity-100">
        {item.label}
        {item.isNew && <NewBadge feature={item.feature} />}
      </span>
      {item.isNew && <span className="absolute left-[46px] top-2.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white transition-opacity group-hover/side:opacity-0" />}
    </AppLink>
  );
}

export function IconRail() {
  const { pathname } = useNav();
  const user = useCurrentUser();
  const moving = MOVING_ITEMS.filter(visibleFor(user.role));
  return (
    <div className="no-print hidden w-[104px] shrink-0 md:block">
      <aside className="group/side fixed left-0 top-0 z-40 flex h-screen w-[104px] flex-col overflow-hidden border-r border-gray-200 bg-white transition-[width] duration-200 hover:w-72 hover:shadow-2xl">
        <AppLink href="/dashboard" className="flex h-20 shrink-0 items-center gap-3 px-8" aria-label="Estimate Master home">
          <Logo />
          <span className="whitespace-nowrap font-heading text-lg font-extrabold text-gray-900 opacity-0 transition-opacity group-hover/side:opacity-100">Estimate Master</span>
        </AppLink>
        <nav className="no-scrollbar flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2" aria-label="Main">
          {LIVE_ITEMS.filter(visibleFor(user.role)).map((i) => (
            <Item key={i.href} item={i} pathname={pathname} />
          ))}
          <div className="mx-4 my-3 h-px bg-gray-100" />
          <div className="flex flex-col gap-1" data-tour="rail-new">
            {NEW_ITEMS.filter(visibleFor(user.role)).map((i) => (
              <Item key={i.href} item={i} pathname={pathname} />
            ))}
          </div>
          {moving.length > 0 && (
            <>
              <div className="mx-4 my-3 h-px bg-gray-100" />
              {moving.map((i) => (
                <Item key={i.href} item={i} pathname={pathname} />
              ))}
            </>
          )}
        </nav>
        <div className="flex flex-col gap-1 border-t border-gray-100 px-3 py-3">
          <Item item={{ href: "/support", label: "Help & Support", icon: HelpCircle, match: ["/support"] }} pathname={pathname} />
          <Item item={{ href: "/settings", label: "Settings", icon: Settings, match: ["/settings"] }} pathname={pathname} />
          <Item item={{ href: "/dashboard", label: "Logout", icon: LogOut, match: ["/logout"] }} pathname={pathname} />
        </div>
      </aside>
    </div>
  );
}

/** Mobile drawer content (the live MobileSidebar). */
export function MobileNavList({ onNavigate }: { onNavigate: () => void }) {
  const { pathname } = useNav();
  const user = useCurrentUser();
  const groups = [LIVE_ITEMS, NEW_ITEMS, MOVING_ITEMS];
  return (
    <>
      {groups.map((g, gi) => (
        <div key={gi} className={cn(gi > 0 && "mt-3 border-t border-gray-100 pt-3")}>
          {g.filter(visibleFor(user.role)).map((i) => {
            const Icon = i.icon;
            const active = isActiveItem(pathname, i);
            return (
              <AppLink
                key={i.href}
                href={i.href}
                onClick={onNavigate}
                className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold", active ? "bg-primary-50 text-primary-700" : "text-gray-600 hover:bg-gray-50")}
              >
                <Icon className="h-5 w-5" /> {i.label}
                <span className="ml-auto flex gap-1">
                  {i.isNew && <NewBadge />}
                  {i.needsConfirmation && <ConfirmBadge className="hidden" />}
                </span>
              </AppLink>
            );
          })}
        </div>
      ))}
      <div className="mt-3 border-t border-gray-100 pt-3">
        {[
          { href: "/support", label: "Help & Support", icon: HelpCircle },
          { href: "/settings", label: "Settings", icon: Settings },
        ].map((i) => (
          <AppLink key={i.href} href={i.href} onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            <i.icon className="h-5 w-5" /> {i.label}
          </AppLink>
        ))}
      </div>
    </>
  );
}

/** The brand mark (replica components/layout/Logo.tsx, /brand/logo-full.webp). */
export function Logo({ className }: { className?: string }) {
  return <LogoIcon className={cn("h-10 w-10 shrink-0", className)} />;
}
