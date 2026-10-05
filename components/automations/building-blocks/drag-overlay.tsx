'use client';

/*
  The see-through preview that follows the pointer: a copy of the step card
  the drop would create, so the user sees what they are about to make.
*/
import { DragOverlay } from '@dnd-kit/core';
import type { DragItem } from '@/lib/automations/drop-rules';
import { stageLabel, stepDef } from '@/lib/automations/registry';
import { allTemplates, useAuto } from '@/lib/automations/store';
import { useLibrary } from '../hooks';
import { Icon } from '../shared';

export function BlockDragOverlay({ active }: { active?: DragItem }) {
  const library = useLibrary();
  const automations = useAuto((s) => s.automations);
  const templates = useAuto((s) => s.templates);
  let icon = 'Circle';
  let title = '';
  let detail = '';
  if (active?.kind === 'step') { const d = stepDef(active.type); icon = d?.icon ?? icon; title = d?.title ?? ''; detail = d?.description ?? ''; }
  if (active?.kind === 'message') { const m = library.find((x) => x.id === active.id); icon = m?.channel === 'SMS' ? 'MessageSquare' : 'Mail'; title = m?.channel === 'SMS' ? 'Send text' : 'Send email'; detail = m?.name ?? ''; }
  if (active?.kind === 'stage') { icon = 'MoveRight'; title = 'Move to stage'; detail = stageLabel(active.pipeline, active.stage); }
  if (active?.kind === 'template') { const t = allTemplates({ templates } as never).find((x) => x.id === active.id); icon = 'LayoutTemplate'; title = t?.name ?? 'Template'; detail = 'New automation from template'; }
  if (active?.kind === 'card') { const st = automations.find((a) => a.id === active.automationId)?.steps.find((x) => x.id === active.stepId); const d = st && stepDef(st.type); icon = d?.icon ?? icon; title = d?.title ?? ''; detail = 'Move this step'; }
  if (active?.kind === 'group') { const a = automations.find((x) => x.id === active.automationId); icon = 'GripHorizontal'; title = a?.name ?? ''; detail = 'Change the order'; }
  return (
    <DragOverlay dropAnimation={null}>
      {active ? (
        <div className="flex w-64 items-start gap-2 rounded-xl border border-primary-300 bg-white/80 px-3 py-2 opacity-80 shadow-xl backdrop-blur dark:bg-gray-800/80">
          <Icon name={icon} className="mt-0.5 text-primary-700" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-gray-900 dark:text-white">{title}</span>
            <span className="block truncate text-xs text-gray-500">{detail}</span>
          </span>
        </div>
      ) : null}
    </DragOverlay>
  );
}
