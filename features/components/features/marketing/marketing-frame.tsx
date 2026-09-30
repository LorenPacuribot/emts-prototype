"use client";
/**
 * Wraps every Marketing screen (feature 34) with the Marketing section tabs under each page title.
 * The office drafts and posts; the business owner approves identifiable
 * content and controls the accounts. Other roles don't see Marketing.
 */
import type { ReactNode } from "react";
import { BadgeDollarSign, BarChart3, CalendarDays, FileText, Globe, Images, Inbox, LayoutTemplate, Lightbulb, Lock, Mail, Share2, Star, Target, Ticket, Workflow } from "lucide-react";
import { trendAlerts } from "@/features/lib/rules/marketing-growth";
import { now } from "@/features/lib/clock";
import { useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { PageHeaderBelow, Screen } from "@/features/components/layout/screen";
import { SectionTabs } from "@/features/components/layout/section-tabs";
import { EmptyState } from "@/features/components/ui";

export const MARKETING_TABS = [
  { key: "calendar", label: "Content Calendar", path: "/marketing", icon: CalendarDays },
  { key: "posts", label: "Posts & Drafts", path: "/marketing/posts", icon: FileText },
  { key: "media", label: "Media Library", path: "/marketing/media", icon: Images },
  { key: "reports", label: "Monthly Report", path: "/marketing/reports", icon: BarChart3 },
] as const;

/** Patent §34 part 2: campaigns and growth. Leads, posts, spend, links and ROI attach to a campaign. */
export const GROWTH_TABS = [
  { key: "campaigns", label: "Campaigns", path: "/marketing/campaigns", icon: Target },
  { key: "promotions", label: "Promotions & Referrals", path: "/marketing/promotions", icon: Ticket },
  { key: "reviews", label: "Reviews & Testimonials", path: "/marketing/reviews", icon: Star },
  { key: "messages", label: "Email & SMS Campaigns", path: "/marketing/messages", icon: Mail },
] as const;

/** Patent §34: engaging customers and automating follow-up; alerts, recommendations and search. */
export const ENGAGE_TABS = [
  { key: "inbox", label: "Social Inbox", path: "/marketing/inbox", icon: Inbox },
  { key: "landing-pages", label: "Landing Pages & Forms", path: "/marketing/landing-pages", icon: LayoutTemplate },
  { key: "ads", label: "Ads", path: "/marketing/ads", icon: BadgeDollarSign },
  { key: "automations", label: "Automations", path: "/marketing/automations", icon: Workflow },
  { key: "insights", label: "Alerts, Recommendations & Search", path: "/marketing/insights", icon: Lightbulb },
] as const;

export type MarketingTabKey = (typeof MARKETING_TABS)[number]["key"] | (typeof GROWTH_TABS)[number]["key"] | (typeof ENGAGE_TABS)[number]["key"] | "compose";

export function MarketingFrame({ tab, children }: { tab: MarketingTabKey; children: ReactNode }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const label = tab === "compose" ? "Post Composer" : [...MARKETING_TABS, ...GROWTH_TABS, ...ENGAGE_TABS].find((t) => t.key === tab)!.label;
  const unanswered = (db.socialMessages ?? []).filter((m) => m.status === "open").length;
  const adApprovals = (db.socialAds ?? []).filter((a) => a.status === "pending_approval").length;
  const alerts = trendAlerts(db, now()).length;
  const engageBadge = { inbox: unanswered, ads: adApprovals, insights: alerts } as Record<string, number>;
  const activeCampaigns = (db.mktCampaigns ?? []).filter((c) => c.status === "active").length;
  const toAnswer = (db.socialReviews ?? []).filter((r) => r.response?.status !== "sent").length;
  const drafts = (db.mktMessageCampaigns ?? []).filter((m) => m.status === "draft").length;
  const approvals = db.marketingPosts.filter((p) => p.state === "awaiting_approval").length;
  const attention = db.marketingPosts.filter((p) => p.state === "missed" || p.state === "partially_failed" || (p.takedown && !p.takedown.doneAt)).length;
  const reviews = db.leads.filter((l) => l.review?.status === "open").length;
  // Website leads moved to the Lead Pipeline and accounts to Settings (34).
  const moved = [
    { href: "/leads?view=website", label: "Website Lead Review", icon: Globe, badge: reviews || undefined },
    { href: "/settings/social-accounts", label: "Social Accounts", icon: Share2 },
  ];
  // Sections as an underline tab row under the page title (no second sidebar), in the
  // same three groups plus the two pages that moved elsewhere in the app.
  const tabs = (
    <SectionTabs
      label="Marketing sections"
      note={<>Sandbox: nothing is sent to a provider or platform.</>}
      groups={[
        MARKETING_TABS.map((t) => ({
          href: t.path, label: t.label, icon: t.icon, active: t.key === tab,
          badge: t.key === "calendar" ? attention || undefined : t.key === "posts" ? approvals || undefined : undefined,
        })),
        GROWTH_TABS.map((t) => ({
          href: t.path, label: t.label, icon: t.icon, active: t.key === tab,
          badge: t.key === "campaigns" ? activeCampaigns || undefined : t.key === "reviews" ? toAnswer || undefined : t.key === "messages" ? drafts || undefined : undefined,
        })),
        ENGAGE_TABS.map((t) => ({ href: t.path, label: t.label, icon: t.icon, active: t.key === tab, badge: engageBadge[t.key] || undefined })),
        moved,
      ]}
    />
  );
  return (
    <Screen roomy crumbs={[{ label: "Marketing", href: "/marketing" }, { label }]}>
      {can(user, "marketing.access") ? <PageHeaderBelow.Provider value={tabs}>{children}</PageHeaderBelow.Provider> : (
        <>
          <div className="mb-6">{tabs}</div>
          <EmptyState icon={<Lock />} title="Marketing is for the office and the business owner" body="The office drafts and posts; the owner approves identifiable content and controls the accounts. Switch role in the demo bar to see it." />
        </>
      )}
    </Screen>
  );
}
