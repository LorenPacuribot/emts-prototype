'use client';

/*
  Job Management list ("Mission control for active projects.").
  Matches the live Jobs grid: search, stage pill filters, one card per job
  (number, status, EST/LEAD chips, title, address, schedule) and pagination.
  "All Active" hides Completed, Marketing and Cancelled jobs.
*/
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Calendar, ChevronRight, MapPin } from 'lucide-react';
import { PageShell } from '@/components/Navigation';
import { EmptyState, ListSkeleton, PageHeader, Pagination, PillFilter, RefChip, SearchInput, usePagination } from '@/components/ui/display';
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge';
import { useCollection, useLookups } from '@/lib/store';
import type { JobStatus } from '@/lib/types';
import { fullName, shortDate } from '@/lib/utils';

type StageFilter = 'All Active' | Exclude<JobStatus, 'Cancelled'>;

const FILTERS: StageFilter[] = [
  'All Active', 'Unscheduled', 'Confirmed', 'Scheduled', 'In Production', 'Touch Up', 'Ready for Inspection', 'Completed', 'Marketing',
];
const INACTIVE: JobStatus[] = ['Completed', 'Marketing', 'Cancelled'];

export default function JobsPage() {
  const { items: jobs } = useCollection('jobs');
  const look = useLookups();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<StageFilter>('All Active');
  const [loading, setLoading] = useState(true);
  useEffect(() => setLoading(false), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs
      .filter((j) => (stage === 'All Active' ? !INACTIVE.includes(j.status) : j.status === stage))
      .filter((j) => {
        if (!q) return true;
        const c = look.customer(j.customerId);
        const est = look.estimate(j.estimateId);
        return [j.jobNumber, j.title, j.address, fullName(c), est?.estimateNumber].some((s) => s?.toLowerCase().includes(q));
      })
      // Newest first, like the live list (JOB-2026-4 above JOB-2026-1).
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.jobNumber.localeCompare(a.jobNumber, undefined, { numeric: true }));
  }, [jobs, stage, search, look]);

  const pg = usePagination(filtered, 10);

  return (
    <PageShell title="Jobs">
      <PageHeader title="Job Management" subtitle="Mission control for active projects." />

      <div className="mb-6 flex flex-col gap-4 md:flex-row">
        <SearchInput value={search} onChange={setSearch} placeholder="Search jobs..." className="md:max-w-md md:w-[336px] shrink-0" />
        <PillFilter options={FILTERS.map((f) => ({ value: f, label: f }))} value={stage} onChange={setStage} />
      </div>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Briefcase />} title="No jobs found" message="Try adjusting your filters." className="rounded-3xl border-gray-300 py-20" />
      ) : (
        <div className="space-y-3.5">
          {pg.pageItems.map((job) => {
            const est = look.estimate(job.estimateId);
            const lead = look.lead(job.leadId);
            return (
              <div
                key={job.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/jobs/${job.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && router.push(`/jobs/${job.id}`)}
                className="group block cursor-pointer rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm transition-all hover:border-primary-300 hover:shadow-md"
              >
                <div className="flex flex-col items-start gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded border border-gray-100 bg-gray-50 px-2 py-1 font-mono text-[10px] font-bold text-gray-400">{job.jobNumber}</span>
                      <JobStatusBadge status={job.status} className="px-2 text-[10px]" />
                      {est && <RefChip href={`/estimates/${est.id}`}>{est.estimateNumber}</RefChip>}
                      {lead && <RefChip kind="lead" href={`/leads/${lead.id}`}>{lead.leadNumber}</RefChip>}
                    </div>
                    <h3 className="mb-1 font-heading text-lg font-bold text-gray-900 transition-colors group-hover:text-primary-700">{job.title || job.jobNumber}</h3>
                    {job.address && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <MapPin className="h-3.5 w-3.5 text-gray-400" /> {job.address}
                      </div>
                    )}
                  </div>

                  <div className="min-w-[150px] border-gray-100 lg:border-l lg:border-r lg:px-6">
                    <div className="mb-2 text-[8px] font-bold uppercase tracking-wider text-gray-400">Schedule</div>
                    {job.startDate ? (
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <Calendar className="h-4 w-4 text-blue-500" />
                        <span>{shortDate(job.startDate)}</span>
                        {job.endDate && (
                          <>
                            <span className="text-gray-300">-</span>
                            <span>{shortDate(job.endDate)}</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs italic text-gray-400">Not scheduled</span>
                    )}
                  </div>

                  <div className="hidden w-12 items-center justify-center lg:flex">
                    <ChevronRight className="h-5 w-5 text-gray-300 transition-colors group-hover:text-primary-500" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination
        page={pg.page}
        totalPages={pg.totalPages}
        onPage={pg.setPage}
        pageSize={pg.pageSize}
        onPageSize={pg.setPageSize}
        shown={pg.pageItems.length}
        total={pg.total}
      />
    </PageShell>
  );
}
