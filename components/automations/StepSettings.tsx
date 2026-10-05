'use client';

/*
  Step settings, drawn from the registry fields (spec 6.4). No step has a
  hand-written form: a new step definition gets its form from its fields.
  Every step ends with three optional sections: Delay before this step,
  Only if, and How should this run?
*/
import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { AutomationCondition, AutomationStep, PipelineModule, RegistryField } from '@/lib/automations/types';
import {
  PIPELINES, MODULE_LABEL, ROLE_OPTIONS, WAIT_CONDITIONS, conditionField, conditionFieldsFor, dateFieldsOf, stagesOf, stepDef, variablesFor, watchedFields,
} from '@/lib/automations/registry';
import { fieldVisible, type Problem } from '@/lib/automations/validation';
import { LIMITS } from '@/lib/automations/validation';
import { newCondId } from '@/lib/automations/store';
import { useDb as useFeatureDb } from '@/features/lib/store';
import { Button, Field, Input, Select, Textarea } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { useEstimateTemplates, useLibrary } from './hooks';
import { Icon } from './shared';

/* ---------- Variables ---------- */

export function VariablesBox({ variables, onInsert }: { variables: string[]; onInsert: (v: string) => void }) {
  return (
    <div className="mt-1.5 rounded-lg border border-gray-100 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Available variables</div>
      <div className="flex flex-wrap gap-1">
        {variables.map((v) => (
          <button key={v} type="button" onClick={() => onInsert(v)} className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-gray-700 hover:border-primary-300 hover:text-primary-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
            {`{{${v}}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A text input or textarea with the variables box; clicking a variable inserts it at the cursor. */
export function VariableText({ value, onChange, multiline, variables, invalid, id, disabled, rows = 4, placeholder }: {
  value: string; onChange: (v: string) => void; multiline?: boolean; variables: string[]; invalid?: boolean; id?: string; disabled?: boolean; rows?: number; placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const insert = (v: string) => {
    const el = ref.current;
    const token = `{{${v}}}`;
    if (!el) return onChange(value + token);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  };
  return (
    <>
      {multiline
        ? <Textarea ref={ref} id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} invalid={invalid} disabled={disabled} placeholder={placeholder} />
        : <Input ref={ref} id={id} value={value} onChange={(e) => onChange(e.target.value)} invalid={invalid} disabled={disabled} placeholder={placeholder} />}
      {!disabled && <VariablesBox variables={variables} onInsert={insert} />}
    </>
  );
}

/* ---------- One registry field ---------- */

export interface FieldCtx {
  pipeline: PipelineModule;
  stage?: string;
  readOnly?: boolean;
  onNewMessage?: (channel: 'EMAIL' | 'SMS', done: (id: string) => void) => void;
}

export function RegistryInput({ field, value, config, onChange, ctx, error, idPrefix }: {
  field: RegistryField; value: unknown; config: Record<string, unknown>; onChange: (v: unknown) => void; ctx: FieldCtx; error?: string; idPrefix: string;
}) {
  const users = useFeatureDb((d) => d.users);
  const crews = useFeatureDb((d) => d.crews);
  const library = useLibrary();
  const templates = useEstimateTemplates();
  const id = `${idPrefix}-${field.key}`;
  const str = value === undefined || value === null ? '' : String(value);
  const dis = ctx.readOnly;
  let control: ReactNode;
  const select = (options: { value: string; label: string }[], placeholder = 'Choose…') => (
    <Select id={id} value={str} onChange={(e) => onChange(e.target.value)} invalid={!!error} disabled={dis}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );
  switch (field.kind) {
    case 'text':
    case 'longtext':
      control = field.supportsVariables
        ? <VariableText id={id} value={str} onChange={onChange} multiline={field.kind === 'longtext'} variables={variablesFor(ctx.pipeline, ctx.stage)} invalid={!!error} disabled={dis} />
        : field.kind === 'longtext' ? <Textarea id={id} value={str} onChange={(e) => onChange(e.target.value)} invalid={!!error} disabled={dis} /> : <Input id={id} value={str} onChange={(e) => onChange(e.target.value)} invalid={!!error} disabled={dis} />;
      break;
    case 'number':
    case 'percent':
    case 'money':
    case 'duration':
      control = (
        <div className="relative">
          {field.kind === 'money' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>}
          <Input id={id} type="number" inputMode="decimal" step={field.kind === 'money' ? '0.01' : '1'} min={field.min} max={field.max} value={str}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} invalid={!!error} disabled={dis} className={cn(field.kind === 'money' && 'pl-7', field.kind === 'percent' && 'pr-8')} />
          {field.kind === 'percent' && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">%</span>}
        </div>
      );
      break;
    case 'boolean':
      control = select([{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]);
      break;
    case 'user':
      control = select(users.map((u) => ({ value: u.id, label: u.name })), 'Choose a person…');
      break;
    case 'role':
      control = select(field.options ?? ROLE_OPTIONS);
      break;
    case 'stage': {
      const pipeline = (field.pipelineFrom as PipelineModule | undefined) ?? ctx.pipeline;
      control = select(stagesOf(pipeline).map((s) => ({ value: s.value, label: s.label })), 'Choose a stage…');
      break;
    }
    case 'estimateTemplate':
      control = select(templates.map((t) => ({ value: t.id, label: t.name })), 'Choose an estimate template…');
      break;
    case 'message': {
      const list = library.filter((m) => !field.channel || m.channel === field.channel);
      control = (
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">{select(list.map((m) => ({ value: m.id, label: m.name })), field.required ? 'Choose a message…' : 'Default text')}</div>
          {ctx.onNewMessage && !dis && <Button size="sm" onClick={() => ctx.onNewMessage!(field.channel ?? 'EMAIL', (mid) => onChange(mid))}><Plus className="h-3.5 w-3.5" /> New</Button>}
        </div>
      );
      break;
    }
    case 'module':
      control = select(PIPELINES.map((p) => ({ value: p, label: MODULE_LABEL[p] })));
      break;
    case 'dateField': {
      const pipeline = (config.module as PipelineModule | undefined) ?? ctx.pipeline;
      control = select(dateFieldsOf(pipeline));
      break;
    }
    case 'waitCondition':
      control = select(WAIT_CONDITIONS.map((w) => ({ value: w.value, label: w.label + (w.backendGap ? ' (needs backend)' : '') })));
      break;
    case 'select': {
      let options = field.options ?? [];
      if (field.key === 'field' && options.length === 0) options = watchedFields(ctx.pipeline);
      if (field.key === 'crew') options = [{ value: 'ANY', label: 'Any crew' }, ...crews.map((c) => ({ value: c.id, label: c.name }))];
      control = select(options);
      break;
    }
    default:
      control = <Input id={id} value={str} onChange={(e) => onChange(e.target.value)} disabled={dis} />;
  }
  return (
    <Field label={field.label} htmlFor={id} required={field.required} error={error} hint={!error ? field.hint : undefined}>
      {control}
    </Field>
  );
}

/* ---------- Conditions ---------- */

const OPERATORS: { value: AutomationCondition['operator']; label: string; for: string[] }[] = [
  { value: 'IS', label: 'is', for: ['select', 'user', 'stage', 'boolean', 'text', 'money'] },
  { value: 'IS_NOT', label: 'is not', for: ['select', 'user', 'stage', 'text'] },
  { value: 'IS_ANY_OF', label: 'is any of', for: ['select', 'stage'] },
  { value: 'GT', label: 'is over', for: ['money', 'number'] },
  { value: 'LT', label: 'is under', for: ['money', 'number'] },
  { value: 'IS_EMPTY', label: 'is empty', for: ['select', 'user', 'text'] },
  { value: 'IS_NOT_EMPTY', label: 'is not empty', for: ['select', 'user', 'text'] },
];

export function ConditionsEditor({ conditions, onChange, pipeline, stage, readOnly, idPrefix }: {
  conditions: AutomationCondition[]; onChange: (c: AutomationCondition[]) => void; pipeline: PipelineModule; stage?: string; readOnly?: boolean; idPrefix: string;
}) {
  const fields = conditionFieldsFor(pipeline, stage);
  const users = useFeatureDb((d) => d.users);
  const set = (i: number, patch: Partial<AutomationCondition>) => onChange(conditions.map((c, n) => (n === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2">
      {conditions.map((c, i) => {
        const f = conditionField(c.field);
        const ops = OPERATORS.filter((o) => !f || o.for.includes(f.kind));
        const options = f?.kind === 'user' ? users.map((u) => ({ value: u.id, label: u.name }))
          : f?.kind === 'boolean' ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]
          : f?.kind === 'stage' ? stagesOf((f.pipelineFrom as PipelineModule) ?? pipeline).map((s) => ({ value: s.value, label: s.label }))
          : f?.options;
        const noValue = c.operator === 'IS_EMPTY' || c.operator === 'IS_NOT_EMPTY';
        return (
          <div key={c.id} className="grid grid-cols-1 gap-2 rounded-xl border border-gray-100 p-2 sm:grid-cols-[1fr_auto_1fr_auto] dark:border-gray-700">
            <Select aria-label="Field" value={c.field} disabled={readOnly} onChange={(e) => set(i, { field: e.target.value, operator: conditionField(e.target.value)?.kind === 'money' ? 'GT' : 'IS', value: '' })}>
              <option value="">Choose a field…</option>
              {fields.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </Select>
            <Select aria-label="Operator" value={c.operator} disabled={readOnly} onChange={(e) => set(i, { operator: e.target.value as AutomationCondition['operator'] })}>
              {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            {noValue ? <span /> : c.operator === 'IS_ANY_OF' && options ? (
              <select aria-label="Values" multiple className="h-20 rounded-lg border border-gray-200 px-2 text-sm dark:bg-gray-800" disabled={readOnly}
                value={Array.isArray(c.value) ? c.value : []} onChange={(e) => set(i, { value: Array.from(e.target.selectedOptions, (o) => o.value) })}>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : options ? (
              <Select aria-label="Value" value={String(c.value ?? '')} disabled={readOnly} onChange={(e) => set(i, { value: e.target.value })}>
                <option value="">Choose…</option>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            ) : (
              <Input aria-label="Value" id={`${idPrefix}-cv-${i}`} type={f?.kind === 'money' || f?.kind === 'number' ? 'number' : 'text'} value={String(c.value ?? '')} disabled={readOnly}
                onChange={(e) => set(i, { value: f?.kind === 'money' || f?.kind === 'number' ? Number(e.target.value) : e.target.value })} />
            )}
            {!readOnly && <Button size="icon-sm" variant="ghost" aria-label="Remove condition" onClick={() => onChange(conditions.filter((_, n) => n !== i))}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        );
      })}
      {!readOnly && conditions.length < LIMITS.conditions && (
        <button type="button" className="text-sm font-semibold text-primary-700 hover:underline" onClick={() => onChange([...conditions, { id: newCondId(), field: '', operator: 'IS', value: '' }])}>
          + Add a condition
        </button>
      )}
      {conditions.length >= LIMITS.conditions && <p className="text-xs text-gray-500">Up to {LIMITS.conditions} conditions.</p>}
    </div>
  );
}

/* ---------- The whole step form ---------- */

function Collapsible({ title, open, onToggle, children, badge }: { title: string; open: boolean; onToggle: () => void; children: ReactNode; badge?: ReactNode }) {
  return (
    <div className="border-t border-gray-100 pt-3 dark:border-gray-700">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2 text-left text-sm font-semibold text-gray-800 dark:text-gray-100">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {title}
        {badge}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function StepSettingsForm({ step, onChange, ctx, problems = [] }: { step: AutomationStep; onChange: (s: AutomationStep) => void; ctx: FieldCtx; problems?: Problem[] }) {
  const def = stepDef(step.type);
  const [open, setOpen] = useState({ delay: !!step.delay?.amount, only: step.conditions.length > 0, mode: step.mode === 'ASK' });
  if (!def) return <p className="text-sm text-red-700">This step no longer exists. Remove it.</p>;
  const err = (key: string) => problems.find((p) => p.field === key)?.message;
  const setConfig = (key: string, v: unknown) => onChange({ ...step, config: { ...step.config, [key]: v } });
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-900/30"><Icon name={def.icon} /></span>
        <div>
          <div className="font-bold text-gray-900 dark:text-white">{def.title}</div>
          <p className="text-sm text-gray-500">{def.description}</p>
          {def.prerequisites.length > 0 && <p className="mt-1 text-xs text-gray-500">Needs: {def.prerequisites.map((p) => p.label).join('; ')}.</p>}
          {def.backendGap && <p className="mt-1 text-xs text-amber-700">{def.backendGap}</p>}
          {def.customerFacing && <p className="mt-1 text-xs text-purple-700">Sent to the customer. Follows consent, opt-outs and the 8 a.m. to 7 p.m. contact window.</p>}
        </div>
      </div>
      {def.fields.filter((f) => fieldVisible(f, step.config)).map((f) => (
        <RegistryInput key={f.key} field={f} value={step.config[f.key]} config={step.config} onChange={(v) => setConfig(f.key, v)} ctx={ctx} error={err(f.key)} idPrefix={step.id} />
      ))}
      <Collapsible title="Delay before this step" open={open.delay} onToggle={() => setOpen((o) => ({ ...o, delay: !o.delay }))}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Run this step</span>
          <Input aria-label="Delay amount" type="number" min={0} className="w-20" disabled={ctx.readOnly} value={step.delay?.amount ?? 0}
            onChange={(e) => onChange({ ...step, delay: { amount: Number(e.target.value), unit: step.delay?.unit ?? 'DAYS', workingDaysOnly: step.delay?.workingDaysOnly ?? false } })} />
          <Select aria-label="Delay unit" className="w-28" disabled={ctx.readOnly} value={step.delay?.unit ?? 'DAYS'}
            onChange={(e) => onChange({ ...step, delay: { amount: step.delay?.amount ?? 0, unit: e.target.value as 'HOURS' | 'DAYS', workingDaysOnly: step.delay?.workingDaysOnly ?? false } })}>
            <option value="HOURS">hours</option>
            <option value="DAYS">days</option>
          </Select>
          <span>after the step before it.</span>
        </div>
        {step.delay?.unit !== 'HOURS' && (
          <Select aria-label="Which days count" className="mt-2 w-60" disabled={ctx.readOnly} value={step.delay?.workingDaysOnly ? 'WORKING' : 'ALL'}
            onChange={(e) => onChange({ ...step, delay: { amount: step.delay?.amount ?? 0, unit: 'DAYS', workingDaysOnly: e.target.value === 'WORKING' } })}>
            <option value="ALL">Count every day</option>
            <option value="WORKING">Count working days only</option>
          </Select>
        )}
        {err('delay') && <p className="mt-1 text-xs text-red-600">{err('delay')}</p>}
      </Collapsible>
      <Collapsible title="Only if" open={open.only} onToggle={() => setOpen((o) => ({ ...o, only: !o.only }))} badge={step.conditions.length ? <span className="text-xs text-gray-500">({step.conditions.length})</span> : undefined}>
        <p className="mb-2 text-xs text-gray-500">If these are false when the step's turn comes, it is skipped and the next step runs.</p>
        <ConditionsEditor conditions={step.conditions} onChange={(c) => onChange({ ...step, conditions: c })} pipeline={ctx.pipeline} stage={ctx.stage} readOnly={ctx.readOnly} idPrefix={`${step.id}-c`} />
      </Collapsible>
      {def.mode !== 'AUTO_ONLY' && (
        <Collapsible title="How should this run?" open={open.mode} onToggle={() => setOpen((o) => ({ ...o, mode: !o.mode }))}>
          <div className="flex flex-col gap-2 text-sm" role="radiogroup" aria-label="How should this run?">
            {(['AUTO', 'ASK'] as const).map((m) => (
              <label key={m} className="flex items-start gap-2">
                <input type="radio" name={`${step.id}-mode`} checked={step.mode === m} disabled={ctx.readOnly} onChange={() => onChange({ ...step, mode: m })} className="mt-1" />
                <span><span className="font-semibold">{m === 'AUTO' ? 'Do it automatically' : 'Ask me first'}</span>
                  <span className="block text-xs text-gray-500">{m === 'AUTO' ? 'Runs on its own once the automation is deployed.' : 'Waits in "Waiting for review" until someone approves it.'}</span></span>
              </label>
            ))}
          </div>
        </Collapsible>
      )}
    </div>
  );
}
