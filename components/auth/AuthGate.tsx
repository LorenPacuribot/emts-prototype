'use client';

/*
  Demo sign-in gate (features/lib/auth/demo-auth.ts).
  - Every page except the public customer links needs a signed-in session;
    without one the visitor is sent to /login?next=<page>.
  - /login renders without the sidebar.
  This keeps casual visitors on the sign-in screen. It is not production
  security: the session lives in this browser's localStorage.
*/
import React, { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AUTH_EVENT, endSession, getSession, isPublicPath, SESSION_KEY, type DemoSession } from '@/features/lib/auth/demo-auth';

/** The current demo session; re-reads when it changes in this or another tab. */
export function useDemoSession(): { session: DemoSession | undefined; ready: boolean } {
  const [state, setState] = useState<{ session: DemoSession | undefined; ready: boolean }>({ session: undefined, ready: false });
  useEffect(() => {
    const read = () => setState({ session: getSession(), ready: true });
    read();
    const onStorage = (e: StorageEvent) => (e.key === null || e.key === SESSION_KEY) && read();
    window.addEventListener(AUTH_EVENT, read);
    window.addEventListener('storage', onStorage);
    // Expire the session while the page stays open.
    const timer = window.setInterval(read, 60_000);
    return () => {
      window.removeEventListener(AUTH_EVENT, read);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(timer);
    };
  }, []);
  return state;
}

export function useSignOut() {
  const router = useRouter();
  return useCallback(() => {
    endSession();
    router.replace('/login');
  }, [router]);
}

/** Sidebar frame for signed-in pages; bare page for /login. */
export function AppFrame({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { session, ready } = useDemoSession();
  const isLogin = pathname === '/login' || pathname.startsWith('/login/');
  const isPublic = isPublicPath(pathname);
  const blocked = ready && !session && !isPublic;

  useEffect(() => {
    if (!blocked) return;
    const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : pathname;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [blocked, pathname, router]);

  if (isLogin) return <div className="min-h-screen bg-gray-50">{children}</div>;
  if (!isPublic && !session) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 text-sm text-gray-500" role="status">
        {ready ? 'Redirecting to sign in…' : 'Loading…'}
      </div>
    );
  }
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Customers on a public link are not signed in and don't get the staff navigation. */}
      {session && sidebar}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-gray-50">{children}</div>
    </div>
  );
}
