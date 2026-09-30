'use client';

/*
  Center-column dashboard cards: Pending Sales, Win Rate gauge, Revenue,
  Schedule Agenda and Invoices Due. Layout and copy follow the live app.
*/
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, DollarSign, Filter, Flame, MapPin, Zap } from 'lucide-react';
import { ESTIMATE_STATUS_BADGE } from '@/lib/constants';
import type { EstimateStatus } from '@/lib/types';
import { cn, shortDate, toISODate } from '@/lib/utils';
import { Checkbox } from '@/components/ui/form';
import { SectionHeader } from './SectionHeader';
import { VersionBadge } from '@/features/components/ui';
import { AGENDA_TYPE_OPTIONS, kMoney1, parseDate, plainMoney, type AgendaItem, type AgendaType, type DashboardData } from './metrics';

/* ---------- Pending Sales ---------- */

export function PendingSalesWidget({ rows, pipelineValue }: { rows: DashboardData['pending']; pipelineValue: number }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center md:mb-6">
        <SectionHeader title="Pending Sales" icon={Clock} colorClass="text-blue-600" href="/estimates" className="mb-0" />
        <div className="text-left sm:text-right">
          <span className="mb-1 block text-xxs font-black uppercase tracking-widest text-gray-500">Pipeline Value</span>
          <span className="text-2xl font-black tracking-tight text-primary-600 md:text-3xl">{plainMoney(pipelineValue)}</span>
        </div>
      </div>
      <div className="rtable custom-scrollbar min-h-0 flex-1 overflow-auto rounded-xl border border-gray-100">
        <table className="w-full min-w-[420px] text-left">
          <thead className="sticky top-0 z-10 bg-gray-50 text-xxs font-black uppercase tracking-widest text-gray-500">
            <tr>
              <th className="p-2 md:p-4">Customer</th>
              <th className="p-2 md:p-4">Value</th>
              <th className="p-2 md:p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-8 text-center italic text-gray-500">No pending estimates.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-blue-50/30">
                  <td className="p-2 text-sm font-bold text-gray-900 md:p-4">
                    <Link href={`/estimates/${r.id}`} className="hover:text-primary-600">{r.customerName}</Link>
                  </td>
                  <td className="p-2 text-sm font-black text-gray-900 md:p-4">{plainMoney(r.value)}</td>
                  <td className="p-2 md:p-4">
                    <span className={cn('rounded-full border px-2 py-0.5 text-xs font-bold', ESTIMATE_STATUS_BADGE[r.status as EstimateStatus])}>{r.status}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Win Rate gauge (240 degree arc) ---------- */

export function WinRateWidget({ data }: { data: DashboardData['winRate'] }) {
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const arc = (240 / 360) * circumference;
  const fill = (Math.min(100, data.winRate) / 100) * arc;
  return (
    <Link href="/reports?tab=summary" className="flex h-full flex-col items-center" title="View Stats">
      <div className="flex w-full flex-1 flex-col items-center justify-center">
        <div className="relative flex h-full min-h-[160px] w-full flex-col items-center justify-center rounded-3xl border border-primary-100/50 bg-primary-50/30 p-3 lg:min-h-[220px] lg:p-6">
          <svg className="h-32 w-32 rotate-[150deg] lg:h-48 lg:w-48" viewBox="0 0 128 128" aria-hidden>
            <circle cx="64" cy="64" r={r} fill="transparent" stroke="currentColor" className="text-gray-200" strokeWidth="8" strokeDasharray={`${arc} ${circumference}`} strokeLinecap="round" />
            {fill > 0 && (
              <circle cx="64" cy="64" r={r} fill="transparent" stroke="#2563eb" strokeWidth="12" strokeDasharray={`${fill} ${circumference}`} strokeLinecap="round" className="transition-all duration-1000" />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
            <span className="text-4xl font-black leading-none tracking-tighter text-gray-900 lg:text-5xl">{Math.round(data.winRate)}%</span>
            <span className="mt-1 flex items-center gap-1.5 text-xxs font-black uppercase tracking-[0.2em] text-gray-500 lg:mt-2">
              <Flame className="h-3 w-3 text-orange-500" /> Win Rate
            </span>
          </div>
          <div className="absolute bottom-4 flex w-28 justify-between px-2 lg:bottom-8 lg:w-32">
            <span className="text-xxs font-black uppercase text-gray-500">0%</span>
            <span className="text-xxs font-black uppercase text-gray-500">100%</span>
          </div>
        </div>
      </div>
      <div className="mt-4 grid w-full grid-cols-2 gap-4 border-t border-gray-50 pt-4 text-center">
        <div>
          <div className="text-lg font-black text-gray-900">{data.accepted}/{data.total}</div>
          <div className="text-xxs font-bold uppercase tracking-widest text-gray-500">Est. Sold</div>
        </div>
        <div>
          <div className="text-lg font-black text-gray-900">{kMoney1(data.avgJob)}</div>
          <div className="text-xxs font-bold uppercase tracking-widest text-gray-500">Avg. Job</div>
        </div>
      </div>
    </Link>
  );
}

/* ---------- Revenue ---------- */

export function RevenueWidget({ data }: { data: DashboardData['revenue'] }) {
  return (
    <Link href="/invoices" className="relative flex h-full flex-col justify-center space-y-4 overflow-hidden lg:space-y-10" title="View Invoices">
      <div className="absolute right-0 top-0 p-6 opacity-5">
        <Zap className="h-24 w-24 text-indigo-500" />
      </div>
      <div className="relative z-10">
        <span className="mb-1 flex items-center gap-2 text-xxs font-black uppercase tracking-[0.25em] text-primary-500 lg:mb-2 lg:text-xs">Revenue <VersionBadge item="RP-M4" withNew={false} /></span>
        <div className="text-2xl font-black tracking-tighter text-primary-600 lg:text-4xl">{plainMoney(data.total)}</div>
        <div className="mt-1 text-xxs font-bold uppercase tracking-widest text-gray-500 lg:mt-2 lg:text-xxs">Verified Total Sales</div>
      </div>
      {data.annualTarget > 0 && (
        <div className="relative z-10 border-t border-gray-100 pt-3 lg:pt-6">
          <span className="mb-1 block text-xxs font-black uppercase tracking-[0.25em] text-gray-500 lg:mb-2 lg:text-xs">Annual Target</span>
          <div className="text-xl font-black tracking-tighter text-gray-900 lg:text-3xl">
            ${data.annualTarget.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-xxs font-bold uppercase tracking-widest text-gray-500 lg:text-xxs">Company Goal</div>
        </div>
      )}
    </Link>
  );
}

/* ---------- Schedule Agenda ---------- */

const ALL_TYPES = AGENDA_TYPE_OPTIONS.map((o) => o.value);
const TYPE_BADGE: Record<AgendaType, { label: string; cls: string }> = {
  LEAD: { label: 'Lead', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  WORK: { label: 'Work Order', cls: 'bg-green-50 text-green-700 border-green-200' },
  MEETING: { label: 'Meeting', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
};
const DOT: Record<AgendaType, string> = { LEAD: 'bg-blue-500', WORK: 'bg-green-500', MEETING: 'bg-purple-500' };

function timeLabel(hhmm?: string) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function ScheduleAgendaWidget({ items }: { items: AgendaItem[] }) {
  const today = new Date();
  const todayKey = toISODate(today);
  const [selected, setSelected] = useState(todayKey);
  const [weekOffset, setWeekOffset] = useState(0);
  const [types, setTypes] = useState<AgendaType[]>(ALL_TYPES);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const toggleType = (t: AgendaType) => {
    if (types.includes(t)) {
      if (types.length <= 1) return; // keep at least one type, like the live app
      setTypes(types.filter((x) => x !== t));
    } else setTypes([...types, t]);
  };

  // Monday-start week containing today, shifted by weekOffset
  const weekDays = useMemo(() => {
    const day = today.getDay();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  // Items per day (multi-day jobs appear on every day of their range)
  const byDay = useMemo(() => {
    const map: Record<string, AgendaItem[]> = {};
    for (const item of items) {
      if (!types.includes(item.type)) continue;
      const cur = parseDate(item.startDate);
      const end = parseDate(item.endDate);
      let guard = 0;
      while (cur <= end && guard++ < 400) {
        const k = toISODate(cur);
        (map[k] ??= []).push(item);
        cur.setDate(cur.getDate() + 1);
      }
    }
    for (const k of Object.keys(map)) map[k]!.sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
    return map;
  }, [items, types]);

  const selectedItems = byDay[selected] ?? [];
  const selectedDate = parseDate(selected);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-2">
        <Link href="/calendar" className="group flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-blue-500" />
          <h3 className="text-xs font-black uppercase tracking-[0.15em] text-gray-500 group-hover:text-primary-600">Schedule Agenda</h3>
        </Link>
        <div className="relative" ref={filterRef}>
          <button
            onClick={() => setFilterOpen((o) => !o)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xxs font-bold uppercase tracking-wider transition-colors',
              types.length < ALL_TYPES.length ? 'border-primary-200 bg-primary-50 text-primary-600' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300',
            )}
          >
            <Filter className="h-3 w-3" />
            {types.length === ALL_TYPES.length ? 'All Types' : `${types.length} Type${types.length > 1 ? 's' : ''}`}
          </button>
          {filterOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-48 rounded-xl border border-gray-100 bg-white py-1.5 shadow-xl">
              {AGENDA_TYPE_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                  <Checkbox
                    checked={types.includes(opt.value)}
                    onChange={() => toggleType(opt.value)}
                    label={
                      <span className="flex items-center gap-2 text-xs font-semibold">
                        <span className={cn('h-2 w-2 rounded-full', opt.dot)} />
                        {opt.label}
                      </span>
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <button onClick={() => setWeekOffset((w) => w - 1)} className="shrink-0 p-1 text-gray-500 hover:text-primary-600" aria-label="Previous week">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="grid flex-1 grid-cols-7 gap-1">
          {weekDays.map((d) => {
            const key = toISODate(d);
            const isSel = key === selected;
            const isToday = key === todayKey;
            const dayItems = byDay[key] ?? [];
            const kinds = ALL_TYPES.filter((t) => dayItems.some((i) => i.type === t));
            return (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className={cn(
                  'flex flex-col items-center rounded-xl border py-2 transition-all',
                  isSel ? 'border-primary-700 bg-primary-600 text-white shadow-lg' : 'border-transparent bg-white text-gray-500 hover:bg-gray-50',
                  isToday && !isSel && 'bg-primary-50 text-primary-600 ring-2 ring-primary-100',
                )}
              >
                <span className="mb-1 text-xxs font-black uppercase opacity-70">{d.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0)}</span>
                <span className="text-xs font-black">{d.getDate()}</span>
                <div className="mt-1 flex h-1 gap-0.5">
                  {kinds.map((k) => (
                    <span key={k} className={cn('h-1 w-1 rounded-full', isSel ? 'bg-white' : DOT[k])} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
        <button onClick={() => setWeekOffset((w) => w + 1)} className="shrink-0 p-1 text-gray-500 hover:text-primary-600" aria-label="Next week">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <div className="mb-4 text-xxs font-black uppercase tracking-widest text-gray-500">
          {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        {selectedItems.length > 0 ? (
          <div className="custom-scrollbar flex gap-4 overflow-x-auto pb-4">
            {selectedItems.map((item) => {
              const badge = TYPE_BADGE[item.type];
              const start = parseDate(item.startDate);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="group flex w-[280px] shrink-0 items-center gap-4 rounded-2xl border border-gray-100 bg-gray-50/30 p-4 transition-all hover:border-primary-200 hover:bg-white hover:shadow-md md:w-[300px]"
                >
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-gray-100 bg-white text-gray-500 shadow-sm group-hover:text-primary-600">
                    <span className="mb-1 text-xxs font-black uppercase leading-none opacity-60">{start.toLocaleDateString('en-US', { month: 'short' })}</span>
                    <span className="text-lg font-black leading-none">{start.getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <h4 className="truncate text-sm font-bold text-gray-900 group-hover:text-primary-700">{item.title}</h4>
                        <div className="mt-1">
                          <span className={cn('rounded-full border px-2 py-0.5 text-xs font-bold', badge.cls)}>{badge.label}</span>
                        </div>
                      </div>
                      {item.time ? (
                        <span className="ml-2 shrink-0 rounded border border-gray-100 bg-white px-2 py-1 text-xs font-black text-gray-500">{timeLabel(item.time)}</span>
                      ) : item.status ? (
                        <span className="ml-2 shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">{item.status}</span>
                      ) : null}
                    </div>
                    {item.location && (
                      <div className="mt-2 flex items-center gap-1 truncate text-xs font-medium text-gray-500">
                        <MapPin className="h-3 w-3" /> {item.location.split(',')[0]}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-4 text-center">
            <CalendarIcon className="mb-2 h-8 w-8 text-gray-300" />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
              {selected === todayKey ? 'No appointments today' : 'No appointments this day'}
            </p>
            <Link href="/calendar?new=1" className="mt-2 text-xxs font-black uppercase tracking-widest text-primary-600 hover:underline">
              Schedule New
            </Link>
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        <Link href="/calendar" className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:underline">
          Go to Calendar <ArrowUpRight className="h-2.5 w-2.5" />
        </Link>
      </div>
    </div>
  );
}

/* ---------- Invoices Due ---------- */

export function InvoicesDueWidget({ invoices }: { invoices: DashboardData['invoicesDue'] }) {
  return (
    <div className="flex h-full flex-col">
      <SectionHeader title="Invoices Due" icon={DollarSign} colorClass="text-green-600" href="/invoices" />
      <div className="custom-scrollbar grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-y-auto pr-2 md:grid-cols-2">
        {invoices.length === 0 ? (
          <p className="col-span-full py-8 text-center text-xs font-medium italic text-gray-500">All accounts up to date.</p>
        ) : (
          invoices.slice(0, 4).map((inv) => (
            <Link
              key={inv.id}
              href={`/invoices/${inv.id}`}
              className="flex h-fit items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 transition-all hover:border-green-300 hover:shadow-md"
            >
              <div className="mr-2 min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-gray-900">{inv.customerName}</div>
                <div className="text-xxs font-black uppercase tracking-widest text-gray-500">
                  {inv.isOverdue ? <span className="font-bold text-red-500">OVERDUE</span> : `Due ${shortDate(inv.dueDate)}`}
                </div>
              </div>
              <div className={cn('shrink-0 text-base font-black', inv.isOverdue ? 'text-red-600' : 'text-green-600')}>{plainMoney(inv.dueAmount)}</div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
