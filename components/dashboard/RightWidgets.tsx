'use client';

/*
  Right-column dashboard cards: Estimate Status ring, Monthly Goal (with Top
  Deals), Active Jobs and Pipeline. Layout and copy follow the live app.
*/
import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Briefcase, ChevronRight, List, Star, Target, TrendingUp } from 'lucide-react';
import { JOB_STATUS_TEXT } from '@/lib/constants';
import { shortDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { EmptyLine, SectionHeader } from './SectionHeader';
import { kMoney, plainMoney, type DashboardData } from './metrics';

/* ---------- Estimate Status ---------- */

export function EstimateStatusWidget({ data }: { data: DashboardData['estimateStatus'] }) {
  const circumference = 339.29; // 2 * PI * 54
  const offset = circumference * (1 - data.soldRatio);
  return (
    <div className="flex h-full flex-col items-center text-center">
      <SectionHeader title="Estimate Status" icon={Target} colorClass="text-primary-600" href="/estimates" className="w-full justify-center" />
      <div className="relative mb-6 mt-2 flex h-32 w-32 items-center justify-center">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 128 128" aria-hidden>
          <circle cx="64" cy="64" r="54" fill="transparent" stroke="currentColor" strokeWidth="12" className="text-gray-100" />
          <circle cx="64" cy="64" r="54" fill="transparent" stroke="#2563eb" strokeWidth="12" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black leading-none text-gray-900">{data.total}</span>
          <span className="mt-1 text-xxs font-black uppercase tracking-widest text-gray-400">Total</span>
        </div>
      </div>
      <div className="w-full space-y-3 border-t border-gray-50 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-600">Open Estimates</span>
          <span className="font-black text-gray-900">{data.openCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xxs font-bold uppercase tracking-widest text-gray-400">Total Value</span>
          <span className="text-base font-black text-primary-600">{kMoney(data.totalValue)}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Monthly Goal ---------- */

export function MonthlyGoalWidget({ data }: { data: DashboardData['goal'] }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-50 pb-4">
        <SectionHeader title={data.label} icon={TrendingUp} colorClass="text-green-500" href="/reports?tab=sales" />
        <div className="mt-3 space-y-3 lg:mt-5 lg:space-y-5">
          <div className="flex flex-col justify-between gap-1 lg:flex-row lg:items-end lg:gap-2">
            <div>
              <div className="text-xl font-black text-gray-900 lg:text-3xl">{kMoney(data.actual)}</div>
              <span className="text-xxs font-black uppercase tracking-widest text-green-600 lg:text-xxs">Actual Revenue</span>
            </div>
            {data.target > 0 && (
              <div className="lg:text-right">
                <div className="text-xl font-black text-gray-400 lg:text-3xl">{kMoney(data.target)}</div>
                <span className="text-xxs font-black uppercase tracking-widest text-gray-400 lg:text-xxs">Target</span>
              </div>
            )}
          </div>
          {data.target > 0 && (
            <div className="relative pt-2">
              <div className="h-4 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full bg-green-500 transition-all duration-1000" style={{ width: `${Math.min(data.percent, 100)}%` }} />
              </div>
              <div className="mt-2 text-right">
                <span className="text-xs font-black uppercase tracking-widest text-green-600">{Math.round(data.percent)}% to Goal</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-gray-50/30 pt-4">
        <SectionHeader title="Top Deals" icon={Star} colorClass="text-amber-400" />
        <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto">
          {data.topDeals.length > 0 ? (
            data.topDeals.map((deal) => (
              <Link
                key={deal.id}
                href={`/estimates/${deal.id}`}
                className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-2.5 shadow-xs transition-all hover:border-amber-300"
              >
                <div className="mr-2 min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-gray-700">{deal.customerName}</span>
                  <span className="text-xs font-bold text-gray-400">{deal.estimateNumber}</span>
                </div>
                <span className="shrink-0 text-xs font-black text-indigo-600">{plainMoney(deal.amount)}</span>
              </Link>
            ))
          ) : (
            <EmptyLine className="py-2">No deals closed yet.</EmptyLine>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Active Jobs ---------- */

export function ActiveJobsWidget({ jobs }: { jobs: DashboardData['activeJobs'] }) {
  const rows = jobs.slice(0, 5);
  return (
    <div className="flex h-full flex-col">
      <SectionHeader title="Active Jobs" icon={Briefcase} colorClass="text-blue-600" href="/jobs" />
      <div className="custom-scrollbar -mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
        {rows.length === 0 ? (
          <EmptyLine>No active jobs found.</EmptyLine>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}`} className="group -mx-2 flex items-center justify-between rounded-lg px-2 py-3 transition-colors first:pt-0 last:pb-0 hover:bg-gray-50/50">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className={cn('text-xxs font-black uppercase tracking-widest', JOB_STATUS_TEXT[job.status])}>{job.status}</span>
                  <span className="truncate text-sm font-bold text-gray-900">{job.customerName}</span>
                </div>
                <div className="flex items-center gap-1 whitespace-nowrap pl-4 text-xs font-bold text-gray-400 transition-colors group-hover:text-primary-600">
                  {job.startDate ? shortDate(job.startDate) : 'TBD'}
                  <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="mt-auto border-t border-gray-50 pt-3 text-center">
        <Link href="/jobs" className="text-xxs font-bold uppercase tracking-widest text-primary-600 hover:text-primary-700">View All Jobs</Link>
      </div>
    </div>
  );
}

/* ---------- Pipeline ---------- */

export function PipelineWidget({ stages }: { stages: DashboardData['stages'] }) {
  const total = Math.max(1, stages.reduce((s, x) => s + x.count, 0));
  return (
    <div className="flex h-full flex-col">
      <SectionHeader title="Pipeline" icon={List} colorClass="text-indigo-400" href="/leads" />
      <div className="flex flex-1 flex-col justify-between gap-2 pt-1">
        {stages.map((s) => (
          <div key={s.id} className="space-y-1">
            <div className="flex items-end justify-between">
              <span className="text-xxs font-black uppercase tracking-widest" style={{ color: s.color }}>{s.displayName}</span>
              <span className="text-xs font-black text-gray-900">{s.count}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 shadow-inner">
              <div className="h-full transition-all duration-1000" style={{ width: `${Math.max(5, (s.count / total) * 100)}%`, backgroundColor: s.color }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-gray-50 pt-3 text-center">
        <Link href="/leads" className="flex items-center justify-center gap-1 text-xs font-bold text-primary-600">
          Lead Pipeline <ArrowUpRight className="h-2.5 w-2.5" />
        </Link>
      </div>
    </div>
  );
}
