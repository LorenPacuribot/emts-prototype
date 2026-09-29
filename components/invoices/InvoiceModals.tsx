'use client';

/*
  Invoice modals, copied from the live app's layouts:
  - RecordPaymentModal: balance due box, method tabs (Credit Card / Check /
    Cash / Bank Transfer), amount (max = balance), date, reference, notes.
    Card payments are simulated (no gateway): we keep only the last 4 digits.
  - SendInvoiceModal: To, Subject, Message, Requested Amount and the
    "Payment Link Included" info box. Sending marks the invoice Sent.
  - EditInvoiceModal: line items (description, qty, rate), tax, discount,
    dates, terms and notes.
*/
import { useState } from 'react';
import { Mail, Plus, Send, ShieldCheck, Trash2 } from 'lucide-react';
import type { Invoice, InvoiceLineItem, Payment } from '@/lib/types';
import { invoiceTotals, round2 } from '@/lib/calculations';
import { useCollection, useLogActivity, useLookups, useSingleton } from '@/lib/store';
import { cn, fullName, toISODate, uid } from '@/lib/utils';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { PAYMENT_TABS, statusAfterPayments, usd, useInvoiceSaver } from './invoice-utils';

/* ---------------- Record Payment ---------------- */

export function RecordPaymentModal({ invoice, open, onOpenChange }: { invoice: Invoice; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = invoiceTotals(invoice);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Record Payment" size="lg">
      {open && <RecordPaymentForm invoice={invoice} balance={t.balance} onDone={() => onOpenChange(false)} />}
    </Modal>
  );
}

function RecordPaymentForm({ invoice, balance, onDone }: { invoice: Invoice; balance: number; onDone: () => void }) {
  const save = useInvoiceSaver();
  const log = useLogActivity();
  const look = useLookups();
  const { toast } = useToast();
  const [mode, setMode] = useState<Payment['method']>('Credit Card');
  const [amount, setAmount] = useState(round2(balance));
  const [date, setDate] = useState(toISODate(new Date()));
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [card, setCard] = useState({ number: '', month: '', year: '', cvv: '' });
  const [saveCard, setSaveCard] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const e: Record<string, string> = {};
    if (!Number.isFinite(amount) || round2(amount) < 0.01) e.amount = 'Minimum amount is $0.01';
    else if (round2(amount) > balance) e.amount = `Cannot exceed balance due (${usd(balance)})`;
    if (mode === 'Credit Card') {
      const digits = card.number.replace(/\s/g, '');
      if (!/^\d{13,19}$/.test(digits)) e.number = 'Enter a valid card number';
      if (!/^(0?[1-9]|1[0-2])$/.test(card.month)) e.month = 'MM';
      if (!/^\d{2,4}$/.test(card.year)) e.year = 'YY';
      if (!/^\d{3,4}$/.test(card.cvv)) e.cvv = 'CVV';
    }
    setErrors(e);
    if (Object.keys(e).length) return;

    const payment: Payment = {
      id: uid('pay'),
      date,
      amount: round2(amount),
      method: mode,
      reference: mode === 'Credit Card' ? `ch_${Math.random().toString(36).slice(2, 8)}` : reference || undefined,
      note: note || undefined,
      cardLast4: mode === 'Credit Card' ? card.number.replace(/\s/g, '').slice(-4) : undefined,
    };
    const payments = [...invoice.payments, payment];
    save(invoice.id, { payments, status: statusAfterPayments(invoice, payments) }, `Payment received ${usd(payment.amount)}`);
    log(`${fullName(look.customer(invoice.customerId))} - Payment Received`, 'invoice', invoice.id);
    toast(mode === 'Credit Card' ? 'Payment processed successfully' : 'Payment recorded successfully');
    onDone();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-4">
        <span className="text-sm font-bold text-gray-500">Balance Due</span>
        <span className="text-xl font-bold text-gray-900">{usd(balance)}</span>
      </div>

      <div className="flex gap-2">
        {PAYMENT_TABS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => { setMode(o.value); setErrors({}); }}
            className={cn(
              'flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition-all',
              mode === o.value ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Payment Amount ($)" required error={errors.amount} hint={`Maximum: ${usd(balance)}`}>
          <Input type="number" step="0.01" min={0.01} value={amount} max={balance} onChange={(e) => setAmount(Number(e.target.value))} invalid={!!errors.amount} />
        </Field>
        <Field label="Payment Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      {mode === 'Credit Card' && (
        <div className="space-y-4">
          <div className="flex gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <p className="text-xs font-medium text-blue-700">Card data is tokenized securely by Authorize.Net. PCI compliant.</p>
          </div>
          <Field label="Card Number" required error={errors.number}>
            <Input
              inputMode="numeric"
              placeholder="4242 4242 4242 4242"
              value={card.number}
              onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, '').slice(0, 23) })}
              invalid={!!errors.number}
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Month" required error={errors.month}>
              <Input placeholder="MM" value={card.month} onChange={(e) => setCard({ ...card, month: e.target.value.slice(0, 2) })} invalid={!!errors.month} />
            </Field>
            <Field label="Year" required error={errors.year}>
              <Input placeholder="YY" value={card.year} onChange={(e) => setCard({ ...card, year: e.target.value.slice(0, 4) })} invalid={!!errors.year} />
            </Field>
            <Field label="CVV" required error={errors.cvv}>
              <Input placeholder="123" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.slice(0, 4) })} invalid={!!errors.cvv} />
            </Field>
          </div>
          <Checkbox checked={saveCard} onChange={setSaveCard} label="Save card for future payments" />
        </div>
      )}

      {(mode === 'Check' || mode === 'ACH') && (
        <Field label={mode === 'Check' ? 'Check Number / Reference' : 'Reference Number'}>
          <Input placeholder={mode === 'Check' ? 'e.g. 1024' : 'e.g. TXN-9876'} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      )}

      <Field label="Notes">
        <Textarea rows={2} className="min-h-[64px]" placeholder="Optional payment notes..." value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" className="flex-1" onClick={onDone}>Cancel</Button>
        <Button className="flex-1" onClick={submit}>{mode === 'Credit Card' ? 'Charge Card' : 'Record Payment'}</Button>
      </div>
    </div>
  );
}

/* ---------------- Send Invoice ---------------- */

export function SendInvoiceModal({ invoice, open, onOpenChange }: { invoice: Invoice; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Send Invoice" size="lg">
      {open && <SendInvoiceForm invoice={invoice} onDone={() => onOpenChange(false)} />}
    </Modal>
  );
}

function SendInvoiceForm({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const look = useLookups();
  const [biz] = useSingleton('businessProfile');
  const [fin] = useSingleton('financialSettings');
  const save = useInvoiceSaver();
  const log = useLogActivity();
  const { toast } = useToast();
  const customer = look.customer(invoice.customerId);
  const project = look.estimate(invoice.estimateId)?.title ?? look.job(invoice.jobId)?.title ?? 'your project';
  const t = invoiceTotals(invoice);
  // First send asks for the deposit (if any); a resend asks for the full balance.
  const defaultAmount = invoice.sentAt || invoice.invoiceType !== 'Final' ? t.balance : round2(Math.min(t.balance, (t.total * fin.depositPercent) / 100));

  const [to, setTo] = useState(customer?.email ?? '');
  const [subject, setSubject] = useState(`Invoice ${invoice.invoiceNumber} from ${biz.companyName}`);
  const [message, setMessage] = useState(
    `Hi ${customer?.firstName ?? ''},\n\nPlease find attached invoice ${invoice.invoiceNumber} for ${project}.\n\nYou can view and pay the invoice securely online at the link below.\n\nThank you for your business!\n\nBest regards,\n${biz.companyName}`,
  );
  const [amount, setAmount] = useState(defaultAmount);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const send = () => {
    const e: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(to)) e.to = 'Enter a valid email address';
    if (!subject.trim()) e.subject = 'Subject is required';
    if (!message.trim()) e.message = 'Message is required';
    if (!Number.isFinite(amount) || round2(amount) < 0.01) e.amount = 'Minimum amount is $0.01';
    else if (round2(amount) > t.balance) e.amount = `Amount cannot exceed balance due (${usd(t.balance)})`;
    setErrors(e);
    if (Object.keys(e).length) return;
    const now = new Date().toISOString();
    const status = invoice.status === 'Draft' || invoice.status === 'Unpaid' ? 'Sent' : invoice.status;
    save(invoice.id, { status, sentAt: now, requestedAmount: round2(amount) }, `${invoice.sentAt ? 'Resent' : 'Sent'} to ${to} (requested ${usd(amount)})`);
    log(`${fullName(customer)} - Invoice Sent`, 'invoice', invoice.id);
    toast('Invoice sent successfully');
    onDone();
  };

  return (
    <div className="space-y-5">
      <Field label="To" error={errors.to}>
        <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@email.com" invalid={!!errors.to} />
      </Field>
      <Field label="Subject" error={errors.subject}>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} invalid={!!errors.subject} />
      </Field>
      <Field label="Message" error={errors.message}>
        <Textarea rows={8} value={message} onChange={(e) => setMessage(e.target.value)} invalid={!!errors.message} />
      </Field>
      <Field label="Requested Amount" required error={errors.amount} hint={`Balance due: ${usd(t.balance)}`}>
        <Input type="number" step="0.01" min={0.01} max={t.balance} value={amount} onChange={(e) => setAmount(Number(e.target.value))} leftIcon={<span className="text-sm font-medium">$</span>} invalid={!!errors.amount} />
      </Field>
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <div className="mt-0.5 rounded-lg bg-blue-100 p-1.5 text-blue-600"><Mail className="h-4 w-4" /></div>
        <div>
          <h4 className="text-sm font-bold text-blue-800">Payment Link Included</h4>
          <p className="mt-1 text-xs leading-relaxed text-blue-600">The email will automatically include a secure link for the client to view and pay this invoice online.</p>
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <Button variant="secondary" className="flex-1" onClick={onDone}>Cancel</Button>
        <Button className="flex-[2]" icon={<Send className="h-4 w-4" />} onClick={send}>Send Invoice</Button>
      </div>
    </div>
  );
}

/* ---------------- Edit Invoice ---------------- */

export function EditInvoiceModal({ invoice, open, onOpenChange }: { invoice: Invoice; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit Invoice" description={invoice.invoiceNumber} size="xl">
      {open && <EditInvoiceForm invoice={invoice} onDone={() => onOpenChange(false)} />}
    </Modal>
  );
}

function EditInvoiceForm({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const save = useInvoiceSaver();
  const { toast } = useToast();
  const { items: termsList } = useCollection('termsConditions');
  const [lines, setLines] = useState<InvoiceLineItem[]>(invoice.lineItems);
  const [taxRate, setTaxRate] = useState(invoice.taxRate);
  const [discount, setDiscount] = useState(invoice.discount);
  const [date, setDate] = useState(invoice.date.slice(0, 10));
  const [dueDate, setDueDate] = useState(invoice.dueDate.slice(0, 10));
  const [notes, setNotes] = useState(invoice.notes ?? '');
  const [termsId, setTermsId] = useState(invoice.termsId ?? '');
  const [error, setError] = useState('');

  const t = invoiceTotals({ lineItems: lines, taxRate, discount, payments: invoice.payments });
  const setLine = (id: string, patch: Partial<InvoiceLineItem>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const submit = () => {
    if (lines.some((l) => !l.description.trim())) return setError('Every line needs a description.');
    if (lines.some((l) => l.quantity <= 0 || l.rate < 0)) return setError('Quantity must be above 0 and rate cannot be negative.');
    if (dueDate < date) return setError('Due date cannot be before the invoice date.');
    if (discount < 0 || discount > t.subtotal) return setError('Discount must be between $0 and the subtotal.');
    if (t.total < t.paid) return setError(`Total cannot be less than the amount already paid (${usd(t.paid)}).`);
    const next = { ...invoice, lineItems: lines, taxRate, discount };
    save(
      invoice.id,
      { lineItems: lines, taxRate, discount, date, dueDate, notes, termsId: termsId || undefined, status: statusAfterPayments(next, invoice.payments) },
      'Invoice updated',
    );
    toast('Invoice saved');
    onDone();
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-600">Line Items</div>
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="w-24 px-3 py-2 text-left">Qty</th>
                <th className="w-32 px-3 py-2 text-left">Rate ($)</th>
                <th className="w-28 px-3 py-2 text-right">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2"><Input value={l.description} onChange={(e) => setLine(l.id, { description: e.target.value })} placeholder="Description" /></td>
                  <td className="px-3 py-2"><Input type="number" min={0} value={l.quantity} onChange={(e) => setLine(l.id, { quantity: Number(e.target.value) })} /></td>
                  <td className="px-3 py-2"><Input type="number" step="0.01" min={0} value={l.rate} onChange={(e) => setLine(l.id, { rate: Number(e.target.value) })} /></td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{usd(l.quantity * l.rate)}</td>
                  <td className="px-2 py-2">
                    <button onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label="Remove line">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-500">No line items yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Button variant="outline" size="sm" className="mt-3" icon={<Plus className="h-4 w-4" />} onClick={() => setLines((ls) => [...ls, { id: uid('il'), description: '', quantity: 1, rate: 0 }])}>
          Add Line Item
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Tax Rate (%)"><Input type="number" step="0.01" min={0} value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} /></Field>
        <Field label="Discount ($)"><Input type="number" step="0.01" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></Field>
        <Field label="Invoice Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Due Date"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Terms & Conditions">
          <Select value={termsId} onChange={setTermsId} options={termsList.map((x) => ({ value: x.id, label: x.name }))} placeholder="None" />
        </Field>
        <Field label="Notes"><Textarea rows={2} className="min-h-[40px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>

      <div className="ml-auto w-full max-w-xs space-y-1.5 rounded-xl bg-gray-50 p-4 text-sm">
        <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="font-semibold text-gray-900">{usd(t.subtotal)}</span></div>
        <div className="flex justify-between text-gray-500"><span>Discount</span><span className="font-semibold text-green-600">-{usd(t.discount)}</span></div>
        <div className="flex justify-between text-gray-500"><span>Tax</span><span className="font-semibold text-gray-900">{usd(t.tax)}</span></div>
        <div className="flex justify-between border-t border-gray-200 pt-1.5 font-bold text-gray-900"><span>Total</span><span>{usd(t.total)}</span></div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button onClick={submit}>Save Changes</Button>
      </div>
    </div>
  );
}
