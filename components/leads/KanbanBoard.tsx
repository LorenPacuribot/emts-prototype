'use client';

/*
  Sales pipeline board: one column per Sales stage (names, colours and order
  come from Settings > Pipeline Stages). Cards can be dragged between columns
  with native HTML5 drag and drop. Columns the dragged lead cannot move to are
  dimmed, and dropping there shows the live app's error message.
  NEW (29): a lead driven by an open repaint follow-up can't be dragged or
  moved at all; its card says which follow-up sets the stage.

  30 Sep call:
  - CRM-M2: a stage that stands for a lifecycle status (New, Contacted…) moves
    the lead to that status, with the usual rules. A stage added in Settings
    holds the lead as it is (onMoveToStage).
  - CRM-C1 (Complete): Group by Source. Columns are sources, each card shows
    its stage as a grey chip, and dragging is off.
*/
import React, { useEffect, useRef, useState } from 'react';
import type { Lead, LeadStatus, PipelineStage } from '@/lib/types';
import { useCollection, useLookups } from '@/lib/store';
import { resolveSource } from '@/features/lib/rules/lead-sources';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { salesColumnFor } from '@/features/lib/rules/lead-pipeline';
import { LeadCard } from './LeadCard';
import { NEXT_STAGE_MAP, blockedMoveMessage, canManuallySetStatus, isManualLeadStatus } from './leadHelpers';
import { followUpLockMessage, useFollowUpLocks } from './leadFeatures';

const SOURCE_COLORS = ['#3B82F6', '#A855F7', '#14B8A6', '#F59E0B', '#EC4899', '#0EA5E9', '#22C55E', '#6B7280'];

export function KanbanBoard({
  leads, stages, groupBy = 'stage', onMove, onMoveToStage, onArchive,
}: {
  leads: Lead[];
  /** Sales columns in order (pipelineColumns). */
  stages: PipelineStage[];
  groupBy?: 'stage' | 'source';
  onMove: (lead: Lead, status: LeadStatus) => void;
  onMoveToStage: (lead: Lead, stage: PipelineStage) => void;
  onArchive: (lead: Lead) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lookups = useLookups();
  const { toast } = useToast();
  const lockOf = useFollowUpLocks();
  const bySource = groupBy === 'source';
  const { items: sourceList } = useCollection('leadSources');

  // Reset drag state if the drag ends anywhere (e.g. dropped outside the board).
  useEffect(() => {
    const end = () => { setDraggedId(null); setOverId(null); };
    window.addEventListener('dragend', end);
    return () => window.removeEventListener('dragend', end);
  }, []);

  const dragged = leads.find((l) => l.id === draggedId);
  const draggedLock = dragged ? lockOf(dragged.id) : undefined;
  const columnOf = (l: Lead) => salesColumnFor(l, stages);

  /** Can this lead go to this stage by hand? Stages added in Settings take any lead. */
  const canEnter = (lead: Lead | undefined, stage: PipelineStage) => {
    if (!stage.leadStatus) return true;
    return lead ? canManuallySetStatus(lead.status, stage.leadStatus) : isManualLeadStatus(stage.leadStatus);
  };

  // Scroll the board sideways when dragging near its edges.
  const handleBoardDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const el = scrollRef.current;
    if (!el) return;
    const { left, right } = el.getBoundingClientRect();
    if (e.clientX > right - 120) el.scrollLeft += 15;
    else if (e.clientX < left + 120) el.scrollLeft -= 15;
  };

  const handleDrop = (e: React.DragEvent, stage: PipelineStage) => {
    e.preventDefault();
    const lead = leads.find((l) => l.id === (draggedId ?? e.dataTransfer.getData('text/plain')));
    setDraggedId(null);
    setOverId(null);
    if (!lead || columnOf(lead)?.id === stage.id) return;
    const fu = lockOf(lead.id);
    if (fu) {
      toast(followUpLockMessage(fu), 'error');
      return;
    }
    if (!stage.leadStatus) {
      onMoveToStage(lead, stage);
      return;
    }
    if (lead.status === stage.leadStatus) {
      // Back from a hand-picked stage to the one for its status.
      onMoveToStage(lead, stage);
      return;
    }
    if (!canManuallySetStatus(lead.status, stage.leadStatus)) {
      toast(blockedMoveMessage(stage.leadStatus), 'error');
      return;
    }
    onMove(lead, stage.leadStatus);
  };

  // CRM-C1: columns are sources; each card shows its stage. D6: the organisation's list,
  // in its order; a lead whose source isn't on the list falls under Other.
  const sourceOf = (l: Lead) => resolveSource(l.leadSource, sourceList);
  const sourceColumns = bySource
    ? sourceList.filter((s) => leads.some((l) => sourceOf(l) === s.name)).map((s, i) => ({ id: `src:${s.id}`, name: s.name, color: SOURCE_COLORS[i % SOURCE_COLORS.length]! }))
    : [];

  const card = (lead: Lead, draggable: boolean) => (
    <LeadCard
      key={lead.id}
      lead={lead}
      estimate={lookups.estimate(lead.estimateId)}
      estimator={lookups.member(lead.appointment?.estimatorId)}
      dragging={draggedId === lead.id}
      draggable={draggable}
      followUpId={lockOf(lead.id)?.id}
      stageChip={bySource ? columnOf(lead)?.displayName : undefined}
      onDragStart={(e, id) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        setDraggedId(id);
      }}
      onArchive={onArchive}
      onAdvance={(l) => {
        const next = NEXT_STAGE_MAP[l.status];
        if (next) onMove(l, next);
      }}
    />
  );

  const header = (name: string, color: string, count: number) => (
    <div className="mb-4 flex items-center justify-between rounded-t-2xl border-b-2 bg-white px-3 py-3.5 shadow-sm" style={{ borderBottomColor: color }}>
      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-900">{name}</h3>
      <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold" style={{ backgroundColor: `${color}22`, color }}>{count}</span>
    </div>
  );

  if (bySource) {
    return (
      <div className="overflow-x-auto pb-8">
        <div className="flex h-full gap-3" style={{ minWidth: Math.max(1040, sourceColumns.length * 190) }}>
          {sourceColumns.map((col) => {
            const list = leads.filter((l) => sourceOf(l) === col.name);
            return (
              <div key={col.id} className="flex min-w-[170px] flex-1 basis-0 flex-col rounded-2xl border border-transparent bg-gray-100/60">
                {header(col.name, col.color, list.length)}
                <div className="flex-1 space-y-3 px-2 pb-4">{list.map((l) => card(l, false))}</div>
              </div>
            );
          })}
          {sourceColumns.length === 0 && <p className="p-8 text-sm italic text-gray-500">No leads match.</p>}
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} onDragOver={handleBoardDragOver} className="overflow-x-auto pb-8">
      <div className="flex h-full gap-3" style={{ minWidth: Math.max(1040, stages.length * 175) }}>
        {stages.map((stage) => {
          const stageLeads = leads.filter((l) => columnOf(l)?.id === stage.id);
          const canDrop = dragged ? !draggedLock && canEnter(dragged, stage) : canEnter(undefined, stage);
          const isOver = overId === stage.id;
          return (
            <div
              key={stage.id}
              onDragOver={(e) => { e.preventDefault(); if (draggedId && overId !== stage.id) setOverId(stage.id); }}
              onDrop={(e) => handleDrop(e, stage)}
              className={cn(
                'flex min-w-[170px] flex-1 basis-0 flex-col rounded-2xl border bg-gray-100/60 transition-colors',
                isOver && canDrop ? 'border-primary-300 bg-primary-50/80 ring-2 ring-primary-200' : 'border-transparent',
                draggedId && !isOver && canDrop && 'border-dashed border-gray-300',
                draggedId && !canDrop && 'opacity-60',
              )}
            >
              {/* Column header with the stage color as a thick underline */}
              {header(stage.displayName, stage.color, stageLeads.length)}

              <div className="flex-1 space-y-3 px-2 pb-4">
                {stageLeads.map((lead) => card(lead, true))}
                {stageLeads.length === 0 && (
                  <div
                    className={cn(
                      'flex h-16 items-center justify-center rounded-xl border-2 border-dashed text-xs font-medium italic text-gray-300',
                      isOver ? 'border-primary-300 bg-primary-50/50' : 'border-gray-200',
                    )}
                  >
                    Drop leads here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
