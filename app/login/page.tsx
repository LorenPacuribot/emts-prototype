'use client';

/*
  Sign in (patent walkthroughs, step 1: "Log in to Estimate Master with a
  valid username and password").
  Demo accounts are the prototype team (Prototype bar › Viewing as). The
  username is the first name, the email, or first.last. Signing in also
  sets the prototype's current user, so role rules apply to that person.
  Credentials are checked in the browser (features/lib/auth/demo-auth.ts).
*/
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Lock, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { LogoFull } from '@/components/layout/Logo';
import { useStore } from '@/features/lib/store';
import { checkSignIn, getSession, loadCredentials, safeNext, SEED_HINTS, startSession, type DemoAccount } from '@/features/lib/auth/demo-auth';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const users = useStore((s) => s.db.users);
  const setUser = useStore((s) => s.setUser);
  const accounts = useMemo<DemoAccount[]>(
    () => users.map((u) => {
      const [firstName = u.name, ...rest] = u.name.trim().split(/\s+/);
      return { id: u.id, firstName, lastName: rest.join(' '), email: u.email ?? '' };
    }),
    [users],
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Already signed in: go straight on.
  useEffect(() => {
    if (getSession()) router.replace(next);
  }, [next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await checkSignIn(accounts, loadCredentials(), username, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      setPassword('');
      return;
    }
    setUser(result.account.id);
    startSession(result.account.id);
    router.replace(next);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <LogoFull className="h-14 w-auto" />
        </div>
        <form onSubmit={submit} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8" noValidate>
          <h1 className="font-heading text-2xl font-bold text-gray-900">Sign in</h1>
          <p className="mt-1 text-sm text-gray-500">Use your Estimate Master username and password.</p>
          <div className="mt-6 space-y-4">
            <Field label="Username or email" required>
              <Input
                autoFocus
                autoComplete="username"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                leftIcon={<UserIcon className="h-4 w-4" />}
                invalid={!!error}
              />
            </Field>
            <Field label="Password" required>
              <div className="relative">
                <Input
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  leftIcon={<Lock className="h-4 w-4" />}
                  className="pr-10"
                  invalid={!!error}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
            <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
          </div>
        </form>
        <details className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white/60 px-4 py-3 text-sm text-gray-600">
          <summary className="cursor-pointer font-semibold text-gray-700">Demo accounts</summary>
          <p className="mt-2 text-xs text-gray-500">Each person has a different role. Passwords can be changed in Settings › Team Access.</p>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
            {SEED_HINTS.map((h) => {
              const u = users.find((x) => x.id === h.userId);
              return (
                <li key={h.userId}>
                  <button type="button" className="text-left hover:text-primary-700" onClick={() => { setUsername(h.username); setPassword(h.password); setError(''); }}>
                    {h.username} / {h.password}
                    {u && <span className="block font-sans text-[11px] text-gray-400">{u.role.replace(/_/g, ' ')}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
