'use client';

/*
  Settings > Pipeline Stages ("Pipeline Configuration").

  30 Sep call (CRM-M1, CRM-M2): one tab per pipeline (Sales, Production, and
  added ones in the Complete version, CRM-C2). Each row has a drag handle,
  the stage colour, its name, how many cards sit in it, and delete.
  System stages (Sales: New, Sold, Lost; Production: Complete) show a lock:
  they can be renamed and recoloured, not moved or deleted. "+ Add stage"
  inserts above Sold (or above the last system stage). A pipeline has at
  most 12 stages, and a stage with cards can't be deleted. Nothing is stored
  until Save; Discard puts the saved stages back.
  The rules are in features/lib/rules/lead-pipeline.ts.
*/
import React, { useMemo, useState } from 'react';
import { GripVertical, Lock, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import type { PipelineStage } from '@/lib/types';
import { createPipeline } from '@/lib/crm';
import { cn, uid } from '@/lib/utils';
import { Field as FField, Input as FInput, Modal, NewBadge, VersionBadge, VersionGate } from '@/features/components/ui';
import {
  MAX_STAGES, deleteStageProblem, insertStage, moveStage, pipelineColumns, stageCounts, stageNameProblem, stageOrderProblem, stagePipeline,
} from '@/features/lib/rules/lead-pipeline';

const COLORS = ['#3B82F6', '#A855F7', '#14B8A6', '#F59E0B', '#EC4899', '#0EA5E9', '#8B5CF6', '#22C55E'];

export function PipelineStagesView() {
  const stages = useCollection('pipelineStages');
  const pipelines = useCollection('pipelines');
  const { items: leads } = useCollection('leads');
  const { items: cards } = useCollection('productionCards');
  const { toast } = useToast();
  const sortedPipelines = [...pipelines.items].sort((a, b) => a.sortOrder - b.sortOrder);
  const [tab, setTab] = useState(sortedPipelines[0]?.id ?? 'sales');
  const [draft, setDraft] = useState<PipelineStage[]>(() => stages.items);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState<string>();
  const [adding, setAdding] = useState(false);

  const columns = pipelineColumns(draft, tab);
  const counts = useMemo(
    () => stageCounts(draft, pipelines.items, leads, cards.filter((c) => !c.removedAt)),
    [draft, pipelines.items, leads, cards],
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(stages.items);

  /** Replaces this pipeline's visible columns in the draft (hidden stages stay). */
  const setColumns = (cols: PipelineStage[]) => setDraft((d) => [...d.filter((s) => stagePipeline(s) !== tab || s.hidden), ...cols]);
  const patch = (id: string, p: Partial<PipelineStage>) => {
    setDraft((d) => d.map((s) => (s.id === id ? { ...s, ...p } : s)));
    if (p.displayName !== undefined) setErrors((e) => ({ ...e, [id]: '' }));
  };

  const addStage = () => {
    const id = uid('ps');
    const r = insertStage(columns, { id, stageId: id.toUpperCase(), displayName: `New stage ${columns.length - 1}`, color: COLORS[columns.length % COLORS.length]!, sortOrder: 0, pipelineId: tab });
    if (!r.ok) return toast(r.error, 'error');
    setColumns(r.columns);
  };

  const remove = (s: PipelineStage) => {
    const problem = deleteStageProblem(s, counts[s.id] ?? 0);
    if (problem) return toast(problem, 'error');
    setColumns(columns.filter((x) => x.id !== s.id).map((x, i) => ({ ...x, sortOrder: i + 1 })));
  };

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const r = moveStage(columns, dragId, columns.findIndex((s) => s.id === targetId));
    setDragId(undefined);
    if (!r.ok) return toast(r.error, 'error');
    setColumns(r.columns);
  };

  const save = () => {
    const e: Record<string, string> = {};
    for (const p of pipelines.items) {
      const cols = pipelineColumns(draft, p.id);
      cols.forEach((s) => {
        const problem = stageNameProblem(s.displayName, cols.filter((o) => o.id !== s.id).map((o) => o.displayName));
        if (problem) e[s.id] = problem;
      });
      const order = stageOrderProblem(cols);
      if (order) return toast(`${p.name}: ${order}`, 'error');
    }
    setErrors(e);
    if (Object.keys(e).length) {
      const first = draft.find((s) => e[s.id]);
      if (first) setTab(stagePipeline(first));
      return toast('Please fix the stage names before saving', 'error');
    }
    stages.setAll(draft.map((s) => ({ ...s, displayName: s.displayName.trim() })));
    toast('Pipeline stages updated successfully');
  };

  const discard = () => {
    setDraft(stages.items);
    setErrors({});
  };

  const addPipeline = (name: string) => {
    const made = createPipeline(name, sortedPipelines.length + 1, uid);
    pipelines.setAll([...pipelines.items, made.pipeline]);
    stages.setAll([...stages.items, ...made.stages]);
    setDraft((d) => [...d, ...made.stages]);
    setTab(made.pipeline.id);
    setAdding(false);
    toast(`${name} pipeline added`);
  };

  return (
    <SettingsPage
      wide
      title="Pipeline Configuration"
      subtitle="The stages of your lead and production boards. Drag to reorder."
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-gray-200 bg-gray-100 p-1" role="tablist" aria-label="Pipelines">
          {sortedPipelines.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={tab === p.id}
              onClick={() => setTab(p.id)}
              className={cn('rounded-lg px-4 py-2 text-sm font-bold', tab === p.id ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-900')}
            >
              {p.name}
            </button>
          ))}
        </div>
        <VersionBadge item="CRM-M1" />
        <VersionGate item="CRM-C2">
          <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
            Add pipeline <VersionBadge item="CRM-C2" />
          </Button>
        </VersionGate>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">
          <span className="flex items-center gap-2">Stages <VersionBadge item="CRM-M2" /></span>
          <span>{columns.length} of {MAX_STAGES}</span>
        </div>
        <ul>
          {columns.map((s) => (
            <li
              key={s.id}
              draggable={!s.system}
              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragId(s.id); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); drop(s.id); }}
              onDragEnd={() => setDragId(undefined)}
              className={cn('flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3 last:border-0', dragId === s.id && 'opacity-50')}
            >
              <span className={cn('text-gray-400', s.system ? 'cursor-not-allowed opacity-40' : 'cursor-grab')} aria-hidden title={s.system ? undefined : 'Drag to reorder'}>
                <GripVertical className="h-4 w-4" />
              </span>
              <label className="relative h-7 w-7 shrink-0 cursor-pointer rounded-lg border border-gray-200" style={{ backgroundColor: s.color }} title="Change colour">
                <span className="sr-only">{s.displayName} colour</span>
                <input type="color" value={s.color} onChange={(e) => patch(s.id, { color: e.target.value.toUpperCase() })} className="absolute inset-0 cursor-pointer opacity-0" />
              </label>
              <div className="min-w-[200px] flex-1">
                <Input aria-label={`${s.displayName} name`} value={s.displayName} invalid={!!errors[s.id]} onChange={(e) => patch(s.id, { displayName: e.target.value })} />
                {errors[s.id] && <p className="mt-1 text-xs text-red-600">{errors[s.id]}</p>}
              </div>
              {s.system && (
                <span className="flex items-center gap-1 text-xs font-semibold text-gray-500" title="System stage: rename and recolour only">
                  <Lock className="h-3.5 w-3.5" /> System
                </span>
              )}
              <span className="w-20 text-right text-xs text-gray-500">{counts[s.id] ?? 0} {counts[s.id] === 1 ? 'card' : 'cards'}</span>
              <button
                type="button"
                onClick={() => remove(s)}
                disabled={s.system}
                aria-label={`Delete ${s.displayName}`}
                title={s.system ? "System stages can't be deleted" : (counts[s.id] ?? 0) > 0 ? `Move the ${counts[s.id]} cards in this stage first.` : 'Delete stage'}
                className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-gray-100 px-5 py-3">
          <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={addStage} disabled={columns.length >= MAX_STAGES}>
            Add stage
          </Button>
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-2">
        <Button variant="secondary" onClick={discard} disabled={!dirty} icon={<RotateCcw className="h-4 w-4" />}>Discard</Button>
        <Button onClick={save} disabled={!dirty} icon={<Save className="h-4 w-4" />}>Save Changes</Button>
      </div>

      {adding && <AddPipelineModal onClose={() => setAdding(false)} onAdd={addPipeline} taken={pipelines.items.map((p) => p.name)} />}
    </SettingsPage>
  );
}

/** CRM-C2: "+ Add pipeline", e.g. Marketing. */
export function AddPipelineModal({ onClose, onAdd, taken }: { onClose: () => void; onAdd: (name: string) => void; taken: string[] }) {
  const [name, setName] = useState('Marketing');
  const problem = !name.trim() ? 'Enter a name.' : taken.some((t) => t.toLowerCase() === name.trim().toLowerCase()) ? 'A pipeline with this name exists.' : undefined;
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Add pipeline"
      description={<span className="inline-flex items-center gap-1.5">Starts with a New stage and a Done stage. <VersionBadge item="CRM-C2" /></span>}
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!!problem} onClick={() => onAdd(name.trim())}>Add pipeline</Button></>}
    >
      <FField label="Name" error={name ? problem : undefined}>
        <FInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </FField>
    </Modal>
  );
}
