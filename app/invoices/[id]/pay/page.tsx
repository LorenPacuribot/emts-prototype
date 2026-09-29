'use client';

/*
  Customer "Pay Invoice" page (live: /pay/invoice/[token], a public page).
  The customer sees the invoice and a payment card on the right where they
  pay the requested amount (or any amount up to the balance) by card.
  Payment is simulated: no card data is stored except the last 4 digits,
  and the payment is recorded on the invoice exactly like Record Payment.
*/
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { derivedInvoiceStatus, invoiceTotals, round2 } from '@/lib/calculations';
import { useCollection, useLogActivity, useLookups, useSingleton } from '@/lib/store';
import { fullName, initials, toISODate, uid } from '@/lib/utils';
import type { Payment } from '@/lib/types';
import { InvoiceDocument } from '@/components/invoices/InvoiceDocument';
import { FullScreen } from '@/components/invoices/FullScreen';
import { statusAfterPayments, usd, useInvoiceSaver } from '@/components/invoices/invoice-utils';

export default function PayInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const invoice = useCollection('invoices').get(id);
  const look = useLookups();
  const [biz] = useSingleton('businessProfile');
  const save = useInvoiceSaver();
  const log = useLogActivity();
  const { toast } = useToast();

  const t = invoice ? invoiceTotals(invoice) : null;
  const [amount, setAmount] = useState(0);
  const [card, setCard] = useState({ name: '', number: '', expiry: '', cvv: '', zip: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const [paid, setPaid] = useState<Payment | null>(null);
  const viewedOnce = useRef(false);

  // Default amount = requested amount from the last email, else the balance.
  useEffect(() => {
    if (!invoice || !t) return;
    setAmount(round2(Math.min(invoice.requestedAmount ?? t.balance, t.balance) || t.balance));
    setCard((c) => ({ ...c, name: c.name || fullName(look.customer(invoice.customerId)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id]);

  // Opening the pay link counts as the customer viewing the invoice.
  useEffect(() => {
    if (!invoice || viewedOnce.current || invoice.viewedAt) return;
    viewedOnce.current = true;
    save(invoice.id, { viewedAt: new Date().toISOString() }, 'Viewed by customer');
  }, [invoice, save]);

  if (!invoice || !t) {
    return (
      <FullScreen className="flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-500">This payment link is not valid.</p>
          <Link href="/invoices" className="mt-4 inline-block text-sm font-bold text-primary-600">Back to Invoices</Link>
        </div>
      </FullScreen>
    );
  }

  const status = derivedInvoiceStatus(invoice);
  const payable = status !== 'Paid' && status !== 'Void' && t.balance > 0;

  const pay = () => {
    const e: Record<string, string> = {};
    if (!card.name.trim()) e.name = 'Name on card is required';
    if (!/^\d{13,19}$/.test(card.number.replace(/\s/g, ''))) e.number = 'Enter a valid card number';
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(card.expiry)) e.expiry = 'Use MM/YY';
    if (!/^\d{3,4}$/.test(card.cvv)) e.cvv = 'Invalid CVV';
    if (!amount || amount < 1) e.amount = 'Minimum amount is $1';
    else if (amount > t.balance + 0.001) e.amount = `Cannot exceed ${usd(t.balance)}`;
    setErrors(e);
    if (Object.keys(e).length) return;

    setProcessing(true);
    // Simulate the gateway round trip.
    setTimeout(() => {
      const payment: Payment = {
        id: uid('pay'),
        date: toISODate(new Date()),
        amount: round2(amount),
        method: 'Credit Card',
        reference: `ch_${Math.random().toString(36).slice(2, 8)}`,
        note: 'Paid online',
        cardLast4: card.number.replace(/\s/g, '').slice(-4),
      };
      const payments = [...invoice.payments, payment];
      save(invoice.id, { payments, status: statusAfterPayments(invoice, payments) }, `Online payment received ${usd(payment.amount)}`);
      log(`${fullName(look.customer(invoice.customerId))} - Payment Received`, 'invoice', invoice.id);
      setProcessing(false);
      setPaid(payment);
      setCard((c) => ({ ...c, number: '', expiry: '', cvv: '' }));
      toast('Payment successful');
    }, 900);
  };

  return (
    <FullScreen>
      {/* Public header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black text-white" style={{ backgroundColor: biz.brandColor }}>{initials(biz.companyName)}</div>
          <div>
            <div className="font-heading text-sm font-bold text-gray-900">{biz.companyName}</div>
            <div className="text-xs text-gray-500">{biz.phone} • {biz.email}</div>
          </div>
        </div>
        <Link href={`/invoices/${invoice.id}`} className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700">
          <ArrowLeft className="h-3.5 w-3.5" /> Exit customer view
        </Link>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-8 p-4 md:p-8 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 print-area">
          <InvoiceDocument invoice={invoice} />
        </div>

        {/* Payment card */}
        <aside className="w-full shrink-0 xl:sticky xl:top-8 xl:w-96 print:hidden">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
            {paid ? (
              <div className="py-4 text-center">
                <CheckCircle2 className="mx-auto h-14 w-14 text-green-500" />
                <h2 className="mt-4 font-heading text-xl font-bold text-gray-900">Payment Successful</h2>
                <p className="mt-1 text-sm text-gray-500">{usd(paid.amount)} charged to card ending {paid.cardLast4}.</p>
                <p className="mt-1 text-xs text-gray-400">Confirmation {paid.reference}</p>
                <div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Remaining balance</span><span className="font-bold text-gray-900">{usd(t.balance)}</span></div>
                </div>
                {t.balance > 0 && <Button variant="secondary" className="mt-4 w-full" onClick={() => { setPaid(null); setAmount(t.balance); }}>Make another payment</Button>}
              </div>
            ) : !payable ? (
              <div className="py-6 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-gray-300" />
                <h2 className="mt-3 font-heading text-lg font-bold text-gray-900">{status === 'Void' ? 'This invoice was voided' : 'This invoice is paid in full'}</h2>
                <p className="mt-1 text-sm text-gray-500">No payment is due. Thank you!</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Amount Due</div>
                  <div className="mt-1 text-3xl font-black tracking-tight text-gray-900">{usd(t.balance)}</div>
                  <div className="text-xs text-gray-500">Invoice {invoice.invoiceNumber}</div>
                </div>
                <Field label="Payment Amount" error={errors.amount}>
                  <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} leftIcon={<span className="text-sm">$</span>} invalid={!!errors.amount} />
                </Field>
                <Field label="Name on Card" error={errors.name}>
                  <Input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} invalid={!!errors.name} />
                </Field>
                <Field label="Card Number" error={errors.number}>
                  <Input inputMode="numeric" placeholder="4242 4242 4242 4242" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, '').slice(0, 23) })} invalid={!!errors.number} />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Expiry" error={errors.expiry}>
                    <Input placeholder="MM/YY" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value.slice(0, 5) })} invalid={!!errors.expiry} />
                  </Field>
                  <Field label="CVV" error={errors.cvv}>
                    <Input placeholder="123" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.slice(0, 4) })} invalid={!!errors.cvv} />
                  </Field>
                  <Field label="ZIP">
                    <Input value={card.zip} onChange={(e) => setCard({ ...card, zip: e.target.value.slice(0, 10) })} />
                  </Field>
                </div>
                <Button size="lg" className="w-full" loading={processing} icon={<Lock className="h-4 w-4" />} onClick={pay}>
                  Pay {usd(amount || 0)}
                </Button>
                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-gray-400">
                  <ShieldCheck className="h-3.5 w-3.5" /> Secure payment. Card details are never stored.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </FullScreen>
  );
}
