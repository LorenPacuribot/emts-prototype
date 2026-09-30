"use client";
/**
 * Content column for a feature settings page. It renders inside the replica's
 * app/settings/layout.tsx, which already draws the AppHeader and the
 * three-group SettingsSidebar (NEW pages are registered in lib/constants.ts
 * SETTINGS_NAV). Access follows SETTINGS_PERMISSIONS.
 * The title block and column match the replica's <SettingsPage wide>
 * (components/settings/SettingsSidebar.tsx).
 */
import type { ReactNode } from "react";
import { useCurrentUser } from "@/features/lib/store";
import { AppLink } from "@/features/lib/navigation";
import { can } from "@/features/lib/permissions";
import { cn } from "@/features/lib/cn";
import { Banner, ConfirmBadge, NewBadge } from "@/features/components/ui";
import { SETTINGS_GROUPS, SETTINGS_PERMISSIONS, SETTINGS_TITLES } from "./settings-config";
import { useHowThisWorks } from "@/features/components/layout/how-this-works";

export function SettingsShell({ page, subtitle, details, actions, subTabs, children }: {
  page: string;
  subtitle?: ReactNode;
  /** Rules and detail behind a "How this works" button (the subtitle stays one sentence). */
  details?: ReactNode;
  actions?: ReactNode;
  /** Sub-pages inside one settings page (e.g. Suppliers › Product Mapping). */
  subTabs?: { href: string; label: string; active: boolean }[];
  children: ReactNode;
}) {
  const user = useCurrentUser();
  const item = SETTINGS_GROUPS.flatMap((g) => g.items).find((i) => i.id === page);
  const perm = SETTINGS_PERMISSIONS[page];
  const allowed = !perm || can(user, perm);
  const how = useHowThisWorks(details);
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 pb-24 md:px-8 lg:py-10">
      {allowed ? (
        <>
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-3 font-heading text-3xl font-bold tracking-tight text-gray-900">
                {SETTINGS_TITLES[page]}
                {item?.isNew && <span className="flex items-center gap-2"><NewBadge feature={item.feature} />{item.needsConfirmation && <ConfirmBadge />}</span>}
                {how.button}
              </h1>
              {subtitle && <p className="mt-2 max-w-[90ch] text-base text-gray-500">{subtitle}</p>}
              {how.panel}
            </div>
            {actions && <div className="no-print flex flex-wrap items-center gap-3" data-tour="page-actions">{actions}</div>}
          </div>
          {subTabs && (
            <div className="no-scrollbar -mt-2 mb-8 flex gap-2 overflow-x-auto">
              {subTabs.map((t) => (
                <AppLink key={t.href} href={t.href} className={cn("shrink-0 rounded-xl px-4 py-2 text-sm font-bold", t.active ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50")}>
                  {t.label}
                </AppLink>
              ))}
            </div>
          )}
          {children}
        </>
      ) : (
        <>
          <div className="mb-8">
            <h1 className="font-heading text-3xl font-bold tracking-tight text-gray-900">{SETTINGS_TITLES[page]}</h1>
          </div>
          <Banner tone="info" title="Access Denied">Your role can&apos;t open {SETTINGS_TITLES[page]}. Switch roles in the Prototype bar to see it.</Banner>
        </>
      )}
    </div>
  );
}
