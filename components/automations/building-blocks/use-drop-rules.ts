'use client';

/*
  The drop rules for the screens. canDrop() itself is in
  lib/automations/drop-rules.ts; this hook gives it the context (permissions,
  automations on the board, templates, release flags) and shares the item
  being dragged, so drag and drop, the "Add to which stage?" popover and the
  keyboard flow all ask the same question.
*/
import { createContext, useContext, useMemo } from 'react';
import type { Automation } from '@/lib/automations/types';
import { blockLocked, canDrop, type DragItem, type DropContext, type DropResult, type DropTarget } from '@/lib/automations/drop-rules';
import { allTemplates, useAuto } from '@/lib/automations/store';
import { usePerms } from '../hooks';

export function useDropContext(extra?: Automation[]): DropContext {
  const automations = useAuto((s) => s.automations);
  const templates = useAuto((s) => s.templates);
  const settings = useAuto((s) => s.settings);
  const { manage } = usePerms();
  return useMemo(() => {
    const live = automations.filter((a) => !a.isDeleted && !a.isArchived);
    const merged = extra?.length ? [...live.filter((a) => !extra.some((e) => e.id === a.id)), ...extra] : live;
    return {
      canManage: manage, automations: merged, templates: allTemplates({ templates } as never),
      textingReleased: settings.textingReleased, flags: settings.flags,
    };
  }, [automations, templates, settings, manage, extra]);
}

export interface DragState {
  active?: DragItem;
  ctx: DropContext;
}

export const DragStateContext = createContext<DragState | null>(null);

export function useDragState(): DragState | null {
  return useContext(DragStateContext);
}

export function useCanDrop(target: DropTarget): DropResult | undefined {
  const st = useDragState();
  if (!st?.active) return undefined;
  return canDrop(st.active, target, st.ctx);
}

/** Parse a draggable id back into the item (ids say what they are: step:CREATE_INVOICE, message:tpl_123…). */
export function itemFromId(id: string): DragItem | undefined {
  const [kind, a, b] = id.split(':');
  if (kind === 'step' && a) return { kind: 'step', type: a };
  if (kind === 'stage' && a && b) return { kind: 'stage', pipeline: a as never, stage: b };
  if (kind === 'template' && a) return { kind: 'template', id: a };
  if (kind === 'card' && a && b) return { kind: 'card', automationId: a, stepId: b };
  if (kind === 'group' && a) return { kind: 'group', automationId: a };
  return undefined;
}

export { canDrop, blockLocked };
export type { DragItem, DropTarget, DropResult, DropContext };
