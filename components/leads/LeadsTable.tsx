'use client';

/*
  Table view of the pipeline. Filters by stage, source and date range,
  sorts by clicking a column header, and pages 10 rows at a time.
  Clicking a row opens the lead. The kebab menu has Edit, Archive and Delete
  (live: features/(main)/leads/listings/templates/useColumns.tsx).
  NEW (29): the Repaint alert source badge; a lead driven by an open repaint
  follow-up has no Archive item.
*/
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArrowDown, ArrowUp, ArrowUpDown, Edit2, Mail, Phone, Star, Trash2 } from 'lucide-react';
import type { Lead, LeadStatus } from '@/lib/types';
import { useLookups } from '@/lib/store';
import { Badge, Pagination, RefChip, usePagination } from '@/components/ui/display';
import { Input, NativeSelect } from '@/components/ui/form';
import { RowMenu } from '@/components/ui/menu';
import { Button } from '@/components/ui/button';
import { cn, money, shortDate } from '@/lib/utils';
import { LEAD_LIFECYCLE, LEAD_STATUS_BADGE, PIPELINE_STEPS, canArchiveLeadStatus, formatPhone } from './leadHelpers';
import { LeadSourceChip, useFollowUpLocks } from './leadFeatures';

type SortKey = 'name' | 'status' | 'source' | 'service' | 'value' | 'date';

export function LeadsTable({
  leads, onEdit, onArchive, onDelete,
}: {
  leads: Lead[];
  onEdit: (lead: Lead) => void;
  onArchive: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
}) {
  const router = useRouter();
  const lookups = useLookups();
  const lockOf = useFollowUpLocks();
  const [stage, setStage] = useState<'' | LeadStatus>('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });

  const sources = useMemo(() => Array.from(new Set(leads.map((l) => l.leadSource).filter(Boolean))).sort(), [leads]);

  const rows = useMemo(() => {
    const filtered = leads.filter((l) => {
      const day = l.date.slice(0, 10);
      if (stage && l.status !== stage) return false;
      if (source && l.leadSource !== source) return false;
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
    const val = (l: Lead): string | number => {
      switch (sort.key) {
        case 'name': return `${l.firstName} ${l.lastName}`.toLowerCase();
        case 'status': return PIPELINE_STEPS.indexOf(l.status);
        case 'source': return l.leadSource.toLowerCase();
        case 'service': return l.serviceType.toLowerCase();
        case 'value': return l.estimatedValue;
        default: return new Date(l.date).getTime();
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === 'asc' ? c : -c;
    });
  }, [leads, stage, source, from, to, sort]);

  const pg = usePagination(rows, 10);
  const hasFilters = !!(stage || source || from || to);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' || key === 'value' ? 'desc' : 'asc' }));

  const Th = ({ label, k, className }: { label: string; k?: SortKey; className?: string }) => (
    <th className={cn('whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500', className)}>
      {k ? (
        <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase hover:text-gray-800">
          {label}
          {sort.key === k ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-gray-300" />}
        </button>
      ) : label}
    </th>
  );

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <NativeSelect value={stage} onChange={(e) => setStage(e.target.value as LeadStatus | '')} aria-label="Filter by stage">
            <option value="">All Stages</option>
            {PIPELINE_STEPS.map((s) => <option key={s} value={s}>{s}</option>)}
          </NativeSelect>
        </div>
        <div className="w-44">
          <NativeSelect value={source} onChange={(e) => setSource(e.target.value)} aria-label="Filter by source">
            <option value="">All Sources</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </NativeSelect>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="w-40" />
          <span className="text-xs text-gray-400">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="w-40" />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setStage(''); setSource(''); setFrom(''); setTo(''); }}>
            Clear filters
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className="py-12 text-center italic text-gray-400">No leads found.</div>
          ) : (
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <Th label="Lead #" />
                  <Th label="Lead Name" k="name" />
                  <Th label="Status" k="status" />
                  <Th label="Estimate" />
                  <Th label="Contact" />
                  <Th label="Location" />
                  <Th label="Source" k="source" />
                  <Th label="Service Type" k="service" />
                  <Th label="Value" k="value" />
                  <Th label="Created" k="date" />
                  <Th label="Action" className="text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pg.pageItems.map((l, i) => {
                  const est = lookups.estimate(l.estimateId);
                  const lc = LEAD_LIFECYCLE[l.status];
                  return (
                    <tr
                      key={l.id}
                      onClick={() => router.push(`/leads/${l.id}`)}
                      className={cn('cursor-pointer transition-colors hover:bg-gray-50', i % 2 ? 'bg-gray-50/50' : 'bg-white')}
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-xs font-medium text-gray-500">{l.leadNumber}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="whitespace-nowrap font-bold text-gray-900">{l.firstName} {l.lastName}</span>
                          {(l.qualityRating ?? 0) > 0 && (
                            <span className="flex items-center text-amber-400">
                              <span className="mr-0.5 text-xs font-bold text-amber-700">{l.qualityRating}</span>
                              <Star className="h-3 w-3 fill-current" />
                            </span>
                          )}
                        </div>
                        <span className={cn('mt-1 inline-flex rounded-full px-2 py-0.5 text-xxs font-bold uppercase tracking-wide', lc.color)}>{lc.label}</span>
                      </td>
                      <td className="px-5 py-4"><Badge className={LEAD_STATUS_BADGE[l.status]}>{l.status}</Badge></td>
                      <td className="px-5 py-4">
                        {est ? <RefChip href={`/estimates/${est.id}`}>{est.estimateNumber}</RefChip> : <span className="text-xs text-gray-400">-</span>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-0.5 text-xs text-gray-500">
                          <span className="flex items-center gap-1.5 whitespace-nowrap"><Phone className="h-3 w-3" />{formatPhone(l.phone) || '-'}</span>
                          <span className="flex items-center gap-1.5 whitespace-nowrap"><Mail className="h-3 w-3" />{l.email}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-gray-600">{l.city}, {l.state}</td>
                      <td className="px-5 py-4">
                        <LeadSourceChip lead={l} fallback={<span className="whitespace-nowrap rounded border border-gray-200 bg-gray-100 px-2 py-0.5 text-xxs font-medium text-gray-600">{l.leadSource}</span>} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-gray-600">{l.serviceType || '-'}</td>
                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-gray-900">{money(l.estimatedValue)}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-500">{shortDate(l.date)}</td>
                      <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <RowMenu
                          items={[
                            { label: 'Edit', icon: <Edit2 />, onClick: () => onEdit(l) },
                            ...(canArchiveLeadStatus(l.status) && !lockOf(l.id) ? [{ label: 'Archive', icon: <Archive />, onClick: () => onArchive(l) }] : []),
                            { label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => onDelete(l) },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="border-t border-gray-200 px-4 pb-4">
          <Pagination
            page={pg.page} totalPages={pg.totalPages} onPage={pg.setPage}
            pageSize={pg.pageSize} onPageSize={pg.setPageSize}
            shown={pg.pageItems.length} total={pg.total}
          />
        </div>
      </div>
    </div>
  );
}
