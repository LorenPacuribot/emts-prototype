'use client';

/*
  Small building blocks shared by the report tabs: the tab button, the
  Start - End date inputs, a multi-select dropdown (status / type filters),
  the white table card and cell styles.
*/
import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DateRange } from './data';

export function TabButton({ active, onClick, icon: Icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string; badge?: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition-all md:px-5 md:py-3 md:text-sm',
        active ? 'bg-white text-primary-700 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
      )}
    >
      <Icon className={cn('h-3.5 w-3.5 md:h-4 md:w-4', active ? 'text-primary-600' : 'text-gray-500')} />
      {label}
      {badge}
    </button>
  );
}

export function DateRangeInputs({ value, onChange, labels = ['Start Date', 'End Date'] }: { value: DateRange; onChange: (r: DateRange) => void; labels?: [string, string] }) {
  const input = 'h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40';
  return (
    <div className="flex w-full items-end gap-2 sm:w-auto">
      <label className="block min-w-0 flex-1 sm:w-40 sm:flex-none">
        <span className="mb-1 block text-xxs font-bold uppercase tracking-wider text-gray-500">{labels[0]}</span>
        <input type="date" value={value.start} max={value.end || undefined} onChange={(e) => onChange({ ...value, start: e.target.value })} className={input} />
      </label>
      <span className="mb-2.5 font-bold text-gray-500">-</span>
      <label className="block min-w-0 flex-1 sm:w-40 sm:flex-none">
        <span className="mb-1 block text-xxs font-bold uppercase tracking-wider text-gray-500">{labels[1]}</span>
        <input type="date" value={value.end} min={value.start || undefined} onChange={(e) => onChange({ ...value, end: e.target.value })} className={input} />
      </label>
    </div>
  );
}

export interface MultiOption {
  value: string;
  label: string;
}

/** Checkbox dropdown. Groups are optional headings (e.g. Pending / Sold / Closed). */
export function MultiSelect({
  label, value, onChange, options, groups,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  options?: MultiOption[];
  groups?: { label: string; options: MultiOption[] }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const sections = groups ?? [{ label: '', options: options ?? [] }];
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-10 w-44 items-center justify-between gap-2 rounded-lg border bg-white px-3 text-sm font-semibold shadow-sm',
          value.length ? 'border-primary-300 text-primary-700' : 'border-gray-200 text-gray-600',
        )}
      >
        <span className="truncate">{value.length ? `${label} (${value.length})` : label}</span>
        <ChevronDown className={cn('h-4 w-4 text-gray-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 max-h-80 w-56 overflow-y-auto rounded-xl border border-gray-100 bg-white p-1.5 shadow-xl">
          {sections.map((g) => (
            <div key={g.label || 'all'}>
              {g.label && (
                <button
                  type="button"
                  onClick={() => {
                    const vals = g.options.map((o) => o.value);
                    const all = vals.every((v) => value.includes(v));
                    onChange(all ? value.filter((v) => !vals.includes(v)) : [...new Set([...value, ...vals])]);
                  }}
                  className="w-full px-2 pb-1 pt-2 text-left text-xxs font-bold uppercase tracking-widest text-gray-500 hover:text-primary-600"
                >
                  {g.label}
                </button>
              )}
              {g.options.map((o) => {
                const on = value.includes(o.value);
                return (
                  <button key={o.value} type="button" onClick={() => toggle(o.value)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50">
                    <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary-600 bg-primary-600' : 'border-gray-300')}>
                      {on && <Check className="h-3 w-3 text-white" />}
                    </span>
                    {o.label}
                  </button>
                );
              })}
            </div>
          ))}
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 w-full border-t border-gray-100 px-2 pt-2 text-left text-xs font-bold text-gray-500 hover:text-gray-900">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ExportButton({ onClick, children = 'Export' }: { onClick: () => void; children?: React.ReactNode }) {
  return (
    <Button variant="secondary" size="sm" className="shrink-0 bg-gray-50" onClick={onClick} icon={<Download className="h-4 w-4" />}>
      {children}
    </Button>
  );
}

/** White rounded card holding a report table. */
export function ReportCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('overflow-hidden rounded-2xl bg-white shadow-lg', className)}>{children}</div>;
}

export const TH = 'whitespace-nowrap px-4 py-4';
export const TD = 'whitespace-nowrap px-4 py-4 text-sm';
export const money0 = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
export const money2 = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
