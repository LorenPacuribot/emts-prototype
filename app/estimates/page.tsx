'use client';

/*
  /estimates - list of all proposals.
  Layout follows the live Estimates screen: header with "Create New Estimate",
  four stat cards, search + Date Range + status + sort, row cards and
  pagination ("Show 10").
  NEW (feature 28): the "From history" filter and row chip.
*/
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ClipboardList, Clock, DollarSign, FileText, Plus } from 'lucide-react';
import type { Estimate } from '@/lib/types';
import { PageShell } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, ListSkeleton, Pagination, usePagination } from '@/components/ui/display';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useCollection, useLookups } from '@/lib/store';
import { estimateTotals } from '@/lib/calculations';
import { fullName } from '@/lib/utils';
import { EstimateRow } from '@/components/estimates/EstimateRow';
import { EstimateFilters, type DateRange, type SortKey, type StatusFilter } from '@/components/estimates/EstimateFilters';
import { CreateEstimateWizard } from '@/components/estimates/CreateEstimateWizard';
import { useEstimateActions } from '@/components/estimates/useEstimateActions';
import { isActive } from '@/components/estimates/estimate-utils';
import { useDb as useFeatureDb } from '@/features/lib/store';

function StatCards({ items }: { items: Estimate[]; }) {
  const stats = useMemo(() => {
    const active = items.filter((e) => isActive(e.status));
    return {
      draft: items.filter((e) => e.status === 'Draft').length,
      pending: items.filter((e) => e.status === 'Sent' || e.status === 'Viewed').length,
      approved: items.filter((e) => e.status === 'Approved').length,
      pipeline: active.reduce((s, e) => s + estimateTotals(e).total, 0),
    };
  }, [items]);
  const cards = [
    { label: 'Draft Proposals', value: stats.draft, sub: 'In progress', Icon: FileText },
    { label: 'Sent / Pending', value: stats.pending, sub: 'Awaiting approval', Icon: Clock },
    { label: 'Approved', value: stats.approved, sub: 'Ready for work', Icon: CheckCircle2 },
    { label: 'Pipeline Value', value: `$${(stats.pipeline / 1000).toFixed(1)}k`, sub: 'Total active value', Icon: DollarSign },
  ];
  return (
    <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ label, value, sub, Icon }) => (
        <Card key={label} className="flex flex-col p-5">
          <div className="mb-2 flex items-center gap-2 text-xxs font-bold uppercase tracking-widest text-gray-500">
            <Icon className="h-4 w-4 text-gray-500" /> {label}
          </div>
          <div className="font-heading text-2xl font-black text-gray-900">{value}</div>
          <div className="mt-1 text-xs font-medium text-gray-500">{sub}</div>
        </Card>
      ))}
    </div>
  );
}

export default function EstimatesPage() {
  const router = useRouter();
  const { items } = useCollection('estimates');
  const look = useLookups();
  const actions = useEstimateActions();
  const { toast } = useToast();
  const featureDb = useFeatureDb((d) => d);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [search, setSearch] = useState('');
  const [range, setRange] = useState<DateRange | null>(null);
  const [status, setStatus] = useState<StatusFilter>('All Active');
  const [sort, setSort] = useState<SortKey>('date-desc');
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Estimate | null>(null);

  // Totals are needed for both sorting and display, so compute once.
  const totals = useMemo(() => new Map(items.map((e) => [e.id, estimateTotals(e).total])), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter((e) => {
      if (status === 'From History') {
        // NEW (28): repeat estimates, from the prototype twin.
        const twin = featureDb.estimates.find((x) => x.id === e.id);
        if (!twin || !(twin.isRepaint || twin.repeatEstimateId)) return false;
      } else if (status === 'All Active' ? !isActive(e.status) : e.status !== status) return false;
      if (range?.from && e.date.slice(0, 10) < range.from) return false;
      if (range?.to && e.date.slice(0, 10) > range.to) return false;
      if (!q) return true;
      const c = look.customer(e.customerId);
      const lead = look.lead(e.leadId);
      return [e.title, e.estimateNumber, fullName(c), c?.companyName ?? '', e.address, lead?.leadNumber ?? '', e.estimateType]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
    const name = (e: Estimate) => fullName(look.customer(e.customerId));
    return list.sort((a, b) => {
      if (sort === 'date-asc') return a.date.localeCompare(b.date);
      if (sort === 'amount') return (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0);
      if (sort === 'name') return name(a).localeCompare(name(b));
      return b.date.localeCompare(a.date);
    });
  }, [items, search, status, range, sort, look, totals, featureDb]);

  const pg = usePagination(filtered, 10);

  const handlers = {
    onDuplicate: (e: Estimate) => {
      const copy = actions.duplicate(e);
      toast(`Duplicated as ${copy.estimateNumber}`);
    },
    onDelete: (e: Estimate) => setToDelete(e),
    onMarkApproved: (e: Estimate) => {
      actions.markApproved(e);
      toast('Estimate approved successfully');
    },
    onConvert: (e: Estimate) => {
      const job = actions.convertToJob(e);
      toast(`Job ${job.jobNumber} created`);
      router.push(`/jobs/${job.id}`);
    },
  };

  return (
    <PageShell title="Estimates">
      <div className="mb-8 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
        <div>
          <h1 className="mb-3 font-heading text-3xl font-bold tracking-tight text-gray-900">Estimates</h1>
          <p className="text-base text-gray-500">Manage your proposals, track status, and win more work.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} icon={<Plus className="h-5 w-5" />} className="w-full shadow-xl md:w-auto">
          Create New Estimate
        </Button>
      </div>

      <StatCards items={items} />

      <EstimateFilters
        search={search}
        onSearch={setSearch}
        range={range}
        onRange={setRange}
        status={status}
        onStatus={setStatus}
        sort={sort}
        onSort={setSort}
      />

      {!mounted ? (
        <ListSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-white py-20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50 text-gray-500">
            <ClipboardList className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">{items.length === 0 ? "No estimates yet" : "No estimates found"}</h3>
          <p className="mb-6 text-gray-500">{items.length === 0 ? "Each estimate starts from an open lead. Create one to start pricing." : "Try adjusting your search or filters."}</p>
          <Button onClick={() => setCreateOpen(true)}>Create New Estimate</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {pg.pageItems.map((e) => (
            <EstimateRow key={e.id} estimate={e} total={totals.get(e.id) ?? 0} handlers={handlers} />
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

      <Modal open={createOpen} onOpenChange={setCreateOpen} title="Start New Estimate" size="lg">
        {createOpen && (
          <CreateEstimateWizard
            onCancel={() => setCreateOpen(false)}
            onCreated={(id) => {
              setCreateOpen(false);
              router.push(`/estimates/${id}`);
            }}
            onSaved={() => setCreateOpen(false)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete Estimate"
        message={`Are you sure you want to delete "${toDelete?.title ?? 'this estimate'}"? This action cannot be undone.`}
        onConfirm={() => {
          if (toDelete) {
            actions.remove(toDelete);
            toast('Estimate deleted successfully');
          }
        }}
      />
    </PageShell>
  );
}
