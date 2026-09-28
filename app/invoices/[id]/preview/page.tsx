'use client';

/*
  Printable invoice ("Download PDF" in the live app opens a generated PDF).
  Here we show the invoice document full screen with Print and Back buttons.
  The browser's "Save as PDF" in the print dialog produces the PDF.
*/
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CreditCard, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCollection } from '@/lib/store';
import { derivedInvoiceStatus } from '@/lib/calculations';
import { InvoiceDocument } from '@/components/invoices/InvoiceDocument';
import { FullScreen } from '@/components/invoices/FullScreen';

export default function InvoicePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const invoice = useCollection('invoices').get(id);

  if (!invoice) {
    return (
      <FullScreen className="flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-500">Invoice not found.</p>
          <Link href="/invoices" className="mt-4 inline-block text-sm font-bold text-primary-600">Back to Invoices</Link>
        </div>
      </FullScreen>
    );
  }
  const status = derivedInvoiceStatus(invoice);

  return (
    <FullScreen>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3 shadow-sm print:hidden sm:px-6">
        <Link href={`/invoices/${invoice.id}`} aria-label="Back to Invoice" className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back to Invoice</span>
        </Link>
        <span className="hidden font-heading text-sm font-bold text-gray-900 sm:inline">{invoice.invoiceNumber}</span>
        <div className="flex gap-2">
          {status !== 'Paid' && status !== 'Void' && (
            <Link href={`/invoices/${invoice.id}/pay`}>
              <Button variant="secondary" size="sm" icon={<CreditCard className="h-4 w-4" />}>Customer View</Button>
            </Link>
          )}
          <Button size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print / Save PDF</Button>
        </div>
      </div>
      <div className="p-4 md:p-8 print:p-0">
        <div className="print-area">
          <InvoiceDocument invoice={invoice} />
        </div>
      </div>
    </FullScreen>
  );
}
