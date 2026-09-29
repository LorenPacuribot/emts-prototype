'use client';

/*
  Create Invoice. Opened from the Invoices list or from a job (?jobId=...).
  Fields follow the live Create Invoice modal (Job, Invoice Type, Amount,
  Due Date, Notes) with the line items pre-filled from the job's estimate:
    - Final:    one line per estimate area + extras (full amount)
    - Deposit:  one line for Financial Settings > deposit % of the estimate
    - Progress: one line for a custom % of the estimate
  Without a job you can pick a customer and add lines on the next screen.
*/
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Receipt } from 'lucide-react';
import Link from 'next/link';
import { PageShell } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, ListSkeleton, PageHeader } from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { estimateTotals, invoiceTotals, round2 } from '@/lib/calculations';
import { useCollection, useLogActivity, useLookups, useNextNumber, useSingleton } from '@/lib/store';
import { fullName, toISODate } from '@/lib/utils';
import type { Invoice, InvoiceLineItem } from '@/lib/types';
import { addDays, linesFromEstimate, usd } from '@/components/invoices/invoice-utils';

type InvType = NonNullable<Invoice['invoiceType']>;

function NewInvoiceForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const look = useLookups();
  const nextNumber = useNextNumber();
  const log = useLogActivity();
  const { items: jobs } = useCollection('jobs');
  const { items: customers } = useCollection('customers');
  const { items: terms } = useCollection('termsConditions');
  const { add } = useCollection('invoices');
  const [fin] = useSingleton('financialSettings');

  const today = toISODate(new Date());
  const [jobId, setJobId] = useState(params.get('jobId') ?? '');
  const [customerId, setCustomerId] = useState('');
  const [type, setType] = useState<InvType>('Final');
  const [percent, setPercent] = useState(fin.depositPercent);
  const [date, setDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDays(today, fin.paymentTermsDays));
  const [notes, setNotes] = useState('Thank you for your business!');
  const [termsId, setTermsId] = useState(terms.find((t) => t.isDefault)?.id ?? '');
  const [error, setError] = useState<Record<string, string>>({});

  const job = look.job(jobId);
  const estimate = look.estimate(job?.estimateId);

  // Keep the customer in sync with the chosen job.
  useEffect(() => {
    if (job) setCustomerId(job.customerId);
  }, [job]);
  // Deposit uses the configured percent; Progress lets you type one.
  useEffect(() => {
    if (type === 'Deposit') setPercent(fin.depositPercent);
    if (type === 'Progress') setPercent(50);
  }, [type, fin.depositPercent]);

  const lines: InvoiceLineItem[] = useMemo(() => {
    if (!estimate) return [];
    if (type === 'Final') return linesFromEstimate(estimate);
    const total = estimateTotals(estimate).total;
    return [{ id: 'preview', description: `${type} (${percent}%) — ${estimate.title}`, quantity: 1, rate: round2((total * percent) / 100) }];
  }, [estimate, type, percent]);
  const total = invoiceTotals({ lineItems: lines, taxRate: 0, discount: 0, payments: [] }).total;

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!customerId) errs.customer = 'Select a job or a customer';
    if (type !== 'Final' && (percent <= 0 || percent > 100)) errs.percent = 'Enter a percent between 1 and 100';
    if (dueDate && dueDate < date) errs.dueDate = 'Due date cannot be before the invoice date';
    setError(errs);
    if (Object.keys(errs).length) return;

    const number = nextNumber('INVOICE');
    const now = new Date().toISOString();
    const saved = add(
      {
        id: number,
        invoiceNumber: number,
        customerId,
        jobId: job?.id,
        estimateId: estimate?.id,
        leadId: job?.leadId ?? estimate?.leadId,
        date,
        dueDate,
        status: 'Draft',
        invoiceType: type,
        lineItems: lines.map((l, i) => ({ ...l, id: `il_${Date.now().toString(36)}_${i}` })),
        taxRate: estimate?.taxRate ?? 0,
        discount: 0,
        payments: [],
        notes,
        termsId: termsId || undefined,
        history: [{ date: now, text: `Invoice created${job ? ` from ${job.jobNumber}` : ''}` }],
      },
      { atStart: true },
    );
    log(`${fullName(look.customer(customerId))} - Invoice Created`, 'invoice', saved.id);
    toast('Invoice created successfully');
    router.push(`/invoices/${saved.id}`);
  };

  const jobOptions = jobs.map((j) => ({ value: j.id, label: `${j.jobNumber} - ${fullName(look.customer(j.customerId))}` }));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/invoices" className="mb-6 flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> Back to Invoices
      </Link>
      <PageHeader title="Create Invoice" subtitle="Bill a customer for a job. Line items are copied from the job's estimate." />
      <Card className="space-y-6 p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Job" hint="Pick the job you are billing for.">
            <Select value={jobId} onChange={setJobId} options={jobOptions} placeholder="Select a job" />
          </Field>
          <Field label="Customer" required error={error.customer}>
            <Select
              value={customerId}
              onChange={(v) => { setCustomerId(v); if (job && job.customerId !== v) setJobId(''); }}
              options={customers.map((c) => ({ value: c.id, label: fullName(c) }))}
              placeholder="Select a customer"
              invalid={!!error.customer}
            />
          </Field>
          <Field label="Invoice Type" required>
            <Select
              value={type}
              onChange={(v) => setType(v as InvType)}
              options={[{ value: 'Deposit', label: 'Deposit' }, { value: 'Progress', label: 'Progress' }, { value: 'Final', label: 'Final' }]}
            />
          </Field>
          {type !== 'Final' && (
            <Field label="Percent of Estimate (%)" required error={error.percent}>
              <Input type="number" min={1} max={100} value={percent} onChange={(e) => setPercent(Number(e.target.value))} invalid={!!error.percent} />
            </Field>
          )}
          <Field label="Invoice Date" required>
            <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDueDate(addDays(e.target.value, fin.paymentTermsDays)); }} />
          </Field>
          <Field label="Due Date" hint={`Payment terms: ${fin.paymentTermsDays} days`} error={error.dueDate}>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} invalid={!!error.dueDate} />
          </Field>
          <Field label="Terms & Conditions">
            <Select value={termsId} onChange={setTermsId} options={terms.map((t) => ({ value: t.id, label: t.name }))} placeholder="None" />
          </Field>
        </div>
        <Field label="Notes (Optional)">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any notes..." />
        </Field>

        {/* Line item preview */}
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-600">Line Items</div>
          {lines.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              <Receipt className="h-5 w-5 text-gray-500" />
              {job ? 'This job has no linked estimate. You can add line items after creating the invoice.' : 'Select a job to copy its estimate lines, or add lines after creating the invoice.'}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2.5 text-gray-700">{l.description}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{l.quantity} ×</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{usd(l.rate)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={2} className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-500">Subtotal</td>
                    <td className="px-4 py-2.5 text-right font-black text-gray-900">{usd(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-gray-100 pt-4">
          <Button variant="secondary" className="flex-1" onClick={() => router.push('/invoices')}>Cancel</Button>
          <Button className="flex-1" onClick={submit}>Create Invoice</Button>
        </div>
      </Card>
    </div>
  );
}

export default function NewInvoicePage() {
  return (
    <PageShell title="Create Invoice" breadcrumbs={[{ label: 'Invoices', href: '/invoices' }]} backHref="/invoices">
      <Suspense fallback={<ListSkeleton rows={3} />}>
        <NewInvoiceForm />
      </Suspense>
    </PageShell>
  );
}
