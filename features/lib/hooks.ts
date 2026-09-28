"use client";
import { useEffect, useState } from "react";

/** True after the first client render. Used to avoid SSR/localStorage mismatches. */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
