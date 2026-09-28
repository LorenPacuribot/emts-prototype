'use client';

/*
  Works out the numbers shown for each contact (lifetime value, jobs,
  current job status, last contact date). The live app gets these from the
  API; here they are computed from the local store.
*/
import { useMemo } from 'react';
import type { Customer, Database, JobStatus } from '@/lib/types';
import { useDb } from '@/lib/store';
import { invoiceTotals } from '@/lib/calculations';

const INACTIVE_JOB: JobStatus[] = ['Completed', 'Marketing', 'Cancelled'];

export interface ContactStats {
  leads: number;
  estimates: number;
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  /** Sum of invoice totals (void invoices excluded) */
  lifetimeValue: number;
  /** Status of the newest active job, or "No Active Jobs" */
  jobStatus: string;
  /** Distinct service addresses (customer address + lead addresses) */
  propertiesManaged: number;
  lastContactAt?: string;
}

export function statsFor(db: Database, c: Customer): ContactStats {
  const col = db.collections;
  const leads = col.leads.filter((l) => l.customerId === c.id);
  const estimates = col.estimates.filter((e) => e.customerId === c.id);
  const jobs = col.jobs.filter((j) => j.customerId === c.id);
  const invoices = col.invoices.filter((i) => i.customerId === c.id && i.status !== 'Void');
  const active = jobs.filter((j) => !INACTIVE_JOB.includes(j.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const addresses = new Set([`${c.street}|${c.zip}`.toLowerCase(), ...leads.map((l) => `${l.street}|${l.zip}`.toLowerCase())]);
  const dates = [
    ...leads.map((l) => l.updatedAt),
    ...estimates.map((e) => e.updatedAt),
    ...invoices.map((i) => i.date),
    ...col.messages.filter((m) => m.customerId === c.id).map((m) => m.date),
  ].filter(Boolean).sort();
  return {
    leads: leads.length,
    estimates: estimates.length,
    totalJobs: jobs.length,
    activeJobs: active.length,
    completedJobs: jobs.filter((j) => j.status === 'Completed').length,
    lifetimeValue: invoices.reduce((s, i) => s + invoiceTotals(i).total, 0),
    jobStatus: active[0]?.status ?? 'No Active Jobs',
    propertiesManaged: addresses.size,
    lastContactAt: dates[dates.length - 1],
  };
}

/** Stats for every customer, keyed by id. */
export function useContactStats() {
  const db = useDb();
  return useMemo(() => {
    const map = new Map<string, ContactStats>();
    db.collections.customers.forEach((c) => map.set(c.id, statsFor(db, c)));
    return map;
  }, [db]);
}

/** Badge colors for the contact's current job status (live: JOB_STATUS_DISPLAY). */
export const CONTACT_JOB_STATUS: Record<string, string> = {
  'No Active Jobs': 'bg-gray-50 text-gray-500 border-gray-200',
  Unscheduled: 'bg-gray-100 text-gray-600 border-gray-200',
  Confirmed: 'bg-green-50 text-green-600 border-green-200',
  Scheduled: 'bg-blue-50 text-blue-600 border-blue-200',
  'In Production': 'bg-indigo-50 text-indigo-600 border-indigo-200',
  'Touch Up': 'bg-amber-50 text-amber-600 border-amber-200',
  'Ready for Inspection': 'bg-purple-50 text-purple-600 border-purple-200',
};

export const CONTACT_TYPE_COLORS: Record<Customer['type'], string> = {
  Lead: 'bg-blue-50 text-blue-700 border-blue-200',
  Contact: 'bg-purple-50 text-purple-700 border-purple-200',
  Client: 'bg-green-50 text-green-700 border-green-200',
};
