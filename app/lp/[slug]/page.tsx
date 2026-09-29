'use client';

/*
  Public landing page (patent 34): /lp/{slug} shows a published marketing page
  and its form. A submission is checked field by field (validateSubmission),
  mapped to the intake payload (submissionToInbound) and becomes a lead
  attributed to the page and its campaign, with any promo or referral code and
  the UTM tags the visitor arrived with (from /r/{code}). Like /r/{code}, the
  page reads the shared store in the browser; lib/guest-access lets a
  published slug through without a staff sign-in.
*/
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import type { FormField, UtmParams } from '@/features/types/marketing-growth';
import { system, useDb } from '@/features/lib/store';
import { useHydrated } from '@/features/lib/hooks';
import { validateSubmission } from '@/features/lib/rules/marketing-growth';
import { recordLandingView, submitLandingPage } from '@/features/lib/store/actions/marketing-engage';

const input = 'w-full min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500';
const newRef = () => `LPS-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default function Page() {
  const slug = String(useParams<{ slug: string }>().slug ?? '').trim().toLowerCase();
  const hydrated = useHydrated();
  const page = useDb((d) => d.mktLandingPages?.find((p) => p.slug === slug));
  const promo = useDb((d) => (page?.promotionId ? d.mktPromotions?.find((p) => p.id === page.promotionId) : undefined));
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string>();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const ref = useRef<string>('');
  const live = page?.status === 'published';

  // Arrival tags from a tracked link (/r/{code} adds utm_*), and a code in the address prefills the form.
  const arrival = useMemo(() => {
    if (!hydrated) return { utm: undefined as Partial<UtmParams> | undefined, code: undefined as string | undefined };
    const q = new URLSearchParams(window.location.search);
    const utm: Partial<UtmParams> = {};
    for (const k of ['source', 'medium', 'campaign', 'content', 'term'] as const) {
      const v = q.get(`utm_${k}`);
      if (v) utm[k] = v;
    }
    return { utm: Object.keys(utm).length ? utm : undefined, code: q.get('code') ?? q.get('promo') ?? undefined };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !live) return;
    const key = `emts-lp-${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      /* storage blocked: count the view anyway */
    }
    system(recordLandingView, slug);
  }, [hydrated, live, slug]);

  useEffect(() => {
    if (!page || !arrival.code) return;
    const f = page.form.fields.find((x) => x.maps === 'promoCode' || x.maps === 'referralCode');
    if (f) setValues((v) => (v[f.key] ? v : { ...v, [f.key]: arrival.code!.toUpperCase() }));
  }, [page, arrival.code]);

  if (!hydrated) return <Shell><p className="text-sm text-gray-600">Loading…</p></Shell>;
  if (!page || !live) {
    return (
      <Shell>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-gray-900">This page isn&apos;t available</h1>
          <p className="mt-2 text-sm text-gray-600">The offer may have ended. Please contact Estimate Master Painting directly.</p>
        </div>
      </Shell>
    );
  }

  const set = (k: string, v: string) => {
    setValues((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((e) => { const n = { ...e }; delete n[k]; return n; });
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setGeneral(undefined);
    const found = validateSubmission(page.form.fields, values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSending(true);
    ref.current ||= newRef();
    const r = system(submitLandingPage, slug, values, ref.current, { utm: arrival.utm });
    setSending(false);
    if (!r.ok) {
      if (r.field && page.form.fields.some((f) => f.key === r.field)) setErrors({ [r.field]: r.error });
      else setGeneral(r.error);
      return;
    }
    setSent(true);
  };

  return (
    <Shell>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-600">Estimate Master Painting</p>
      <h1 className="text-2xl font-black text-gray-900">{page.headline}</h1>
      {page.body && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{page.body}</p>}
      {promo && promo.active && (
        <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          Quote <b>{promo.code}</b> for {promo.discountType === 'percent' ? `${promo.value}% off` : `$${promo.value.toLocaleString('en-US', { minimumFractionDigits: 2 })} off`}
          {promo.validTo ? ` — until ${new Date(`${promo.validTo}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}.
        </p>
      )}
      {sent ? (
        <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-800" role="status">
          <CheckCircle2 className="mb-2 h-6 w-6" aria-hidden />
          <b>Thank you — we have your request.</b> {page.form.successMessage}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-6 space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          {page.form.fields.map((f) => <FormInput key={f.key} field={f} value={values[f.key] ?? ''} error={errors[f.key]} onChange={(v) => set(f.key, v)} />)}
          {general && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{general}</p>}
          {Object.keys(errors).length > 0 && <p className="text-sm text-red-700" role="alert">Please check the {Object.keys(errors).length === 1 ? 'field' : `${Object.keys(errors).length} fields`} marked above.</p>}
          <button type="submit" disabled={sending} className="min-h-11 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
            {sending ? 'Sending…' : page.form.submitLabel}
          </button>
          <p className="text-xs text-gray-500">We use your details only to answer this request. Fields marked * are required.</p>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50">
      <main className="mx-auto max-w-lg px-4 py-10">{children}</main>
    </div>
  );
}

function FormInput({ field: f, value, error, onChange }: { field: FormField; value: string; error?: string; onChange: (v: string) => void }) {
  const id = `lp-${f.key}`;
  const describedBy = error ? `${id}-err` : undefined;
  const common = { id, name: f.key, 'aria-invalid': !!error, 'aria-describedby': describedBy, 'aria-required': f.required };
  const label = <span className="mb-1 block text-sm font-semibold text-gray-700">{f.label}{f.required && <span className="text-red-600"> *</span>}</span>;
  let control: React.ReactNode;
  if (f.type === 'checkbox') {
    return (
      <div>
        <label htmlFor={id} className="flex min-h-11 items-center gap-2 text-sm text-gray-700">
          <input {...common} type="checkbox" className="h-5 w-5" checked={value === 'yes'} onChange={(e) => onChange(e.target.checked ? 'yes' : '')} />
          {f.label}{f.required && <span className="text-red-600"> *</span>}
        </label>
        {error && <span id={describedBy} className="mt-1 block text-xs text-red-600">{error}</span>}
      </div>
    );
  }
  if (f.type === 'textarea') control = <textarea {...common} rows={4} className={input} value={value} onChange={(e) => onChange(e.target.value)} />;
  else if (f.type === 'select') {
    control = (
      <select {...common} className={input} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else {
    const auto = f.maps === 'name' ? 'name' : f.maps === 'email' ? 'email' : f.maps === 'phone' ? 'tel' : f.maps === 'street' ? 'street-address' : f.maps === 'city' ? 'address-level2' : f.maps === 'zip' ? 'postal-code' : undefined;
    control = <input {...common} type={f.type} autoComplete={auto} inputMode={f.type === 'tel' ? 'tel' : undefined} className={input} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <label htmlFor={id} className="block">
      {label}
      {control}
      {error && <span id={describedBy} className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
