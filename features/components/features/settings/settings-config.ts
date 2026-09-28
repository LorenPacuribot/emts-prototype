/**
 * Settings registration, mirroring the live app's four places:
 *   1. the sidebar arrays   (features/(main)/settings/components/settings-sidebar.tsx) → SETTINGS_GROUPS
 *   2. SETTINGS_TITLES      (app/(main)/settings/layout.tsx)                         → SETTINGS_TITLES
 *   3. SETTINGS_PERMISSIONS (lib/permissions.ts)                                     → SETTINGS_PERMISSIONS
 *   4. a route folder       (app/(main)/settings/<id>/page.tsx)                      → app/(app)/settings/<id>
 *
 * `built` marks the live pages the prototype rebuilds because a feature
 * changes them. The rest appear in the sidebar exactly as in the live app
 * but are not rebuilt. NEW pages carry `isNew`.
 */
import {
  Boxes, Building2, CreditCard, DollarSign, FileSignature, FileText, GitBranch, Grid3x3, Hash, Landmark, Layers, List, Mail, MapPin, MessageSquare, Package,
  Palette, PackageSearch, BellRing, Settings2, Share2, Shield, Signal, Stamp, Table, Tag, TrendingUp, User, Users, Wallet, type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/features/lib/permissions";

export interface SettingsItem {
  id: string;
  label: string;
  icon: LucideIcon;
  built?: boolean;
  isNew?: boolean;
  feature?: number | number[];
  needsConfirmation?: boolean;
}

export const SETTINGS_GROUPS: { title: string; items: SettingsItem[] }[] = [
  {
    title: "Organization",
    items: [
      { id: "my-profile", label: "My Profile", icon: User },
      { id: "business-profile", label: "Business Profile", icon: Building2 },
      { id: "team-access", label: "Team & Access", icon: Users },
      { id: "subscription", label: "Subscription & Billing", icon: CreditCard },
      { id: "payment-gateway", label: "Payment Gateway", icon: Wallet },
      { id: "social-accounts", label: "Social Accounts", icon: Share2, built: true, isNew: true, feature: 34, needsConfirmation: true },
    ],
  },
  {
    title: "Configuration",
    items: [
      { id: "general", label: "General Configuration", icon: Settings2, built: true },
      { id: "goals-profit", label: "Goals & Profit", icon: TrendingUp },
      { id: "financial-settings", label: "Financial Settings", icon: Wallet, built: true },
      { id: "accounting", label: "Accounting", icon: Landmark, built: true, isNew: true, feature: 33, needsConfirmation: true },
      { id: "labor-config", label: "Labor Config", icon: Users },
      { id: "difficulty-tiers", label: "Difficulty Tiers", icon: Signal },
      { id: "project-discounts", label: "Project Discounts", icon: Tag },
      { id: "tax-regions", label: "Tax Regions", icon: MapPin },
      { id: "table-columns", label: "Table Columns", icon: Table },
      { id: "pipeline-stages", label: "Pipeline Stages", icon: GitBranch },
      { id: "automated-messages", label: "Automated Messages", icon: Mail },
      { id: "sms-templates", label: "SMS Templates", icon: MessageSquare },
      { id: "document-numbering", label: "Document Numbering", icon: Hash },
      { id: "roles-permissions", label: "Roles & Permissions", icon: Shield },
    ],
  },
  {
    title: "Libraries",
    items: [
      { id: "estimate-templates", label: "Estimate Templates", icon: FileText },
      { id: "estimate-types", label: "Estimate Types (Scopes)", icon: Layers },
      { id: "package-templates", label: "Package Templates", icon: Boxes },
      { id: "area-templates", label: "Area Templates", icon: Grid3x3 },
      { id: "surface-rates", label: "Surface Rates", icon: DollarSign, built: true },
      { id: "paint-library", label: "Paint Library", icon: Palette, built: true },
      { id: "brands", label: "Brands", icon: Stamp },
      { id: "materials", label: "Materials & Supplies", icon: Package },
      { id: "line-items", label: "Line Items", icon: List },
      { id: "terms-conditions", label: "Terms & Conditions", icon: FileSignature },
      { id: "suppliers", label: "Suppliers", icon: PackageSearch, built: true, isNew: true, feature: 19 },
      { id: "repaint-intervals", label: "Repaint Intervals", icon: BellRing, built: true, isNew: true, feature: 27 },
    ],
  },
];

/** app/(main)/settings/layout.tsx SETTINGS_TITLES (+ the NEW pages). */
export const SETTINGS_TITLES: Record<string, string> = {
  index: "Settings",
  ...Object.fromEntries(SETTINGS_GROUPS.flatMap((g) => g.items.map((i) => [i.id, i.id === "estimate-types" ? "Estimate Types" : i.label]))),
};

/**
 * lib/permissions.ts SETTINGS_PERMISSIONS, as prototype permission keys.
 * Live: goals-profit and surface-rates use ENGINE_CALIBRATION_VIEW, the rest ADMIN_MASTER_DATA.
 * NEW: suppliers → SUPPLIER_SETUP, repaint-intervals → REPAINT_LIBRARY_VIEW, accounting → ACCOUNTING_CONFIG,
 * social-accounts → MARKETING_ACCESS (connecting and removing access needs MARKETING_ACCOUNTS, owner only).
 */
export const SETTINGS_PERMISSIONS: Record<string, Permission> = {
  general: "settings.masterData",
  "financial-settings": "settings.masterData",
  "surface-rates": "settings.engineCalibration",
  "paint-library": "settings.masterData",
  suppliers: "supplier.setup",
  "repaint-intervals": "alerts.queue",
  accounting: "finance.access",
  "social-accounts": "marketing.access",
};
