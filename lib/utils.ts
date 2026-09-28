import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind class names safely (later classes win). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Short random id for new records, e.g. "lead_k3j9x2". */
export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

/** $4,992.90 */
export function money(n: number, opts: { cents?: boolean } = {}) {
  const cents = opts.cents ?? true;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

/** $120.1k style used on stat cards */
export function moneyShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

/** $4,992.9 style (drops trailing zero) used on invoice cards in the live app */
export function moneyCompact(n: number) {
  return '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** 6/10/2026 */
export function shortDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString('en-US');
}

/** Jun 10, 2026 */
export function longDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** { month: 'JUN', day: '10', year: '2026' } for the date "tiles" on list rows */
export function dateTile(iso: string) {
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
    year: String(d.getFullYear()),
  };
}

/** "12 days ago" */
export function daysAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return '1 day ago';
  return `${diff} days ago`;
}

/** YYYY-MM-DD for a Date (local time) */
export function toISODate(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fullName(p: { firstName: string; lastName: string } | undefined | null) {
  return p ? `${p.firstName} ${p.lastName}`.trim() : '—';
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('');
}
