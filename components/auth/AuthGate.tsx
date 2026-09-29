'use client';

/*
  Sign-in gate. proxy.ts already refuses staff pages without a valid session
  cookie on the server; this is the in-app side of the same check:
  - asks the server who is signed in (features/lib/auth/client-session.ts)
    and sends a visitor whose session has ended to /login?next=<page>;
  - makes the prototype's current user the person who signed in, so role
    rules apply to them. Only the owner may then switch "Viewing as" to
    demo other roles (features/components/layout/demo-bar.tsx);
  - /login renders without the sidebar.
*/
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isPublicPath, type SessionInfo } from '@/features/lib/auth/auth';
import { AUTH_EVENT, getSession, loadSession, sessionChecked, signOut } from '@/features/lib/auth/client-session';
import { useStore } from '@/features/lib/store';

const RECHECK_MS = 5 * 60_000;

/** The signed-in session; re-checks with the server on focus and every few minutes. */
export function useSession(): { session: SessionInfo | undefined; ready: boolean } {
  const [state, setState] = useState<{ session: SessionInfo | undefined; ready: boolean }>(() => ({ session: getSession(), ready: sessionChecked() }));
  useEffect(() => {
    const read = () => setState({ session: getSession(), ready: sessionChecked() });
    window.addEventListener(AUTH_EVENT, read);
    void loadSession().then(read);
    const recheck = () => void loadSession().then(read);
    window.addEventListener('focus', recheck);
    const timer = window.setInterval(recheck, RECHECK_MS);
    return () => {
      window.removeEventListener(AUTH_EVENT, read);
      window.removeEventListener('focus', recheck);
      window.clearInterval(timer);
    };
  }, []);
  return state;
}

export function useSignOut() {
  const router = useRouter();
  return useCallback(() => {
    void signOut().then(() => router.replace('/login'));
  }, [router]);
}

/** Sidebar frame for signed-in pages; bare page for /login. */
export function AppFrame({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { session, ready } = useSession();
  const isLogin = pathname === '/login' || pathname.startsWith('/login/');
  const isPublic = isPublicPath(pathname);
  const blocked = ready && !session && !isPublic;

  useEffect(() => {
    if (!blocked) return;
    const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : pathname;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [blocked, pathname, router]);

  // Act as the person who signed in (once per sign-in; the owner may switch afterwards).
  const currentUserId = useStore((s) => s.currentUserId);
  const setUser = useStore((s) => s.setUser);
  const appliedFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!session) {
      appliedFor.current = undefined;
      return;
    }
    const key = `${session.userId}|${session.expiresAt}`;
    const mayViewAs = session.role === 'owner';
    if (appliedFor.current !== key || (!mayViewAs && currentUserId !== session.userId)) {
      appliedFor.current = key;
      if (currentUserId !== session.userId) setUser(session.userId);
    }
  }, [session, currentUserId, setUser]);

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
