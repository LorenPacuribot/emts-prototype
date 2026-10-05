'use client';

/*
  One drop zone. While something is dragged, valid zones get a dashed
  outline and "Drop here"; the zone under the pointer fills and opens a gap
  the size of a card; a blocked zone turns red with the reason while the
  block hovers over it. Invalid zones otherwise stay plain.
*/
import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import type { DropTarget } from '@/lib/automations/drop-rules';
import { cn } from '@/lib/utils';
import { useCanDrop } from './use-drop-rules';

export function targetId(t: DropTarget): string {
  switch (t.kind) {
    case 'zone': return `zone:${t.automationId}:${t.index}`;
    case 'new': return `new:${t.pipeline}:${t.stage}`;
    case 'when': return `when:${t.automationId}`;
    case 'groupSlot': return `slot:${t.pipeline}:${t.stage}:${t.index}`;
  }
}

export function DropZone({ target, label, onPlus, highlighted, children, compact, disabled }: {
  target: DropTarget;
  /** Text inside the zone when nothing is dragged (the "New automation" box). */
  label?: ReactNode;
  /** Click "+" to choose this spot for the next block clicked. */
  onPlus?: () => void;
  /** This spot was chosen with "+". */
  highlighted?: boolean;
  children?: ReactNode;
  compact?: boolean;
  disabled?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: targetId(target), data: { target }, disabled });
  const verdict = useCanDrop(target);
  const dragging = !!verdict;
  const ok = verdict?.ok;
  if (!dragging && !label && !children) {
    return (
      <div ref={setNodeRef} className={cn('group/zone relative flex items-center justify-center', compact ? 'h-3' : 'h-5')}>
        <span aria-hidden className="absolute inset-x-6 top-1/2 h-px bg-gray-200 dark:bg-gray-700" />
        {onPlus && (
          <button type="button" onClick={onPlus} aria-label="Add a step here"
            className={cn('relative z-10 flex h-5 w-5 items-center justify-center rounded-full border bg-white text-gray-500 transition-colors hover:border-primary-400 hover:text-primary-600 dark:bg-gray-800',
              highlighted ? 'border-primary-500 text-primary-600 ring-2 ring-primary-200' : 'border-gray-200')}>
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }
  return (
    <div
      ref={setNodeRef}
      aria-label={dragging ? (ok ? 'Drop here' : verdict?.ok === false ? verdict.reason : undefined) : undefined}
      className={cn(
        'rounded-xl border-2 text-center text-xs transition-all',
        dragging && ok && !isOver && 'border-dashed border-primary-400 py-2 text-primary-700',
        dragging && ok && isOver && 'border-solid border-primary-500 bg-primary-50 py-6 font-semibold text-primary-800 dark:bg-primary-900/30',
        dragging && !ok && isOver && 'border-solid border-red-400 bg-red-50 px-2 py-3 text-red-800 dark:bg-red-900/30',
        dragging && !ok && !isOver && (label ? 'border-dashed border-gray-200 py-2 text-gray-400' : 'h-3 border-transparent'),
        !dragging && 'border-dashed border-gray-300 py-3 text-gray-500 hover:border-primary-300 hover:text-primary-700 dark:border-gray-600',
        highlighted && !dragging && 'border-primary-500 bg-primary-50 text-primary-700',
      )}
    >
      {dragging ? (ok ? 'Drop here' : isOver && verdict?.ok === false ? verdict.reason : label ?? null) : children ?? label}
    </div>
  );
}
