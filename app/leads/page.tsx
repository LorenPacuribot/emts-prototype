'use client';

/*
  Lead Pipeline (/leads). "Manage potential customers from initial contact to booked job."
  - Search by name, email or city (applies to every view).
  - BOARD view (default): drag-and-drop kanban. TABLE view (?view=table): sortable, filterable list.
  - View Archived switches to a grid of archived leads with Restore buttons.
  - NEW (34): WEBSITE view (?view=website), the Website Lead Review panel (website-form
    leads, the review list and the simulated website form) from the feature prototype.
  - NEW (29): the Repaint alert source and the follow-up lock on the board and table.
  Live source: features/(main)/leads/listings/templates/grid.tsx
*/
import React, { Suspense, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Archive, Globe, LayoutGrid, List, UserPlus } from 'lucide-react';
import type { Lead } from '@/lib/types';
import { PageShell } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { SearchInput, Skeleton } from '@/components/ui/display';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { useCollection } from '@/lib/store';
import { cn } from '@/lib/utils';
import { KanbanBoard } from '@/components/leads/KanbanBoard';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { ArchivedView } from '@/components/leads/ArchivedView';
import { LeadFormModal } from '@/components/leads/LeadFormModal';
import { useLeadActions } from '@/components/leads/useLeadActions';
import { useDb as useFeatureDb } from '@/features/lib/store';
import { NewBadge } from '@/features/components/ui';
import { WebsiteLeadsPanel } from '@/features/components/features/leads/listings/website-leads-panel';

export default function LeadsPage() {
  return (
    <PageShell title="Leads" contentClassName="bg-gray-100 min-h-full">
      <Suspense fallback={<BoardSkeleton />}>
        <LeadPipeline />
      </Suspense>
    </PageShell>
  );
}

function LeadPipeline() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const viewParam = params.get('view');
  const view = viewParam === 'table' ? 'table' : viewParam === 'website' ? 'website' : 'kanban';
  const featureDb = useFeatureDb((d) => d);
  const openReviews = featureDb.leads.filter((l) => l.review?.status === 'open').length;

  const { items: leads } = useCollection('leads');
  const { items: stageList } = useCollection('pipelineStages');
  const actions = useLeadActions();

  const [search, setSearch] = useState('');
  const [viewArchived, setViewArchived] = useState(false);
  // ?new=1 (from the dashboard Create menu) opens the Add Lead form on load
  const [formOpen, setFormOpen] = useState(() => params.get('new') === '1');
  const [editing, setEditing] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState<Lead | null>(null);

  const setView = (mode: 'kanban' | 'table' | 'website') => {
    const next = new URLSearchParams(params.toString());
    if (mode === 'kanban') next.delete('view');
    else next.set('view', mode);
    const q = next.toString();
    router.replace(`${pathname}${q ? `?${q}` : ''}`, { scroll: false });
  };

  // Board columns: every stage except Archived, in the order set in Settings.
  const stages = useMemo(
    () => [...stageList].filter((s) => s.stageId !== 'ARCHIVED').sort((a, b) => a.sortOrder - b.sortOrder),
    [stageList],
  );

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter(
      (l) =>
        !q ||
        `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q),
    );
  }, [leads, search]);

  const active = matches.filter((l) => l.status !== 'Archived');
  const archived = matches.filter((l) => l.status === 'Archived');

  return (
    <>
      {/* Header */}
      <div className="mb-8 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <h1 className="mb-3 font-heading text-3xl font-extrabold tracking-tight text-gray-900">Lead Pipeline</h1>
          <p className="text-base text-gray-600">Manage potential customers from initial contact to booked job.</p>
        </div>
        <div className="flex w-full flex-wrap gap-3 lg:w-auto">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => setViewArchived((v) => !v)}
            icon={<Archive className="h-5 w-5" />}
            className={cn('h-12 w-full text-sm lg:w-auto', viewArchived && 'border-gray-300 bg-gray-200 shadow-inner')}
          >
            {viewArchived ? 'View Active' : 'View Archived'}
          </Button>
          <Button
            size="lg"
            onClick={() => { setEditing(null); setFormOpen(true); }}
            icon={<UserPlus className="h-5 w-5" />}
            className="h-12 w-full text-sm shadow-xl shadow-primary-500/20 lg:w-auto"
          >
            Add New Lead
          </Button>
        </div>
      </div>

      {/* Toolbar: search + view switch */}
      <div className="mb-6 flex flex-col items-center justify-between gap-4 lg:flex-row">
        <SearchInput value={search} onChange={setSearch} placeholder="Search leads by name, email, or city..." className="md:w-full lg:max-w-[300px]" />
        <div className="flex w-full self-start rounded-xl border border-gray-200 bg-gray-100 p-1 lg:w-auto lg:self-auto">
          {([
            { mode: 'kanban', label: 'Board', icon: LayoutGrid, title: 'Kanban Board View' },
            { mode: 'table', label: 'Table', icon: List, title: 'Table View' },
          ] as const).map((b) => (
            <button
              key={b.mode}
              type="button"
              title={b.title}
              onClick={() => setView(b.mode)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-1.5 transition-all lg:flex-none',
                view === b.mode ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <b.icon className="h-4 w-4" />
              <span className="text-xxs font-bold uppercase">{b.label}</span>
            </button>
          ))}
          <button
            type="button"
            title="Website Lead Review"
            data-tour="leads-website"
            onClick={() => setView('website')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-1.5 transition-all lg:flex-none',
              view === 'website' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <Globe className="h-4 w-4" />
            <span className="text-xxs font-bold uppercase">Website</span>
            {openReviews > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-700">{openReviews}</span>}
            <NewBadge feature={34} />
          </button>
        </div>
      </div>

      {viewArchived && view !== 'website' && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-100 p-4">
          <span className="flex items-center gap-2 font-bold text-gray-700"><Archive className="h-5 w-5" /> Archived Leads</span>
          <span className="text-sm text-gray-500">Showing {archived.length} archived items</span>
        </div>
      )}

      {view === 'website' ? (
        <WebsiteLeadsPanel />
      ) : viewArchived ? (
        <ArchivedView leads={archived} onRestore={actions.restore} />
      ) : view === 'table' ? (
        <LeadsTable
          leads={active}
          onEdit={(l) => { setEditing(l); setFormOpen(true); }}
          onArchive={actions.archive}
          onDelete={setDeleting}
        />
      ) : (
        <KanbanBoard leads={active} stages={stages} onMove={(l, s) => actions.changeStatus(l, s)} onArchive={actions.archive} />
      )}

      <LeadFormModal open={formOpen} onOpenChange={setFormOpen} lead={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete Lead"
        message={deleting ? `Are you sure you want to delete "${deleting.firstName} ${deleting.lastName}"?` : undefined}
        onConfirm={() => deleting && actions.remove(deleting)}
      />
    </>
  );
}

/** Loading placeholder while search params resolve. */
function BoardSkeleton() {
  return (
    <div className="flex gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex-1 space-y-3">
          <Skeleton className="h-12 w-full rounded-t-2xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
