'use client';

/*
  Templates tab (spec 6.6): journey templates and automation templates, each
  split into "From Estimate Master" (read-only; Duplicate makes an editable
  copy) and "Yours". "Use this template" opens a short setup check that only
  asks for the blanks, with defaults from the business's settings, and
  creates everything Off.
*/
import { useMemo, useState } from 'react';
import { Copy, LayoutTemplate, Pencil, Plus, Trash2 } from 'lucide-react';
import type { AutomationTemplate, PipelineModule } from '@/lib/automations/types';
import { allTemplates, applyTemplate, createBlankTemplate, deleteTemplate, duplicateTemplate, samplesUsed, useAuto } from '@/lib/automations/store';
import { summarize } from '@/lib/automations/summary';
import { checkReadiness } from '@/lib/automations/readiness';
import { stepDef, stageLabel } from '@/lib/automations/registry';
import { sampleById } from '@/lib/automations/messages';
import { useDb as useFeatureDb } from '@/features/lib/store';
import { useNav } from '@/features/lib/navigation';
import { toast } from '@/features/lib/toast';
import { Badge, Banner, Button, Field, Input, Modal, RowMenu } from '@/features/components/ui';
import { useEstimateTemplates, useLibrary, useMessageActions, useNames, useOrg, usePerms } from './hooks';
import { RegistryInput } from './StepSettings';
import { CARD, ReadinessList, useConfirm } from './shared';

export function UseTemplateModal({ templateId, placeAt, onClose }: { templateId: string; placeAt?: { pipeline: PipelineModule; stage: string }; onClose: () => void }) {
  const s = useAuto((x) => x);
  const t = allTemplates(s).find((x) => x.id === templateId);
  const fdb = useFeatureDb((d) => d);
  const library = useLibrary();
  const names = useNames();
  const templates = useEstimateTemplates();
  const { reviewLink } = useOrg();
  const msg = useMessageActions();
  const nav = useNav();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(t?.name ?? '');
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {};
    for (const b of t?.blanks ?? []) {
      const st = t!.automations[b.automationIndex]?.steps.find((x) => x.id === b.stepId);
      const f = st && stepDef(st.type)?.fields.find((x) => x.key === b.fieldKey);
      const own = st?.config[b.fieldKey];
      const fromSettings = f?.defaultFrom === 'financialSettings.depositPercent' ? fdb.financialSettings?.depositPercent : undefined;
      out[`${b.stepId}|${b.fieldKey}`] = own !== undefined && own !== '' ? own : fromSettings ?? f?.defaultValue ?? '';
    }
    return out;
  });
  // Preview of what will be created, with the blanks filled in.
  const preview = useMemo(() => (t?.automations ?? []).map((a, i) => ({
    ...a, id: `preview_${i}`, summary: '', runOrder: 0, isEnabled: false, needsReapproval: false, isArchived: false, isDeleted: false, runsLast7Days: 0, problemCount: 0,
    createdBy: '', updatedBy: '', createdAt: '', updatedAt: '',
    steps: a.steps.map((st) => ({ ...st, config: { ...st.config, ...Object.fromEntries(Object.entries(answers).filter(([k]) => k.startsWith(`${st.id}|`)).map(([k, v]) => [k.split('|')[1]!, v])) } })),
  })), [t, answers]);
  if (!t) return null;
  const sampleNames: NameLookupMsg = (id) => library.find((m) => m.id === id)?.name ?? sampleById(id ?? '')?.name;
  const nm = { ...names, message: sampleNames };
  const readiness = checkReadiness(preview.map((p) => ({ ...p, steps: p.steps.map((st) => (typeof st.config.messageId === 'string' && st.config.messageId.startsWith('sample_') ? { ...st, config: { ...st.config, messageId: library.find((m) => m.name === sampleById(String(st.config.messageId))?.name)?.id ?? `__sample` } } : st)) })),
    s, { db: { users: fdb.users }, messages: [...library, { id: '__sample', name: 'Sample', channel: 'EMAIL', subject: 'x', body: 'x', isSample: true, version: 1, usedInAutomationIds: [], updatedBy: '', updatedAt: '' }], estimateTemplates: templates, reviewLink, all: s.automations });
  const create = () => {
    if (name.trim().length < 3) { setStep(0); return toast.error('Name needed', 'Use at least 3 characters.'); }
    const missing = t.blanks.find((b) => answers[`${b.stepId}|${b.fieldKey}`] === '' || answers[`${b.stepId}|${b.fieldKey}`] === undefined);
    if (missing) { setStep(1); return toast.error('Fill in the blanks', missing.question); }
    const messageMap = msg.copySamples(samplesUsed(t), library);
    const r = applyTemplate({ templateId: t.id, name, answers, messageMap, placeAt });
    if (!r.ok) return toast.error('Not created', r.error);
    toast.success(t.kind === 'JOURNEY' ? `${name} created` : 'Automation created', 'Everything starts Off. Turn it on when you are ready.');
    onClose();
    if (t.kind === 'JOURNEY') nav.push(`/automations?tab=board&journey=${r.value!.journeyId}`);
  };
  const steps = ['Name', 'Fill in the blanks', 'Check'];
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="lg" title={`Use template: ${t.name}`}
      description={placeAt ? `The new automation goes in ${stageLabel(placeAt.pipeline, placeAt.stage)}.` : t.description}
      footer={<>
        <Button onClick={step === 0 ? onClose : () => setStep(step - 1)}>{step === 0 ? 'Cancel' : 'Back'}</Button>
        {step < 2 ? <Button variant="primary" onClick={() => setStep(step === 0 && !t.blanks.length ? 2 : step + 1)}>Next</Button> : <Button variant="primary" onClick={create}>Create</Button>}
      </>}>
      <ol className="mb-4 flex gap-2 text-xs font-semibold" aria-label="Setup steps">
        {steps.map((x, i) => <li key={x} className={i === step ? 'rounded-full bg-primary-50 px-2 py-1 text-primary-700' : 'px-2 py-1 text-gray-500'}>{i + 1}. {x}</li>)}
      </ol>
      {step === 0 && (
        <Field label="Name" htmlFor="ut-name" required><Input id="ut-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      )}
      {step === 1 && (
        <div className="space-y-3">
          {!t.blanks.length && <p className="text-sm text-gray-500">Nothing to fill in.</p>}
          {t.blanks.map((b) => {
            const a = t.automations[b.automationIndex]!;
            const st = a.steps.find((x) => x.id === b.stepId)!;
            const f = stepDef(st.type)!.fields.find((x) => x.key === b.fieldKey)!;
            const k = `${b.stepId}|${b.fieldKey}`;
            return <RegistryInput key={k} field={{ ...f, label: b.question, required: true }} value={answers[k]} config={{ ...st.config, ...answers }} onChange={(v) => setAnswers((x) => ({ ...x, [k]: v }))} ctx={{ pipeline: placeAt?.pipeline ?? 'LEAD' }} idPrefix={`ut-${k}`} />;
          })}
        </div>
      )}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 font-bold">It will create {preview.length} {preview.length === 1 ? 'automation' : 'automations'}, all Off</h3>
            <ul className="space-y-1.5 text-sm">{preview.map((p) => <li key={p.id}><span className="font-semibold">{p.name}:</span> {summarize(p, nm)}</li>)}</ul>
            {samplesUsed(t).length > 0 && <p className="mt-2 text-xs text-gray-500">{samplesUsed(t).length} sample messages are copied into your library so you can edit them.</p>}
          </div>
          <div><h3 className="mb-2 font-bold">Readiness check</h3><ReadinessList items={readiness.items} /></div>
          {!readiness.ok && <Banner tone="warn">You can create it now and fix the blockers before turning it on.</Banner>}
        </div>
      )}
    </Modal>
  );
}

type NameLookupMsg = (id?: string) => string | undefined;

function TemplateList({ title, list, onUse }: { title: string; list: AutomationTemplate[]; onUse: (id: string) => void }) {
  const { manage, del } = usePerms();
  const nav = useNav();
  const names = useNames();
  const library = useLibrary();
  const { confirm, dialog } = useConfirm();
  const nm = { ...names, message: (id?: string) => library.find((m) => m.id === id)?.name ?? sampleById(id ?? '')?.name };
  const group = (label: string, items: AutomationTemplate[]) => (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">{label}</h3>
      {items.length === 0 ? <p className="text-sm text-gray-500">None yet. Save any automation or journey as a template.</p> : (
        <ul className="space-y-2">
          {items.map((t) => (
            <li key={t.id} className={`${CARD} p-4`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-bold text-gray-900 dark:text-white"><LayoutTemplate className="h-4 w-4 text-gray-500" />{t.name}{t.source === 'SYSTEM' ? <Badge tone="gray">From Estimate Master</Badge> : <Badge tone="blue">v{t.version}</Badge>}</div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{t.kind === 'AUTOMATION' && t.automations[0] ? summarize(t.automations[0], nm) : t.description}</p>
                  {t.kind === 'JOURNEY' && <p className="mt-1 text-xs text-gray-500">{t.automations.length} automations · {t.blanks.length} blanks to fill in</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {manage && <Button size="sm" variant="primary" onClick={() => onUse(t.id)}>Use this template</Button>}
                  <RowMenu label={`Actions for ${t.name}`} items={[
                    ...(manage ? [{ label: 'Duplicate', icon: <Copy />, onSelect: () => { const r = duplicateTemplate(t.id); if (r.ok) toast.success('Duplicated', 'The copy is under Yours.'); } }] : []),
                    ...(manage && t.source === 'BUSINESS' ? [{ label: 'Edit', icon: <Pencil />, onSelect: () => nav.push(`/automations/templates/${t.id}`) }] : []),
                    ...(del && t.source === 'BUSINESS' ? [{ label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => confirm({ title: `Delete "${t.name}"?`, body: 'Automations made from it are not changed.', label: 'Delete', onConfirm: () => { const r = deleteTemplate(t.id); if (r.ok) toast.success('Template deleted'); } }) }] : []),
                    ...(t.source === 'SYSTEM' ? [{ label: 'System templates can’t be edited or deleted', disabled: true, reason: 'Duplicate it to make your own copy.', onSelect: () => {} }] : []),
                  ]} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <section>
      <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
      {group('From Estimate Master', list.filter((t) => t.source === 'SYSTEM'))}
      {group('Yours', list.filter((t) => t.source === 'BUSINESS'))}
      {dialog}
    </section>
  );
}

export function TemplatesTab() {
  const s = useAuto((x) => x);
  const nav = useNav();
  const { manage } = usePerms();
  const [use, setUse] = useState<string>();
  const [newKind, setNewKind] = useState<AutomationTemplate['kind']>();
  const [newName, setNewName] = useState('');
  const list = allTemplates(s);
  return (
    <div>
      {manage && <div className="mb-4 flex justify-end"><Button onClick={() => { setNewKind('AUTOMATION'); setNewName(''); }}><Plus className="h-4 w-4" /> New template</Button></div>}
      <div className="grid gap-8 lg:grid-cols-2">
        <TemplateList title="Journey templates" list={list.filter((t) => t.kind === 'JOURNEY')} onUse={setUse} />
        <TemplateList title="Automation templates" list={list.filter((t) => t.kind === 'AUTOMATION')} onUse={setUse} />
      </div>
      {use && <UseTemplateModal templateId={use} onClose={() => setUse(undefined)} />}
      <Modal open={!!newKind} onOpenChange={(o) => !o && setNewKind(undefined)} title="New template"
        footer={<><Button onClick={() => setNewKind(undefined)}>Cancel</Button><Button variant="primary" onClick={() => {
          if (newName.trim().length < 3) return toast.error('Name needed', 'Use at least 3 characters.');
          const r = createBlankTemplate(newKind!, newName);
          if (!r.ok) return toast.error('Not created', r.error);
          setNewKind(undefined);
          nav.push(`/automations/templates/${r.value}`);
        }}>Create and edit</Button></>}>
        <Field label="Name" htmlFor="nt-name" required><Input id="nt-name" value={newName} onChange={(e) => setNewName(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
