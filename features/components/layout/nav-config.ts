/**
 * Navigation map.
 *
 * `LIVE_ITEMS` copies the live app's Sidebar.tsx (same labels, order and
 * routes). `NEW_ITEMS` are the only standalone pages the 14 features add,
 * because INTEGRATION_MAP.md lists no host screen for them. Everything else
 * a feature adds lives inside a live screen.
 */
import {
  BarChart3, BellRing, Briefcase, Calculator, Calendar, ClipboardList, Clock, FileText, Kanban, Home, LayoutDashboard, Landmark,
  Megaphone, MonitorPlay, PackageSearch, Timer, Users, type LucideIcon,
} from "lucide-react";
import type { Role } from "@/features/types";

export interface RailItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: string[];
  isNew?: boolean;
  /** Feature numbers, shown in the NEW badge tooltip. */
  feature?: number | number[];
  /** Features 33 and 34 are suggested hosts that need client confirmation. */
  needsConfirmation?: boolean;
  placeholder?: boolean;
  /** Roles the item is absent for (not just disabled), e.g. Accounting for estimators. */
  hiddenFor?: Role[];
}

export function visibleFor(role: Role) {
  return (i: RailItem) => !i.hiddenFor?.includes(role);
}

/** apps/main/src/features/(main)/layout/components/Sidebar.tsx */
export const LIVE_ITEMS: RailItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, match: ["/dashboard", "/"] },
  { href: "/leads", label: "Lead Pipeline", icon: Kanban, match: ["/leads"] },
  { href: "/contacts", label: "Contacts", icon: Users, match: ["/contacts"] },
  { href: "/calendar", label: "Calendar", icon: Calendar, match: ["/calendar"], placeholder: true },
  { href: "/estimates", label: "Estimates", icon: Calculator, match: ["/estimates"] },
  { href: "/jobs", label: "Jobs", icon: Briefcase, match: ["/jobs"] },
  { href: "/job-scheduling", label: "Job Scheduling", icon: Clock, match: ["/job-scheduling"] },
  { href: "/work-orders", label: "Work Orders", icon: ClipboardList, match: ["/work-orders"] },
  { href: "/invoices", label: "Invoices", icon: FileText, match: ["/invoices"] },
  { href: "/presentations", label: "Presentation Builder", icon: MonitorPlay, match: ["/presentations"], placeholder: true },
  { href: "/reports", label: "Reports", icon: BarChart3, match: ["/reports"] },
];

/** Standalone pages with no live host (INTEGRATION_MAP.md). */
export const NEW_ITEMS: RailItem[] = [
  { href: "/time", label: "Time", icon: Timer, match: ["/time"], isNew: true, feature: 22 },
  { href: "/supplier-orders", label: "Supplier Orders", icon: PackageSearch, match: ["/supplier-orders"], isNew: true, feature: 19, hiddenFor: ["crew_lead", "bookkeeper"] },
  { href: "/repaint-alerts", label: "Repaint Alerts", icon: BellRing, match: ["/repaint-alerts"], isNew: true, feature: [27, 29], hiddenFor: ["crew_lead", "bookkeeper"] },
  { href: "/accounting", label: "Accounting", icon: Landmark, match: ["/accounting"], isNew: true, feature: 33, needsConfirmation: true, hiddenFor: ["estimator", "senior_estimator"] },
  { href: "/marketing", label: "Marketing", icon: Megaphone, match: ["/marketing"], isNew: true, feature: 34, needsConfirmation: true, hiddenFor: ["estimator", "senior_estimator", "crew_lead", "bookkeeper"] },
];

/**
 * Prototype-only menus still waiting to move into their live host screens.
 * Emptied as each host screen is built; removed at the end of the rework.
 */
export const MOVING_ITEMS: RailItem[] = [
];

export function isActiveItem(pathname: string, item: RailItem) {
  return item.match.some((m) => (m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(m + "/")));
}
