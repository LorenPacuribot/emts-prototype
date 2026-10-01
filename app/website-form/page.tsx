'use client';

/*
  Public sample of the organisation's website contact form (patent 34). It
  posts to /api/website-form exactly as an embedded form on the real website
  would, so the lead arrives through the live endpoint, not the simulator.

  CRM-M5: a tracked link opens it as /website-form?src={source}&l={linkId}.
  Both go to the endpoint with the referring site, which sets the lead
  source (lib/website-form.ts leadSourceFor). A paused link takes no requests.

  2 Oct 2026 (D5): Full name (2–80 characters), Phone (US, 10 digits) and
  Email (one of the two), Property address, "What would you like painted?"
  (Interior, Exterior, Both, Cabinets, Other) and a Message of up to 1,000
  characters. The endpoint checks the same rules (lib/website-form.ts).
*/
import { useEffect, useState } from 'react';
import { CheckCircle2, PauseCircle } from 'lucide-react';
import { CONTACT_REQUIRED, DEMO_SITE_KEY, HONEYPOT_FIELD, MESSAGE_MAX, NAME_LENGTH, PAINT_TYPES, THANKS_MESSAGE } from '@/lib/website-form';
import { useCollection } from '@/lib/store';

type Status = { kind: 'idle' | 'sending' | 'sent' } | { kind: 'error'; message: string; field?: string };

const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

export default function Page() {
  const [startedAt, setStartedAt] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [track, setTrack] = useState<{ src: string; l: string; referrer: string }>({ src: '', l: '', referrer: '' });
  const [messageLength, setMessageLength] = useState(0);
  const { items: links } = useCollection('trackedLinks');
  useEffect(() => {
    setStartedAt(Date.now());
    const q = new URLSearchParams(window.location.search);
    setTrack({ src: q.get('src') ?? '', l: q.get('l') ?? '', referrer: document.referrer });
  }, []);
  const paused = !!track.l && links.find((x) => x.id === track.l)?.status === 'paused';

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus({ kind: 'sending' });
    const body = { ...Object.fromEntries(new FormData(e.currentTarget).entries()), siteKey: DEMO_SITE_KEY, startedAt, ...track };
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
        {paused ? (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-700" role="status">
            <PauseCircle className="h-5 w-5 shrink-0 text-gray-500" />
            This form is not accepting requests right now.
          </div>
        ) : status.kind === 'sent' ? (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-800" role="status">
            <CheckCircle2 className="mb-2 h-6 w-6" />
            <b>{THANKS_MESSAGE}</b>
            <button type="button" className="mt-3 block font-semibold text-green-900 underline" onClick={() => { setStatus({ kind: 'idle' }); setStartedAt(Date.now()); setMessageLength(0); }}>Send another request</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm" noValidate>
            {field('name', 'Full name', { required: true, autoComplete: 'name', minLength: NAME_LENGTH.min, maxLength: NAME_LENGTH.max })}
            <div className="grid gap-4 sm:grid-cols-2">
              {field('phone', 'Phone', { type: 'tel', autoComplete: 'tel', inputMode: 'tel', placeholder: '(214) 555-0123' })}
              {field('email', 'Email', { type: 'email', autoComplete: 'email' })}
            </div>
            <p className="-mt-2 text-xs text-gray-500">{CONTACT_REQUIRED}</p>
            {field('address', 'Property address (optional)', { autoComplete: 'street-address' })}
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">What would you like painted? (optional)</span>
              <select name="paintType" defaultValue="" className={input} aria-invalid={!!err('paintType')}>
                <option value="">Choose…</option>
                {PAINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {err('paintType') && <span className="mt-1 block text-xs text-red-600">{err('paintType')}</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Message (optional)</span>
              <textarea name="message" rows={4} maxLength={MESSAGE_MAX} className={input} onChange={(e) => setMessageLength(e.target.value.length)} aria-invalid={!!err('message')} />
              <span className="mt-1 block text-right text-xs text-gray-500">{messageLength.toLocaleString('en-US')} / {MESSAGE_MAX.toLocaleString('en-US')}</span>
              {err('message') && <span className="mt-1 block text-xs text-red-600">{err('message')}</span>}
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
