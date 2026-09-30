'use client';

/*
  Display building blocks that repeat across screens:
  Badge, RefChip (EST-2026-9 style links), Card, CardTitle (uppercase icon
  header used on dashboard cards), StatCard, PageHeader, SearchInput,
  EmptyState, ListSkeleton, Pagination, DateTile, Avatar, Tabs, ProgressBar.
*/
import React from 'react';
import Link from 'next/link';
import * as RTabs from '@radix-ui/react-tabs';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileText, Inbox, Search, Users } from 'lucide-react';
import { cn, dateTile, initials, inkOn } from '@/lib/utils';
import { NativeSelect } from './form';
import { pressable } from '@/lib/a11y';

/* ---------- Badge ---------- */

export function Badge({ children, className, dot }: { children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold whitespace-nowrap', className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Small uppercase pill: "WEBSITE", "CLIENT", "INTERIOR" */
export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xxs font-black uppercase tracking-wider whitespace-nowrap', className)}>
      {children}
    </span>
  );
}

/** Blue reference chip that links to a record: EST-2026-9, LEAD-2026-6 */
export function RefChip({ href, kind = 'doc', children }: { href?: string; kind?: 'doc' | 'lead' | 'plain'; children: React.ReactNode }) {
  const cls = cn(
    'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap',
    kind === 'plain' ? 'border-gray-200 bg-gray-50 text-gray-500' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
  );
  const icon = kind === 'lead' ? <Users className="h-3 w-3" /> : kind === 'doc' ? <FileText className="h-3 w-3" /> : null;
  if (!href) return <span className={cls}>{icon}{children}</span>;
  return (
    <Link href={href} onClick={(e) => e.stopPropagation()} className={cls}>
      {icon}
      {children}
    </Link>
  );
}

/* ---------- Cards ---------- */

export function Card({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div {...pressable(onClick)} onClick={onClick} className={cn('rounded-2xl border border-gray-200 bg-white shadow-sm', onClick && 'cursor-pointer hover:border-primary-300 hover:shadow-md transition', className)}>
      {children}
    </div>
  );
}

/** Uppercase card header with icon: "📋 MY TASKS" */
export function CardTitle({ icon, children, href, right, className }: { icon?: React.ReactNode; children: React.ReactNode; href?: string; right?: React.ReactNode; className?: string }) {
  const label = (
    <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-gray-600">
      {icon && <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
      {href && <ChevronRight className="h-3 w-3 text-gray-300" />}
    </span>
  );
  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      {href ? <Link href={href} className="hover:opacity-80">{label}</Link> : label}
      {right}
    </div>
  );
}

export function StatCard({ icon, label, value, sub, className }: { icon?: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-gray-500 [&>svg]:h-4 [&>svg]:w-4">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-heading text-2xl font-extrabold text-gray-900">{value}</div>
      {sub && <div className="mt-1 text-sm text-gray-500">{sub}</div>}
    </Card>
  );
}

/* ---------- Page header ---------- */

export function PageHeader({ title, subtitle, actions, className }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8', className)}>
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
        {subtitle && <p className="mt-2 text-base text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

/* ---------- Search ---------- */

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative w-full md:w-80', className)}>
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-400"
      />
    </div>
  );
}

/* ---------- Empty & loading ---------- */

export function EmptyState({ icon, title, message, action, className }: { icon?: React.ReactNode; title?: string; message: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center', className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-500 [&>svg]:h-6 [&>svg]:w-6">{icon ?? <Inbox />}</div>
      {title && <h3 className="font-heading text-base font-bold text-gray-900">{title}</h3>}
      <p className="mt-1 max-w-sm text-sm text-gray-500">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-gray-200/70', className)} />;
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

/* ---------- Pagination (matches live: « ‹ 1 › »  + "Show 10") ---------- */

export function usePagination<T>(items: T[], initialSize = 10) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(initialSize);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  React.useEffect(() => setPage(1), [items.length, pageSize]);
  return { page: safePage, setPage, pageSize, setPageSize, totalPages, pageItems, total: items.length };
}

export function Pagination({
  page, totalPages, onPage, pageSize, onPageSize, shown, total,
}: { page: number; totalPages: number; onPage: (p: number) => void; pageSize: number; onPageSize: (n: number) => void; shown: number; total: number }) {
  const btn = 'flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:text-gray-700 disabled:opacity-40';
  return (
    <div className="mt-6 flex flex-col items-center justify-between gap-3 md:flex-row">
      <p className="text-sm text-gray-600">Showing {shown} out of {total} results</p>
      <div className="flex items-center gap-1.5">
        <button className={btn} disabled={page === 1} onClick={() => onPage(1)} aria-label="First page"><ChevronsLeft className="h-4 w-4" /></button>
        <button className={btn} disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
        {Array.from({ length: totalPages }).map((_, i) => (
          <button
            key={i}
            onClick={() => onPage(i + 1)}
            className={cn('h-7 min-w-7 rounded-md px-2 text-xs font-bold', page === i + 1 ? 'bg-primary-600 text-white' : 'border border-gray-200 bg-white text-gray-600')}
          >
            {i + 1}
          </button>
        ))}
        <button className={btn} disabled={page === totalPages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
        <button className={btn} disabled={page === totalPages} onClick={() => onPage(totalPages)} aria-label="Last page"><ChevronsRight className="h-4 w-4" /></button>
      </div>
      <div className="w-32">
        <NativeSelect aria-label="Rows per page" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-9">
          {[5, 10, 20, 50].map((n) => (
            <option key={n} value={n}>Show {n}</option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}

/* ---------- Misc ---------- */

/** Month/day/year block at the left of estimate rows */
export function DateTile({ iso, compact }: { iso: string; compact?: boolean }) {
  const t = dateTile(iso);
  return (
    <div className={cn('flex shrink-0 flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50', compact ? 'h-10 w-10' : 'h-12 w-11')}>
      <span className="text-xxs font-bold uppercase text-gray-500">{t.month}</span>
      <span className="font-heading text-sm font-extrabold leading-none text-gray-900">{t.day}</span>
      {!compact && <span className="text-xs text-gray-500">{t.year}</span>}
    </div>
  );
}

export function Avatar({ name, color, size = 'md', className }: { name: string; color?: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = size === 'sm' ? 'h-7 w-7 text-xs' : size === 'lg' ? 'h-14 w-14 text-lg' : 'h-9 w-9 text-xs';
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold', s, className)}
      style={{ backgroundColor: color ?? '#93c5fd', color: inkOn(color ?? '#93c5fd') }}
    >
      {initials(name)}
    </span>
  );
}

export function ProgressBar({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-gray-100', className)}>
      <div className={cn('h-full rounded-full bg-primary-600 transition-all', barClassName)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Tabs({
  tabs, value, onChange, className,
}: { tabs: { value: string; label: React.ReactNode }[]; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <RTabs.Root value={value} onValueChange={onChange}>
      {/* The border sits on a wrapper so the tab strip can scroll on phones without clipping the active underline. */}
      <div className={cn('border-b border-gray-200', className)}>
      <RTabs.List className="no-scrollbar -mb-px flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <RTabs.Trigger
            key={t.value}
            value={t.value}
            className="shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 sm:px-4 text-sm font-semibold text-gray-500 hover:text-gray-800 data-[state=active]:border-primary-600 data-[state=active]:text-primary-700"
          >
            {t.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      </div>
    </RTabs.Root>
  );
}

/** Horizontal pill filter used on Jobs ("All Active", "Unscheduled", ...) */
export function PillFilter<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-10 rounded-xl border px-3 text-xs font-bold transition-colors',
            value === o.value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
