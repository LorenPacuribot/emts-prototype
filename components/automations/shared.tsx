'use client';

/*
  Small pieces the Automations screens share: icons by registry name,
  badges, run status pills, the readiness list and a confirm hook.
  Cards follow the app's card style (rounded-2xl, shadow-sm, border).
*/
import { useState, type ReactNode } from 'react';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CheckCircle2, Lock, XCircle } from 'lucide-react';
import type { AutomationModule, AutomationStep, ReadinessItem, RunStatus, RunStepStatus } from '@/lib/automations/types';
import { MODULE_ICON, stepDef } from '@/lib/automations/registry';
import { validateStep } from '@/lib/automations/validation';
import { Badge, Button, ConfirmDialog } from '@/features/components/ui';
import { cn } from '@/lib/utils';

export const CARD = 'rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800';

export function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, LucideIcon>)[name] ?? Icons.Circle;
  return <C className={cn('h-4 w-4', className)} aria-hidden />;
}

export function ModuleIcon({ module, className }: { module: AutomationModule; className?: string }) {
  return <Icon name={MODULE_ICON[module]} className={className} />;
}

const RUN_TONE: Record<RunStepStatus, 'green' | 'blue' | 'amber' | 'red' | 'gray'> = {
  DONE: 'green', WAITING: 'blue', WAITING_FOR_REVIEW: 'amber', FAILED: 'red', SKIPPED: 'gray', PAUSED: 'gray', PENDING: 'gray',
};
const RUN_LABEL: Record<RunStepStatus, string> = {
  DONE: 'Done', WAITING: 'Waiting', WAITING_FOR_REVIEW: 'Waiting for review', FAILED: 'Failed', SKIPPED: 'Skipped', PAUSED: 'Paused', PENDING: 'Not run yet',
};

export function RunBadge({ status, paused }: { status: RunStatus | RunStepStatus; paused?: boolean }) {
  if (paused) return <Badge tone="gray">Paused</Badge>;
  return <Badge tone={RUN_TONE[status]}>{RUN_LABEL[status]}</Badge>;
}

export const runLabel = (s: RunStepStatus) => RUN_LABEL[s];

/** The small badges a step card shows (spec 6.2). */
export function StepBadges({ step, problem, variables }: { step: AutomationStep; problem?: string; variables?: string[] }) {
  const def = stepDef(step.type);
  const unfinished = validateStep(step, variables).length > 0;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {step.mode === 'ASK' && def?.mode !== 'AUTO_ONLY' && <Badge tone="blue">Ask me first</Badge>}
      {step.delay && step.delay.amount > 0 && <Badge tone="gray">After {step.delay.amount} {step.delay.unit === 'HOURS' ? (step.delay.amount === 1 ? 'hour' : 'hours') : step.delay.amount === 1 ? 'day' : 'days'}</Badge>}
      {step.conditions.length > 0 && <Badge tone="gray">Only if</Badge>}
      {def?.customerFacing && <Badge tone="purple">To customer</Badge>}
      {unfinished && <Badge tone="amber">Finish setup</Badge>}
      {problem && <Badge tone="red">Problem</Badge>}
    </div>
  );
}

export function ReadinessList({ items }: { items: ReadinessItem[] }) {
  const order = { BLOCK: 0, WARN: 1, PASS: 2 } as const;
  return (
    <ul className="space-y-1.5">
      {[...items].sort((a, b) => order[a.level] - order[b.level]).map((i, n) => (
        <li key={n} className="flex items-start gap-2 text-sm">
          {i.level === 'PASS' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-label="Pass" />
            : i.level === 'WARN' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-label="Warning" />
            : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="Blocker" />}
          <span className={cn(i.level === 'BLOCK' ? 'text-red-800' : i.level === 'WARN' ? 'text-amber-900' : 'text-gray-700', 'dark:text-gray-200')}>{i.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function LockedNote({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Lock className="h-3 w-3" />{children}</span>;
}

export interface ConfirmOptions {
  title: string;
  body: ReactNode;
  label: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
}

export function useConfirm() {
  const [c, setC] = useState<ConfirmOptions>();
  const dialog = (
    <ConfirmDialog
      open={!!c}
      onOpenChange={(o) => !o && setC(undefined)}
      title={c?.title ?? ''}
      body={c?.body}
      confirmLabel={c?.label}
      tone={c?.tone ?? 'danger'}
      onConfirm={() => { c?.onConfirm(); setC(undefined); }}
    />
  );
  return { confirm: setC, dialog };
}

export function SectionHeading({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">{children}</h3>
      {right}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-gray-700">{children}</p>;
}

export function relTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ago(iso: string, now = Date.now()): string {
  const h = Math.floor((now - Date.parse(iso)) / 3_600_000);
  if (h < 1) return 'under an hour';
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'}`;
}

export { Button };
