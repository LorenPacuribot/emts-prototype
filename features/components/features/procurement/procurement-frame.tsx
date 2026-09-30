"use client";
/**
 * NEW (feature 19). Hosts the supplier screens in the live app:
 * - Supplier Orders board and Returns: the standalone /supplier-orders page
 *   (no live host). Receipts and the Exception List are views on the board.
 * - Suppliers and Branches, Product Mapping: the NEW Settings › Suppliers
 *   page, registered like every live settings page (settings-config.ts).
 */
import type { ReactNode } from "react";
import { Boxes, Building2, Tags, Undo2 } from "lucide-react";
import { useDb } from "@/features/lib/store";
import { now } from "@/features/lib/clock";
import { ackException } from "@/features/lib/rules/procurement";
import { PageHeaderBelow, Screen } from "@/features/components/layout/screen";
import { SectionTabs } from "@/features/components/layout/section-tabs";
import { SettingsShell } from "@/features/components/features/settings/settings-shell";

export const PROCUREMENT_TABS = [
  { key: "orders", label: "Supplier Orders", path: "/supplier-orders", icon: Boxes },
  { key: "suppliers", label: "Suppliers and Branches", path: "/settings/suppliers", icon: Building2 },
  { key: "mapping", label: "Product Mapping", path: "/settings/suppliers/product-mapping", icon: Tags },
  { key: "returns", label: "Returns and Credits", path: "/supplier-orders/returns", icon: Undo2 },
] as const;

export type ProcurementTabKey = (typeof PROCUREMENT_TABS)[number]["key"];

export function ProcurementFrame({ tab, children }: { tab: ProcurementTabKey; children: ReactNode }) {
  const db = useDb((d) => d);
  const nowIso = now();
  const exceptions = db.purchaseOrders.filter((p) => ackException(p, db.users, nowIso)?.overdue || p.uncertainSend).length;
  const meta = PROCUREMENT_TABS.find((t) => t.key === tab)!;
  if (tab === "suppliers" || tab === "mapping") {
    return (
      <SettingsShell page="suppliers" subtitle="Supplier branches, account numbers and product mapping for manual ordering."
        subTabs={PROCUREMENT_TABS.filter((t) => t.key === "suppliers" || t.key === "mapping").map((t) => ({ href: t.path, label: t.label, active: t.key === tab }))}>
        {children}
      </SettingsShell>
    );
  }
  // Sections as an underline tab row under the page title (no second sidebar). The
  // order board's own stats show open office requests; exceptions are the tab badge.
  const tabs = (
    <SectionTabs
      label="Supplier Orders sections"
      groups={[PROCUREMENT_TABS.filter((t) => t.key === "orders" || t.key === "returns").map((t) => ({ href: t.path, label: t.label, icon: t.icon, active: t.key === tab, badge: t.key === "orders" ? exceptions : undefined }))]}
    />
  );
  return (
    <Screen roomy crumbs={[{ label: "Supplier Orders", href: "/supplier-orders" }, { label: meta.label }]}>
      <PageHeaderBelow.Provider value={tabs}>{children}</PageHeaderBelow.Provider>
    </Screen>
  );
}
