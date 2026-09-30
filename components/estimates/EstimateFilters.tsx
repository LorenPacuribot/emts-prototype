'use client';

/*
  Search + Date Range + Status + Sort toolbar for /estimates.
  Mirrors the live FiltersToolbar: filters that differ from the default
  are highlighted in light blue.
  NEW (feature 28): the "From history" status option for repeat estimates.
*/
import * as Popover from '@radix-ui/react-popover';
import { ArrowDownAZ, Calendar, Check, ChevronDown, DollarSign, Filter, X } from 'lucide-react';
import type { EstimateStatus } from '@/lib/types';
import { SearchInput } from '@/components/ui/display';
import { DropdownMenu } from '@/components/ui/menu';
import { Button } from '@/components/ui/button';
import { cn, shortDate, toISODate } from '@/lib/utils';
import { NewBadge } from '@/features/components/ui';
import { useIsOn, useVisibility } from '@/features/lib/feature-visibility';
import { STATUS_LABEL } from './estimate-utils';

export type StatusFilter = 'All Active' | EstimateStatus | 'From History';
export type SortKey = 'date-desc' | 'date-asc' | 'amount' | 'name';
export interface DateRange { from: string; to: string }

export const STATUS_OPTIONS: StatusFilter[] = ['All Active', 'Draft', 'Sent', 'Viewed', 'Approved', 'Rejected', 'Expired', 'From History'];

const statusLabel = (s: StatusFilter, badges = false) => (s === 'All Active' ? 'All Active' : s === 'From History' ? `From history (repeat work)${badges ? ' · NEW' : ''}` : STATUS_LABEL[s]);

export const SORT_OPTIONS: { value: SortKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'date-desc', label: 'Date (Newest)', icon: Calendar },
  { value: 'date-asc', label: 'Date (Oldest)', icon: Calendar },
  { value: 'amount', label: 'Amount (High-Low)', icon: DollarSign },
  { value: 'name', label: 'Client Name', icon: ArrowDownAZ },
];

const pill = (active: boolean) =>
  cn(
    'flex h-[42px] min-w-[140px] items-center justify-between gap-3 rounded-xl border px-4 text-sm font-bold shadow-sm transition-colors',
    active ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
  );

function presets(): { label: string; range: DateRange }[] {
  const today = new Date();
  const iso = (d: Date) => toISODate(d);
  const back = (n: number) => new Date(today.getTime() - n * 86_400_000);
  return [
    { label: 'Today', range: { from: iso(today), to: iso(today) } },
    { label: 'Last 7 days', range: { from: iso(back(6)), to: iso(today) } },
    { label: 'Last 30 days', range: { from: iso(back(29)), to: iso(today) } },
    { label: 'This month', range: { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) } },
    { label: 'This year', range: { from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(today) } },
  ];
}

function DateRangeFilter({ value, onChange }: { value: DateRange | null; onChange: (r: DateRange | null) => void }) {
  const label = value ? `${value.from ? shortDate(value.from) : '…'} – ${value.to ? shortDate(value.to) : '…'}` : 'Date Range';
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className={cn(pill(!!value), 'min-w-45 justify-start')}>
          <ChevronDown className="h-4 w-4 text-gray-500" />
          <span className="flex-1 text-left">{label}</span>
          {value && (
            <span
              role="button"
              aria-label="Clear date range"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="rounded p-0.5 text-gray-500 hover:bg-white hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-[150] w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
          <div className="mb-3 grid grid-cols-2 gap-2">
            {presets().map((p) => (
              <Popover.Close asChild key={p.label}>
                <button
                  type="button"
                  onClick={() => onChange(p.range)}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-700 hover:border-primary-300 hover:bg-primary-50"
                >
                  {p.label}
                </button>
              </Popover.Close>
            ))}
          </div>
          <div className="space-y-2">
            {(['from', 'to'] as const).map((k) => (
              <label key={k} className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">{k === 'from' ? 'From' : 'To'}</span>
                <input
                  type="date"
                  value={value?.[k] ?? ''}
                  onChange={(e) => onChange({ from: value?.from ?? '', to: value?.to ?? '', [k]: e.target.value })}
                  className="h-9 w-full rounded-lg border border-gray-200 px-2 text-sm focus:border-primary-400 focus:outline-none"
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <Popover.Close asChild>
              <Button size="sm" variant="secondary" onClick={() => onChange(null)}>Clear</Button>
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function EstimateFilters(p: {
  search: string;
  onSearch: (v: string) => void;
  range: DateRange | null;
  onRange: (r: DateRange | null) => void;
  status: StatusFilter;
  onStatus: (s: StatusFilter) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
}) {
  const sortOpt = SORT_OPTIONS.find((o) => o.value === p.sort)!;
  const SortIcon = sortOpt.icon;
  // From History (28) follows New Features; its NEW text follows the badges switch.
  const historyOn = useIsOn({ feature: 28 });
  const badges = useVisibility((s) => s.showBadges);
  return (
    <div className="mb-6 flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
      <SearchInput value={p.search} onChange={p.onSearch} placeholder="Search by client, project, or number..." className="lg:w-80" />
      <div className="flex w-full flex-col gap-4 md:flex-row lg:w-auto">
        <DateRangeFilter value={p.range} onChange={p.onRange} />
        <div className="flex w-full gap-2 md:w-auto">
          <DropdownMenu
            items={STATUS_OPTIONS.filter((s) => s !== 'From History' || historyOn).map((s) => ({
              label: statusLabel(s, badges),
              icon: p.status === s ? <Check className="text-primary-600" /> : <span />,
              onClick: () => p.onStatus(s),
            }))}
            trigger={
              <button type="button" className={pill(p.status !== 'All Active')}>
                <span className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-500" />
                  {p.status === 'From History' ? 'From history' : statusLabel(p.status)}
                  {p.status === 'From History' && <NewBadge feature={28} />}
                </span>
                <ChevronDown className="h-3 w-3 text-gray-500" />
              </button>
            }
          />
          <DropdownMenu
            items={SORT_OPTIONS.map((o) => ({ label: o.label, icon: <o.icon />, onClick: () => p.onSort(o.value) }))}
            trigger={
              <button type="button" className={pill(p.sort !== 'date-desc')}>
                <span className="flex items-center gap-2">
                  <SortIcon className={cn('h-4 w-4', p.sort !== 'date-desc' ? 'text-primary-500' : 'text-gray-500')} />
                  {sortOpt.label}
                </span>
                <ChevronDown className="h-4 w-4 text-gray-500" />
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
}
