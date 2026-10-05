'use client';

/*
  Board tab (spec 6.2 and 6.3): what happens at each stage of one
  pipeline. One column per stage, many automations per column (each a group
  with its own name and On/Off switch, run in the order shown), built-in
  steps as locked cards, stuck alerts in the column header, and the
  Building blocks panel on the left.

  Adding and moving steps: drag and drop (mouse, touch with a 250ms hold on
  tablets, keyboard: Space to pick up, arrows, Space to drop, Esc to cancel),
  or click a block to choose where it goes, or click "+" first and then a
  block. Every path asks the same drop rules. Complete drops save at once
  with Undo; steps that need settings open the settings panel and save on
  Done. Phones get one column at a time and a bottom sheet with tap-to-add.
*/
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DndContext, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useDraggable, useSensor, useSensors,
  type Announcements, type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { AlarmClock, ChevronDown, ChevronLeft, ChevronRight, Clock, GripHorizontal, Layers, Lock, Plus, Trash2, X } from 'lucide-react';
import type { Automation, AutomationStep, PipelineModule } from '@/lib/automations/types';
import {
  BUILT_INS, MODULE_LABEL, PIPELINES, RECORD_NOUN, STUCK_ALERT_DEFAULTS, boardPlacement, stageLabel, stagesOf, stepDef, variablesFor,
} from '@/lib/automations/registry';
import { stepPhrase } from '@/lib/automations/summary';
import { validateStep } from '@/lib/automations/validation';
import { canDrop, defaultConfig, type DragItem, type DropTarget } from '@/lib/automations/drop-rules';
import { stuckSettingFor } from '@/lib/automations/engine';
import {
  allTemplates, createForStage, insertStep, moveStep, newStepId, removeStep, reorderStage, replaceStep, setStuckAlert, setUi, undoChange, useAuto, type BoardChange,
} from '@/lib/automations/store';
import { useDb as useFeatureDb } from '@/features/lib/store';
import { toast } from '@/features/lib/toast';
import { Badge, Button, Drawer, Field, Input, Modal, RowMenu, Select, Switch } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { useLibrary, useMessageActions, useNames, usePerms } from './hooks';
import { BuildingBlocksPanel } from './building-blocks/building-blocks-panel';
import { DropZone, targetId } from './building-blocks/drop-zone';
import { BlockDragOverlay } from './building-blocks/drag-overlay';
import { DragStateContext, useDropContext } from './building-blocks/use-drop-rules';
import { dragId } from './building-blocks/block-card';
import { StepSettingsForm } from './StepSettings';
import { MessageEditor } from './MessageEditor';
import { useAutomationActions } from './actions';
import { DeployModal } from './modals';
import { UseTemplateModal } from './TemplatesTab';
import { Icon, StepBadges } from './shared';

/* ---------- Helpers ---------- */

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

function hours(h: number): string {
  if (h % 24 === 0) return `${h / 24} ${h / 24 === 1 ? 'day' : 'days'}`;
  return `${h} ${h === 1 ? 'hour' : 'hours'}`;
}

function itemTitle(item: DragItem, a: Automation[], libraryName: (id: string) => string | undefined): string {
  if (item.kind === 'step') return stepDef(item.type)?.title ?? 'step';
  if (item.kind === 'message') return libraryName(item.id) ?? 'message';
  if (item.kind === 'stage') return stageLabel(item.pipeline, item.stage);
  if (item.kind === 'template') return 'template';
  if (item.kind === 'card') { const st = a.find((x) => x.id === item.automationId)?.steps.find((s) => s.id === item.stepId); return st ? stepDef(st.type)?.title ?? 'step' : 'step'; }
  return a.find((x) => x.id === item.automationId)?.name ?? 'automation';
}

function targetLabel(t: DropTarget, a: Automation[]): string {
  if (t.kind === 'new') return `New automation for ${stageLabel(t.pipeline, t.stage)}`;
  if (t.kind === 'groupSlot') return `${stageLabel(t.pipeline, t.stage)}, position ${t.index + 1}`;
  const auto = a.find((x) => x.id === t.automationId);
  const p = auto ? boardPlacement(auto.trigger) : undefined;
  if (t.kind === 'when') return `the When of ${auto?.name ?? 'this automation'}`;
  return `${p ? stageLabel(p.pipeline, p.stage) : ''}, ${auto?.name ?? ''}, position ${t.index + 1}`;
}

/* ---------- Pending step (settings open, not saved yet) ---------- */

interface Pending {
  /** Automation the step goes into, or undefined for a new automation. */
  automationId?: string;
  pipeline: PipelineModule;
  stage: string;
  index: number;
  step: AutomationStep;
  isNew: boolean;
}

/* ---------- The board ---------- */

export function BoardTab({ pipeline, setPipeline, journeyId, setJourneyId, focusStage }: {
  pipeline: PipelineModule; setPipeline: (p: PipelineModule) => void; journeyId: string; setJourneyId: (j: string) => void; focusStage?: string;
}) {
  const automations = useAuto((s) => s.automations);
  const journeys = useAuto((s) => s.journeys);
  const templatesState = useAuto((s) => s.templates);
  const s = useAuto((x) => x);
  const library = useLibrary();
  const names = useNames();
  const perms = usePerms();
  const msgActions = useMessageActions();
  const actions = useAutomationActions();
  const fdb = useFeatureDb((d) => d);
  const desktop = useMediaQuery('(min-width: 768px)');
  const [active, setActive] = useState<DragItem>();
  const [pending, setPending] = useState<Pending>();
  const [selected, setSelected] = useState<{ automationId: string; stepId: string }>();
  const [plusTarget, setPlusTarget] = useState<DropTarget>();
  const [pick, setPick] = useState<DragItem>();
  const [msgEditor, setMsgEditor] = useState<{ id?: string; channel?: 'EMAIL' | 'SMS'; start?: Parameters<typeof MessageEditor>[0]['start']; onSaved?: (id: string) => void }>();
  const [deleteMsg, setDeleteMsg] = useState<string>();
  const [approve, setApprove] = useState<string[]>();
  const [useTpl, setUseTpl] = useState<{ templateId: string; pipeline: PipelineModule; stage: string }>();
  const [phoneCol, setPhoneCol] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [stuckEdit, setStuckEdit] = useState<string>();

  const ctx = useDropContext();
  const stages = stagesOf(pipeline);
  const visible = automations.filter((a) => !a.isDeleted && !a.isArchived && boardPlacement(a.trigger).pipeline === pipeline && (!journeyId || a.journeyId === journeyId));
  const byStage = (stage: string) => visible.filter((a) => boardPlacement(a.trigger).stage === stage).sort((x, y) => x.runOrder - y.runOrder);

  // Opened from Settings › Pipeline Stages: scroll to that stage.
  useEffect(() => {
    if (!focusStage) return;
    const i = stagesOf(pipeline).findIndex((x) => x.value === focusStage);
    if (i < 0) return;
    setPhoneCol(i);
    requestAnimationFrame(() => document.getElementById(`stage-${focusStage}`)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }));
  }, [focusStage, pipeline]);

  // "Leaving the page with an unfinished step asks."
  useEffect(() => {
    if (!pending) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "You have a step that isn't set up. Leave anyway?"; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [pending]);

  const after = useCallback((r: { ok: true; value?: BoardChange } | { ok: false; error: string }, message: string) => {
    if (!r.ok) return toast.error('Not changed', r.error);
    setUi({ firstDropDone: true });
    const change = r.value!;
    toast.info(message, undefined, { label: 'Undo', onClick: () => { undoChange(change); toast.success('Undone'); } });
    if (change.needsApproval.length) setApprove(change.needsApproval);
  }, []);

  const settingsFrom = { financialSettings: fdb.financialSettings };

  /** Carry out a drop that the rules allowed. */
  const applyDrop = useCallback((item: DragItem, target: DropTarget) => {
    const verdict = canDrop(item, target, ctx);
    if (!verdict.ok) return toast.error('Can’t go there', verdict.reason);
    const placeOf = (t: DropTarget) => {
      if (t.kind === 'new' || t.kind === 'groupSlot') return { pipeline: t.pipeline, stage: t.stage };
      const a = automations.find((x) => x.id === (t as { automationId: string }).automationId)!;
      const p = boardPlacement(a.trigger);
      return { pipeline: p.pipeline, stage: p.stage };
    };
    const where = placeOf(target);
    const stageName = stageLabel(where.pipeline, where.stage);
    const makeStep = (type: string, config: Record<string, unknown>): AutomationStep => ({ id: newStepId(), order: 0, type, mode: stepDef(type)?.mode === 'ASK_BY_DEFAULT' ? 'ASK' : 'AUTO', conditions: [], config: { ...defaultConfig(type, settingsFrom), ...config } });
    const put = (step: AutomationStep) => {
      if (target.kind === 'zone') after(insertStep(target.automationId, target.index, step), `Step added to ${stageName}`);
      else if (target.kind === 'new') after(createForStage(where.pipeline, where.stage, [step], undefined, journeyId || undefined), `New automation added to ${stageName}`);
    };
    switch (item.kind) {
      case 'step': {
        const step = makeStep(item.type, {});
        const needsSetup = validateStep(step, variablesFor(where.pipeline, where.stage)).length > 0;
        if (!needsSetup) return put(step);
        setPending({ automationId: target.kind === 'zone' ? target.automationId : undefined, pipeline: where.pipeline, stage: where.stage, index: target.kind === 'zone' ? target.index : 0, step, isNew: true });
        setSelected(undefined);
        return;
      }
      case 'message':
        return put(makeStep(item.channel === 'SMS' ? 'SEND_TEXT' : 'SEND_EMAIL', { messageId: item.id }));
      case 'stage':
        return put(makeStep(item.pipeline === 'LEAD' ? 'MOVE_LEAD_STAGE' : 'MOVE_JOB_STAGE', { stage: item.stage }));
      case 'template':
        if (target.kind === 'new') setUseTpl({ templateId: item.id, pipeline: target.pipeline, stage: target.stage });
        return;
      case 'card':
        if (target.kind === 'zone') after(moveStep(item.automationId, item.stepId, target.automationId, target.index), target.automationId === item.automationId ? 'Steps reordered' : `Step moved to ${stageName}`);
        return;
      case 'group': {
        if (target.kind !== 'groupSlot') return;
        const ids = byStage(target.stage).map((a) => a.id).filter((id) => id !== item.automationId);
        const oldIndex = byStage(target.stage).findIndex((a) => a.id === item.automationId);
        ids.splice(target.index > oldIndex ? target.index - 1 : target.index, 0, item.automationId);
        const r = reorderStage(ids);
        if (!r.ok) toast.error('Not reordered', r.error);
        else toast.success('Run order changed');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, automations, after, journeyId, fdb.financialSettings]);

  /* ---- drag and drop ---- */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const collision: CollisionDetection = (args) => { const p = pointerWithin(args); return p.length ? p : rectIntersection(args); };
  const libName = (id: string) => library.find((m) => m.id === id)?.name;
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `Picked up ${itemTitle((a.data.current as { item: DragItem }).item, automations, libName)}.`,
    onDragOver: ({ active: a, over }) => over ? `${itemTitle((a.data.current as { item: DragItem }).item, automations, libName)}. Over ${targetLabel((over.data.current as { target: DropTarget }).target, automations)}.` : 'Not over a drop zone.',
    onDragEnd: ({ over }) => over ? `Dropped on ${targetLabel((over.data.current as { target: DropTarget }).target, automations)}.` : 'Dropped. Nothing changed.',
    onDragCancel: () => 'Cancelled. Nothing changed.',
  };
  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current as { item: DragItem }).item);
  const onDragEnd = (e: DragEndEvent) => {
    const item = (e.active.data.current as { item: DragItem } | undefined)?.item;
    const target = (e.over?.data.current as { target: DropTarget } | undefined)?.target;
    setActive(undefined);
    if (item && target) applyDrop(item, target);
  };

  /* ---- click to add ---- */
  const onPick = (item: DragItem) => {
    if (!perms.manage) return;
    if (plusTarget) {
      const t = plusTarget;
      setPlusTarget(undefined);
      setSheet(false);
      return applyDrop(item, t);
    }
    setPick(item);
  };

  /* ---- settings panel ---- */
  const selAuto = selected ? automations.find((a) => a.id === selected.automationId) : undefined;
  const selStep = selAuto?.steps.find((st) => st.id === selected?.stepId);
  const [editStep, setEditStep] = useState<AutomationStep>();
  useEffect(() => { setEditStep(pending?.step ?? selStep); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.step.id, selStep?.id, selected?.automationId]);
  const panelPlace = pending ? { pipeline: pending.pipeline, stage: pending.stage } : selAuto ? boardPlacement(selAuto.trigger) : undefined;
  const panelProblems = editStep && panelPlace ? validateStep(editStep, variablesFor(panelPlace.pipeline, panelPlace.stage)) : [];
  const [showProblems, setShowProblems] = useState(false);
  const closePanel = () => { setPending(undefined); setSelected(undefined); setEditStep(undefined); setShowProblems(false); };
  const done = () => {
    if (!editStep || !panelPlace) return;
    if (panelProblems.length) { setShowProblems(true); return; }
    if (pending) {
      if (pending.automationId) after(insertStep(pending.automationId, pending.index, editStep), `Step added to ${stageLabel(pending.pipeline, pending.stage)}`);
      else after(createForStage(pending.pipeline, pending.stage, [editStep], undefined, journeyId || undefined), `New automation added to ${stageLabel(pending.pipeline, pending.stage)}`);
    } else if (selAuto) {
      const r = replaceStep(selAuto.id, editStep);
      if (!r.ok) return toast.error('Not saved', r.error);
      toast.success('Step saved');
      if (r.value!.needsApproval.length) setApprove(r.value!.needsApproval);
    }
    closePanel();
  };

  const newMessage = (channel?: 'EMAIL' | 'SMS', onSaved?: (id: string) => void) => setMsgEditor({ channel, onSaved });

  const columns = stages.map((st) => ({ st, autos: byStage(st.value) }));
  const shownColumns = desktop ? columns : columns.slice(phoneCol, phoneCol + 1);

  const panelProps = {
    pipeline, onPick, dragEnabled: desktop && perms.manage,
    onNewMessage: () => newMessage(),
    onEditMessage: (id: string) => setMsgEditor({ id }),
    onDuplicateMessage: (id: string) => { const m = library.find((x) => x.id === id); if (m) setMsgEditor({ start: { name: `${m.name} (copy)`, channel: m.channel, subject: m.subject, body: m.body, category: m.category } }); },
    onDeleteMessage: (id: string) => setDeleteMsg(id),
  };

  return (
    <DragStateContext.Provider value={{ active, ctx }}>
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(undefined)} accessibility={{ announcements }} autoScroll={{ threshold: { x: 0.15, y: 0.1 } }}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 no-scrollbar dark:bg-gray-900" role="tablist" aria-label="Pipeline">
            {PIPELINES.map((p) => (
              <button key={p} role="tab" aria-selected={pipeline === p} onClick={() => { setPipeline(p); setPhoneCol(0); }}
                className={cn('h-9 shrink-0 rounded-lg px-3 text-sm font-semibold', pipeline === p ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-600 hover:text-gray-900 dark:text-gray-300')}>
                {MODULE_LABEL[p]}
              </button>
            ))}
          </div>
          <Select aria-label="Journey filter" className="w-60" value={journeyId} onChange={(e) => setJourneyId(e.target.value)}>
            <option value="">All automations</option>
            {journeys.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </Select>
          {plusTarget && <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">Now pick a block for the highlighted spot <button onClick={() => setPlusTarget(undefined)} aria-label="Cancel"><X className="h-3 w-3" /></button></span>}
          {!desktop && <Button className="ml-auto" onClick={() => setSheet(true)}><Layers className="h-4 w-4" /> Building blocks</Button>}
        </div>

        <div className="flex min-h-0 gap-4">
          {desktop && <div className="sticky top-4 flex max-h-[calc(100vh-180px)] self-start"><BuildingBlocksPanel {...panelProps} /></div>}
          <div className="min-w-0 flex-1">
            {!desktop && (
              <div className="mb-3 flex items-center justify-between gap-2">
                <Button size="icon" disabled={phoneCol === 0} onClick={() => setPhoneCol((c) => c - 1)} aria-label="Previous stage"><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm font-semibold">{stages[phoneCol]?.label} <span className="text-gray-500">({phoneCol + 1} of {stages.length})</span></span>
                <Button size="icon" disabled={phoneCol >= stages.length - 1} onClick={() => setPhoneCol((c) => c + 1)} aria-label="Next stage"><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
            <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar" aria-label={`${MODULE_LABEL[pipeline]} stages`}>
              {shownColumns.map(({ st, autos }) => {
                const stuck = stuckSettingFor(s, pipeline, st.value);
                const builtIns = BUILT_INS.filter((b) => b.module === pipeline && b.stage === st.value);
                return (
                  <section key={st.value} id={`stage-${st.value}`} className={cn('flex shrink-0 flex-col gap-3 rounded-2xl bg-gray-100/70 p-3 dark:bg-gray-900/60', desktop ? 'w-[300px]' : 'w-full')} aria-label={`When ${article(RECORD_NOUN[pipeline])} reaches ${st.label}`}>
                    <header>
                      <div className="text-xs text-gray-500">When {article(RECORD_NOUN[pipeline])} reaches</div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: st.colour }} aria-hidden />{st.label}</h3>
                        <span className="text-xs text-gray-500">{autos.length} {autos.length === 1 ? 'automation' : 'automations'}</span>
                      </div>
                      {!st.terminal && (
                        <button type="button" onClick={() => perms.manage && setStuckEdit(st.value)} disabled={!perms.manage}
                          className={cn('mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs', stuck?.enabled ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' : 'bg-gray-200/70 text-gray-500', perms.manage && 'hover:ring-1 hover:ring-amber-300')}
                          title="Stuck alert: if a record sits in this stage longer, someone is told.">
                          <AlarmClock className="h-3 w-3" />{stuck?.enabled ? `Alert after ${hours(stuck.hours)}${stuck.from !== 'STAGE_ENTRY' ? ` past the ${stuck.from === 'appointmentAt' ? 'appointment' : stuck.from === 'startDate' ? 'start date' : 'planned end'}` : ''}` : 'No stuck alert'}
                        </button>
                      )}
                    </header>
                    {builtIns.map((b) => (
                      <div key={b.label} className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/60">
                        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span><span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Done by Estimate Master</span>{b.label}</span>
                      </div>
                    ))}
                    {active?.kind === 'group' && <DropZone target={{ kind: 'groupSlot', pipeline, stage: st.value, index: 0 }} compact />}
                    {autos.map((a, gi) => (
                      <div key={a.id}>
                        <GroupCard automation={a} pending={pending?.automationId === a.id ? pending : undefined} journeyName={journeys.find((j) => j.id === a.journeyId)?.name}
                          collapsed={!!s.ui.collapsed[a.id]} onCollapse={(v) => setUi({ collapsed: { [a.id]: v } })}
                          onSelectStep={(stepId) => { setPending(undefined); setSelected({ automationId: a.id, stepId }); }}
                          selectedStepId={selected?.automationId === a.id ? selected.stepId : undefined}
                          onPlus={(index) => setPlusTarget({ kind: 'zone', automationId: a.id, index })} plusTarget={plusTarget}
                          onToggle={(on) => actions.toggle(a, on)} menu={actions.items(a)} names={names} canManage={perms.manage}
                          onApprove={() => setApprove([a.id])} problems={s.runs.filter((r) => r.automationId === a.id && r.status === 'FAILED')} />
                        {active?.kind === 'group' && <DropZone target={{ kind: 'groupSlot', pipeline, stage: st.value, index: gi + 1 }} compact />}
                      </div>
                    ))}
                    {pending && !pending.automationId && pending.stage === st.value && pending.pipeline === pipeline && (
                      <div className="rounded-xl border-2 border-dashed border-amber-300 bg-white p-3 text-sm dark:bg-gray-800">
                        <div className="font-semibold">New automation</div>
                        <PendingCard step={pending.step} />
                      </div>
                    )}
                    {perms.manage && (
                      <div onClick={() => { if (active) return; if (plusTarget) setPlusTarget(undefined); after(createForStage(pipeline, st.value, [], undefined, journeyId || undefined), `New automation added to ${st.label}`); }} className="cursor-pointer"
                        role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); after(createForStage(pipeline, st.value, [], undefined, journeyId || undefined), `New automation added to ${st.label}`); } }}>
                        <DropZone target={{ kind: 'new', pipeline, stage: st.value }} highlighted={plusTarget?.kind === 'new' && plusTarget.stage === st.value && plusTarget.pipeline === pipeline}
                          label={<span className="inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> New automation for this stage</span>} />
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
        <BlockDragOverlay active={active} />
      </DndContext>

      {/* Phones: Building blocks as a bottom sheet, tap to add. */}
      {sheet && !desktop && (
        <div className="fixed inset-0 z-[90] flex items-end bg-gray-900/40" onClick={() => setSheet(false)}>
          <div className="max-h-[80vh] w-full overflow-hidden rounded-t-2xl bg-white dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-2"><span className="font-bold">Building blocks</span><button onClick={() => setSheet(false)} aria-label="Close"><X className="h-5 w-5" /></button></div>
            <div className="flex max-h-[70vh]"><BuildingBlocksPanel {...panelProps} sheet onPick={(i) => { setSheet(false); onPick(i); }} /></div>
          </div>
        </div>
      )}

      {/* "Add to which stage?" */}
      <AddWherePopover item={pick} pipeline={pipeline} journeyId={journeyId} onClose={() => setPick(undefined)} onChoose={(t) => { const i = pick!; setPick(undefined); applyDrop(i, t); }} />

      {/* Step settings */}
      <Drawer open={!!editStep && !!panelPlace} onOpenChange={(o) => !o && closePanel()} width="max-w-xl"
        title={pending ? 'Finish setup' : 'Step settings'}
        subtitle={panelPlace ? `${MODULE_LABEL[panelPlace.pipeline]} › ${stageLabel(panelPlace.pipeline, panelPlace.stage)}${selAuto ? ` · ${selAuto.name}` : ''}` : undefined}
        footer={<>
          {!pending && selAuto && perms.manage && <Button variant="danger" className="mr-auto" onClick={() => { after(removeStep(selAuto.id, selStep!.id), 'Step removed'); closePanel(); }}><Trash2 className="h-4 w-4" /> Remove step</Button>}
          <Button onClick={closePanel}>Cancel</Button>
          {perms.manage && <Button variant="primary" onClick={done}>Done</Button>}
        </>}>
        {editStep && panelPlace && (
          <StepSettingsForm step={editStep} onChange={setEditStep} problems={showProblems ? panelProblems : []}
            ctx={{ pipeline: panelPlace.pipeline, stage: panelPlace.stage, readOnly: !perms.manage, onNewMessage: (channel, cb) => newMessage(channel, cb) }} />
        )}
        {pending && <p className="mt-4 text-xs text-gray-500">Saved when you press Done. Cancel removes it.</p>}
      </Drawer>

      <MessageEditor open={!!msgEditor} messageId={msgEditor?.id} channel={msgEditor?.channel} start={msgEditor?.start} onClose={() => setMsgEditor(undefined)} onSaved={(id) => msgEditor?.onSaved?.(id)} />
      <DeleteMessageModal id={deleteMsg} onClose={() => setDeleteMsg(undefined)} remove={msgActions.remove} />
      <DeployModal open={!!approve} ids={approve ?? []} onClose={() => setApprove(undefined)} />
      {useTpl && <UseTemplateModal templateId={useTpl.templateId} placeAt={{ pipeline: useTpl.pipeline, stage: useTpl.stage }} onClose={() => setUseTpl(undefined)} />}
      <StuckAlertModal pipeline={pipeline} stage={stuckEdit} onClose={() => setStuckEdit(undefined)} />
      {actions.modals}
      <span className="sr-only">{allTemplates({ templates: templatesState } as never).length} templates available</span>
    </DragStateContext.Provider>
  );
}

const article = (noun: string) => (/^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`);

/* ---------- One automation group ---------- */

function GroupCard({ automation: a, pending, journeyName, collapsed, onCollapse, onSelectStep, selectedStepId, onPlus, plusTarget, onToggle, menu, names, canManage, onApprove, problems }: {
  automation: Automation; pending?: Pending; journeyName?: string; collapsed: boolean; onCollapse: (v: boolean) => void;
  onSelectStep: (id: string) => void; selectedStepId?: string; onPlus: (index: number) => void; plusTarget?: DropTarget;
  onToggle: (on: boolean) => void; menu: Parameters<typeof RowMenu>[0]['items']; names: ReturnType<typeof useNames>; canManage: boolean; onApprove: () => void;
  problems: { id: string; steps: { stepId: string; status: string }[]; cursor: number }[];
}) {
  const drag = useDraggable({ id: dragId({ kind: 'group', automationId: a.id }), data: { item: { kind: 'group', automationId: a.id } as DragItem }, disabled: !canManage });
  const p = boardPlacement(a.trigger);
  const vars = variablesFor(p.pipeline, p.stage);
  const failedSteps = new Set(problems.map((r) => r.steps[r.cursor]?.stepId).filter(Boolean));
  return (
    <article className={cn('rounded-2xl border bg-white shadow-sm dark:bg-gray-800', a.isEnabled ? 'border-gray-200 dark:border-gray-700' : 'border-dashed border-gray-300 dark:border-gray-600', drag.isDragging && 'opacity-40')}>
      <header className="flex items-start gap-1.5 border-b border-gray-100 px-2.5 py-2 dark:border-gray-700">
        <button type="button" ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} aria-label={`Drag ${a.name} to change the order`} className={cn('mt-0.5 rounded p-0.5 text-gray-400', canManage ? 'cursor-grab hover:text-gray-700' : 'cursor-default')}>
          <GripHorizontal className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => onCollapse(!collapsed)} aria-expanded={!collapsed} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-1 text-sm font-bold text-gray-900 dark:text-white">
            {collapsed ? <ChevronRight className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
            {p.timed && <Clock className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-label="Time-based" />}
            <span className="truncate">{a.name}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap gap-1">
            {journeyName && <Badge tone="gray">{journeyName}</Badge>}
            {!a.deployedAt && <Badge tone="gray">Not deployed</Badge>}
            {a.needsReapproval && <Badge tone="amber">Waiting for approval</Badge>}
            {a.templateUpdated && <Badge tone="blue">Template updated</Badge>}
            {problems.length > 0 && <Badge tone="red">{problems.length} failed</Badge>}
          </span>
        </button>
        <Switch checked={a.isEnabled} onCheckedChange={onToggle} disabled={!canManage} label={<span className="sr-only">{a.isEnabled ? 'On' : 'Off'}</span>} />
        <RowMenu label={`Actions for ${a.name}`} items={menu} />
      </header>
      {!collapsed && (
        <div className="px-2.5 py-2">
          <p className="mb-1 text-xs text-gray-500">{a.summary}</p>
          {a.needsReapproval && canManage && <button type="button" onClick={onApprove} className="mb-1 text-xs font-semibold text-amber-800 hover:underline">The old version runs until approved. Review and approve</button>}
          <DropZone target={{ kind: 'zone', automationId: a.id, index: 0 }} onPlus={canManage ? () => onPlus(0) : undefined} highlighted={plusTarget?.kind === 'zone' && plusTarget.automationId === a.id && plusTarget.index === 0} />
          {a.steps.map((st, i) => (
            <div key={st.id}>
              {pending && pending.index === i && <PendingCard step={pending.step} />}
              <StepCard automationId={a.id} step={st} n={i + 1} names={names} onClick={() => onSelectStep(st.id)} selected={selectedStepId === st.id} vars={vars} problem={failedSteps.has(st.id) ? 'Failed recently' : undefined} canManage={canManage} />
              <DropZone target={{ kind: 'zone', automationId: a.id, index: i + 1 }} onPlus={canManage ? () => onPlus(i + 1) : undefined} highlighted={plusTarget?.kind === 'zone' && plusTarget.automationId === a.id && plusTarget.index === i + 1} />
            </div>
          ))}
          {pending && pending.index >= a.steps.length && <PendingCard step={pending.step} />}
          {a.steps.length === 0 && !pending && <p className="py-1 text-center text-xs text-gray-400">No steps yet. Drop a block here.</p>}
        </div>
      )}
    </article>
  );
}

function PendingCard({ step }: { step: AutomationStep }) {
  const def = stepDef(step.type);
  return (
    <div className="my-1 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-2 text-sm dark:bg-amber-900/20">
      <Icon name={def?.icon ?? 'Circle'} className="mt-0.5" />
      <span><span className="font-semibold">{def?.title}</span><span className="mt-1 block"><Badge tone="amber">Finish setup</Badge></span></span>
    </div>
  );
}

function StepCard({ automationId, step, n, names, onClick, selected, vars, problem, canManage }: {
  automationId: string; step: AutomationStep; n: number; names: ReturnType<typeof useNames>; onClick: () => void; selected: boolean; vars: string[]; problem?: string; canManage: boolean;
}) {
  const def = stepDef(step.type);
  const drag = useDraggable({ id: dragId({ kind: 'card', automationId, stepId: step.id }), data: { item: { kind: 'card', automationId, stepId: step.id } as DragItem }, disabled: !canManage });
  const detail = stepPhrase(step, names);
  return (
    <div ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} role="button" tabIndex={0} aria-roledescription="Step" onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onClick(); } else drag.listeners?.onKeyDown?.(e); }}
      className={cn('flex items-start gap-2 rounded-xl border bg-white px-2.5 py-2 text-left transition-colors dark:bg-gray-800', selected ? 'border-primary-400 ring-2 ring-primary-100' : 'border-gray-200 hover:border-primary-300 dark:border-gray-700',
        canManage ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer', drag.isDragging && 'opacity-40', 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400')}>
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-200">{n}</span>
      <Icon name={def?.icon ?? 'Circle'} className="mt-0.5 shrink-0 text-gray-600 dark:text-gray-300" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900 dark:text-white">{def?.title ?? 'Removed step'}</span>
        <span className="block text-xs text-gray-500">{detail.replace(/^./, (x) => x.toUpperCase())}</span>
        <StepBadges step={step} problem={problem ?? (!def ? 'Removed' : undefined)} variables={vars} />
      </span>
    </div>
  );
}

/* ---------- "Add to which stage?" ---------- */

function AddWherePopover({ item, pipeline, journeyId, onClose, onChoose }: { item?: DragItem; pipeline: PipelineModule; journeyId: string; onClose: () => void; onChoose: (t: DropTarget) => void }) {
  const automations = useAuto((s) => s.automations);
  const ctx = useDropContext();
  const [p, setP] = useState(pipeline);
  useEffect(() => setP(pipeline), [pipeline, item]);
  if (!item) return null;
  const autos = automations.filter((a) => !a.isDeleted && !a.isArchived && boardPlacement(a.trigger).pipeline === p && (!journeyId || a.journeyId === journeyId));
  const option = (t: DropTarget, label: ReactNode) => {
    const v = canDrop(item, t, ctx);
    return (
      <li key={targetId(t)}>
        <button type="button" disabled={!v.ok} onClick={() => onChoose(t)} className={cn('w-full rounded-lg px-3 py-2 text-left text-sm', v.ok ? 'hover:bg-primary-50' : 'cursor-not-allowed text-gray-400')}>
          {label}{!v.ok && <span className="block text-xs text-red-700">{v.reason}</span>}
        </button>
      </li>
    );
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Add to which stage?" size="md">
      <Select aria-label="Pipeline" className="mb-3 w-56" value={p} onChange={(e) => setP(e.target.value as PipelineModule)}>
        {PIPELINES.map((x) => <option key={x} value={x}>{MODULE_LABEL[x]}</option>)}
      </Select>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto">
        {stagesOf(p).map((st) => {
          const inStage = autos.filter((a) => boardPlacement(a.trigger).stage === st.value).sort((x, y) => x.runOrder - y.runOrder);
          return (
            <div key={st.value}>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: st.colour }} />{st.label}</div>
              <ul className="space-y-0.5">
                {item.kind !== 'template' && inStage.map((a) => option({ kind: 'zone', automationId: a.id, index: a.steps.length }, <>Add to <span className="font-semibold">{a.name}</span> (at the end)</>))}
                {option({ kind: 'new', pipeline: p, stage: st.value }, <span className="inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> New automation for this stage</span>)}
              </ul>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/* ---------- Stuck alert editor ---------- */

function StuckAlertModal({ pipeline, stage, onClose }: { pipeline: PipelineModule; stage?: string; onClose: () => void }) {
  const s = useAuto((x) => x);
  const current = stage ? stuckSettingFor(s, pipeline, stage) : undefined;
  const def = stage ? STUCK_ALERT_DEFAULTS[pipeline]?.[stage] : undefined;
  const [value, setValue] = useState(0);
  const [unit, setUnit] = useState<'HOURS' | 'DAYS'>('DAYS');
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!stage) return;
    const h = current?.hours ?? 72;
    setUnit(h % 24 === 0 ? 'DAYS' : 'HOURS');
    setValue(h % 24 === 0 ? h / 24 : h);
    setOn(current?.enabled ?? true);
  }, [stage, current?.hours, current?.enabled]);
  if (!stage) return null;
  const save = () => {
    const h = unit === 'DAYS' ? value * 24 : value;
    if (on && (!Number.isFinite(h) || h < 1 || h > 365 * 24)) return toast.error('Check the time', 'Use 1 hour to 365 days.');
    const r = setStuckAlert(pipeline, stage, { hours: h, enabled: on }, current ?? { hours: h, from: def?.from ?? 'STAGE_ENTRY', enabled: on });
    if (!r.ok) return toast.error('Not saved', r.error);
    toast.success(on ? 'Stuck alert saved' : 'Stuck alert turned off');
    onClose();
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`Stuck alert: ${stageLabel(pipeline, stage)}`}
      description="If a record sits in this stage longer than this, its assigned person is told (or the business owner if nobody is assigned). It repeats once a day, up to 3 times."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-3">
        <Switch checked={on} onCheckedChange={setOn} label="Alert for this stage" />
        {on && (
          <div className="flex items-end gap-2">
            <Field label="Alert after" htmlFor="sa-v"><Input id="sa-v" type="number" min={1} className="w-24" value={value} onChange={(e) => setValue(Number(e.target.value))} /></Field>
            <Select aria-label="Unit" className="w-28" value={unit} onChange={(e) => setUnit(e.target.value as 'HOURS' | 'DAYS')}><option value="HOURS">hours</option><option value="DAYS">days</option></Select>
          </div>
        )}
        {def && <p className="text-xs text-gray-500">Recommended: {hours(def.hours)}{def.from !== 'STAGE_ENTRY' ? ` after the ${def.from === 'appointmentAt' ? 'appointment date' : def.from === 'startDate' ? 'start date' : 'planned end date'}` : ''}. Commercial journeys double it.</p>}
      </div>
    </Modal>
  );
}

/* ---------- Delete a message from the panel ---------- */

export function DeleteMessageModal({ id, onClose, remove }: { id?: string; onClose: () => void; remove: (id: string, replaceWith?: string) => void }) {
  const library = useLibrary();
  const automations = useAuto((s) => s.automations);
  const { del } = usePerms();
  const [replaceWith, setReplaceWith] = useState('');
  const m = library.find((x) => x.id === id);
  if (!id || !m) return null;
  const users = automations.filter((a) => !a.isDeleted && a.steps.some((st) => st.config.messageId === id));
  const go = () => {
    if (!del) return toast.error('Not deleted', 'You need permission to delete messages.');
    if (users.length && !replaceWith) return toast.error('Pick a replacement', 'A message in use needs a replacement so no automation points at nothing.');
    remove(id, replaceWith || undefined);
    toast.success('Message deleted', users.length ? `${users.length} ${users.length === 1 ? 'automation now uses' : 'automations now use'} the replacement.` : undefined);
    onClose();
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`Delete "${m.name}"?`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger-solid" onClick={go} disabled={!del || (users.length > 0 && !replaceWith)}>{users.length ? 'Replace and delete' : 'Delete'}</Button></>}>
      {users.length === 0 ? <p className="text-sm">No automation uses this message.</p> : (
        <div className="space-y-3 text-sm">
          <p>These automations use it:</p>
          <ul className="list-disc pl-5">{users.map((a) => <li key={a.id}>{a.name}</li>)}</ul>
          <Field label="Replace with another message" htmlFor="dm-rep" required>
            <Select id="dm-rep" value={replaceWith} onChange={(e) => setReplaceWith(e.target.value)}>
              <option value="">Choose…</option>
              {library.filter((x) => x.id !== id && x.channel === m.channel).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </Field>
          {users.some((a) => a.deployedAt) && <p className="text-xs text-amber-700">Deployed automations need approval for the replacement before they use it.</p>}
        </div>
      )}
    </Modal>
  );
}
