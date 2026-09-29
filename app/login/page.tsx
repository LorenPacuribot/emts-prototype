'use client';

/*
  Sign in (patent walkthroughs, step 1: "Log in to Estimate Master with a
  valid username and password").
  The username is the first name, the email, or first.last. The password is
  checked on the server (app/api/auth/login), which sets an HttpOnly session
  cookie. No password or password hint is shown on this page.
*/
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Lock, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { LogoFull } from '@/components/layout/Logo';
import { useStore } from '@/features/lib/store';
import { safeNext } from '@/features/lib/auth/auth';
import { loadSession, signIn } from '@/features/lib/auth/client-session';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const setUser = useStore((s) => s.setUser);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Already signed in: go straight on.
  useEffect(() => {
    void loadSession().then((s) => {
      if (s) router.replace(next);
    });
  }, [next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await signIn(username, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      setPassword('');
      return;
    }
    setUser(result.session.userId);
    // A full load, so the shared data (refused before sign-in) loads with the new session.
    window.location.replace(next);
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
                  className="pr-12"
                  invalid={!!error}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-gray-400 hover:text-gray-700"
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
        <p className="mt-4 text-center text-xs text-gray-500">
          Forgotten your password? Ask the owner or office manager to set a new one in Settings › Team Access.
        </p>
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
