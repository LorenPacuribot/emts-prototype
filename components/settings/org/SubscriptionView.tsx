'use client';

/*
  Settings > Subscription & Billing. Mirrors the live screen:
  current method badge, current plan card, usage this billing cycle,
  plan tier cards (Switch Plan), "Ala Carte Setup Services" add-ons
  (Order Setup), billing history table and the custom-workflow banner.

  The plan and add-on catalogs are fixed (like the live API's catalog).
  Everything the user changes (plan, card, add-ons, cancel) is saved to the
  `subscription` singleton, and each purchase adds a billing history row.
  Usage numbers are counted from the local store for the current cycle.
*/
import React, { useMemo, useState } from 'react';
import {
  ArrowDownCircle, ArrowRight, ArrowRightLeft, ArrowUpCircle, Briefcase, Check, Clock, CreditCard, FileText,
  LifeBuoy, Mail, MessageSquare, Palette, Receipt, Send, Settings, Sparkles, Star, UserCheck, Zap,
} from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/form';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useDb, useSingleton } from '@/lib/store';
import { cn, longDate, toISODate, uid } from '@/lib/utils';
import type { Subscription } from '@/lib/types';
import { SegmentedToggle } from '@/components/settings/config/ui';

/* ---------- Catalogs (from the live screen) ---------- */

interface Plan { key: string; name: string; price: number; description: string; features: string[]; icon: typeof Star; accent: string }
const PLANS: Plan[] = [
  {
    key: 'GROWTH', name: 'Growth', price: 129, icon: Star, accent: 'border-amber-200 bg-amber-50 text-amber-600',
    description: 'Everything in Starter plus job scheduling, advanced costing, email conversations, presentations, custom roles, and reports.',
    features: ['CRM', 'Leads', 'Estimates', 'Invoicing', 'Job Scheduling', 'Advanced Costing', 'Email Conversations', 'Presentation Builder', 'Custom Roles', 'Reports'],
  },
  {
    key: 'PLATINUM', name: 'PLATINUM-DONE FOR YOU', price: 499, icon: Sparkles, accent: 'border-amber-300 bg-amber-100 text-amber-900',
    description: 'Hit the ground running with our Platinum package that sets you up for long term success. Our DONE FOR YOU package customizes Estimate Master to your specific needs like your own goals, surface rates, paint library, presentations, and templates. Get: All surface rates added, All Paints & Materials added, 5 Exterior Templates, 5 Interior Templates, 4 Presentations',
    features: ['Priority Support'],
  },
  {
    key: 'INSTANT', name: 'INSTANT GROWTH', price: 299, icon: Sparkles, accent: 'border-amber-300 bg-amber-100 text-amber-900',
    description: 'Instant, ready to go templates, surface rates, paint library, and presentation.',
    features: ['Priority Support'],
  },
];

type Cadence = 'MONTHLY' | 'YEARLY' | 'LIFETIME';
interface Addon { key: string; name: string; description: string; icon: typeof Zap; prices: Partial<Record<Cadence, number>> }
const ADDONS: Addon[] = [
  { key: 'master', name: 'Master Acceleration Setup', icon: Zap, prices: { LIFETIME: 499 }, description: 'Instant, ready to go templates, surface rates, paint library, and presentation.' },
  { key: 'platinum', name: 'PLATINUM-DONE FOR YOU', icon: Zap, prices: { LIFETIME: 799 }, description: 'Hit the ground running with our Platinum package that sets you up for long term success. Our DONE FOR YOU package customizes Estimate Master to your needs.' },
  { key: 'polish', name: 'Presentation Polish', icon: Palette, prices: { MONTHLY: 50, YEARLY: 200, LIFETIME: 500 }, description: 'We set up your branding, portfolio, and artisans story pages' },
];
const CADENCE_LABEL: Record<Cadence, string> = { MONTHLY: 'Monthly', YEARLY: 'Yearly', LIFETIME: 'Lifetime' };
const CADENCE_SUFFIX: Record<Cadence, string> = { MONTHLY: '/mo', YEARLY: '/yr', LIFETIME: '' };
const headline = (a: Addon): Cadence => (a.prices.MONTHLY ? 'MONTHLY' : a.prices.YEARLY ? 'YEARLY' : 'LIFETIME');
const dollars = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

/** Visa / Mastercard / Amex / Discover from the first digits. */
const cardBrand = (num: string) => (/^4/.test(num) ? 'Visa' : /^(5[1-5]|2[2-7])/.test(num) ? 'Mastercard' : /^3[47]/.test(num) ? 'Amex' : /^6/.test(num) ? 'Discover' : 'Card');

export function SubscriptionView() {
  const [sub, setSub] = useSingleton('subscription');
  const db = useDb();
  const { toast } = useToast();
  const [switchTo, setSwitchTo] = useState<Plan | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [buy, setBuy] = useState<Addon | null>(null);

  const current = PLANS.find((p) => p.name.toLowerCase() === sub.planName.toLowerCase());
  const cancelled = sub.status === 'Cancelled';
  const pm = sub.paymentMethod;

  // Billing cycle = the month ending on the renewal date.
  const cycleEnd = new Date(sub.renewsAt + 'T12:00:00');
  const cycleStart = new Date(cycleEnd);
  cycleStart.setMonth(cycleStart.getMonth() - 1);

  const usage = useMemo(() => {
    const inCycle = (iso?: string) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= cycleStart.getTime() && t <= cycleEnd.getTime();
    };
    const c = db.collections;
    const email = c.messages.filter((m) => m.channel === 'email' && inCycle(m.date)).length;
    const sms = c.messages.filter((m) => m.channel === 'sms' && inCycle(m.date)).length;
    return [
      { label: 'Estimates', icon: FileText, used: c.estimates.filter((e) => inCycle(e.createdAt)).length, max: -1 },
      { label: 'Jobs', icon: Briefcase, used: c.jobs.filter((j) => inCycle(j.createdAt)).length, max: -1 },
      { label: 'Invoices', icon: Receipt, used: c.invoices.filter((i) => inCycle(i.date)).length, max: -1 },
      { label: 'Outbound Emails', icon: Mail, used: email, max: 500 },
      { label: 'Transactional Emails', icon: Send, used: email + c.invoices.length, max: -1 },
      { label: 'Transactional SMS', icon: MessageSquare, used: sms, max: -1 },
    ];
  }, [db, cycleStart, cycleEnd]);

  const addHistory = (description: string, amount: number, type: 'charge' | 'refund' = 'charge') => {
    const n = sub.billingHistory.length + 1;
    const row = { id: uid('bh'), date: toISODate(new Date()), invoiceNumber: `INV-${String(n).padStart(5, '0')}`, description, amount, status: 'Paid' as const, type };
    return [row, ...sub.billingHistory];
  };

  const doSwitch = (p: Plan) => {
    const diff = p.price - sub.price;
    const desc = `${diff >= 0 ? 'Upgrade' : 'Downgrade'}: ${sub.planName.toUpperCase()} → ${p.name.toUpperCase()}`;
    setSub({ planName: p.name, price: p.price, status: 'Active', billingHistory: addHistory(desc, Math.abs(diff), diff >= 0 ? 'charge' : 'refund') });
    toast(`Switched to ${p.name}`);
  };

  const owned = (a: Addon) => sub.addOns.some((x) => x.name === a.name && x.active);

  return (
    <SettingsPage
      title="Subscription & Billing"
      subtitle="Manage your platform access and professional setup services."
      actions={
        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex h-8 w-12 items-center justify-center rounded-md bg-[#1a1f71] text-[10px] font-black italic text-white">{pm.brand.toUpperCase().slice(0, 4)}</div>
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase leading-none tracking-widest text-gray-400">Current Method</div>
            <div className="text-sm font-bold leading-none text-gray-900">{pm.brand} •••• {pm.last4}</div>
          </div>
          <button type="button" onClick={() => setPayOpen(true)} className="ml-2 text-sm font-bold text-primary-600 hover:underline">Update</button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Current plan */}
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Current Plan</div>
            <div className="mt-1 font-heading text-base font-bold text-gray-900">
              {sub.planName} — ${sub.price}/mo {cancelled && <Badge className="ml-2 border-red-200 bg-red-50 text-red-700">Cancelled</Badge>}
            </div>
            <div className="mt-1 text-xs text-gray-500">Card: {pm.brand} ending in {pm.last4}</div>
            <div className="mt-0.5 text-xs text-gray-500">{cancelled ? 'Access ends' : 'Renews'}: {longDate(sub.renewsAt)}</div>
          </div>
          {cancelled ? (
            <Button size="sm" onClick={() => { setSub({ status: 'Active' }); toast('Subscription reactivated'); }}>Reactivate</Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setCancelOpen(true)}>Cancel Subscription</Button>
          )}
        </div>

        {/* Usage */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Usage This Billing Cycle</h3>
            <span className="text-xs text-gray-500">{longDate(toISODate(cycleStart))} – {longDate(sub.renewsAt)}</span>
          </div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
            {usage.map(({ label, icon: Icon, used, max }) => {
              const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
              return (
                <div key={label}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-medium text-gray-700"><Icon className="h-3.5 w-3.5 text-gray-400" />{label}</span>
                    <span className="text-xs font-bold text-gray-900">{used}<span className="text-gray-400"> / {max === -1 ? 'Unlimited' : max}</span></span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                    {max === -1 ? <div className="h-full w-full rounded-full bg-gray-200" /> : <div className={cn('h-full rounded-full', pct > 80 ? 'bg-red-500' : 'bg-primary-500')} style={{ width: `${pct}%` }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 gap-5 pt-4 md:grid-cols-3">
          {PLANS.map((p) => {
            const isCurrent = p === current;
            const Icon = p.icon;
            return (
              <div key={p.key} className={cn('flex flex-col rounded-3xl bg-white p-6 shadow-lg transition-all', isCurrent ? 'ring-2 ring-primary-500 ring-offset-4' : 'hover:-translate-y-1 hover:shadow-xl')}>
                <div className={cn('mb-5 flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm', p.accent)}><Icon className="h-5 w-5" /></div>
                <h3 className="font-heading text-lg font-bold text-gray-900">{p.name}</h3>
                <div className="mb-3 flex items-baseline gap-1">
                  <span className="text-2xl font-black text-gray-900">${p.price}</span>
                  <span className="text-[10px] font-bold text-gray-400">/mo</span>
                </div>
                <p className="min-h-[40px] text-xs leading-relaxed text-gray-500">{p.description}</p>
                <div className="mb-8 mt-5 flex-1 space-y-3">
                  {p.features.map((f) => (
                    <div key={f} className="flex items-center gap-3">
                      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full', isCurrent ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400')}><Check className="h-2.5 w-2.5" /></span>
                      <span className="text-[10px] font-medium uppercase text-gray-600">{f}</span>
                    </div>
                  ))}
                </div>
                {isCurrent ? (
                  <Button disabled className="h-12 w-full rounded-xl border-none bg-gray-500 text-white disabled:opacity-100" icon={<UserCheck className="h-5 w-5" />}>Current Plan</Button>
                ) : (
                  <Button className="h-12 w-full rounded-xl" icon={<ArrowRightLeft className="h-5 w-5" />} onClick={() => setSwitchTo(p)}>Switch Plan</Button>
                )}
              </div>
            );
          })}
        </div>

        {/* Add-ons */}
        <div className="pt-8">
          <h3 className="font-heading text-xl font-bold text-gray-900">Ala Carte Setup Services</h3>
          <p className="mb-6 text-xs text-gray-500">One-time expert assistance to get your platform running at peak performance.</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {ADDONS.map((a) => {
              const Icon = a.icon;
              const has = owned(a);
              const h = headline(a);
              return (
                <div key={a.key} className={cn('group flex items-center gap-5 rounded-3xl border bg-white p-5 shadow-sm transition-all', has ? 'border-green-200' : 'border-gray-200 hover:border-primary-300')}>
                  <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-inner', has ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400 group-hover:bg-primary-50 group-hover:text-primary-600')}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <h4 className="font-bold text-gray-900 group-hover:text-primary-700">{a.name}</h4>
                      <div className="whitespace-nowrap font-black text-primary-600">{dollars(a.prices[h]!)}<span className="ml-0.5 text-[10px] font-bold text-gray-400">{CADENCE_SUFFIX[h]}</span></div>
                    </div>
                    <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-gray-500">{a.description}</p>
                    {!has && (
                      <div className="mb-3 grid grid-cols-3 gap-1.5">
                        {(['MONTHLY', 'YEARLY', 'LIFETIME'] as Cadence[]).map((c) => (
                          <div key={c} className={cn('rounded-lg border px-2 py-1 text-center', a.prices[c] ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 opacity-50')}>
                            <div className="text-[7px] font-bold uppercase tracking-wider text-gray-400">{CADENCE_LABEL[c]}</div>
                            <div className="text-[10px] font-black text-gray-900">{a.prices[c] ? dollars(a.prices[c]!) : '—'}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {has ? (
                      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-green-600"><Check className="h-3 w-3" /> Already Active</div>
                    ) : (
                      <button type="button" onClick={() => setBuy(a)} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary-600 transition-all hover:gap-3">
                        Order Setup <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Billing history */}
        <div className="pt-8">
          <div className="mb-6 flex items-center gap-4 border-b border-gray-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-gray-400"><Clock className="h-5 w-5" /></div>
            <h3 className="font-heading text-xl font-bold text-gray-900">Billing History</h3>
          </div>
          {sub.billingHistory.length === 0 ? (
            <div className="rounded-3xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">No billing transactions yet.</div>
          ) : (
            <div className="overflow-x-auto rounded-3xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    {['Date', 'Invoice', 'Description', 'Type', 'Method', 'Amount', 'Status'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sub.billingHistory.map((t) => {
                    const credit = t.type === 'refund' || t.type === 'credit';
                    return (
                      <tr key={t.id} className="hover:bg-gray-50/50">
                        <td className="whitespace-nowrap px-4 py-3.5 font-medium text-gray-900">{new Date(t.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[10px] text-gray-400">{t.invoiceNumber ?? '—'}</td>
                        <td className="px-4 py-3.5 text-gray-600">{t.description}</td>
                        <td className="px-4 py-3.5">
                          <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                            {credit ? <ArrowDownCircle className="h-3.5 w-3.5 text-blue-500" /> : <ArrowUpCircle className="h-3.5 w-3.5 text-green-500" />}
                            {t.type === 'refund' ? 'Refund' : t.type === 'credit' ? 'Credit' : 'Charge'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-gray-500"><span className="flex items-center gap-2"><CreditCard className="h-3 w-3" />{pm.brand} {pm.last4}</span></td>
                        <td className={cn('whitespace-nowrap px-4 py-3.5 font-bold', credit ? 'text-blue-600' : 'text-gray-900')}>{credit ? '-' : ''}${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3.5">
                          <Badge className={t.status === 'Paid' ? 'border-gray-200 bg-gray-50 text-gray-600' : t.status === 'Failed' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
                            {t.status === 'Paid' ? 'Approved' : t.status === 'Failed' ? 'Declined' : 'Pending'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Support banner */}
        <div className="relative mt-6 flex flex-col items-center justify-between gap-8 overflow-hidden rounded-[2.5rem] bg-slate-900 p-8 text-white md:flex-row md:p-10">
          <Settings className="absolute -bottom-10 right-10 h-40 w-40 opacity-10" />
          <div className="relative z-10 max-w-xl text-center md:text-left">
            <h4 className="mb-3 font-heading text-xl font-bold">Need a completely custom workflow?</h4>
            <p className="text-sm leading-relaxed text-slate-400">Our implementation engineers can build custom API integrations or high-volume enterprise templates tailored to your specific business model.</p>
          </div>
          <a href="/support" className="relative z-10 inline-flex h-12 shrink-0 items-center rounded-xl bg-white px-8 text-sm font-bold text-slate-900 shadow-lg hover:bg-slate-100">
            <LifeBuoy className="mr-2 h-4 w-4" /> Contact Support
          </a>
        </div>
      </div>

      <ConfirmDialog
        open={!!switchTo}
        onOpenChange={(v) => !v && setSwitchTo(null)}
        variant="primary"
        title="Switch Plan"
        confirmLabel="Confirm Switch"
        message={switchTo && (
          <div className="space-y-2">
            <p>Switch from <b>{sub.planName}</b> (${sub.price}/mo) to <b>{switchTo.name}</b> (${switchTo.price}/mo)?</p>
            <p className="text-xs text-gray-500">The prorated difference is charged or refunded to your {pm.brand} ending in {pm.last4} today.</p>
          </div>
        )}
        onConfirm={() => switchTo && doSwitch(switchTo)}
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel Subscription"
        confirmLabel="Cancel Subscription"
        message={`Your ${sub.planName} plan stays active until ${longDate(sub.renewsAt)}. After that you will lose access to your account data.`}
        onConfirm={() => { setSub({ status: 'Cancelled' }); toast('Subscription cancelled'); }}
      />

      <UpdatePaymentModal open={payOpen} onOpenChange={setPayOpen} onSave={(paymentMethod) => { setSub({ paymentMethod }); toast('Payment method updated successfully'); }} />

      {buy && (
        <PurchaseAddonModal
          addon={buy}
          card={`${pm.brand} ending in ${pm.last4}`}
          onClose={() => setBuy(null)}
          onBuy={(c) => {
            const price = buy.prices[c]!;
            setSub({
              addOns: [...sub.addOns.filter((x) => x.name !== buy.name), { id: uid('ao'), name: buy.name, price, active: true }],
              billingHistory: addHistory(`${buy.name} (${c})`, price),
            });
            toast(`${buy.name} ordered successfully`);
            setBuy(null);
          }}
        />
      )}
    </SettingsPage>
  );
}

/** Card form with basic checks (16 digits, MM/YY in the future, 3-4 digit CVC). */
function UpdatePaymentModal({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; onSave: (pm: Subscription['paymentMethod']) => void }) {
  const empty = { name: '', number: '', exp: '', cvc: '' };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof empty, v: string) => { setF((s) => ({ ...s, [k]: v })); setErr((e) => ({ ...e, [k]: '' })); };
  const close = (v: boolean) => { if (!v) { setF(empty); setErr({}); } onOpenChange(v); };

  const submit = () => {
    const e: Record<string, string> = {};
    const num = f.number.replace(/\D/g, '');
    const [mm, yy] = f.exp.split('/').map((x) => parseInt(x, 10));
    if (!f.name.trim()) e.name = 'Cardholder name is required';
    if (num.length < 15 || num.length > 16) e.number = 'Enter a valid card number';
    const now = new Date();
    if (!mm || !yy || mm < 1 || mm > 12) e.exp = 'Use MM/YY';
    else if (2000 + yy < now.getFullYear() || (2000 + yy === now.getFullYear() && mm < now.getMonth() + 1)) e.exp = 'Card is expired';
    if (!/^\d{3,4}$/.test(f.cvc)) e.cvc = 'Enter 3-4 digits';
    setErr(e);
    if (Object.keys(e).length) return;
    onSave({ brand: cardBrand(num), last4: num.slice(-4), expMonth: mm!, expYear: 2000 + yy! });
    close(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Update Payment Method"
      description="Your new card will be used for future renewals and add-ons."
      footer={<><Button variant="secondary" onClick={() => close(false)}>Cancel</Button><Button onClick={submit}>Save Card</Button></>}
    >
      <div className="space-y-4">
        <Field label="Cardholder Name" required error={err.name}><Input value={f.name} placeholder="Jane Doe" invalid={!!err.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Card Number" required error={err.number}>
          <Input
            value={f.number}
            inputMode="numeric"
            placeholder="4111 1111 1111 1111"
            invalid={!!err.number}
            onChange={(e) => set('number', e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Expiry (MM/YY)" required error={err.exp}>
            <Input
              value={f.exp}
              placeholder="12/28"
              invalid={!!err.exp}
              onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 4); set('exp', d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d); }}
            />
          </Field>
          <Field label="CVC" required error={err.cvc}><Input value={f.cvc} placeholder="123" invalid={!!err.cvc} onChange={(e) => set('cvc', e.target.value.replace(/\D/g, '').slice(0, 4))} /></Field>
        </div>
      </div>
    </Modal>
  );
}

/** Pick a billing cadence for an add-on and confirm the charge. */
function PurchaseAddonModal({ addon, card, onClose, onBuy }: { addon: Addon; card: string; onClose: () => void; onBuy: (c: Cadence) => void }) {
  const options = (['MONTHLY', 'YEARLY', 'LIFETIME'] as Cadence[]).filter((c) => addon.prices[c]);
  const [cadence, setCadence] = useState<Cadence>(options[0]!);
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={addon.name}
      description={addon.description}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onBuy(cadence)}>Order Setup — {dollars(addon.prices[cadence]!)}</Button></>}
    >
      <div className="space-y-4">
        {options.length > 1 && <SegmentedToggle value={cadence} onChange={setCadence} options={options.map((c) => ({ value: c, label: CADENCE_LABEL[c] }))} />}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Billing</span><span className="font-bold text-gray-900">{CADENCE_LABEL[cadence]}</span></div>
          <div className="mt-2 flex justify-between"><span className="text-gray-500">Price</span><span className="font-bold text-gray-900">{dollars(addon.prices[cadence]!)}{CADENCE_SUFFIX[cadence]}</span></div>
          <div className="mt-2 flex justify-between"><span className="text-gray-500">Charged to</span><span className="font-bold text-gray-900">{card}</span></div>
        </div>
      </div>
    </Modal>
  );
}
