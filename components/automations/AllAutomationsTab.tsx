'use client';

/*
  All automations tab (spec 6.5): a short list with a plain sentence per
  automation, not a wide table. Filters, search, bulk actions (turn on, turn
  off, move to journey, archive, delete) and the row menu. Journeys sit
  above the list: each turns on and off as one.
*/
import { useMemo, useState } from 'react';
import { FlaskConical, LayoutTemplate, Pencil, Plus, Rocket, Search, Trash2 } from 'lucide-react';
import type { Automation, PipelineModule } from '@/lib/automations/types';
import { MODULE_LABEL, PIPELINES, boardPlacement } from '@/lib/automations/registry';
import { archiveAutomations, deleteJourney, moveToJourney, setEnabled, useAuto } from '@/lib/automations/store';
import { useNav } from '@/features/lib/navigation';
import { toast } from '@/features/lib/toast';
import { Badge, Button, Checkbox, Input, Modal, RowMenu, Select, Switch } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { usePerms } from './hooks';
import { useAutomationActions } from './actions';
import { JourneyModal } from './modals';
import { CARD, EmptyNote, useConfirm } from './shared';

export function AllAutomationsTab({ initialJourney }: { initialJourney?: string }) {
  const automations = useAuto((s) => s.automations);
  const journeys = useAuto((s) => s.journeys);
  const perms = usePerms();
  const nav = useNav();
  const actions = useAutomationActions();
  const { confirm, dialog } = useConfirm();
  const [q, setQ] = useState('');
  const [pipeline, setPipeline] = useState<'' | PipelineModule>('');
  const [journey, setJourney] = useState(initialJourney ?? '');
  const [onOff, setOnOff] = useState<'' | 'on' | 'off'>('');
  const [problems, setProblems] = useState(false);
  const [archived, setArchived] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTo, setMoveTo] = useState('');
  const [journeyModal, setJourneyModal] = useState<{ id?: string }>();

  const rows = useMemo(() => automations.filter((a) => !a.isDeleted && (archived ? a.isArchived : !a.isArchived)
    && (!q || a.name.toLowerCase().includes(q.toLowerCase()))
    && (!pipeline || boardPlacement(a.trigger).pipeline === pipeline)
    && (!journey || (journey === 'none' ? !a.journeyId : a.journeyId === journey))
    && (!onOff || (onOff === 'on' ? a.isEnabled : !a.isEnabled))
    && (!problems || a.problemCount > 0 || a.needsReapproval)), [automations, q, pipeline, journey, onOff, problems, archived]);

  const toggleSel = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const selected = sel.filter((id) => rows.some((r) => r.id === id));
  const bulkOn = () => {
    const list = selected.map((id) => automations.find((a) => a.id === id)!).filter(Boolean);
    const needDeploy = list.filter((a) => !a.deployedAt || a.needsReapproval).map((a) => a.id);
    const ready = list.filter((a) => a.deployedAt && !a.needsReapproval).map((a) => a.id);
    if (ready.length) { const r = setEnabled(ready, true); if (!r.ok) toast.error('Not turned on', r.error); else toast.success(`${ready.length} turned on`); }
    if (needDeploy.length) actions.openDeploy(needDeploy);
  };

  const journeyMenu = (id: string) => {
    const j = journeys.find((x) => x.id === id)!;
    const ids = j.automationIds;
    return [
      { label: 'Rename', icon: <Pencil />, onSelect: () => setJourneyModal({ id }) },
      { label: 'Show on the board', icon: <Rocket />, onSelect: () => nav.push(`/automations?tab=board&journey=${id}`) },
      { label: 'Test run', icon: <FlaskConical />, onSelect: () => actions.openTest(ids) },
      { label: 'Save journey as template', icon: <LayoutTemplate />, onSelect: () => actions.openSaveTemplate(ids, id) },
      ...(perms.del ? [{ label: 'Delete journey', icon: <Trash2 />, danger: true, onSelect: () => confirm({ title: `Delete "${j.name}"?`, body: 'Its automations are kept and become "Not in a journey".', label: 'Delete', onConfirm: () => { const r = deleteJourney(id); if (r.ok) toast.success('Journey deleted'); } }) }] : []),
    ];
  };

  const toggleJourney = (id: string, on: boolean) => {
    const j = journeys.find((x) => x.id === id)!;
    const list = j.automationIds.map((x) => automations.find((a) => a.id === x)).filter((a): a is Automation => !!a && !a.isDeleted && !a.isArchived);
    if (!on) return actions.openTurnOff(list.map((a) => a.id), id);
    const needDeploy = list.filter((a) => !a.deployedAt || a.needsReapproval);
    if (needDeploy.length) return actions.openDeploy(list.map((a) => a.id), id);
    const r = setEnabled(list.map((a) => a.id), true);
    if (!r.ok) toast.error('Not turned on', r.error); else toast.success(`${j.name} is on`);
  };

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Journeys</h2>
          {perms.manage && <Button size="sm" onClick={() => setJourneyModal({})}><Plus className="h-4 w-4" /> New journey</Button>}
        </div>
        {journeys.length === 0 ? <EmptyNote>No journeys yet. Set one up from Templates, or create one and move automations into it.</EmptyNote> : (
          <ul className="grid gap-2 md:grid-cols-2">
            {journeys.map((j) => {
              const list = j.automationIds.map((x) => automations.find((a) => a.id === x)).filter((a): a is Automation => !!a && !a.isDeleted);
              const on = list.filter((a) => a.isEnabled).length;
              return (
                <li key={j.id} className={cn(CARD, 'flex items-start gap-3 p-4')}>
                  <Switch checked={j.isEnabled} onCheckedChange={(v) => toggleJourney(j.id, v)} disabled={!perms.manage || !list.length} label={<span className="sr-only">Journey on</span>} />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setJourney(j.id)}>
                    <div className="font-bold text-gray-900 dark:text-white">{j.name}</div>
                    <div className="text-xs text-gray-500">{list.length} automations · {on} on{j.stuckMultiplier && j.stuckMultiplier !== 1 ? ` · stuck alerts ×${j.stuckMultiplier}` : ''}</div>
                  </button>
                  <RowMenu label={`Actions for ${j.name}`} items={journeyMenu(j.id)} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input aria-label="Search by name" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <Select aria-label="Pipeline" className="w-40" value={pipeline} onChange={(e) => setPipeline(e.target.value as PipelineModule | '')}>
            <option value="">All pipelines</option>{PIPELINES.map((p) => <option key={p} value={p}>{MODULE_LABEL[p]}</option>)}
          </Select>
          <Select aria-label="Journey" className="w-48" value={journey} onChange={(e) => setJourney(e.target.value)}>
            <option value="">All journeys</option><option value="none">Not in a journey</option>{journeys.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </Select>
          <Select aria-label="On or off" className="w-32" value={onOff} onChange={(e) => setOnOff(e.target.value as '' | 'on' | 'off')}>
            <option value="">On and off</option><option value="on">On</option><option value="off">Off</option>
          </Select>
          <Checkbox checked={problems} onCheckedChange={setProblems} label="Has problems" />
          <Checkbox checked={archived} onCheckedChange={setArchived} label="Show archived" />
        </div>

        {selected.length > 0 && perms.manage && (
          <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-sm dark:bg-primary-900/30">
            <span className="font-semibold">{selected.length} selected</span>
            <Button size="sm" onClick={bulkOn}>Turn on</Button>
            <Button size="sm" onClick={() => actions.openTurnOff(selected)}>Turn off</Button>
            <Button size="sm" onClick={() => setMoveOpen(true)}>Move to journey</Button>
            <Button size="sm" onClick={() => { const r = archiveAutomations(selected); if (r.ok) { toast.success(`${selected.length} archived`); setSel([]); } }}>Archive</Button>
            {perms.del && <Button size="sm" variant="danger" onClick={() => actions.openDelete(selected)}>Delete</Button>}
            <button className="ml-auto text-xs font-semibold text-gray-600 hover:underline" onClick={() => setSel([])}>Clear</button>
          </div>
        )}

        {rows.length === 0 ? <EmptyNote>{archived ? 'No archived automations.' : 'No automations match.'}</EmptyNote> : (
          <ul className={cn(CARD, 'divide-y divide-gray-100 dark:divide-gray-700')}>
            {rows.map((a) => {
              const p = boardPlacement(a.trigger);
              const jn = journeys.find((j) => j.id === a.journeyId)?.name;
              return (
                <li key={a.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
                  <div className="flex items-center gap-3">
                    {perms.manage && <Checkbox checked={sel.includes(a.id)} onCheckedChange={() => toggleSel(a.id)} label={<span className="sr-only">Select {a.name}</span>} />}
                    <Switch checked={a.isEnabled} onCheckedChange={(v) => actions.toggle(a, v)} disabled={!perms.manage || a.isArchived} label={<span className="sr-only">{a.isEnabled ? 'On' : 'Off'}</span>} />
                  </div>
                  <button type="button" onClick={() => nav.push(`/automations/${a.id}`)} className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2 font-semibold text-gray-900 dark:text-white">
                      {a.name}
                      {!a.deployedAt && <Badge tone="gray">Not deployed</Badge>}
                      {a.needsReapproval && <Badge tone="amber">Waiting for approval</Badge>}
                      {a.templateUpdated && <Badge tone="blue">Template updated</Badge>}
                      {a.isArchived && <Badge tone="gray">Archived</Badge>}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{a.summary}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                      <span>{jn ?? 'Not in a journey'}</span><span>{MODULE_LABEL[p.pipeline]}</span><span>{a.runsLast7Days} runs in the last 7 days</span>
                      {a.problemCount > 0 && <span className="font-semibold text-red-600">{a.problemCount} failed</span>}
                    </div>
                  </button>
                  <RowMenu label={`Actions for ${a.name}`} items={actions.items(a)} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Modal open={moveOpen} onOpenChange={setMoveOpen} title={`Move ${selected.length} to a journey`}
        footer={<><Button onClick={() => setMoveOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => { const r = moveToJourney(selected, moveTo || undefined); if (r.ok) toast.success('Moved'); setMoveOpen(false); }}>Move</Button></>}>
        <Select aria-label="Journey" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
          <option value="">Not in a journey</option>{journeys.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
        </Select>
      </Modal>
      {journeyModal && <JourneyModal open journeyId={journeyModal.id} onClose={() => setJourneyModal(undefined)} />}
      {actions.modals}
      {dialog}
    </div>
  );
}
