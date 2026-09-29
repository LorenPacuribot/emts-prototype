'use client';

/*
  "Table Columns" panel, opened from the ⋯ menu on the Area & Line Items
  section or on an area. Click the eye to show or hide a column, then Save.
  It edits the same list as Settings > Table Columns, so the choice applies to
  every estimate. Custom columns are preparation activities; their production
  rate (units per hour) turns a tick or a quantity into prep hours.
*/
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Settings2 } from 'lucide-react';
import type { TableColumn } from '@/lib/types';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import { cn } from '@/lib/utils';

const TYPE_LABEL: Record<TableColumn['columnType'], string> = { SYSTEM: 'Estimate field', HOURS: 'Prep · hours', CHECKBOX: 'Prep · checkbox', QUANTITY: 'Prep · quantity' };

export function TableColumnsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { items, setAll } = useCollection('tableColumns');
  const { toast } = useToast();
  const [draft, setDraft] = useState<TableColumn[]>([]);

  useEffect(() => {
    if (open) setDraft([...items].sort((a, b) => a.sortOrder - b.sortOrder));
  }, [open, items]);

  const toggle = (id: string) => setDraft((d) => d.map((c) => (c.id === id ? { ...c, isVisible: !c.isVisible } : c)));
  const save = () => {
    const locked = draft.find((c) => c.id === 'tcol_surface');
    const next = locked && !locked.isVisible ? draft.map((c) => (c.id === 'tcol_surface' ? { ...c, isVisible: true } : c)) : draft;
    setAll(next);
    toast('Table columns saved');
    onOpenChange(false);
  };

  const group = (system: boolean) => draft.filter((c) => c.isSystem === system);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Table Columns"
      description="Show or hide columns in the estimate area tables. Changes apply to every estimate."
      size="md"
      footer={
        <>
          <Link href="/settings/table-columns" className="mr-auto inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:underline">
            <Settings2 className="h-4 w-4" /> Add or edit columns
          </Link>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </>
      }
    >
      {[{ title: 'Estimate fields', list: group(true) }, { title: 'Preparation activities', list: group(false) }].map((g) => (
        <div key={g.title} className="mb-5 last:mb-0">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">{g.title}</div>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {g.list.map((c) => {
              const locked = c.id === 'tcol_surface';
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => toggle(c.id)}
                    aria-pressed={c.isVisible}
                    aria-label={`${c.isVisible ? 'Hide' : 'Show'} ${c.name}`}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed',
                      c.isVisible ? 'border-primary-200 bg-primary-50/60 text-gray-900' : 'border-gray-200 bg-white text-gray-400',
                    )}
                    title={locked ? 'The Item column is always shown' : undefined}
                  >
                    {c.isVisible ? <Eye className="h-4 w-4 shrink-0 text-primary-600" /> : <EyeOff className="h-4 w-4 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                    <span className="shrink-0 text-[10px] text-gray-400">
                      {TYPE_LABEL[c.columnType]}
                      {c.prepRate ? ` · ${c.prepRate}/h` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </Modal>
  );
}
