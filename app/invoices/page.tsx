'use client';

/*
  Invoices list ("Track payments and outstanding balances.").
  Layout follows the live app: two summary cards, a search box on the left,
  status filter + sort dropdowns on the right, invoice cards and pagination.
  Outstanding Balance = sum of balances on non-void invoices.
  Total Collected = sum of all payments received.
  NEW (33, needs client confirmation): QuickBooks column for finance roles.
*/
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownAZ, Calendar, Check, CheckCircle2, ChevronDown, DollarSign, FileText, Filter, Plus } from 'lucide-react';
import { PageShell } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, Pagination, SearchInput, usePagination } from '@/components/ui/display';
import { DropdownMenu } from '@/components/ui/menu';
import { derivedInvoiceStatus, invoiceTotals } from '@/lib/calculations';
import { useCollection, useLookups } from '@/lib/store';
import { cn, fullName, moneyCompact } from '@/lib/utils';
import { InvoiceRow } from '@/components/invoices/InvoiceRow';
import { QuickBooksColumnNote, useShowQuickBooks } from '@/components/invoices/InvoiceFeatureParts';
import { INVOICE_FILTER_OPTIONS, INVOICE_STATUS_LABEL } from '@/components/invoices/invoice-utils';
import type { InvoiceStatus } from '@/lib/types';

type SortKey = 'newest' | 'oldest' | 'amount' | 'client';
const SORTS: { value: SortKey; label: string; icon: typeof Calendar }[] = [
  { value: 'newest', label: 'Date (Newest)', icon: Calendar },
  { value: 'oldest', label: 'Date (Oldest)', icon: Calendar },
  { value: 'amount', label: 'Amount (High-Low)', icon: DollarSign },
  { value: 'client', label: 'Client Name', icon: ArrowDownAZ },
];

export default function InvoicesPage() {
  const router = useRouter();
  const { items: invoices } = useCollection('invoices');
  const look = useLookups();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'All' | InvoiceStatus>('All');
  const [sort, setSort] = useState<SortKey>('newest');
  const showQbo = useShowQuickBooks();

  // Summary cards
  const summary = useMemo(() => {
    let outstanding = 0;
    let collected = 0;
    for (const inv of invoices) {
      const t = invoiceTotals(inv);
      collected += t.paid;
      if (inv.status !== 'Void') outstanding += t.balance;
    }
    return { outstanding, collected };
  }, [invoices]);

  // Search + filter + sort
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = invoices.filter((inv) => {
      if (status !== 'All' && derivedInvoiceStatus(inv) !== status) return false;
      if (!q) return true;
      const hay = [
        inv.invoiceNumber,
        fullName(look.customer(inv.customerId)),
        look.job(inv.jobId)?.jobNumber,
        look.estimate(inv.estimateId)?.estimateNumber,
        look.lead(inv.leadId)?.leadNumber,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
    const byDate = (a: string, b: string) => new Date(a).getTime() - new Date(b).getTime();
    list.sort((a, b) => {
      if (sort === 'oldest') return byDate(a.date, b.date) || a.invoiceNumber.localeCompare(b.invoiceNumber);
      if (sort === 'amount') return invoiceTotals(b).total - invoiceTotals(a).total;
      if (sort === 'client') return fullName(look.customer(a.customerId)).localeCompare(fullName(look.customer(b.customerId)));
      return byDate(b.date, a.date) || b.invoiceNumber.localeCompare(a.invoiceNumber, undefined, { numeric: true });
    });
    return list;
  }, [invoices, search, status, sort, look]);

  const pg = usePagination(rows, 10);
  const sortOpt = SORTS.find((s) => s.value === sort)!;
  const SortIcon = sortOpt.icon;
  const filterBtn = 'flex h-[42px] min-w-[140px] items-center justify-between gap-2 rounded-xl border px-4 text-sm font-bold shadow-sm transition-colors';

  return (
    <PageShell title="Invoices">
      <PageHeader
        title="Invoices"
        subtitle="Track payments and outstanding balances."
        actions={<Button icon={<Plus className="h-5 w-5" />} onClick={() => router.push('/invoices/new')}>Create Invoice</Button>}
      />

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
            <DollarSign className="h-4 w-4" /> Outstanding Balance
          </div>
          <div className="text-3xl font-black text-gray-900">{moneyCompact(summary.outstanding)}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
            <CheckCircle2 className="h-4 w-4" /> Total Collected
          </div>
          <div className="text-3xl font-black text-gray-900">{moneyCompact(summary.collected)}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-6 flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search invoices..." className="lg:w-80" />
        <div className="flex w-full gap-2 lg:w-auto">
          <DropdownMenu
            items={INVOICE_FILTER_OPTIONS.map((o) => ({
              label: o === 'All' ? 'All' : INVOICE_STATUS_LABEL[o],
              icon: status === o ? <Check className="text-primary-600" /> : <span />,
              onClick: () => setStatus(o),
            }))}
            trigger={
              <button className={cn(filterBtn, status !== 'All' ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                <span className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-500" />
                  {status === 'All' ? 'All' : INVOICE_STATUS_LABEL[status]}
                </span>
                <ChevronDown className="h-3 w-3 text-gray-500" />
              </button>
            }
          />
          <DropdownMenu
            items={SORTS.map((s) => {
              const I = s.icon;
              return { label: s.label, icon: <I className={sort === s.value ? 'text-primary-600' : ''} />, onClick: () => setSort(s.value) };
            })}
            trigger={
              <button className={cn(filterBtn, sort !== 'newest' ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                <span className="flex items-center gap-2">
                  <SortIcon className={cn('h-4 w-4', sort !== 'newest' ? 'text-primary-500' : 'text-gray-500')} />
                  {sortOpt.label}
                </span>
                <ChevronDown className="h-4 w-4 text-gray-500" />
              </button>
            }
          />
        </div>
      </div>

      {/* List */}
      {pg.pageItems.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No invoices found"
          message={invoices.length === 0 ? 'Create your first invoice from a job.' : 'Try adjusting your filters.'}
          className="rounded-3xl border-gray-300 py-20"
        />
      ) : (
        <div className="space-y-4">
          {showQbo && <QuickBooksColumnNote />}
          {pg.pageItems.map((inv) => (
            <InvoiceRow key={inv.id} invoice={inv} showQuickBooks={showQbo} />
          ))}
        </div>
      )}

      <Pagination
        page={pg.page}
        totalPages={pg.totalPages}
        onPage={pg.setPage}
        pageSize={pg.pageSize}
        onPageSize={pg.setPageSize}
        shown={pg.pageItems.length}
        total={pg.total}
      />
    </PageShell>
  );
}
