'use client';

/*
  Tab bodies on the contact detail page: Leads, Estimates, Invoices,
  Job History and Conversations. Each list has a sort menu, an empty state
  and links to the record (live: features/(main)/contacts/details/components/*-tab.tsx).
  NEW: Job History actions and imported history jobs (see ContactFeatures.tsx).
*/
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUp, Calendar, ChevronDown, Mail, MapPin, MessageSquare } from 'lucide-react';
import type { Estimate, Invoice, Job, Lead, Message } from '@/lib/types';
import { DropdownMenu } from '@/components/ui/menu';
import { estimateTotals, invoiceTotals } from '@/lib/calculations';
import { ESTIMATE_STATUS_BADGE, INVOICE_STATUS_BADGE, JOB_STATUS_BADGE } from '@/lib/constants';
import { cn, money, shortDate } from '@/lib/utils';
import { LEAD_STATUS_BADGE, LEAD_STATUS_DISPLAY_NAMES } from '@/components/leads/leadHelpers';
import { JobFeatureActions, useImportedJobs, type ImportedJob } from './ContactFeatures';

type Sort = 'DateNewest' | 'DateOldest' | 'AmountHigh' | 'AmountLow';
const SORT_LABELS: Record<Sort, string> = {
  DateNewest: 'Date (Newest)', DateOldest: 'Date (Oldest)', AmountHigh: 'Amount (High-Low)', AmountLow: 'Amount (Low-High)',
};

function SortMenu({ value, onChange, withAmount = true }: { value: Sort; onChange: (s: Sort) => void; withAmount?: boolean }) {
  const options = (Object.keys(SORT_LABELS) as Sort[]).filter((s) => withAmount || s.startsWith('Date'));
  const icon = (s: Sort) => (s === 'AmountHigh' ? <ArrowDown /> : s === 'AmountLow' ? <ArrowUp /> : <Calendar />);
  return (
    <div className="mb-6 flex justify-end">
      <DropdownMenu
        items={options.map((o) => ({ label: SORT_LABELS[o], icon: icon(o), onClick: () => onChange(o) }))}
        trigger={
          <button type="button" className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100">
            {SORT_LABELS[value]} <ChevronDown className="h-3 w-3" />
          </button>
        }
      />
    </div>
  );
}

function useSorted<T>(items: T[], sort: Sort, date: (x: T) => string, amount: (x: T) => number) {
  return useMemo(() => {
    const out = [...items];
    switch (sort) {
      case 'DateOldest': return out.sort((a, b) => date(a).localeCompare(date(b)));
      case 'AmountHigh': return out.sort((a, b) => amount(b) - amount(a));
      case 'AmountLow': return out.sort((a, b) => amount(a) - amount(b));
      default: return out.sort((a, b) => date(b).localeCompare(date(a)));
    }
    // date/amount are stable accessors defined per tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sort]);
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex min-h-[300px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-12 text-center">
      <p className="italic text-gray-400">{text}</p>
    </div>
  );
}

const cardCls = 'group block cursor-pointer rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-primary-300 hover:shadow-md';
const pill = 'shrink-0 rounded-full border px-3 py-1 text-xs font-bold';
const chip = 'inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600';
const viewLink = 'inline-flex items-center gap-1 text-xs font-bold text-primary-600 transition-transform group-hover:translate-x-0.5';

export function LeadsTab({ leads }: { leads: Lead[] }) {
  const [sort, setSort] = useState<Sort>('DateNewest');
  const rows = useSorted(leads, sort, (l) => l.date, (l) => l.estimatedValue);
  return (
    <div>
      <SortMenu value={sort} onChange={setSort} withAmount={false} />
      {rows.length === 0 ? <Empty text="No leads found for this customer." /> : (
        <div className="space-y-4">
          {rows.map((l) => (
            <Link key={l.id} href={`/leads/${l.id}`} className={cardCls}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="mb-1 truncate text-lg font-bold text-gray-900 group-hover:text-primary-700">{l.leadNumber}</h3>
                  <div className="truncate text-sm text-gray-500">{l.firstName} {l.lastName}</div>
                </div>
                <span className={cn(pill, LEAD_STATUS_BADGE[l.status])}>{LEAD_STATUS_DISPLAY_NAMES[l.status]}</span>
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                {(l.city || l.state) && <span className={chip}><MapPin className="h-3 w-3" />{[l.city, l.state].filter(Boolean).join(', ')}</span>}
                {l.leadSource && <span className={chip}>{l.leadSource}</span>}
                <span className={chip}><Calendar className="h-3 w-3" />{shortDate(l.date)}</span>
              </div>
              <div className="flex items-center justify-end border-t border-gray-100 pt-3">
                <span className={viewLink}>View Lead <ArrowRight className="h-3.5 w-3.5" /></span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function EstimatesTab({ estimates }: { estimates: Estimate[] }) {
  const [sort, setSort] = useState<Sort>('DateNewest');
  const rows = useSorted(estimates, sort, (e) => e.createdAt, (e) => estimateTotals(e).total);
  // Grouped by property, so a new estimate sits alongside earlier ones for the same address.
  const groups = new Map<string, { address: string; rows: Estimate[] }>();
  for (const e of rows) {
    const address = e.address?.trim() || 'No address';
    const key = address.toLowerCase().replace(/\s+/g, ' ');
    const g = groups.get(key) ?? { address, rows: [] };
    g.rows.push(e);
    groups.set(key, g);
  }
  return (
    <div>
      <SortMenu value={sort} onChange={setSort} />
      {rows.length === 0 ? <Empty text="No estimates found for this customer." /> : (
        <div className="space-y-6">
          {Array.from(groups.values()).map((g) => (
            <section key={g.address} aria-label={`Estimates for ${g.address}`}>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                <MapPin className="h-3.5 w-3.5" /> {g.address}
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">{g.rows.length} estimate{g.rows.length === 1 ? '' : 's'}</span>
              </div>
              <div className="space-y-4">
          {g.rows.map((e) => (
            <Link key={e.id} href={`/estimates/${e.id}`} className={cardCls}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold text-gray-900 group-hover:text-primary-700">{e.estimateNumber}</h3>
                  <div className="mt-1 truncate text-sm text-gray-500">{e.title || 'Untitled Estimate'}</div>
                </div>
                <span className={cn(pill, ESTIMATE_STATUS_BADGE[e.status])}>{e.status}</span>
              </div>
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{shortDate(e.createdAt)}</span>
                {e.estimateType && <><span>&bull;</span><span className="font-medium">{e.estimateType}</span></>}
              </div>
              <div className="flex items-end justify-between border-t border-gray-100 pt-3">
                <span className={viewLink}>View Estimate <ArrowRight className="h-3.5 w-3.5" /></span>
                <div className="text-xl font-bold text-gray-900">{money(estimateTotals(e).total)}</div>
              </div>
            </Link>
          ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function InvoicesTab({ invoices, jobNumber }: { invoices: Invoice[]; jobNumber: (id?: string) => string | undefined }) {
  const [sort, setSort] = useState<Sort>('DateNewest');
  const rows = useSorted(invoices, sort, (i) => i.date, (i) => invoiceTotals(i).total);
  return (
    <div>
      <SortMenu value={sort} onChange={setSort} />
      {rows.length === 0 ? <Empty text="No invoices found for this customer." /> : (
        <div className="space-y-4">
          {rows.map((inv) => {
            const t = invoiceTotals(inv);
            const job = jobNumber(inv.jobId);
            return (
              <Link key={inv.id} href={`/invoices/${inv.id}`} className={cardCls}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-bold text-gray-900 group-hover:text-primary-700">{inv.invoiceNumber}</h3>
                      <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-bold', INVOICE_STATUS_BADGE[inv.status])}>{inv.status}</span>
                    </div>
                    {job && <div className="mt-1 truncate text-sm text-gray-500">{job}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="mb-0.5 text-xs text-gray-500">Balance Due</div>
                    <div className="text-xl font-black text-gray-900">{money(t.balance)}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Calendar className="h-3 w-3" />{shortDate(inv.date)}<span className="mx-1">&bull;</span>Total: {money(t.total)}
                  </div>
                  <span className={viewLink}>View Invoice <ArrowRight className="h-3.5 w-3.5" /></span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const JOB_STAGES = ['Confirmed', 'Scheduled', 'In Production', 'Touch Up', 'Ready for Inspection', 'Completed', 'Marketing'] as const;
const STAGE_LABELS = ['CONFIRMED', 'SCHEDULED', 'PRODUCTION', 'TOUCH UP', 'INSPECTION', 'COMPLETED', 'MARKETING'];

/** Job History. NEW (26, 28): Generate QR Code and New Estimate from History on each card,
    plus completed jobs imported into the paint history (feature prototype). */
export function JobHistoryTab({ jobs, customerId }: { jobs: Job[]; customerId: string }) {
  const [sort, setSort] = useState<Sort>('DateNewest');
  const imported = useImportedJobs(customerId, new Set(jobs.map((j) => j.id)));
  const all: JobRow[] = [
    ...jobs.map((j) => ({ kind: 'live' as const, job: j })),
    ...imported.map((h) => ({ kind: 'imported' as const, job: h })),
  ];
  const rows = useSorted(all, sort, (r) => (r.kind === 'live' ? r.job.createdAt : r.job.completedAt), (r) => r.job.value);
  return (
    <div>
      <SortMenu value={sort} onChange={setSort} />
      {rows.length === 0 ? <Empty text="No job history found for this customer." /> : (
        <div className="space-y-6">
          {rows.map((r) => {
            const j = r.job;
            const status = r.kind === 'live' ? r.job.status : 'Completed';
            const idx = (JOB_STAGES as readonly string[]).indexOf(status);
            const done = idx >= 5;
            const inner = (
              <>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-heading text-xl font-bold text-gray-900">{r.kind === 'live' ? r.job.jobNumber : r.job.id}</h3>
                    <div className="mt-1 text-sm text-gray-500">{j.title}</div>
                  </div>
                  <span className={cn(pill, JOB_STATUS_BADGE[status as Job['status']])}>{status}</span>
                </div>
                <div className="mb-6 flex items-center gap-2 text-sm text-gray-500"><MapPin className="h-4 w-4 shrink-0" /> {j.address || '-'}</div>
                <div className="mb-6">
                  <div className="mb-2 flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className={cn('h-full', done ? 'bg-green-500' : 'bg-blue-500')} style={{ width: idx < 0 ? '0%' : `${((idx + 0.5) / JOB_STAGES.length) * 100}%` }} />
                  </div>
                  <div className="hidden justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400 sm:flex">
                    {STAGE_LABELS.map((s, i) => <span key={s} className={i <= idx ? (done ? 'text-green-600' : 'text-blue-600') : ''}>{s}</span>)}
                  </div>
                </div>
                <div className="flex items-end justify-between border-t border-gray-100 pt-4">
                  <div className="text-xs text-gray-400">{r.kind === 'live' ? `Created: ${shortDate(r.job.createdAt)}` : `Completed: ${shortDate(r.job.completedAt)}`}</div>
                  <div className="text-xl font-bold text-gray-900">{money(j.value, { cents: false })}</div>
                </div>
              </>
            );
            return (
              <div key={j.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                {r.kind === 'live'
                  ? <Link href={`/jobs/${j.id}`} className="block p-6">{inner}</Link>
                  : <div className="p-6">{inner}</div>}
                <JobActionsRow customerId={customerId} jobId={r.kind === 'live' ? j.id : undefined} propertyId={r.kind === 'imported' ? r.job.propertyId : undefined} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type JobRow = { kind: 'live'; job: Job } | { kind: 'imported'; job: ImportedJob };

function JobActionsRow(props: { customerId: string; jobId?: string; propertyId?: string }) {
  return (
    <div className="-mt-2 px-6 pb-5 empty:hidden">
      <JobFeatureActions {...props} />
    </div>
  );
}

export function ConversationsTab({ messages }: { messages: Message[] }) {
  const rows = [...messages].sort((a, b) => b.date.localeCompare(a.date));
  if (rows.length === 0) return <Empty text="No conversations with this customer yet." />;
  return (
    <div className="space-y-3">
      {rows.map((m) => (
        <div key={m.id} className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', m.channel === 'email' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600')}>
            {m.channel === 'email' ? <Mail className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-gray-900">{m.from}</span>
              <span className="text-xs text-gray-400">{shortDate(m.date)}</span>
            </div>
            <p className="mt-0.5 text-sm text-gray-600">{m.preview}</p>
            <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wider text-gray-400">{m.channel}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
