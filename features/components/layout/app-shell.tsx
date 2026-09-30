"use client";
import { Suspense, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DemoBar } from "./demo-bar";
import { ProductTour } from "@/features/components/tour/product-tour";
import { Toaster, TooltipProvider } from "@/features/components/ui";
import { useHydrated } from "@/features/lib/hooks";
import { useVersion } from "@/features/lib/prototype-version";
import { WebsiteInboxSync } from "@/components/WebsiteInboxSync";
import { LeadMessageScheduler } from "@/components/leads/LeadMessageScheduler";

/** Customer-facing pages and the sign-in page: no Prototype bar or tour on top of them. */
const PUBLIC_PATHS = ["/estimates/view", "/paint-record/view", "/website-form", "/login", "/r"];

/**
 * Feature layer mounted inside the replica providers (app/providers.tsx):
 * tooltips and toasts for the feature screens, plus the prototype's demo
 * tooling (Prototype bar and product tour). The replica's own sidebar and
 * header frame every page.
 */
export function FeatureShell({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const hideMarkers = useVersion((s) => s.hideMarkers);
  // "Hide markers" (Prototype bar): globals.css hides every marker under html.hide-markers.
  useEffect(() => {
    document.documentElement.classList.toggle("hide-markers", hideMarkers);
  }, [hideMarkers]);
  const pathname = usePathname() ?? "";
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) || /\/client-view\/?$/.test(pathname);
  return (
    <TooltipProvider>
      {children}
      {hydrated && !isPublic && <DemoBar />}
      {hydrated && !isPublic && <><WebsiteInboxSync /><LeadMessageScheduler /></>}
      {hydrated && !isPublic && (
        <Suspense fallback={null}>
          <ProductTour />
        </Suspense>
      )}
      <Toaster />
    </TooltipProvider>
  );
}
