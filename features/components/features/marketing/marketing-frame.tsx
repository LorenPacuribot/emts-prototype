"use client";
/**
 * Wraps every Marketing screen (feature 34) with the Marketing submenu.
 * The office drafts and posts; the business owner approves identifiable
 * content and controls the accounts. Other roles don't see Marketing.
 */
import type { ReactNode } from "react";
import { BarChart3, CalendarDays, FileText, Globe, Images, Lock, Megaphone, Share2 } from "lucide-react";
import { useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { Screen } from "@/features/components/layout/screen";
import { SubNav } from "@/features/components/layout/sub-nav";
import { EmptyState } from "@/features/components/ui";

export const MARKETING_TABS = [
  { key: "calendar", label: "Content Calendar", path: "/marketing", icon: CalendarDays },
  { key: "posts", label: "Posts & Drafts", path: "/marketing/posts", icon: FileText },
  { key: "media", label: "Media Library", path: "/marketing/media", icon: Images },
  { key: "reports", label: "Monthly Report", path: "/marketing/reports", icon: BarChart3 },
] as const;

export type MarketingTabKey = (typeof MARKETING_TABS)[number]["key"] | "compose";

export function MarketingFrame({ tab, children }: { tab: MarketingTabKey; children: ReactNode }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const label = tab === "compose" ? "Post Composer" : MARKETING_TABS.find((t) => t.key === tab)!.label;
  const approvals = db.marketingPosts.filter((p) => p.state === "awaiting_approval").length;
  const attention = db.marketingPosts.filter((p) => p.state === "missed" || p.state === "partially_failed" || (p.takedown && !p.takedown.doneAt)).length;
  const reviews = db.leads.filter((l) => l.review?.status === "open").length;
  // Website leads moved to the Lead Pipeline and accounts to Settings (34).
  const moved = [
    { href: "/leads?view=website", label: "Website Lead Review", icon: Globe, badge: reviews || undefined },
    { href: "/settings/social-accounts", label: "Social Accounts", icon: Share2 },
  ];
  return (
    <Screen
      crumbs={[{ label: "Marketing", href: "/marketing" }, { label }]}
      sidebar={
        <SubNav
          header={
            <div className="hidden lg:block">
              <div className="flex items-center gap-2 font-display text-[14px] font-bold text-ink"><Megaphone className="h-4 w-4 text-brand" /> Marketing</div>
              <div className="mt-0.5 text-[11.5px] text-slate-500">Facebook and Instagram publishing, and website-form leads. No ad management, no spend.</div>
            </div>
          }
          groups={[{
            title: "Content and leads",
            items: MARKETING_TABS.map((t) => ({
              href: t.path, label: t.label, icon: t.icon,
              badge: t.key === "calendar" ? attention || undefined : t.key === "posts" ? approvals || undefined : undefined,
            })),
          }, { title: "Elsewhere in the app", items: moved }]}
        />
      }
    >
      {can(user, "marketing.access") ? children : (
        <EmptyState icon={<Lock />} title="Marketing is for the office and the business owner" body="The office drafts and posts; the owner approves identifiable content and controls the accounts. Switch role in the demo bar to see it." />
      )}
    </Screen>
  );
}
