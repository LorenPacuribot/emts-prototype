'use client';

/*
  Work Orders list ("Track production schedules and crew assignments.").
  Matches the live grid: four stat cards, search, a status filter dropdown and
  one card per work order (status, number, EST/LEAD chips, job name,
  customer, address, start date, crew lead, total hours, actions menu).
  A work order with a feature-prototype twin shows the twin's live status
  (Pending Deposit / Unscheduled / Scheduled / In Progress / Completed).
*/
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, CheckCircle2, ChevronDown, ClipboardList, Clock, Filter, MapPin, PlayCircle, User } from 'lucide-react';
import { PageShell } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Avatar, EmptyState, ListSkeleton, PageHeader, Pagination, RefChip, SearchInput, usePagination } from '@/components/ui/display';
import { DropdownMenu, RowMenu } from '@/components/ui/menu';
import { ScheduleJobModal } from '@/components/jobs/ScheduleJobModal';
import { CrewModal } from '@/components/jobs/CrewModal';
import { WO_FILTERS, WO_STATUS_STYLE, woDisplayStatus } from '@/components/work-orders/wo-utils';
import { useCollection, useLookups } from '@/lib/store';
import { useDb } from '@/features/lib/store';
import { cn, fullName } from '@/lib/utils';

type Filter = (typeof WO_FILTERS)[number];

export default function WorkOrdersPage() {
  const { items: workOrders } = useCollection('workOrders');
  const look = useLookups();
  const router = useRouter();
  const pdb = useDb((d) => d);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('All Active');
  const [loading, setLoading] = useState(true);
  const [scheduleJobId, setScheduleJobId] = useState<string | null>(null);
  const [crewJobId, setCrewJobId] = useState<string | null>(null);
  useEffect(() => setLoading(false), []);

  const rows = useMemo(() => workOrders.map((wo) => {
    const job = look.job(wo.jobId);
    return { wo, job, status: woDisplayStatus(wo, job, pdb.workOrders.find((w) => w.id === wo.id)?.status), customer: look.customer(job?.customerId) };
  }), [workOrders, look, pdb]);

  const stats = [
    { label: 'Scheduled Jobs', value: rows.filter((r) => r.status === 'Scheduled').length, icon: Calendar, sub: 'Upcoming starts' },
    { label: 'In Progress', value: rows.filter((r) => r.status === 'In Progress').length, icon: PlayCircle, sub: 'Crews on site' },
    { label: 'Completed', value: rows.filter((r) => r.status === 'Completed').length, icon: CheckCircle2, sub: 'Ready for invoice' },
    { label: 'Total Hours', value: Math.round(rows.reduce((s, r) => s + (r.job?.crew.reduce((a, c) => a + c.hours, 0) ?? 0), 0)), icon: Clock, sub: 'Allocated hours' },
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (filter === 'All Active' ? r.status !== 'Completed' : r.status === filter))
      .filter((r) => !q || [r.wo.workOrderNumber, r.wo.title, r.job?.title, r.job?.jobNumber, fullName(r.customer), r.job?.address].some((s) => s?.toLowerCase().includes(q)))
      .sort((a, b) => b.wo.createdAt.localeCompare(a.wo.createdAt));
  }, [rows, filter, search]);

  const pg = usePagination(filtered, 10);
  const scheduleJob = scheduleJobId ? look.job(scheduleJobId) : undefined;
  const crewJob = crewJobId ? look.job(crewJobId) : undefined;

  return (
    <PageShell title="Work Orders">
      <PageHeader title="Work Orders" subtitle="Track production schedules and crew assignments." />

      <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500"><s.icon className="h-4 w-4 text-gray-400" /> {s.label}</div>
            <div className="font-heading text-3xl font-black text-gray-900">{s.value}</div>
            <div className="mt-1 text-sm font-medium text-gray-400">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="mb-6 flex flex-col items-center justify-between gap-4 md:flex-row">
        <SearchInput value={search} onChange={setSearch} placeholder="Search work orders..." className="md:w-96" />
        <DropdownMenu
          items={WO_FILTERS.map((f) => ({ label: f + (f === filter ? '  •' : ''), onClick: () => setFilter(f) }))}
          trigger={
            <button type="button" className="flex min-w-[160px] items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 shadow-sm hover:border-gray-300">
              <span className="flex items-center gap-2"><Filter className="h-4 w-4 text-gray-400" /> {filter}</span>
              <ChevronDown className="h-3 w-3 text-gray-400" />
            </button>
          }
        />
      </div>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title="No work orders found" message="Try adjusting your filters." className="rounded-3xl border-gray-300 py-20" />
      ) : (
        <div className="space-y-4">
          {pg.pageItems.map(({ wo, job, status, customer }) => {
            const lead = job?.crew.find((c) => c.role === 'Crew Lead') ?? job?.crew[0];
            const leadMember = look.member(lead?.memberId);
            const est = look.estimate(job?.estimateId);
            const leadRec = look.lead(job?.leadId);
            const hours = job?.estimatedHours ?? 0;
            return (
              <div key={wo.id} role="link" tabIndex={0}
                onClick={() => router.push(`/work-orders/${wo.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && router.push(`/work-orders/${wo.id}`)}
                className="group relative block cursor-pointer overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-primary-300 hover:shadow-md">
                <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-3">
                      <span className={cn('rounded-full border px-2.5 py-0.5 text-[10px] font-bold', WO_STATUS_STYLE[status])}>{status}</span>
                      <span className="font-mono text-xs font-bold text-gray-400">{wo.workOrderNumber}</span>
                      {est && <RefChip href={`/estimates/${est.id}`}>{est.estimateNumber}</RefChip>}
                      {leadRec && <RefChip kind="lead" href={`/leads/${leadRec.id}`}>{leadRec.leadNumber}</RefChip>}
                    </div>
                    <h3 className="mb-1 text-lg font-bold text-gray-900 group-hover:text-primary-700">{job?.title ?? wo.title}</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-500"><User className="h-3.5 w-3.5" /> {fullName(customer)}</div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5 border-gray-100 lg:border-l lg:border-r lg:px-6">
                    <div className="flex items-center gap-2 text-sm text-gray-600"><MapPin className="h-3.5 w-3.5 text-gray-400" /><span className="truncate">{job?.address || 'No address set'}</span></div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" /> Start: {job?.startDate ? new Date(job.startDate + 'T12:00:00').toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'TBD'}
                    </div>
                  </div>
                  <div className="flex-none lg:w-48">
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Crew Lead</div>
                    <div className="flex items-center gap-2">
                      {leadMember ? <Avatar name={fullName(leadMember)} color={leadMember.color} size="sm" /> : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-gray-500"><User className="h-4 w-4" /></div>
                      )}
                      <div className="truncate text-sm font-bold text-gray-700">{leadMember ? fullName(leadMember) : 'Unassigned'}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex w-full items-center justify-between gap-4 border-t border-gray-100 pt-4 lg:mt-0 lg:w-auto lg:justify-end lg:border-t-0 lg:pl-4 lg:pt-0">
                    <div className="mr-2 hidden text-right lg:block">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total Hours</div>
                      <div className="text-base font-black text-gray-900">{hours.toFixed(2)}</div>
                    </div>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="secondary" onClick={() => router.push(`/work-orders/${wo.id}`)}>View Details</Button>
                      <RowMenu items={[
                        { label: 'Edit Schedule', icon: <Calendar />, onClick: () => job && setScheduleJobId(job.id), disabled: !job },
                        { label: 'Assign Crew', icon: <User />, onClick: () => job && setCrewJobId(job.id), disabled: !job },
                      ]} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination page={pg.page} totalPages={pg.totalPages} onPage={pg.setPage} pageSize={pg.pageSize} onPageSize={pg.setPageSize} shown={pg.pageItems.length} total={pg.total} />

      {scheduleJob && <ScheduleJobModal job={scheduleJob} open onOpenChange={(v) => !v && setScheduleJobId(null)} />}
      {crewJob && <CrewModal job={crewJob} open onOpenChange={(v) => !v && setCrewJobId(null)} />}
    </PageShell>
  );
}
