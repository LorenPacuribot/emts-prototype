'use client';

/*
  Activity Log tab: every action recorded in the 'activity' collection, with
  search, date range, activity type and entity filters, paging, CSV export,
  and a details modal when a row is clicked. Matches the live Activity Log.
*/
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { useDb } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Pagination, usePagination } from '@/components/ui/display';
import { useToast } from '@/components/ui/toast';
import { ACTIVITY_ENTITY_OPTIONS, ACTIVITY_TYPE_COLOR, activityRow, downloadCsv, inDateRange, type DateRange } from './data';
import { DateRangeInputs, ExportButton, MultiSelect, ReportCard, TD, TH } from './shared';
import { InteractionPanel } from './InteractionPanel';

type Row = ReturnType<typeof activityRow>;

const ENTITY_HREF: Record<string, string> = { lead: '/leads', estimate: '/estimates', job: '/jobs', invoice: '/invoices' };

function dateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

const cap = (s?: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : '');

export function ActivityLogTab({ range, setRange }: { range: DateRange; setRange: (r: DateRange) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [entities, setEntities] = useState<string[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);

  const all = useMemo(() => [...db.collections.activity].sort((a, b) => b.date.localeCompare(a.date)).map((a) => activityRow(db, a)), [db]);
  const typeOptions = useMemo(() => [...new Set(all.map((r) => r.type))].sort().map((t) => ({ value: t, label: t })), [all]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (!inDateRange(r.date, range) && (range.start || range.end)) return false;
      if (types.length && !types.includes(r.type)) return false;
      if (entities.length && !(r.entity && entities.includes(r.entity))) return false;
      if (q && ![r.title, r.customer, r.user, r.reference, r.type].some((x) => x.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [all, search, types, entities, range]);
  const p = usePagination(rows, 10);

  const hasFilters = !!(range.start || range.end || search || types.length || entities.length);
  const clear = () => {
    setRange({ start: '', end: '' });
    setSearch('');
    setTypes([]);
    setEntities([]);
  };

  const exportCsv = () => {
    downloadCsv('activity-log.csv', ['Date', 'Activity', 'Entity', 'Reference', 'Title', 'User', 'Customer'],
      rows.map((r) => [dateTime(r.date), r.type, cap(r.entity), r.reference, r.title, r.user, r.customer]));
    toast('Report exported successfully');
  };

  return (
    <ReportCard>
      <InteractionPanel />
      <div className="space-y-4 border-b border-gray-200 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg sm:whitespace-nowrap font-bold text-gray-900">Activity Log</h3>
          <div className="flex items-center gap-3">
            {hasFilters && (
              <button type="button" onClick={clear} className="flex items-center gap-1 whitespace-nowrap text-xs font-medium text-gray-500 hover:text-gray-900">
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}
            <ExportButton onClick={exportCsv} />
          </div>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-10 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
            />
          </div>
          <DateRangeInputs value={range} onChange={setRange} labels={['From Date', 'To Date']} />
          <MultiSelect label="Activity Type" value={types} onChange={setTypes} options={typeOptions} />
          <MultiSelect label="Entity Type" value={entities} onChange={setEntities} options={ACTIVITY_ENTITY_OPTIONS} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-white text-xs font-bold uppercase tracking-wider text-gray-500">
              <th className={TH}>Date</th><th className={TH}>Activity</th><th className={TH}>Entity</th><th className="px-4 py-4">Title</th>
              <th className={TH}>User</th><th className={TH}>Customer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {p.pageItems.map((r) => (
              <tr key={r.id} onClick={() => setSelected(r)} className="cursor-pointer transition-colors hover:bg-gray-50/80">
                <td className={cn(TD, 'font-medium text-gray-900')}>{dateTime(r.date)}</td>
                <td className={TD}>
                  <span className={cn('inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium', ACTIVITY_TYPE_COLOR[r.type] ?? ACTIVITY_TYPE_COLOR.Updated)}>{r.type}</span>
                </td>
                <td className={TD}>
                  <div className="text-xs uppercase tracking-wider text-gray-500">{cap(r.entity) || '—'}</div>
                  <div className="font-bold text-gray-800">{r.reference || '—'}</div>
                </td>
                <td className="px-4 py-4 text-sm text-gray-700">{r.title}</td>
                <td className={cn(TD, 'text-gray-600')}>{r.user || '—'}</td>
                <td className={cn(TD, 'text-gray-600')}>{r.customer || '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center italic text-gray-400">No activity found for this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {p.total > 0 && (
        <div className="border-t border-gray-200 px-4 pb-4">
          <Pagination page={p.page} totalPages={p.totalPages} onPage={p.setPage} pageSize={p.pageSize} onPageSize={p.setPageSize} shown={p.pageItems.length} total={p.total} />
        </div>
      )}

      <Modal open={!!selected} onOpenChange={(o) => !o && setSelected(null)} title="Activity Details" size="lg">
        {selected && (
          <div className="space-y-6">
            <div>
              <span className={cn('mb-2 inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium', ACTIVITY_TYPE_COLOR[selected.type] ?? ACTIVITY_TYPE_COLOR.Updated)}>{selected.type}</span>
              <h4 className="text-xl font-bold text-gray-900">{selected.title}</h4>
              <p className="mt-1 text-sm text-gray-500">{dateTime(selected.date)}</p>
            </div>
            <div className="border-t border-gray-100" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {[
                ['User', selected.user],
                ['Customer', selected.customer],
                ['Entity', cap(selected.entity)],
                ['Reference', selected.reference],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-500">{label}</div>
                  <div className="text-sm text-gray-900">{value?.trim() ? value : '—'}</div>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100" />
            <div>
              <h5 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Details</h5>
              <p className="text-sm italic text-gray-400">No additional details.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              {selected.entity && selected.entityId && (
                <Link href={`${ENTITY_HREF[selected.entity]}/${selected.entityId}`}>
                  <Button variant="outline" size="sm">Open {cap(selected.entity)}</Button>
                </Link>
              )}
              <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </ReportCard>
  );
}
