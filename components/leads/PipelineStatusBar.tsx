'use client';

/*
  Stage selector on the lead detail header. The current stage is highlighted.
  Stages the lead cannot be moved to by hand are locked (the estimate lifecycle sets them).
  NEW (29): lockedBy = an open repaint follow-up that sets the stage; every step is locked.
*/
import type { ReactNode } from 'react';
import { Check, Lock } from 'lucide-react';
import type { LeadStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PIPELINE_STEPS, canManuallySetStatus } from './leadHelpers';

export function PipelineStatusBar({ current, onChange, lockedBy, lockNote }: { current: LeadStatus; onChange: (s: LeadStatus) => void; lockedBy?: string; lockNote?: ReactNode }) {
  return (
    <div className="mt-8 border-t border-gray-100 pt-8">
      {lockNote}
      <div className="flex w-full gap-1 overflow-x-auto rounded-xl bg-gray-50 p-1">
        {PIPELINE_STEPS.map((step) => {
          const active = current === step;
          const allowed = !lockedBy && canManuallySetStatus(current, step);
          const clickable = allowed && !active;
          return (
            <button
              key={step}
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onChange(step) : undefined}
              title={!allowed && !active ? (lockedBy ? `Set by follow-up ${lockedBy}` : 'Set by the estimate lifecycle — not editable manually') : undefined}
              className={cn(
                'flex min-w-[100px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-3 text-sm font-bold transition-all',
                clickable ? 'cursor-pointer' : 'cursor-default',
                active
                  ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5'
                  : !allowed
                    ? 'text-gray-500 opacity-60'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
              )}
            >
              {active && <Check className="h-4 w-4" />}
              {!active && !allowed && <Lock className="h-3 w-3" />}
              {step}
            </button>
          );
        })}
      </div>
    </div>
  );
}
