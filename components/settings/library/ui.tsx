'use client';

/*
  Shared building blocks for the Settings > Libraries pages
  (estimate templates, types, packages, areas, surface rates, paint,
  brands, materials, line items, terms).

  Every library page follows the same pattern in the live app:
  a header with an "Add" button, a search + sort bar, a grid of white
  cards with a kebab menu, and an add/edit modal. These pieces keep
  that pattern in one place so each page only describes its own fields.

  - LibraryToolbar: search input + optional sort dropdown (or any extra control)
  - LibraryGrid / LibraryCard: the 3-column card grid and the card shell
  - CardKebab: kebab menu with Edit / Delete (+ extra items)
  - EmptyBox: gray "No X yet. Click ..." box
  - Pill: small colored pill (finish, coverage, unit, price)
  - FormActions: Cancel + primary button row used at the bottom of modals
  - SectionHeading: small uppercase label with an icon used inside modals
  - useLibraryCrud: modal / edit target / delete confirm state
  - nextSort: next sortOrder value for a list
*/
import React, { useState } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { SearchInput } from '@/components/ui/display';
import { Select, type SelectOption } from '@/components/ui/form';
import { RowMenu, type MenuItem } from '@/components/ui/menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function LibraryToolbar({
  search, onSearch, placeholder, sort, onSort, sortOptions, children,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  sort?: string;
  onSort?: (v: string) => void;
  sortOptions?: SelectOption[];
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
      <SearchInput value={search} onChange={onSearch} placeholder={placeholder} className="md:w-[300px] md:max-w-md" />
      {sortOptions && onSort && (
        <div className="w-full md:w-auto md:min-w-[150px]">
          <Select value={sort} onChange={onSort} options={sortOptions} size="sm" className="h-8 rounded-lg text-[10px]" />
        </div>
      )}
      {children}
    </div>
  );
}

export function LibraryGrid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  return <div className={cn('grid grid-cols-1 gap-5 md:grid-cols-2', cols === 3 ? 'lg:grid-cols-3' : '')}>{children}</div>;
}

/** White card with the soft shadow used on every library screen. */
export function LibraryCard({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative flex flex-col rounded-2xl bg-white p-5 shadow-lg shadow-gray-200/70 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardKebab({ onEdit, onDelete, extra = [], className }: { onEdit?: () => void; onDelete?: () => void; extra?: MenuItem[]; className?: string }) {
  const items: MenuItem[] = [];
  if (onEdit) items.push({ label: 'Edit', icon: <Edit2 />, onClick: onEdit });
  items.push(...extra);
  if (onDelete) items.push({ label: 'Delete', icon: <Trash2 />, onClick: onDelete, danger: true });
  return <RowMenu items={items} className={className} />;
}

export function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-10 text-center">
      <p className="text-sm text-gray-500">{children}</p>
    </div>
  );
}

/** Plain centered "No results" line shown when a search matches nothing. */
export function NoMatches({ children }: { children: React.ReactNode }) {
  return <div className="col-span-full py-12 text-center text-sm text-gray-400">{children}</div>;
}

const PILL = {
  gray: 'bg-gray-50 text-gray-600 border-gray-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  green: 'bg-green-50 text-green-700 border-green-100',
  purple: 'bg-purple-50 text-purple-700 border-purple-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
} as const;

export function Pill({ children, color = 'gray', className }: { children: React.ReactNode; color?: keyof typeof PILL; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold', PILL[color], className)}>{children}</span>;
}

export function FormActions({
  onCancel, submitLabel, onSubmit, full, left,
}: { onCancel?: () => void; submitLabel: string; onSubmit: () => void; full?: boolean; left?: React.ReactNode }) {
  return (
    <div className={cn('flex gap-3 pt-2', !full && 'items-center justify-end')}>
      {left && <div className="mr-auto">{left}</div>}
      {onCancel && (
        <Button variant="secondary" onClick={onCancel} className={full ? 'flex-1 justify-center' : ''}>
          Cancel
        </Button>
      )}
      <Button onClick={onSubmit} className={full ? 'flex-1 justify-center' : ''}>
        {submitLabel}
      </Button>
    </div>
  );
}

export function SectionHeading({ icon, children, right }: { icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
        {children}
      </h4>
      {right}
    </div>
  );
}

/** Error line under a field. */
export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-red-600">{children}</p>;
}

/**
 * State for a page with one add/edit modal and a delete confirm.
 * editing === null and open === true means "add".
 */
export function useLibraryCrud<T>() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  return {
    open,
    editing,
    deleting,
    openAdd: () => { setEditing(null); setOpen(true); },
    openEdit: (item: T) => { setEditing(item); setOpen(true); },
    close: () => setOpen(false),
    setOpen,
    askDelete: (item: T) => setDeleting(item),
    clearDelete: () => setDeleting(null),
  };
}

export function nextSort(list: { sortOrder: number }[]) {
  return list.length ? Math.max(...list.map((x) => x.sortOrder || 0)) + 1 : 1;
}

/** Parse a number input; empty string gives the fallback. */
export function num(v: string, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export const UNIT_LABELS: Record<string, string> = { sqft: 'SqFt', lnft: 'LnFt', each: 'Item' };
