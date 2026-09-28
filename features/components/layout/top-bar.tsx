"use client";
/**
 * Top bar, matching the live AppHeader.tsx: mobile menu, back arrow, a
 * disabled forward arrow, divider, breadcrumbs separated by "|", then the
 * page title in a bordered pill.
 */
import { ArrowLeft, ArrowRight, Menu } from "lucide-react";
import { Fragment, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AppLink, useNav } from "@/features/lib/navigation";
import { Logo, MobileNavList } from "./icon-rail";

export interface Crumb {
  label: string;
  href?: string;
}

export function TopBar({ crumbs }: { crumbs: Crumb[] }) {
  const nav = useNav();
  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-gray-200 bg-white px-4 shadow-sm md:h-20 md:px-6">
      <MobileMenu />
      <button onClick={nav.back} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100" aria-label="Back">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <button onClick={nav.forward} className="hidden rounded-lg p-2 text-gray-300 hover:bg-gray-100 hover:text-gray-600 sm:block" aria-label="Forward">
        <ArrowRight className="h-5 w-5" />
      </button>
      <div className="mx-1 h-8 w-px bg-gray-200 md:mx-2" />
      <nav className="no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto text-sm" aria-label="Breadcrumb">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={i}>
              {i > 0 && <span className="text-gray-300">|</span>}
              {last ? (
                <span className="whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-1 font-bold text-gray-900 shadow-sm">{c.label}</span>
              ) : c.href ? (
                <AppLink href={c.href} className="whitespace-nowrap font-medium text-gray-500 hover:text-gray-900">
                  {c.label}
                </AppLink>
              ) : (
                <span className="whitespace-nowrap font-medium text-gray-500">{c.label}</span>
              )}
            </Fragment>
          );
        })}
      </nav>
    </header>
  );
}

function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-gray-900/30" />
        <DialogPrimitive.Content className="fixed left-0 top-0 z-50 h-full w-72 overflow-y-auto bg-white p-4 shadow-2xl">
          <DialogPrimitive.Title className="mb-4 flex items-center gap-2 font-heading text-lg font-extrabold">
            <Logo /> Estimate Master
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Main navigation</DialogPrimitive.Description>
          <MobileNavList onNavigate={() => setOpen(false)} />
          <AppLink href="/dashboard" onClick={() => setOpen(false)} className="sr-only">
            Home
          </AppLink>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
