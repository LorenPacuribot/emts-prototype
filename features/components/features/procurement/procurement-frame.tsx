"use client";
/**
 * NEW (feature 19). Hosts the supplier screens in the live app:
 * - Supplier Orders board and Returns: the standalone /supplier-orders page
 *   (no live host). Receipts and the Exception List are views on the board.
 * - Suppliers and Branches, Product Mapping: the NEW Settings › Suppliers
 *   page, registered like every live settings page (settings-config.ts).
 */
import type { ReactNode } from "react";
import { Boxes, Building2, PackageSearch, Tags, Undo2 } from "lucide-react";
import { useDb } from "@/features/lib/store";
import { now } from "@/features/lib/clock";
import { ackException } from "@/features/lib/rules/procurement";
import { Screen } from "@/features/components/layout/screen";
import { SubNav } from "@/features/components/layout/sub-nav";
import { Badge, NewBadge } from "@/features/components/ui";
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
  const requests = (db.orderRequests ?? []).filter((r) => r.status === "requested").length;
  const meta = PROCUREMENT_TABS.find((t) => t.key === tab)!;
  if (tab === "suppliers" || tab === "mapping") {
    return (
      <SettingsShell page="suppliers" subtitle="Supplier branches, account numbers and product mapping for manual ordering."
        subTabs={PROCUREMENT_TABS.filter((t) => t.key === "suppliers" || t.key === "mapping").map((t) => ({ href: t.path, label: t.label, active: t.key === tab }))}>
        {children}
      </SettingsShell>
    );
  }
  return (
    <Screen
      crumbs={[{ label: "Supplier Orders", href: "/supplier-orders" }, { label: meta.label }]}
      sidebar={
        <SubNav
          header={
            <div className="hidden space-y-1.5 lg:block">
              <div className="flex items-center gap-2 font-display text-sm font-bold text-ink">
                <PackageSearch className="h-4 w-4 text-brand" /> Supplier Orders <NewBadge feature={19} />
              </div>
              <div className="text-xs text-gray-500">Manual ordering · two Sherwin-Williams branches</div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {exceptions > 0 && <Badge tone="red">{exceptions} exception{exceptions === 1 ? "" : "s"}</Badge>}
                {requests > 0 && <Badge tone="amber">{requests} request{requests === 1 ? "" : "s"}</Badge>}
              </div>
            </div>
          }
          groups={[
            {
              title: "Supplier Orders",
              items: PROCUREMENT_TABS.filter((t) => t.key === "orders" || t.key === "returns").map((t) => ({ href: t.path, label: t.label, icon: t.icon, badge: t.key === "orders" ? exceptions : undefined })),
            },
          ]}
        />
      }
    >
      {children}
    </Screen>
  );
}
