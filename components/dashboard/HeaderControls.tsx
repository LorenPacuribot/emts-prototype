'use client';

/*
  Dashboard header controls: the period dropdown (presets + custom range)
  and the blue "Create" menu. Both match the live app header buttons.
*/
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Calendar as CalendarIcon, CalendarPlus, ChevronDown, FileText, Plus, Receipt, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PERIOD_OPTIONS, type PeriodValue } from './metrics';

/** Closes a popover when the user clicks outside it. */
function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onOutside]);
}

const fmt = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

export function PeriodFilter({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const label =
    PERIOD_OPTIONS.find((o) => o.key === value.preset)?.label ??
    (value.from && value.to ? `${fmt(value.from)} - ${fmt(value.to)}` : value.from ? `From ${fmt(value.from)}` : 'Custom Range');

  const setCustom = (field: 'from' | 'to', v: string) => onChange({ ...value, preset: 'custom', [field]: v || undefined });

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:border-gray-300 md:h-12"
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="truncate">{label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-gray-100 bg-white shadow-xl">
          <div className="border-b border-gray-100 p-2">
            {PERIOD_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => {
                  onChange({ preset: o.key });
                  setOpen(false);
                }}
                className={cn(
                  'w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-gray-50',
                  value.preset === o.key ? 'bg-primary-50 text-primary-700' : 'text-gray-700',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="rounded-b-xl bg-gray-50 p-4">
            <span className="mb-3 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Custom Range</span>
            <div className="space-y-3">
              {(['from', 'to'] as const).map((f) => (
                <label key={f} className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">{f === 'from' ? 'From' : 'To'}</span>
                  <input
                    type="date"
                    value={value.preset === 'custom' ? value[f] ?? '' : ''}
                    min={f === 'to' ? value.from : undefined}
                    onChange={(e) => setCustom(f, e.target.value)}
                    className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CREATE_ITEMS = [
  { href: '/leads?new=1', label: 'New Lead', icon: UserPlus, color: 'text-blue-500' },
  { href: '/estimates/new', label: 'New Estimate', icon: FileText, color: 'text-primary-500' },
  { href: '/invoices/new', label: 'New Invoice', icon: Receipt, color: 'text-emerald-500' },
  { href: '/calendar?new=1', label: 'New Event', icon: CalendarPlus, color: 'text-purple-500' },
];

export function CreateMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 items-center gap-2 rounded-2xl border border-primary-600 bg-primary-600 px-4 font-bold text-white shadow-xl shadow-primary-500/20 hover:bg-primary-700 md:h-12 md:px-6"
      >
        <Plus className="h-4 w-4 md:h-5 md:w-5" />
        <span className="text-sm md:text-base">Create</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform md:h-4 md:w-4', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
          {CREATE_ITEMS.map(({ href, label, icon: Icon, color }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} className="flex w-full items-center gap-3 px-4 py-3 text-left font-bold text-gray-700 transition-colors hover:bg-gray-50">
              <Icon className={cn('h-4 w-4', color)} /> {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
