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

  30 Sep call (CRM):
  - Board: a Sales / Production switch (?pipeline=), CRM-M1. Production shows
    one card per sale (CRM-M3). Leaving Sold asks whether to keep the
    Production card. A Source filter, remembered per user (CRM-M6).
  - Complete: Group by Stage / Source (CRM-C1) and "+ Add pipeline" (CRM-C2).
  - Website view: Tracked links (CRM-M5) and Connect Facebook Lead Ads (CRM-C6).
*/
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Archive, Globe, LayoutGrid, List, Plus, UserPlus } from 'lucide-react';
import type { Lead, LeadStatus } from '@/lib/types';
import { PageShell } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/form';
import { SearchInput, Skeleton } from '@/components/ui/display';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useCollection, useCurrentUser } from '@/lib/store';
import { cn, uid } from '@/lib/utils';
import { createPipeline } from '@/lib/crm';
import { KanbanBoard } from '@/components/leads/KanbanBoard';
import { LeadPipelineBoard, ProductionBoard } from '@/components/leads/PipelineBoards';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { ArchivedView } from '@/components/leads/ArchivedView';
import { LeadFormModal } from '@/components/leads/LeadFormModal';
import { useLeadActions } from '@/components/leads/useLeadActions';
import { TrackedLinksCard } from '@/components/leads/TrackedLinksCard';
import { FacebookLeadAdsCard } from '@/components/leads/FacebookLeadAdsCard';
import { AddPipelineModal } from '@/components/settings/config/PipelineStagesView';
import { useDb as useFeatureDb } from '@/features/lib/store';
import { NewBadge, VersionBadge, VersionGate } from '@/features/components/ui';
import { useVersion } from '@/features/lib/prototype-version';
import { leavesSold, pipelineColumns } from '@/features/lib/rules/lead-pipeline';
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

/** CRM-M6: the board's Source filter, remembered per user in this browser. */
function useSourceFilter(userId: string) {
  const key = `emts-lead-source-filter:${userId}`;
  const [value, setValue] = useState('');
  useEffect(() => {
    try {
      setValue(localStorage.getItem(key) ?? '');
    } catch {
      setValue('');
    }
  }, [key]);
  const set = (v: string) => {
    setValue(v);
    try {
      if (v) localStorage.setItem(key, v);
      else localStorage.removeItem(key);
    } catch {
      /* private window: the filter just isn't remembered */
    }
  };
  return [value, set] as const;
}

function LeadPipeline() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const viewParam = params.get('view');
  const view = viewParam === 'table' ? 'table' : viewParam === 'website' ? 'website' : 'kanban';
  const featureDb = useFeatureDb((d) => d);
  const openReviews = featureDb.leads.filter((l) => l.review?.status === 'open').length;
  const complete = useVersion((s) => s.version === 'complete');

  const { items: leads } = useCollection('leads');
  const stagesCol = useCollection('pipelineStages');
  const pipelinesCol = useCollection('pipelines');
  const cards = useCollection('productionCards');
  const user = useCurrentUser();
  const actions = useLeadActions();

  const [search, setSearch] = useState('');
  const [viewArchived, setViewArchived] = useState(false);
  // ?new=1 (from the dashboard Create menu) opens the Add Lead form on load
  const [formOpen, setFormOpen] = useState(() => params.get('new') === '1');
  const [editing, setEditing] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState<Lead | null>(null);
  const [source, setSource] = useSourceFilter(user.id);
  const [groupBy, setGroupBy] = useState<'stage' | 'source'>('stage');
  const [leaving, setLeaving] = useState<{ lead: Lead; status: LeadStatus } | null>(null);
  const [addingPipeline, setAddingPipeline] = useState(false);

  const pipelines = useMemo(
    () => [...pipelinesCol.items].filter((p) => p.kind !== 'custom' || complete).sort((a, b) => a.sortOrder - b.sortOrder),
    [pipelinesCol.items, complete],
  );
  const pipelineId = pipelines.some((p) => p.id === params.get('pipeline')) ? params.get('pipeline')! : 'sales';
  const pipeline = pipelines.find((p) => p.id === pipelineId);

  const setParam = (name: string, value?: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    const q = next.toString();
    router.replace(`${pathname}${q ? `?${q}` : ''}`, { scroll: false });
  };
  const setView = (mode: 'kanban' | 'table' | 'website') => setParam('view', mode === 'kanban' ? undefined : mode);

  // Board columns of the chosen pipeline, in the order set in Settings (Archived is not a column).
  const stages = useMemo(() => pipelineColumns(stagesCol.items, pipelineId), [stagesCol.items, pipelineId]);

  const sources = useMemo(() => [...new Set(leads.map((l) => l.leadSource).filter(Boolean))].sort(), [leads]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter(
      (l) =>
        // The Source filter belongs to the board; the table has its own filters.
        (view !== 'kanban' || !source || l.leadSource === source) &&
        (!q ||
          `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q) ||
          l.city.toLowerCase().includes(q)),
    );
  }, [leads, search, source, view]);

  const active = matches.filter((l) => l.status !== 'Archived');
  const archived = matches.filter((l) => l.status === 'Archived');

  /** CRM-M3: leaving Sold asks what happens to the Production card. */
  const move = (lead: Lead, status: LeadStatus) => {
    const card = cards.items.find((c) => !c.removedAt && (c.leadId === lead.id || (lead.estimateId && c.estimateId === lead.estimateId)));
    if (card && leavesSold(lead.status, status)) setLeaving({ lead, status });
    else actions.changeStatus(lead, status);
  };
  const finishLeaving = (keep: boolean) => {
    if (!leaving) return;
    if (!keep) {
      const at = new Date().toISOString();
      cards.items
        .filter((c) => !c.removedAt && (c.leadId === leaving.lead.id || (leaving.lead.estimateId && c.estimateId === leaving.lead.estimateId)))
        .forEach((c) => cards.update(c.id, { removedAt: at }));
    }
    actions.changeStatus(leaving.lead, leaving.status, { message: keep ? 'Lead moved. Kept in Production.' : 'Lead moved. Removed from Production.' });
    setLeaving(null);
  };

  const addPipeline = (name: string) => {
    const made = createPipeline(name, pipelinesCol.items.length + 1, uid);
    pipelinesCol.setAll([...pipelinesCol.items, made.pipeline]);
    stagesCol.setAll([...stagesCol.items, ...made.stages]);
    setAddingPipeline(false);
    setParam('pipeline', made.pipeline.id);
  };

  const track = 'flex rounded-xl border border-gray-200 bg-gray-100 p-1';
  const seg = (on: boolean) => cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all', on ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700');

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
      <div className="mb-4 flex flex-col items-center justify-between gap-4 lg:flex-row">
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

      {/* 30 Sep call: pipeline switch, source filter, group by */}
      {view === 'kanban' && !viewArchived && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className={track} role="tablist" aria-label="Pipeline">
            {pipelines.map((p) => (
              <button key={p.id} type="button" role="tab" aria-selected={pipelineId === p.id} onClick={() => setParam('pipeline', p.id === 'sales' ? undefined : p.id)} className={seg(pipelineId === p.id)}>
                {p.name}
              </button>
            ))}
            <VersionGate item="CRM-C2">
              <button type="button" onClick={() => setAddingPipeline(true)} className={seg(false)} title="Add a pipeline, e.g. Marketing">
                <Plus className="h-3.5 w-3.5" /> Add pipeline <VersionBadge item="CRM-C2" />
              </button>
            </VersionGate>
          </div>
          <VersionBadge item="CRM-M1" />
          {pipeline?.kind !== 'production' && (
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
              Source
              <NativeSelect value={source} onChange={(e) => setSource(e.target.value)} className="h-9 w-44 normal-case">
                <option value="">All sources</option>
                {sources.map((s) => <option key={s} value={s}>{s}</option>)}
              </NativeSelect>
              <VersionBadge item="CRM-M6" />
            </label>
          )}
          {pipeline?.kind === 'sales' && (
            <VersionGate item="CRM-C1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Group by</span>
                <div className={track}>
                  {(['stage', 'source'] as const).map((g) => (
                    <button key={g} type="button" onClick={() => setGroupBy(g)} className={seg(groupBy === g)}>{g === 'stage' ? 'Stage' : 'Source'}</button>
                  ))}
                </div>
                <VersionBadge item="CRM-C1" />
              </div>
            </VersionGate>
          )}
        </div>
      )}

      {viewArchived && view !== 'website' && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-100 p-4">
          <span className="flex items-center gap-2 font-bold text-gray-700"><Archive className="h-5 w-5" /> Archived Leads</span>
          <span className="text-sm text-gray-500">Showing {archived.length} archived items</span>
        </div>
      )}

      {view === 'website' ? (
        <div className="space-y-6">
          <TrackedLinksCard />
          <VersionGate item="CRM-C6"><FacebookLeadAdsCard /></VersionGate>
          <WebsiteLeadsPanel />
        </div>
      ) : viewArchived ? (
        <ArchivedView leads={archived} onRestore={actions.restore} />
      ) : view === 'table' ? (
        <LeadsTable
          leads={active}
          onEdit={(l) => { setEditing(l); setFormOpen(true); }}
          onArchive={actions.archive}
          onDelete={setDeleting}
        />
      ) : pipeline?.kind === 'production' ? (
        <ProductionBoard stages={stages} search={search} />
      ) : pipeline?.kind === 'custom' ? (
        <LeadPipelineBoard pipelineId={pipelineId} stages={stages} leads={active} onMove={(l, s) => actions.moveInPipeline(l, pipelineId, s)} />
      ) : (
        <KanbanBoard
          leads={active}
          stages={stages}
          groupBy={complete ? groupBy : 'stage'}
          onMove={move}
          onMoveToStage={actions.moveToStage}
          onArchive={actions.archive}
        />
      )}

      <LeadFormModal open={formOpen} onOpenChange={setFormOpen} lead={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete Lead"
        message={deleting ? `Are you sure you want to delete "${deleting.firstName} ${deleting.lastName}"?` : undefined}
        onConfirm={() => deleting && actions.remove(deleting)}
      />
      {/* CRM-M3: leaving Sold */}
      <Modal
        open={!!leaving}
        onOpenChange={(o) => !o && setLeaving(null)}
        title={<span className="inline-flex items-center gap-2">Keep this job in Production? <VersionBadge item="CRM-M3" /></span>}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => finishLeaving(false)}>Remove from Production</Button>
            <Button onClick={() => finishLeaving(true)}>Keep in Production</Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          {leaving ? `${leaving.lead.firstName} ${leaving.lead.lastName}` : ''} is leaving Sold. Their card is on the Production board.
        </p>
      </Modal>
      {addingPipeline && <AddPipelineModal onClose={() => setAddingPipeline(false)} onAdd={addPipeline} taken={pipelinesCol.items.map((p) => p.name)} />}
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
