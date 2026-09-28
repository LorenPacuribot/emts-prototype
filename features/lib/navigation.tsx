/**
 * Navigation adapter.
 *
 * Screens never import next/link or next/navigation directly. They use
 * <AppLink>, useNav() and useParam() from here. This keeps every screen
 * portable: the Next.js app uses this file, and the single-file hosted demo
 * swaps in demo/navigation-hash.tsx (hash routing) with the same API.
 *
 * Record IDs travel as query params (?id=JOB-2026-1) so the app can be a
 * static export with no server.
 */
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";

export function AppLink({ href, ...rest }: { href: string } & Omit<ComponentProps<"a">, "href">) {
  return <Link href={href} {...rest} />;
}

export function useNav() {
  const router = useRouter();
  const pathname = usePathname();
  return {
    pathname: normalise(pathname),
    push: (href: string) => router.push(href),
    back: () => router.back(),
    forward: () => router.forward(),
  };
}

export function useParam(name: string): string | undefined {
  const params = useSearchParams();
  return params.get(name) ?? undefined;
}

function normalise(p: string) {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

/** Plain href for raw <a> tags (e.g. target="_blank"). */
export function hrefFor(path: string): string {
  return path;
}

/** Absolute URL, used for QR codes. */
export function absoluteUrl(path: string): string {
  return (typeof window === "undefined" ? "" : window.location.origin) + path;
}
