'use client';

/*
  The Building blocks panel (spec 6.3): every block in one place, drawn
  from the registry. Search filters every section at once. Steps are grouped
  by module in the order of the job journey, with the five most-used steps
  first. Collapses to a 48px icon strip; the state is remembered.
*/
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Copy, Mail, MessageSquare, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { AutomationModule, PipelineModule } from '@/lib/automations/types';
import { MODULE_ICON, MODULE_LABEL, PIPELINES, STEPS, STEP_GROUP_ORDER, stagesOf } from '@/lib/automations/registry';
import { allTemplates, setUi, useAuto } from '@/lib/automations/store';
import type { DragItem } from '@/lib/automations/drop-rules';
import { summarize } from '@/lib/automations/summary';
import { Badge, Input, RowMenu } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { useLibrary, useNames } from '../hooks';
import { Icon } from '../shared';
import { BlockCard } from './block-card';
import { blockLocked, useDropContext } from './use-drop-rules';

type Section = 'steps' | 'messages' | 'stages' | 'templates';

export interface PanelProps {
  pipeline: PipelineModule;
  onPick: (item: DragItem) => void;
  dragEnabled: boolean;
  onNewMessage?: () => void;
  onEditMessage?: (id: string) => void;
  onDuplicateMessage?: (id: string) => void;
  onDeleteMessage?: (id: string) => void;
  /** Bottom sheet on phones: no collapse arrow. */
  sheet?: boolean;
}

export function BuildingBlocksPanel(p: PanelProps) {
  const open = useAuto((s) => s.ui.panelOpen);
  const firstDropDone = useAuto((s) => s.ui.firstDropDone);
  const automations = useAuto((s) => s.automations);
  const templates = useAuto((s) => s.templates);
  const library = useLibrary();
  const names = useNames();
  const ctx = useDropContext();
  const [q, setQ] = useState('');
  const [chip, setChip] = useState<'ALL' | 'EMAIL' | 'SMS'>('ALL');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const needle = q.trim().toLowerCase();
  const match = (...texts: (string | undefined)[]) => !needle || texts.some((t) => t?.toLowerCase().includes(needle));
  const toggle = (k: string) => setClosed((c) => ({ ...c, [k]: !c[k] }));

  const mostUsed = useMemo(() => {
    const count = new Map<string, number>();
    for (const a of automations) if (!a.isDeleted) for (const st of a.steps) count.set(st.type, (count.get(st.type) ?? 0) + 1);
    return [...count.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([t]) => t);
  }, [automations]);

  if (!open && !p.sheet) {
    return (
      <aside className="hidden w-12 shrink-0 flex-col items-center gap-2 rounded-2xl border border-gray-200 bg-white py-3 shadow-sm md:flex dark:border-gray-700 dark:bg-gray-800" aria-label="Building blocks (collapsed)">
        <button type="button" onClick={() => setUi({ panelOpen: true })} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Open Building blocks"><ChevronRight className="h-4 w-4" /></button>
        {STEP_GROUP_ORDER.map((m) => <span key={m} title={MODULE_LABEL[m]} className="text-gray-400"><Icon name={MODULE_ICON[m]} /></span>)}
      </aside>
    );
  }

  const stepItem = (type: string, where = 'group') => {
    const def = STEPS.find((s) => s.type === type)!;
    const item: DragItem = { kind: 'step', type };
    return (
      <BlockCard key={`${where}-${type}`} idSuffix={where === 'group' ? undefined : where} item={item} icon={def.icon} title={def.title} detail={def.description} dragEnabled={p.dragEnabled} onPick={() => p.onPick(item)}
        locked={blockLocked(item, ctx)}
        badges={(def.mode === 'ASK_BY_DEFAULT' || def.customerFacing) ? <>{def.mode === 'ASK_BY_DEFAULT' && <Badge tone="blue">Ask first</Badge>}{def.customerFacing && <Badge tone="purple">To customer</Badge>}</> : undefined} />
    );
  };

  const groups = STEP_GROUP_ORDER.map((m) => ({ module: m, steps: STEPS.filter((s) => s.module === m && match(s.title, s.description, MODULE_LABEL[m])) })).filter((g) => g.steps.length);
  const messages = library.filter((m) => (chip === 'ALL' || m.channel === chip) && match(m.name, m.subject, m.body));
  const stages = stagesOf(p.pipeline).filter((s) => match(s.label));
  const elsewhere = needle ? PIPELINES.filter((x) => x !== p.pipeline).flatMap((x) => stagesOf(x).filter((s) => match(s.label)).map((s) => ({ pipeline: x, stage: s }))) : [];
  const tpls = allTemplates({ templates } as never).filter((t) => t.kind === 'AUTOMATION' && match(t.name, t.description));

  const header = (k: Section, label: string, count: number, extra?: React.ReactNode) => (
    <div className="flex items-center justify-between gap-2 pt-3">
      <button type="button" onClick={() => toggle(k)} aria-expanded={!closed[k]} className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-gray-500">
        {closed[k] ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{label} <span className="font-semibold normal-case tracking-normal">({count})</span>
      </button>
      {extra}
    </div>
  );

  return (
    <aside className={cn('flex min-h-0 shrink-0 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800', p.sheet ? 'w-full' : 'w-[300px]')} aria-label="Building blocks">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5 dark:border-gray-700">
        <span className="font-bold text-gray-900 dark:text-white">Building blocks</span>
        {!p.sheet && <button type="button" onClick={() => setUi({ panelOpen: false })} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Collapse Building blocks"><ChevronLeft className="h-4 w-4" /></button>}
      </div>
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input aria-label="Search steps, messages, stages and templates" placeholder="Search steps, messages, stages and templates" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 text-xs" />
        </div>
        {!firstDropDone && p.dragEnabled && <p className="mt-2 rounded-lg bg-primary-50 px-2.5 py-2 text-xs text-primary-800 dark:bg-primary-900/30 dark:text-primary-200">Drag a block onto a stage, or click it to choose where it goes.</p>}
        {!p.dragEnabled && ctx.canManage && <p className="mt-2 rounded-lg bg-gray-50 px-2.5 py-2 text-xs text-gray-600">Tap a block, then pick the stage.</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 custom-scrollbar">
        {header('steps', 'Steps', groups.reduce((a, g) => a + g.steps.length, 0))}
        {!closed.steps && (
          <div className="mt-2 space-y-3">
            {!needle && mostUsed.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">Most used</div>
                <div className="space-y-1.5">{mostUsed.map((t) => stepItem(t, 'most'))}</div>
              </div>
            )}
            {groups.map((g) => (
              <div key={g.module}>
                <button type="button" onClick={() => toggle(`g-${g.module}`)} aria-expanded={!closed[`g-${g.module}`]} className="mb-1.5 flex w-full items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                  <Icon name={MODULE_ICON[g.module as AutomationModule]} className="h-3.5 w-3.5" />{MODULE_LABEL[g.module as AutomationModule]}
                  {closed[`g-${g.module}`] ? <ChevronRight className="ml-auto h-3.5 w-3.5" /> : <ChevronDown className="ml-auto h-3.5 w-3.5" />}
                </button>
                {!closed[`g-${g.module}`] && <div className="space-y-1.5">{g.steps.map((s) => stepItem(s.type))}</div>}
              </div>
            ))}
          </div>
        )}

        {header('messages', 'Messages', messages.length, p.onNewMessage && ctx.canManage ? <button type="button" onClick={p.onNewMessage} className="flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"><Plus className="h-3 w-3" /> New message</button> : undefined)}
        {!closed.messages && (
          <div className="mt-2 space-y-1.5">
            <div className="flex gap-1" role="group" aria-label="Filter messages">
              {(['ALL', 'EMAIL', 'SMS'] as const).map((c) => (
                <button key={c} type="button" onClick={() => setChip(c)} aria-pressed={chip === c} className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold', chip === c ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600')}>
                  {c === 'ALL' ? 'All' : c === 'EMAIL' ? 'Email' : 'SMS'}
                </button>
              ))}
            </div>
            {messages.map((m) => {
              const item: DragItem = { kind: 'message', id: m.id, channel: m.channel };
              return (
                <div key={m.id} className="flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <BlockCard item={item} icon={m.channel === 'SMS' ? 'MessageSquare' : 'Mail'} title={m.name} detail={m.body.split('\n').find((l) => l.trim()) ?? ''} dragEnabled={p.dragEnabled}
                      onPick={() => p.onPick(item)} locked={blockLocked(item, ctx)} preview={`${m.subject ? `${m.subject}\n` : ''}${m.body.split('\n').filter(Boolean).slice(0, 2).join('\n')}`}
                      badges={<Badge tone={m.channel === 'SMS' ? 'indigo' : 'gray'}>{m.channel === 'SMS' ? <MessageSquare className="h-3 w-3" /> : <Mail className="h-3 w-3" />}{m.channel === 'SMS' ? 'SMS' : 'Email'}</Badge>} />
                  </div>
                  {ctx.canManage && (
                    <RowMenu label={`Actions for ${m.name}`} items={[
                      { label: 'Edit', icon: <Pencil />, onSelect: () => p.onEditMessage?.(m.id) },
                      { label: 'Duplicate', icon: <Copy />, onSelect: () => p.onDuplicateMessage?.(m.id) },
                      { label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => p.onDeleteMessage?.(m.id) },
                    ]} />
                  )}
                </div>
              );
            })}
            {!messages.length && <p className="text-xs text-gray-500">No messages match.</p>}
          </div>
        )}

        {header('stages', 'Stages', stages.length)}
        {!closed.stages && (
          <div className="mt-2 space-y-1.5">
            {stages.map((s) => {
              const item: DragItem = { kind: 'stage', pipeline: p.pipeline, stage: s.value };
              return <BlockCard key={s.value} item={item} colour={s.colour} title={s.label} detail={`${MODULE_LABEL[p.pipeline]} stage`} dragEnabled={p.dragEnabled} onPick={() => p.onPick(item)} locked={blockLocked(item, ctx)} />;
            })}
            {elsewhere.slice(0, 4).map((e) => (
              <p key={`${e.pipeline}-${e.stage.value}`} className="text-xs text-gray-500">{e.stage.label} is in the {MODULE_LABEL[e.pipeline]} pipeline. Switch pipeline to use it.</p>
            ))}
          </div>
        )}

        {header('templates', 'Templates', tpls.length)}
        {!closed.templates && (
          <div className="mt-2 space-y-1.5">
            {tpls.map((t) => {
              const item: DragItem = { kind: 'template', id: t.id };
              const a = t.automations[0];
              return <BlockCard key={t.id} item={item} icon="LayoutTemplate" title={t.name} detail={a ? summarize(a, names) : t.description} dragEnabled={p.dragEnabled} onPick={() => p.onPick(item)} locked={blockLocked(item, ctx)}
                badges={t.source === 'SYSTEM' ? <Badge tone="gray">From Estimate Master</Badge> : <Badge tone="blue">Yours</Badge>} />;
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
