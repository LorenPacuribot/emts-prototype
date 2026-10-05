'use client';

/*
  The full editor (spec 6.4). A form that reads like a sentence: When, Only
  if (optional), Then. The Building blocks panel is on the left; drops change
  the draft, and nothing is saved until Save (no autosave). Save runs the
  checks; problems show in red on the card that has them. A deployed
  automation whose customer-facing steps change asks for approval again and
  keeps running its old version until then. Changes apply to new runs only.

  The same editor edits a template (template mode, with a gray banner).
*/
import { useEffect, useMemo, useState } from 'react';
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core';
import { AlertCircle, ArrowLeft, FlaskConical, Trash2 } from 'lucide-react';
import type { Automation, AutomationStep, AutomationTrigger, PipelineModule } from '@/lib/automations/types';
import {
  MODULE_LABEL, PIPELINES, RECORD_NOUN, TRIGGERS, boardPlacement, pipelineOf, stepDef, triggerDef, variablesFor,
} from '@/lib/automations/registry';
import { summarize, stepPhrase } from '@/lib/automations/summary';
import { validateAutomation, type Problem } from '@/lib/automations/validation';
import { canDrop, defaultConfig, type DragItem, type DropTarget } from '@/lib/automations/drop-rules';
import {
  allTemplates, applyTemplateUpdate, changesCustomerFacing, dismissTemplateUpdate, newStepId, samplesUsed, updateAutomation, updateTemplate, useAuto,
} from '@/lib/automations/store';
import { useDb as useFeatureDb } from '@/features/lib/store';
import { AppLink, useNav } from '@/features/lib/navigation';
import { toast } from '@/features/lib/toast';
import { Badge, Banner, Button, Drawer, Field, Input, RowMenu, Select, Switch } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { useLibrary, useMessageActions, useNames, usePerms } from './hooks';
import { BuildingBlocksPanel } from './building-blocks/building-blocks-panel';
import { DropZone } from './building-blocks/drop-zone';
import { BlockDragOverlay } from './building-blocks/drag-overlay';
import { DragStateContext, useDropContext } from './building-blocks/use-drop-rules';
import { ConditionsEditor, RegistryInput, StepSettingsForm } from './StepSettings';
import { MessageEditor } from './MessageEditor';
import { useAutomationActions } from './actions';
import { DeployModal } from './modals';
import { ActivityTab } from './ActivityTab';
import { useMediaQuery } from './BoardTab';
import { CARD, Icon, StepBadges } from './shared';

export interface EditorDraft {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  conditions: Automation['conditions'];
  steps: AutomationStep[];
  journeyId?: string;
  keepGoingIfStageChanges?: boolean;
}

function SentenceLine() {
  return <div className="ml-6 h-5 w-px bg-gray-300 dark:bg-gray-600" aria-hidden />;
}

/** The When / Only if / Then form with drag and drop. Shared by automations and templates. */
function EditorBody({ draft, setDraft, problems, readOnly, onNewMessage }: {
  draft: EditorDraft; setDraft: (d: EditorDraft) => void; problems: Problem[]; readOnly: boolean; onNewMessage: (ch: 'EMAIL' | 'SMS', cb: (id: string) => void) => void;
}) {
  const names = useNames();
  const desktop = useMediaQuery('(min-width: 768px)');
  const extra = useMemo(() => [{ ...draft, summary: '', runOrder: 0, isEnabled: false, needsReapproval: false, isArchived: false, isDeleted: false, runsLast7Days: 0, problemCount: 0, createdBy: '', updatedBy: '', createdAt: '', updatedAt: '' } as Automation], [draft]);
  const ctx = useDropContext(extra);
  const fdb = useFeatureDb((d) => d);
  const [active, setActive] = useState<DragItem>();
  const [selected, setSelected] = useState<string>();
  const [showOnly, setShowOnly] = useState(draft.conditions.length > 0);
  const [plus, setPlus] = useState<number>();
  const place = boardPlacement(draft.trigger);
  const pipeline = place.pipeline;
  const vars = variablesFor(place.pipeline, place.stage);
  const tdef = triggerDef(draft.trigger.type);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }), useSensor(KeyboardSensor));
  const collision: CollisionDetection = (args) => { const p = pointerWithin(args); return p.length ? p : rectIntersection(args); };

  const setSteps = (steps: AutomationStep[]) => setDraft({ ...draft, steps: steps.map((s, i) => ({ ...s, order: i })) });
  const make = (type: string, config: Record<string, unknown>): AutomationStep => ({ id: newStepId(), order: 0, type, mode: stepDef(type)?.mode === 'ASK_BY_DEFAULT' ? 'ASK' : 'AUTO', conditions: [], config: { ...defaultConfig(type, { financialSettings: fdb.financialSettings }), ...config } });
  const drop = (item: DragItem, target: DropTarget) => {
    const v = canDrop(item, target, ctx);
    if (!v.ok) return toast.error('Can’t go there', v.reason);
    if (target.kind === 'when' && item.kind === 'stage') return setDraft({ ...draft, trigger: { type: 'STAGE_ENTERED', module: item.pipeline, config: { stage: item.stage } } });
    if (target.kind !== 'zone') return;
    const at = target.index;
    let step: AutomationStep | undefined;
    if (item.kind === 'step') step = make(item.type, {});
    if (item.kind === 'message') step = make(item.channel === 'SMS' ? 'SEND_TEXT' : 'SEND_EMAIL', { messageId: item.id });
    if (item.kind === 'stage') step = make(item.pipeline === 'LEAD' ? 'MOVE_LEAD_STAGE' : 'MOVE_JOB_STAGE', { stage: item.stage });
    if (item.kind === 'card') {
      const old = draft.steps.findIndex((s) => s.id === item.stepId);
      const moving = draft.steps[old]!;
      const rest = draft.steps.filter((s) => s.id !== item.stepId);
      rest.splice(at > old ? at - 1 : at, 0, moving);
      return setSteps(rest);
    }
    if (!step) return;
    const steps = [...draft.steps];
    steps.splice(at, 0, step);
    setSteps(steps);
    setSelected(step.id);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const item = (e.active.data.current as { item: DragItem } | undefined)?.item;
    const target = (e.over?.data.current as { target: DropTarget } | undefined)?.target;
    setActive(undefined);
    if (item && target) drop(item, target);
  };
  const onPick = (item: DragItem) => {
    if (item.kind === 'stage' && plus === undefined) return drop(item, { kind: 'when', automationId: draft.id });
    drop(item, { kind: 'zone', automationId: draft.id, index: plus ?? draft.steps.length });
    setPlus(undefined);
  };
  const sel = draft.steps.find((s) => s.id === selected);
  const stepProblems = (id: string) => problems.filter((p) => p.where === id);

  return (
    <DragStateContext.Provider value={{ active, ctx }}>
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={(e) => setActive((e.active.data.current as { item: DragItem }).item)} onDragEnd={onDragEnd} onDragCancel={() => setActive(undefined)}>
        <div className="flex gap-4">
          {!readOnly && desktop && <div className="sticky top-4 flex max-h-[calc(100vh-160px)] self-start"><BuildingBlocksPanel pipeline={pipeline} onPick={onPick} dragEnabled={desktop} /></div>}
          <div className="min-w-0 max-w-3xl flex-1">
            {/* When */}
            <section className={cn(CARD, 'p-4')} aria-label="When">
              <div className="mb-3 text-xs font-bold uppercase tracking-wider text-primary-700">When</div>
              <DropZone target={{ kind: 'when', automationId: draft.id }} disabled={readOnly}>
                <div className="grid gap-3 p-1 text-left sm:grid-cols-2">
                  <Field label="Record" htmlFor="ed-module">
                    <Select id="ed-module" value={draft.trigger.module} disabled={readOnly} onChange={(e) => {
                      const m = e.target.value as AutomationTrigger['module'];
                      const t = triggerDef(draft.trigger.type)?.modules.includes(m) ? draft.trigger.type : TRIGGERS.find((x) => x.modules.includes(m))!.type;
                      setDraft({ ...draft, trigger: { type: t, module: m, config: {} } });
                    }}>
                      {[...PIPELINES, 'CALENDAR' as const].map((p) => <option key={p} value={p}>{p === 'CALENDAR' ? 'An appointment' : `A ${RECORD_NOUN[p]}`}</option>)}
                    </Select>
                  </Field>
                  <Field label="What happens" htmlFor="ed-trigger">
                    <Select id="ed-trigger" value={draft.trigger.type} disabled={readOnly} onChange={(e) => {
                      const d = triggerDef(e.target.value)!;
                      const config: Record<string, unknown> = {};
                      for (const f of d.fields) if (f.defaultValue !== undefined) config[f.key] = f.defaultValue;
                      setDraft({ ...draft, trigger: { type: d.type, module: draft.trigger.module, config } });
                    }}>
                      {TRIGGERS.filter((t) => t.modules.includes(draft.trigger.module)).map((t) => <option key={t.type} value={t.type}>{t.title}{t.backendGap ? ' (needs backend)' : ''}</option>)}
                    </Select>
                  </Field>
                  {tdef?.fields.map((f) => (
                    <RegistryInput key={f.key} field={f} value={draft.trigger.config[f.key]} config={draft.trigger.config} idPrefix="ed-t" error={problems.find((p) => p.where === 'trigger' && p.field === f.key)?.message}
                      onChange={(v) => setDraft({ ...draft, trigger: { ...draft.trigger, config: { ...draft.trigger.config, [f.key]: v } } })} ctx={{ pipeline: pipelineOf(draft.trigger.module), readOnly }} />
                  ))}
                </div>
              </DropZone>
              {tdef?.backendGap && <p className="mt-2 text-xs text-amber-700">{tdef.backendGap}</p>}
              {!readOnly && <p className="mt-2 text-xs text-gray-500">Tip: drop a stage here to start when a record reaches it.</p>}
            </section>
            <SentenceLine />
            {/* Only if */}
            <section className={cn(CARD, 'p-4')} aria-label="Only if">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-primary-700">Only if <span className="font-normal normal-case text-gray-500">(optional)</span></div>
              {showOnly || draft.conditions.length ? (
                <ConditionsEditor conditions={draft.conditions} onChange={(c) => setDraft({ ...draft, conditions: c })} pipeline={pipeline} stage={place.stage} readOnly={readOnly} idPrefix="ed-c" />
              ) : !readOnly ? <button type="button" className="text-sm font-semibold text-primary-700 hover:underline" onClick={() => setShowOnly(true)}>Add a condition</button> : <p className="text-sm text-gray-500">No conditions.</p>}
              <p className="mt-2 text-xs text-gray-500">All conditions must be true.</p>
            </section>
            <SentenceLine />
            {/* Then */}
            <section className={cn(CARD, 'p-4')} aria-label="Then">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-primary-700">Then</div>
              {problems.filter((p) => p.where === 'steps').map((p) => <p key={p.message} className="mb-2 text-sm text-red-700">{p.message}</p>)}
              <DropZone target={{ kind: 'zone', automationId: draft.id, index: 0 }} onPlus={readOnly ? undefined : () => setPlus(0)} highlighted={plus === 0} disabled={readOnly} />
              {draft.steps.map((st, i) => {
                const def = stepDef(st.type);
                const errs = stepProblems(st.id);
                return (
                  <div key={st.id}>
                    <button type="button" onClick={() => setSelected(st.id)} className={cn('flex w-full items-start gap-2 rounded-xl border bg-white px-3 py-2 text-left dark:bg-gray-800', errs.length ? 'border-red-300' : selected === st.id ? 'border-primary-400 ring-2 ring-primary-100' : 'border-gray-200 hover:border-primary-300 dark:border-gray-700')}>
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold dark:bg-gray-700">{i + 1}</span>
                      <Icon name={def?.icon ?? 'Circle'} className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{def?.title ?? 'Removed step'}</span>
                        <span className="block text-xs text-gray-500">{stepPhrase(st, names).replace(/^./, (x) => x.toUpperCase())}</span>
                        <StepBadges step={st} variables={vars} />
                        {errs.map((p) => <span key={p.message} className="mt-1 flex items-start gap-1 text-xs text-red-700"><AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />{p.message}</span>)}
                      </span>
                    </button>
                    <DropZone target={{ kind: 'zone', automationId: draft.id, index: i + 1 }} onPlus={readOnly ? undefined : () => setPlus(i + 1)} highlighted={plus === i + 1} disabled={readOnly} />
                  </div>
                );
              })}
              {draft.steps.length === 0 && <p className="text-center text-sm text-gray-500">No steps yet. Drag one from Building blocks, or click a block.</p>}
              {plus !== undefined && <p className="mt-2 text-xs font-semibold text-primary-700">Now click a block to put it at the highlighted spot.</p>}
            </section>
            <div className="mt-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={readOnly} checked={!!draft.keepGoingIfStageChanges} onChange={(e) => setDraft({ ...draft, keepGoingIfStageChanges: e.target.checked })} /> Keep going even if the stage changes</label>
              <p className="ml-6 text-xs text-gray-500">Without this, a run waiting on a step stops (Skipped) when the record leaves the stage that started it.</p>
            </div>
          </div>
        </div>
        <BlockDragOverlay active={active} />
      </DndContext>
      <Drawer open={!!sel} onOpenChange={(o) => !o && setSelected(undefined)} width="max-w-xl" title="Step settings"
        footer={<>
          {!readOnly && <Button variant="danger" className="mr-auto" onClick={() => { setSteps(draft.steps.filter((s) => s.id !== selected)); setSelected(undefined); }}><Trash2 className="h-4 w-4" /> Remove step</Button>}
          <Button variant="primary" onClick={() => setSelected(undefined)}>Done</Button>
        </>}>
        {sel && <StepSettingsForm step={sel} onChange={(s) => setSteps(draft.steps.map((x) => (x.id === s.id ? s : x)))} problems={stepProblems(sel.id)} ctx={{ pipeline, stage: place.stage, readOnly, onNewMessage }} />}
        <p className="mt-4 text-xs text-gray-500">Changes are kept in the editor until you press Save.</p>
      </Drawer>
    </DragStateContext.Provider>
  );
}

function SaveBar({ dirty, onDiscard, onSave, note }: { dirty: boolean; onDiscard: () => void; onSave: () => void; note: string }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-3 z-20 mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-primary-200 bg-white px-4 py-3 shadow-xl dark:bg-gray-800">
      <div><div className="font-semibold">You have unsaved changes</div><div className="text-xs text-gray-500">{note}</div></div>
      <div className="ml-auto flex gap-2"><Button onClick={onDiscard}>Discard</Button><Button variant="primary" onClick={onSave}>Save</Button></div>
    </div>
  );
}

/* ---------- Automation editor page ---------- */

export function AutomationEditorPage({ id, tab }: { id: string; tab?: string }) {
  const a = useAuto((s) => s.automations.find((x) => x.id === id));
  const all = useAuto((s) => s.automations);
  const journeys = useAuto((s) => s.journeys);
  const templates = useAuto((s) => s.templates);
  const s = useAuto((x) => x);
  const names = useNames();
  const library = useLibrary();
  const msg = useMessageActions();
  const perms = usePerms();
  const nav = useNav();
  const actions = useAutomationActions();
  const toDraft = (x: Automation): EditorDraft => JSON.parse(JSON.stringify({ id: x.id, name: x.name, trigger: x.trigger, conditions: x.conditions, steps: x.steps, journeyId: x.journeyId, keepGoingIfStageChanges: x.keepGoingIfStageChanges }));
  const [draft, setDraft] = useState<EditorDraft | undefined>(a ? toDraft(a) : undefined);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [approve, setApprove] = useState(false);
  const [msgEditor, setMsgEditor] = useState<{ channel: 'EMAIL' | 'SMS'; cb: (id: string) => void }>();
  const [view, setView] = useState<'edit' | 'activity'>(tab === 'activity' ? 'activity' : 'edit');
  useEffect(() => { if (a && !draft) setDraft(toDraft(a)); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.id, draft]);
  const dirty = !!a && !!draft && JSON.stringify(toDraft(a)) !== JSON.stringify(draft);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  if (!a || a.isDeleted || !draft) {
    return <div className={cn(CARD, 'p-8 text-center')}><p className="mb-3 font-semibold">{a?.isDeleted ? 'This automation was deleted. Its past activity stays in Activity.' : 'Automation not found.'}</p><AppLink href="/automations?tab=all" className="text-primary-700 hover:underline">Back to all automations</AppLink></div>;
  }
  const template = allTemplates({ templates } as never).find((t) => t.id === a.templateId);
  const place = boardPlacement(draft.trigger);
  const save = () => {
    const others = all.filter((x) => !x.isDeleted && x.id !== a.id);
    const p = validateAutomation(draft, { otherNames: others.map((x) => x.name), variables: variablesFor(place.pipeline, place.stage), othersInStage: others.filter((x) => { const q = boardPlacement(x.trigger); return q.pipeline === place.pipeline && q.stage === place.stage; }).length });
    setProblems(p);
    if (p.length) return toast.error('Not saved', `${p.length} ${p.length === 1 ? 'thing needs' : 'things need'} fixing. They are marked in red.`);
    const r = updateAutomation(a.id, draft);
    if (!r.ok) return toast.error('Not saved', r.error);
    toast.success('Saved', 'Changes apply to new runs. Runs already waiting keep their old steps.');
    if (r.value!.needsApproval) setApprove(true);
  };
  const facingChanged = a.deployedAt && changesCustomerFacing(a, draft);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <Button size="icon" variant="ghost" onClick={() => nav.push('/automations?tab=all')} aria-label="Back"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="min-w-0 flex-1">
          <input aria-label="Automation name" value={draft.name} disabled={!perms.manage} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={cn('w-full rounded-lg border border-transparent bg-transparent px-1 font-heading text-2xl font-bold text-gray-900 hover:border-gray-200 focus:border-primary-300 focus:outline-none dark:text-white', problems.some((p) => p.where === 'name') && 'border-red-300')} />
          {problems.filter((p) => p.where === 'name').map((p) => <p key={p.message} className="px-1 text-xs text-red-700">{p.message}</p>)}
          <p className="px-1 text-sm text-gray-600 dark:text-gray-300">{summarize(draft, names)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
            <Select aria-label="Journey" className="w-56" value={draft.journeyId ?? ''} disabled={!perms.manage} onChange={(e) => setDraft({ ...draft, journeyId: e.target.value || undefined })}>
              <option value="">Not in a journey</option>{journeys.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
            </Select>
            <Badge tone="gray">{MODULE_LABEL[place.pipeline]}</Badge>
            {!a.deployedAt && <Badge tone="gray">Not deployed</Badge>}
            {a.needsReapproval && <Badge tone="amber">Waiting for approval: the approved version is running</Badge>}
            {template && <Badge tone="gray">Made from {template.name}</Badge>}
            {a.templateUpdated && <Badge tone="blue">Template updated</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={a.isEnabled} onCheckedChange={(v) => actions.toggle(a, v)} disabled={!perms.manage || dirty} label={a.isEnabled ? 'On' : 'Off'} />
          <Button onClick={() => actions.openTest([a.id])}><FlaskConical className="h-4 w-4" /> Test run</Button>
          {a.needsReapproval && perms.deploy && <Button variant="primary" onClick={() => setApprove(true)}>Approve changes</Button>}
          <RowMenu label="More actions" items={actions.items(a, { inEditor: true })} />
        </div>
      </div>
      {a.templateUpdated && template && perms.manage && (
        <Banner tone="info" className="mb-4" title={`"${template.name}" was updated to version ${template.version}`}
          action={<div className="flex gap-2"><Button size="sm" onClick={() => dismissTemplateUpdate(a.id)}>Ignore</Button><Button size="sm" variant="primary" onClick={() => {
            const map = msg.copySamples(samplesUsed(template), library);
            const r = applyTemplateUpdate(a.id, map);
            if (!r.ok) return toast.error('Not applied', r.error);
            setDraft(undefined);
            toast.success('Template changes applied');
            if (r.value?.needsApproval) setApprove(true);
          }}>Apply</Button></div>}>
          See changes: it now has {template.automations[a.templateIndex ?? 0]?.steps.length ?? 0} steps ({template.automations[a.templateIndex ?? 0]?.steps.map((x) => stepDef(x.type)?.title).join(', ')}). Nothing changes until you press Apply.
        </Banner>
      )}
      <div className="mb-4 flex gap-1 border-b border-gray-200 dark:border-gray-700" role="tablist">
        {(['edit', 'activity'] as const).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-semibold', view === v ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500')}>{v === 'edit' ? 'Edit' : 'Activity'}</button>
        ))}
      </div>
      {view === 'activity' ? <ActivityTab initialAutomation={a.id} /> : (
        <>
          {!perms.manage && <Banner tone="info" className="mb-4" title="View only">You can see everything but not change it.</Banner>}
          <EditorBody draft={draft} setDraft={setDraft} problems={problems} readOnly={!perms.manage} onNewMessage={(channel, cb) => setMsgEditor({ channel, cb })} />
          <SaveBar dirty={dirty && perms.manage} onDiscard={() => { setDraft(toDraft(a)); setProblems([]); }} onSave={save}
            note={facingChanged ? 'A customer-facing step changed: saving asks for approval. Until then the approved version keeps running.' : 'Changes apply to new runs only. Runs already waiting keep their old steps.'} />
        </>
      )}
      <DeployModal open={approve} ids={[a.id]} onClose={() => setApprove(false)} />
      <MessageEditor open={!!msgEditor} channel={msgEditor?.channel} onClose={() => setMsgEditor(undefined)} onSaved={(mid) => msgEditor?.cb(mid)} />
      {actions.modals}
      <span className="sr-only">{s.automations.length}</span>
    </div>
  );
}

/* ---------- Template editor page ---------- */

export function TemplateEditorPage({ id }: { id: string }) {
  const templates = useAuto((s) => s.templates);
  const t = templates.find((x) => x.id === id && !x.isDeleted);
  const nav = useNav();
  const perms = usePerms();
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<EditorDraft[] | undefined>(t?.automations.map((a, i) => ({ id: `tpl_${i}`, name: a.name, trigger: a.trigger, conditions: a.conditions, steps: a.steps, keepGoingIfStageChanges: a.keepGoingIfStageChanges })));
  const [name, setName] = useState(t?.name ?? '');
  const [description, setDescription] = useState(t?.description ?? '');
  const [msgEditor, setMsgEditor] = useState<{ channel: 'EMAIL' | 'SMS'; cb: (id: string) => void }>();
  if (!t || !drafts) return <div className={cn(CARD, 'p-8 text-center')}><p className="mb-3 font-semibold">Template not found. System templates can't be edited; duplicate one to make your own copy.</p><AppLink href="/automations?tab=templates" className="text-primary-700 hover:underline">Back to templates</AppLink></div>;
  const save = () => {
    if (name.trim().length < 3) return toast.error('Name needed', 'Use at least 3 characters.');
    const r = updateTemplate(t.id, { name: name.trim(), description, automations: drafts.map((d) => ({ name: d.name, trigger: d.trigger, conditions: d.conditions, steps: d.steps, keepGoingIfStageChanges: d.keepGoingIfStageChanges })) });
    if (!r.ok) return toast.error('Not saved', r.error);
    toast.success('Template saved', 'Automations made from it show "Template updated" and change only if someone presses Apply.');
    nav.push('/automations?tab=templates');
  };
  const d = drafts[index]!;
  return (
    <div>
      <div className="mb-4 flex items-start gap-3">
        <Button size="icon" variant="ghost" onClick={() => nav.push('/automations?tab=templates')} aria-label="Back"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          <Field label="Template name" htmlFor="te-name"><Input id="te-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Description" htmlFor="te-desc"><Input id="te-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
        {perms.manage && <Button variant="primary" onClick={save}>Save template</Button>}
      </div>
      <Banner tone="info" className="mb-4">You are editing a template. Changes do not affect anything that is running.</Banner>
      {drafts.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1">{drafts.map((x, i) => <button key={x.id} onClick={() => setIndex(i)} className={cn('rounded-full border px-3 py-1 text-xs font-semibold', i === index ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600')}>{x.name}</button>)}</div>
      )}
      <Field label="Automation name" htmlFor="te-aname"><Input id="te-aname" className="mb-4 max-w-md" value={d.name} onChange={(e) => setDrafts(drafts.map((x, i) => (i === index ? { ...x, name: e.target.value } : x)))} /></Field>
      <EditorBody key={index} draft={d} setDraft={(nd) => setDrafts(drafts.map((x, i) => (i === index ? nd : x)))} problems={[]} readOnly={!perms.manage} onNewMessage={(channel, cb) => setMsgEditor({ channel, cb })} />
      <MessageEditor open={!!msgEditor} channel={msgEditor?.channel} onClose={() => setMsgEditor(undefined)} onSaved={(mid) => msgEditor?.cb(mid)} />
    </div>
  );
}

export type { PipelineModule };
