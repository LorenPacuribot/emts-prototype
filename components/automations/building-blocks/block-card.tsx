'use client';

/*
  One block in the Building blocks panel. The whole card can be grabbed;
  clicking it opens "Add to which stage?" (or fills the spot chosen with
  "+"). Blocks a user can't use show a lock and the reason, and can't be
  grabbed.
*/
import type { ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical, Lock } from 'lucide-react';
import type { DragItem } from '@/lib/automations/drop-rules';
import { cn } from '@/lib/utils';
import { Icon } from '../shared';

export function dragId(item: DragItem): string {
  switch (item.kind) {
    case 'step': return `step:${item.type}`;
    case 'message': return `message:${item.id}`;
    case 'stage': return `stage:${item.pipeline}:${item.stage}`;
    case 'template': return `template:${item.id}`;
    case 'card': return `card:${item.automationId}:${item.stepId}`;
    case 'group': return `group:${item.automationId}`;
  }
}

export function BlockCard({ item, icon, title, detail, badges, locked, onPick, dragEnabled, colour, preview, idSuffix }: {
  item: DragItem;
  /** Keeps drag ids unique when one block shows twice (Most used). */
  idSuffix?: string;
  icon?: string;
  title: string;
  detail?: string;
  badges?: ReactNode;
  /** Why the block can't be used (it can't be grabbed either). */
  locked?: string;
  onPick: () => void;
  dragEnabled: boolean;
  colour?: string;
  /** Shown on hover after half a second (messages). */
  preview?: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: idSuffix ? `${dragId(item)}#${idSuffix}` : dragId(item), data: { item }, disabled: !!locked || !dragEnabled });
  return (
    <div
      ref={setNodeRef}
      {...(locked || !dragEnabled ? {} : listeners)}
      {...attributes}
      role="button"
      tabIndex={0}
      aria-disabled={!!locked}
      aria-roledescription="Building block"
      title={locked ?? preview}
      onClick={() => !locked && onPick()}
      onKeyDown={(e) => {
        if (locked) return;
        if (e.key === 'Enter') { e.preventDefault(); onPick(); }
        listeners?.onKeyDown?.(e);
      }}
      className={cn(
        'group flex select-none items-start gap-2 rounded-xl border bg-white px-2.5 py-2 text-left shadow-sm transition-colors dark:bg-gray-800',
        locked ? 'cursor-not-allowed border-gray-100 opacity-60 dark:border-gray-700' : 'cursor-grab border-gray-200 hover:border-primary-300 active:cursor-grabbing dark:border-gray-700',
        isDragging && 'opacity-40',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
      )}
    >
      {locked ? <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" /> : <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-gray-500" />}
      {colour ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colour }} aria-hidden /> : icon ? <Icon name={icon} className="mt-0.5 shrink-0 text-gray-600 dark:text-gray-300" /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
        {(detail || locked) && <span className="block truncate text-xs text-gray-500">{locked ?? detail}</span>}
        {badges && <span className="mt-1 flex flex-wrap gap-1">{badges}</span>}
      </span>
    </div>
  );
}
