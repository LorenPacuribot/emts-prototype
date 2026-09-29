'use client';

/*
  Public sample of the organisation's website contact form (patent 34). It
  posts to /api/website-form exactly as an embedded form on the real website
  would, so the lead arrives through the live endpoint, not the simulator.
*/
import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { DEMO_SITE_KEY, HONEYPOT_FIELD } from '@/lib/website-form';

type Status = { kind: 'idle' | 'sending' | 'sent' } | { kind: 'error'; message: string; field?: string };

const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

export default function Page() {
  const [startedAt, setStartedAt] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  useEffect(() => setStartedAt(Date.now()), []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus({ kind: 'sending' });
    const body = { ...Object.fromEntries(new FormData(e.currentTarget).entries()), siteKey: DEMO_SITE_KEY, startedAt };
    try {
      const res = await fetch('/api/website-form', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { error?: string; field?: string };
      if (!res.ok) return setStatus({ kind: 'error', message: json.error ?? 'Something went wrong. Please call us.', field: json.field });
      setStatus({ kind: 'sent' });
    } catch {
      setStatus({ kind: 'error', message: 'No connection. Please try again.' });
    }
  };

  const err = (f: string) => (status.kind === 'error' && status.field === f ? status.message : undefined);
  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-gray-700">{label}</span>
      <input name={name} className={input} aria-invalid={!!err(name)} aria-describedby={err(name) ? `${name}-err` : undefined} {...props} />
      {err(name) && <span id={`${name}-err`} className="mt-1 block text-xs text-red-600">{err(name)}</span>}
    </label>
  );

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-gray-50">
      <main className="mx-auto max-w-lg px-4 py-10">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-600">Sample website form</p>
        <h1 className="text-2xl font-black text-gray-900">Request a free estimate</h1>
        <p className="mt-1 text-sm text-gray-500">Tell us about your project and we&apos;ll be in touch to arrange a visit.</p>
        {status.kind === 'sent' ? (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-800" role="status">
            <CheckCircle2 className="mb-2 h-6 w-6" />
            <b>Thanks, we have your request.</b> We&apos;ll contact you shortly.
            <button type="button" className="mt-3 block font-semibold text-green-900 underline" onClick={() => { setStatus({ kind: 'idle' }); setStartedAt(Date.now()); }}>Send another request</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm" noValidate>
            {field('name', 'Name', { required: true, autoComplete: 'name' })}
            <div className="grid gap-4 sm:grid-cols-2">
              {field('phone', 'Phone', { type: 'tel', autoComplete: 'tel' })}
              {field('email', 'Email', { type: 'email', autoComplete: 'email' })}
            </div>
            <p className="-mt-2 text-xs text-gray-500">A phone number or an email is enough.</p>
            {field('town', 'Address or town', { autoComplete: 'address-level2' })}
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">What would you like painted?</span>
              <textarea name="message" rows={4} className={input} />
            </label>
            {/* Honeypot: hidden from people, filled in by bots. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>Company website<input name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" /></label>
            </div>
            {status.kind === 'error' && !status.field && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{status.message}</p>}
            <button type="submit" disabled={status.kind === 'sending'} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
              {status.kind === 'sending' ? 'Sending…' : 'Send request'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
