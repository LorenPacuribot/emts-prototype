'use client';

/*
  The other pipeline boards on /leads (30 Sep call).

  - ProductionBoard (CRM-M1, CRM-M3): one card per sale, created when the
    lead reaches Sold or its estimate is approved (components/leads/CrmSync).
    Cards move freely between the Production stages; each move is kept on the
    card. The card links to its job and shows the job's status.
  - LeadPipelineBoard (CRM-C2): an added pipeline, such as Marketing. It holds
    the active leads; a lead starts on the first stage.
*/
import React, { useState } from 'react';
import Link from 'next/link';
import { Briefcase, FileText } from 'lucide-react';
import type { Lead, PipelineStage, ProductionCard } from '@/lib/types';
import { useCollection, useCurrentUser } from '@/lib/store';
import { cn, fullName } from '@/lib/utils';
import { move } from '@/lib/crm';
import { customColumnFor } from '@/features/lib/rules/lead-pipeline';
import { useToast } from '@/components/ui/toast';
import { LeadCard } from './LeadCard';

function Column({ stage, count, over, onOver, onDrop, children }: {
  stage: PipelineStage; count: number; over: boolean; onOver: () => void; onDrop: () => void; children: React.ReactNode;
}) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onOver(); }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      className={cn('flex min-w-[170px] flex-1 basis-0 flex-col rounded-2xl border bg-gray-100/60 transition-colors', over ? 'border-primary-300 bg-primary-50/80 ring-2 ring-primary-200' : 'border-transparent')}
    >
      <div className="mb-4 flex items-center justify-between rounded-t-2xl border-b-2 bg-white px-3 py-3.5 shadow-sm" style={{ borderBottomColor: stage.color }}>
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-900">{stage.displayName}</h3>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold" style={{ backgroundColor: `${stage.color}22`, color: stage.color }}>{count}</span>
      </div>
      <div className="flex-1 space-y-3 px-2 pb-4">
        {children}
        {count === 0 && <div className="flex h-16 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-xs font-medium italic text-gray-300">Drop cards here</div>}
      </div>
    </div>
  );
}

/* ---------- Production ---------- */

export function ProductionBoard({ stages, search }: { stages: PipelineStage[]; search: string }) {
  const cards = useCollection('productionCards');
  const { items: jobs } = useCollection('jobs');
  const { items: estimates } = useCollection('estimates');
  const me = fullName(useCurrentUser());
  const { toast } = useToast();
  const [dragId, setDragId] = useState<string>();
  const [overId, setOverId] = useState<string>();
  const q = search.trim().toLowerCase();
  const shown = cards.items.filter((c) => !c.removedAt && (!q || `${c.title} ${c.customerName}`.toLowerCase().includes(q)));

  const drop = (stage: PipelineStage) => {
    const card = cards.items.find((c) => c.id === dragId);
    setDragId(undefined);
    setOverId(undefined);
    if (!card || card.stageId === stage.id) return;
    const at = new Date().toISOString();
    cards.update(card.id, { stageId: stage.id, history: [...card.history, move('production', stage, me, at)] });
    toast(`${card.customerName || card.title} moved to ${stage.displayName}`);
  };

  return (
    <div className="overflow-x-auto pb-8" onDragEnd={() => { setDragId(undefined); setOverId(undefined); }}>
      <div className="flex h-full gap-3" style={{ minWidth: Math.max(1040, stages.length * 175) }}>
        {stages.map((s) => {
          const list = shown.filter((c) => c.stageId === s.id);
          return (
            <Column key={s.id} stage={s} count={list.length} over={overId === s.id} onOver={() => dragId && setOverId(s.id)} onDrop={() => drop(s)}>
              {list.map((c) => (
                <ProductionCardView key={c.id} card={c} job={jobs.find((j) => j.id === c.jobId)} estimateNumber={estimates.find((e) => e.id === c.estimateId)?.estimateNumber} dragging={dragId === c.id} onDragStart={() => setDragId(c.id)} />
              ))}
            </Column>
          );
        })}
      </div>
    </div>
  );
}

function ProductionCardView({ card, job, estimateNumber, dragging, onDragStart }: {
  card: ProductionCard; job?: { id: string; jobNumber: string; status: string }; estimateNumber?: string; dragging: boolean; onDragStart: () => void;
}) {
  const chip = 'inline-flex items-center rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600';
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.id); onDragStart(); }}
      className={cn('cursor-grab rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:border-primary-300 hover:shadow-md active:cursor-grabbing', dragging && 'opacity-50')}
    >
      <div className="truncate font-heading text-sm font-bold text-gray-900">{card.customerName || card.title}</div>
      <div className="truncate text-xs text-gray-500">{card.title}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {job ? (
          <Link href={`/jobs/${job.id}`} className="inline-flex items-center rounded border border-primary-100 bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 hover:bg-primary-100">
            <Briefcase className="mr-1 h-3 w-3" />{job.jobNumber}
          </Link>
        ) : card.estimateId ? (
          <Link href={`/estimates/${card.estimateId}`} className="inline-flex items-center rounded border border-primary-100 bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 hover:bg-primary-100">
            <FileText className="mr-1 h-3 w-3" />{estimateNumber ?? 'Estimate'}
          </Link>
        ) : null}
        {job && <span className={chip}>{job.status}</span>}
        <span className={chip}>${Math.round(card.value).toLocaleString('en-US')}</span>
      </div>
    </div>
  );
}

/* ---------- Added pipelines (CRM-C2) ---------- */

export function LeadPipelineBoard({ pipelineId, stages, leads, onMove }: {
  pipelineId: string; stages: PipelineStage[]; leads: Lead[]; onMove: (lead: Lead, stage: PipelineStage) => void;
}) {
  const [dragId, setDragId] = useState<string>();
  const [overId, setOverId] = useState<string>();
  const drop = (stage: PipelineStage) => {
    const lead = leads.find((l) => l.id === dragId);
    setDragId(undefined);
    setOverId(undefined);
    if (lead && customColumnFor(lead, stages, pipelineId)?.id !== stage.id) onMove(lead, stage);
  };
  return (
    <div className="overflow-x-auto pb-8" onDragEnd={() => { setDragId(undefined); setOverId(undefined); }}>
      <div className="flex h-full gap-3" style={{ minWidth: Math.max(1040, stages.length * 175) }}>
        {stages.map((s) => {
          const list = leads.filter((l) => customColumnFor(l, stages, pipelineId)?.id === s.id);
          return (
            <Column key={s.id} stage={s} count={list.length} over={overId === s.id} onOver={() => dragId && setOverId(s.id)} onDrop={() => drop(s)}>
              {list.map((l) => <LeadCard key={l.id} lead={l} dragging={dragId === l.id} onDragStart={(e, id) => { e.dataTransfer.setData('text/plain', id); setDragId(id); }} />)}
            </Column>
          );
        })}
      </div>
    </div>
  );
}
