'use client';

/*
  Invoice Details. Same layout as the live app: a toolbar (Back to Invoices,
  source chips, actions) above the invoice document, then Payment History.
  Extra panels for this replica: an Activity timeline built from
  invoice.history. Actions:
    - Edit (line items, tax, discount, dates, terms, notes)
    - Send / Resend Invoice (marks Sent), Record Payment (Partial / Paid)
    - Download PDF (opens the printable preview), Customer Pay Link
    - Void and Delete (with confirmation)
  NEW: Supplemental / Credit note chip with a link to its change order (24),
  and the QuickBooks exchange card for finance roles (33, needs client
  confirmation). Send and payments reach the prototype via the bridge.
*/
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Ban, Briefcase, CheckCheck, CreditCard, Download, ExternalLink, History, Lock, Pencil, Plus, Send, Trash2, User } from 'lucide-react';
import { PageShell } from '@/components/Navigation';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { RefChip } from '@/components/ui/display';
import { RowMenu } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { derivedInvoiceStatus, invoiceTotals } from '@/lib/calculations';
import { useCollection, useLogActivity, useLookups } from '@/lib/store';
import { fullName, longDate, shortDate } from '@/lib/utils';
import { InvoiceDocument } from '@/components/invoices/InvoiceDocument';
import { EditInvoiceModal, RecordPaymentModal, SendInvoiceModal } from '@/components/invoices/InvoiceModals';
import { methodLabel, statusAfterPayments, usd, useInvoiceSaver } from '@/components/invoices/invoice-utils';
import { InvoiceKindChip, QuickBooksCard, useInvoiceInQuickBooks, useShowQuickBooks } from '@/components/invoices/InvoiceFeatureParts';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const look = useLookups();
  const log = useLogActivity();
  const save = useInvoiceSaver();
  const { get, remove } = useCollection('invoices');
  const invoice = get(id);
  const showQbo = useShowQuickBooks();
  const inQuickBooks = useInvoiceInQuickBooks(id);

  const [modal, setModal] = useState<null | 'pay' | 'send' | 'edit' | 'void' | 'delete'>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);

  if (!invoice) {
    return (
      <PageShell title="Invoice Details" breadcrumbs={[{ label: 'Invoices', href: '/invoices' }]} backHref="/invoices">
        <div className="flex min-h-[50vh] items-center justify-center text-center">
          <div>
            <p className="text-lg font-medium text-gray-500">Invoice not found.</p>
            <Link href="/invoices" className="mt-4 inline-block text-sm font-bold text-primary-600 hover:text-primary-700">Back to Invoices</Link>
          </div>
        </div>
      </PageShell>
    );
  }

  const status = derivedInvoiceStatus(invoice);
  const t = invoiceTotals(invoice);
  const est = look.estimate(invoice.estimateId);
  const lead = look.lead(invoice.leadId);
  const job = look.job(invoice.jobId);
  const customer = look.customer(invoice.customerId);
  const closed = status === 'Paid' || status === 'Void';

  const openModal = (m: typeof modal) => (open: boolean) => setModal(open ? m : null);

  /** Delivered another way: Draft -> Sent without an email. */
  const markSent = () => {
    save(invoice.id, { status: 'Sent', sentAt: new Date().toISOString() }, 'Marked as sent (delivered another way)');
    log(`${invoice.invoiceNumber} marked as sent`, 'invoice', invoice.id);
    toast('Invoice marked as sent');
  };

  return (
    <PageShell title="Invoice Details" breadcrumbs={[{ label: 'Invoices', href: '/invoices' }]} backHref="/invoices" contentClassName="bg-gray-100/50 pb-32">
      {/* Toolbar */}
      <div className="mx-auto mb-6 flex max-w-[8.5in] flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/invoices" className="flex items-center gap-2 whitespace-nowrap text-sm font-bold text-gray-500 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> Back to Invoices
          </Link>
          {lead && <RefChip kind="lead" href={`/leads/${lead.id}`}>{lead.leadNumber}</RefChip>}
          {est && <RefChip href={`/estimates/${est.id}`}>{est.estimateNumber}</RefChip>}
          {job && <RefChip kind="plain" href={`/jobs/${job.id}`}><Briefcase className="h-3 w-3" />{job.jobNumber}</RefChip>}
          {customer && <RefChip kind="plain" href={`/contacts/${customer.id}`}><User className="h-3 w-3" />{fullName(customer)}</RefChip>}
          <InvoiceKindChip invoiceId={invoice.id} withLink />
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-3">
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => router.push(`/invoices/${invoice.id}/preview`)}>Download PDF</Button>
          {/* Tab 1: once QuickBooks has it, the amount and date are edited in QuickBooks. */}
          {status !== 'Void' && (inQuickBooks
            ? <Button variant="secondary" icon={<Lock className="h-4 w-4" />} disabled title="Edit this invoice in QuickBooks">Edit this invoice in QuickBooks</Button>
            : <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setModal('edit')}>Edit</Button>)}
          {!closed &&
            (status === 'Draft' ? (
              <>
                <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setModal('pay')}>Add Payment</Button>
                <Button variant="secondary" icon={<CheckCheck className="h-4 w-4" />} onClick={markSent} title="Delivered another way (in person, by post)">Mark as Sent</Button>
                <Button icon={<Send className="h-4 w-4" />} onClick={() => setModal('send')}>Send Invoice</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" icon={<Send className="h-4 w-4" />} onClick={() => setModal('send')}>Resend Invoice</Button>
                <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModal('pay')}>Add Payment</Button>
              </>
            ))}
          <RowMenu
            className="h-10 w-10 border border-gray-200 bg-white"
            items={[
              { label: 'Customer Pay Page', icon: <ExternalLink />, onClick: () => router.push(`/invoices/${invoice.id}/pay`), disabled: closed },
              // QA B-05: QuickBooks owns a synced invoice; voiding or deleting it here would leave QuickBooks out of step.
              { label: 'Void Invoice', icon: <Ban />, onClick: () => setModal('void'), disabled: status === 'Void' || inQuickBooks, hint: inQuickBooks ? 'In QuickBooks: void it there' : undefined, separatorBefore: true },
              { label: 'Delete Invoice', icon: <Trash2 />, danger: true, onClick: () => setModal('delete'), disabled: inQuickBooks, hint: inQuickBooks ? 'In QuickBooks: delete it there' : undefined },
            ]}
          />
        </div>
      </div>

      <InvoiceDocument invoice={invoice} />

      {/* Payment history */}
      <div className="mx-auto mt-6 max-w-[8.5in] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-8 py-6">
          <h4 className="flex items-center gap-2 text-lg font-bold text-gray-900"><CreditCard className="h-5 w-5 text-gray-500" /> Payment History</h4>
          <span className="text-sm text-gray-500">Paid {usd(t.paid)} of {usd(t.total)}</span>
        </div>
        {invoice.payments.length === 0 ? (
          <p className="px-8 py-8 text-center text-sm text-gray-500">No payments recorded yet. Use Add Payment when the customer pays.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-gray-100 text-gray-500">
                <tr>
                  {['Date', 'Type', 'Method', 'Status', 'Amount', 'Reference', 'Note', 'Actions'].map((h, i) => (
                    <th key={h} className={`px-6 py-3 text-xs font-bold uppercase ${i === 4 || i === 7 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoice.payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{shortDate(p.date)}</td>
                    <td className="px-6 py-4 text-gray-600">Charge</td>
                    <td className="px-6 py-4 text-gray-600">{methodLabel(p.method)}{p.cardLast4 && <span className="ml-1 text-xs text-gray-500">••••{p.cardLast4}</span>}</td>
                    <td className="px-6 py-4"><span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">Approved</span></td>
                    <td className="px-6 py-4 text-right font-bold text-green-700">{usd(p.amount)}</td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-600">{p.reference || '—'}</td>
                    <td className="px-6 py-4 text-xs text-gray-500">{p.note || '—'}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => setPaymentToDelete(p.id)} className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600" title="Delete payment" aria-label="Delete payment">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showQbo && <QuickBooksCard invoiceId={invoice.id} />}

      {/* History timeline */}
      <div className="mx-auto mt-6 max-w-[8.5in] rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h4 className="mb-5 flex items-center gap-2 text-lg font-bold text-gray-900"><History className="h-5 w-5 text-gray-500" /> Activity</h4>
        {invoice.history.length === 0 ? (
          <p className="text-sm text-gray-500">No activity yet.</p>
        ) : (
          <ol className="relative space-y-5 border-l border-gray-200 pl-6">
            {[...invoice.history].reverse().map((h, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-white bg-primary-500 ring-1 ring-primary-200" />
                <div className="text-sm font-semibold text-gray-800">{h.text}</div>
                <div className="text-xs text-gray-500">{longDate(h.date)}</div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Modals */}
      <RecordPaymentModal invoice={invoice} open={modal === 'pay'} onOpenChange={openModal('pay')} />
      <SendInvoiceModal invoice={invoice} open={modal === 'send'} onOpenChange={openModal('send')} />
      <EditInvoiceModal invoice={invoice} open={modal === 'edit' && !inQuickBooks} onOpenChange={openModal('edit')} />
      <ConfirmDialog
        open={modal === 'void' && !inQuickBooks}
        onOpenChange={openModal('void')}
        title="Void Invoice"
        message={`Void ${invoice.invoiceNumber}? The customer will no longer be able to pay it and its balance is removed from Outstanding Balance.`}
        confirmLabel="Void Invoice"
        onConfirm={() => {
          save(invoice.id, { status: 'Void' }, 'Invoice voided');
          toast('Invoice voided');
        }}
      />
      <ConfirmDialog
        open={modal === 'delete' && !inQuickBooks}
        onOpenChange={openModal('delete')}
        title="Delete Invoice"
        message="Are you sure you want to delete this invoice? This action cannot be undone."
        onConfirm={() => {
          remove(invoice.id);
          log(`${fullName(customer)} - Invoice Deleted`, 'invoice', invoice.id);
          toast('Invoice deleted successfully');
          router.push('/invoices');
        }}
      />
      <ConfirmDialog
        open={!!paymentToDelete}
        onOpenChange={(o) => !o && setPaymentToDelete(null)}
        title="Delete Payment"
        message="Remove this payment from the invoice? The balance due will go back up."
        onConfirm={() => {
          const p = invoice.payments.find((x) => x.id === paymentToDelete);
          const payments = invoice.payments.filter((x) => x.id !== paymentToDelete);
          save(invoice.id, { payments, status: statusAfterPayments(invoice, payments) }, `Payment removed ${p ? usd(p.amount) : ''}`.trim());
          toast('Payment deleted');
          setPaymentToDelete(null);
        }}
      />
    </PageShell>
  );
}
