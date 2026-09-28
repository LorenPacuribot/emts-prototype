'use client';

/*
  Pipeline board: one column per pipeline stage (names and colors come from
  Settings > Pipeline Stages). Cards can be dragged between columns with
  native HTML5 drag and drop. Columns the dragged lead cannot move to are
  dimmed, and dropping there shows the live app's error message.
  NEW (29): a lead driven by an open repaint follow-up can't be dragged or
  moved at all; its card says which follow-up sets the stage.
*/
import React, { useEffect, useRef, useState } from 'react';
import type { Lead, LeadStatus, PipelineStage } from '@/lib/types';
import { useLookups } from '@/lib/store';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { LeadCard } from './LeadCard';
import { NEXT_STAGE_MAP, blockedMoveMessage, canManuallySetStatus, isManualLeadStatus, stageToStatus } from './leadHelpers';
import { followUpLockMessage, useFollowUpLocks } from './leadFeatures';

export function KanbanBoard({
  leads, stages, onMove, onArchive,
}: {
  leads: Lead[];
  stages: PipelineStage[];
  onMove: (lead: Lead, status: LeadStatus) => void;
  onArchive: (lead: Lead) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<LeadStatus | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lookups = useLookups();
  const { toast } = useToast();
  const lockOf = useFollowUpLocks();

  // Reset drag state if the drag ends anywhere (e.g. dropped outside the board).
  useEffect(() => {
    const end = () => { setDraggedId(null); setOverStatus(null); };
    window.addEventListener('dragend', end);
    return () => window.removeEventListener('dragend', end);
  }, []);

  const dragged = leads.find((l) => l.id === draggedId);
  const draggedLock = dragged ? lockOf(dragged.id) : undefined;

  // Scroll the board sideways when dragging near its edges.
  const handleBoardDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const el = scrollRef.current;
    if (!el) return;
    const { left, right } = el.getBoundingClientRect();
    if (e.clientX > right - 120) el.scrollLeft += 15;
    else if (e.clientX < left + 120) el.scrollLeft -= 15;
  };

  const handleDrop = (e: React.DragEvent, status: LeadStatus) => {
    e.preventDefault();
    const lead = leads.find((l) => l.id === (draggedId ?? e.dataTransfer.getData('text/plain')));
    setDraggedId(null);
    setOverStatus(null);
    if (!lead || lead.status === status) return;
    const fu = lockOf(lead.id);
    if (fu) {
      toast(followUpLockMessage(fu), 'error');
      return;
    }
    if (!canManuallySetStatus(lead.status, status)) {
      toast(blockedMoveMessage(status), 'error');
      return;
    }
    onMove(lead, status);
  };

  return (
    <div ref={scrollRef} onDragOver={handleBoardDragOver} className="overflow-x-auto pb-8">
      <div className="flex h-full min-w-[1040px] gap-3">
        {stages.map((stage) => {
          const status = stageToStatus(stage);
          const stageLeads = leads.filter((l) => l.status === status);
          const canDrop = dragged ? !draggedLock && canManuallySetStatus(dragged.status, status) : isManualLeadStatus(status);
          const isOver = overStatus === status;
          return (
            <div
              key={stage.id}
              onDragOver={(e) => { e.preventDefault(); if (draggedId && overStatus !== status) setOverStatus(status); }}
              onDrop={(e) => handleDrop(e, status)}
              className={cn(
                'flex min-w-[170px] flex-1 basis-0 flex-col rounded-2xl border bg-gray-100/60 transition-colors',
                isOver && canDrop ? 'border-primary-300 bg-primary-50/80 ring-2 ring-primary-200' : 'border-transparent',
                draggedId && !isOver && canDrop && 'border-dashed border-gray-300',
                draggedId && !canDrop && 'opacity-60',
              )}
            >
              {/* Column header with the stage color as a thick underline */}
              <div
                className="mb-4 flex items-center justify-between rounded-t-2xl border-b-2 bg-white px-3 py-3.5 shadow-sm"
                style={{ borderBottomColor: stage.color }}
              >
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-900">{stage.displayName}</h3>
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
                  style={{ backgroundColor: `${stage.color}22`, color: stage.color }}
                >
                  {stageLeads.length}
                </span>
              </div>

              <div className="flex-1 space-y-3 px-2 pb-4">
                {stageLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    estimate={lookups.estimate(lead.estimateId)}
                    estimator={lookups.member(lead.appointment?.estimatorId)}
                    dragging={draggedId === lead.id}
                    followUpId={lockOf(lead.id)?.id}
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
                ))}
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
