'use client';

/*
  Small building blocks shared by the Organization and Configuration settings
  pages (components/settings/org/** and components/settings/config/**).

  - SettingsCard: the white rounded card with a bold title used on every page.
  - NoteBox: blue "Note:" callout used under inputs.
  - VariablesBox: "Available Variables" chips on Automated Messages / SMS Templates.
  - SegmentedToggle: two-option pill switch ("Percentage | Flat Amount").
  - TemplateListItem: selectable row in the left list of the template editors.
  - numberOrZero / formatPhone / readImageFile helpers.
*/
import React from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SettingsCard({
  title, subtitle, icon, actions, children, className,
}: { title?: React.ReactNode; subtitle?: React.ReactNode; icon?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl bg-white p-6 shadow-lg shadow-gray-200/60 md:p-7', className)}>
      {(title || actions) && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            {title && (
              <h3 className="flex items-center gap-2 font-heading text-lg font-bold text-gray-900 [&>svg]:h-5 [&>svg]:w-5">
                {icon}
                {title}
              </h3>
            )}
            {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function NoteBox({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700', className)}>
      <span className="font-bold">Note:</span>
      <span>{children}</span>
    </div>
  );
}

/** Blue box listing template variables. Clicking a chip inserts it (onInsert) or copies it. */
export function VariablesBox({ variables, onInsert, hint }: { variables: string[]; onInsert?: (v: string) => void; hint: string }) {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-blue-800">
        <Info className="h-4 w-4" /> Available Variables
      </div>
      <div className="flex flex-wrap gap-2">
        {variables.map((v) => (
          <button
            key={v}
            type="button"
            title="Click to insert"
            onClick={() => onInsert?.(`{{${v}}}`)}
            className="rounded border border-blue-200 bg-white px-2 py-1 font-mono text-xs text-blue-700 hover:bg-blue-100"
          >
            {`{{${v}}}`}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-blue-600">{hint}</p>
    </div>
  );
}

export function SegmentedToggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-xl bg-gray-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-lg py-2 text-sm font-bold transition-all',
            value === o.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TemplateListItem({
  active, icon, title, subtitle, onClick,
}: { active: boolean; icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all',
        active ? 'border-primary-200 bg-primary-50 shadow-sm ring-1 ring-primary-200' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
      )}
    >
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg [&>svg]:h-5 [&>svg]:w-5', active ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500')}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className={cn('block truncate text-sm font-bold', active ? 'text-primary-900' : 'text-gray-900')}>{title}</span>
        <span className="mt-0.5 block max-w-[13rem] truncate text-xs text-gray-500">{subtitle}</span>
      </span>
    </button>
  );
}

/** Parses an <input type=number> value; empty or invalid becomes 0. */
export function numberOrZero(v: string) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** (555) 123-4567 from a string of digits. Partial input is formatted as typed. */
export function formatPhone(raw: string) {
  const d = (raw || '').replace(/\D/g, '').slice(0, 10);
  if (d.length === 0) return '';
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export const digitsOnly = (v: string, max = 10) => v.replace(/\D/g, '').slice(0, max);

/**
 * Reads an image file into a data URL (local only, nothing is uploaded).
 * Resolves with an error message instead when the file is not an image or too big.
 */
export function readImageFile(file: File, maxMb: number): Promise<{ url?: string; error?: string }> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) return resolve({ error: 'Please select a valid image file (JPG, PNG, GIF, etc.)' });
    if (file.size > maxMb * 1024 * 1024) {
      const mb = (file.size / 1024 / 1024).toFixed(2);
      return resolve({ error: `Image size (${mb} MB) exceeds the maximum limit of ${maxMb}MB. Please choose a smaller image.` });
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ url: String(reader.result) });
    reader.onerror = () => resolve({ error: 'Could not read the file.' });
    reader.readAsDataURL(file);
  });
}

/** Big bold page title block used by pages that do not fit SettingsPage's layout. */
export function SmallLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('text-xxs font-bold uppercase tracking-widest text-gray-500', className)}>{children}</div>;
}
