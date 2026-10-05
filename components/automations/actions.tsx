'use client';

/*
  One set of automation actions for the board, the list and the editor:
  On/Off (the first switch-on opens the Deploy modal), rename, edit,
  duplicate, save as template, view activity, test run, archive, restore and
  delete, each with its modal.
*/
import { useState } from 'react';
import { Archive, ArchiveRestore, Copy, FlaskConical, History, LayoutTemplate, Pencil, PenLine, Trash2 } from 'lucide-react';
import type { Automation } from '@/lib/automations/types';
import { archiveAutomations, duplicateAutomation, renameAutomation, restoreAutomations, saveAsTemplate, setEnabled, useAuto } from '@/lib/automations/store';
import { stepDef } from '@/lib/automations/registry';
import { validateName } from '@/lib/automations/validation';
import { useNav } from '@/features/lib/navigation';
import { toast } from '@/features/lib/toast';
import { Button, Checkbox, Field, Input, Modal, type MenuItem } from '@/features/components/ui';
import { usePerms } from './hooks';
import { DeleteModal, DeployModal, TestRunModal, TurnOffModal } from './modals';

export function RenameModal({ automation, onClose }: { automation?: Automation; onClose: () => void }) {
  const automations = useAuto((s) => s.automations);
  const [name, setName] = useState(automation?.name ?? '');
  const [touched, setTouched] = useState(false);
  const err = validateName(name, automations.filter((a) => !a.isDeleted && a.id !== automation?.id).map((a) => a.name));
  const save = () => {
    setTouched(true);
    if (err || !automation) return;
    const r = renameAutomation(automation.id, name);
    if (!r.ok) return toast.error('Not renamed', r.error);
    toast.success('Renamed');
    onClose();
  };
  return (
    <Modal open={!!automation} onOpenChange={(o) => !o && onClose()} title="Rename automation" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <Field label="Name" htmlFor="rn-name" required error={touched ? err : undefined}><Input id="rn-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
    </Modal>
  );
}

const PERSON_KEYS = ['userId', 'notifyUserId', 'assignUserId'];

export function SaveAsTemplateModal({ ids, journeyId, onClose }: { ids?: string[]; journeyId?: string; onClose: () => void }) {
  const automations = useAuto((s) => s.automations);
  const journeys = useAuto((s) => s.journeys);
  const templates = useAuto((s) => s.templates);
  const list = (ids ?? []).map((id) => automations.find((a) => a.id === id)).filter((a): a is Automation => !!a);
  const journey = journeys.find((j) => j.id === journeyId);
  const [name, setName] = useState(journey?.name ?? list[0]?.name ?? '');
  const [description, setDescription] = useState('');
  const [keepPeople, setKeepPeople] = useState(false);
  const [touched, setTouched] = useState(false);
  const err = validateName(name, templates.filter((t) => !t.isDeleted).map((t) => t.name), 'template name');
  const people = list.flatMap((a) => a.steps.filter((st) => PERSON_KEYS.some((k) => st.config[k])).map((st) => `${a.name}: ${stepDef(st.type)?.title}`));
  const save = () => {
    setTouched(true);
    if (err) return;
    const r = saveAsTemplate({ automationIds: list.map((a) => a.id), journeyId, name, description, keepPeople });
    if (!r.ok) return toast.error('Not saved', r.error);
    toast.success('Template saved', 'Find it under Templates › Yours.');
    onClose();
  };
  return (
    <Modal open={!!ids} onOpenChange={(o) => !o && onClose()} title={journeyId ? 'Save journey as template' : 'Save as template'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save template</Button></>}>
      <div className="space-y-3 text-sm">
        <Field label="Name" htmlFor="st-name" required error={touched ? err : undefined}><Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Short description" htmlFor="st-desc"><Input id="st-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900">
          <p className="font-semibold">What is kept</p>
          <p className="text-xs text-gray-600">The When, every step and its settings, delays, "Only if" conditions and messages ({list.length} {list.length === 1 ? 'automation' : 'automations'}).</p>
          <p className="mt-2 font-semibold">What is cleared</p>
          <p className="text-xs text-gray-600">{people.length ? `People picked in steps, because the next use may need different people: ${people.join('; ')}.` : 'Nothing: no step picks a person.'}</p>
        </div>
        {people.length > 0 && <Checkbox checked={keepPeople} onCheckedChange={setKeepPeople} label="Keep the people in the template" />}
      </div>
    </Modal>
  );
}

export function useAutomationActions() {
  const nav = useNav();
  const perms = usePerms();
  const [deploy, setDeploy] = useState<{ ids: string[]; journeyId?: string }>();
  const [off, setOff] = useState<{ ids: string[]; journeyId?: string }>();
  const [del, setDel] = useState<string[]>();
  const [test, setTest] = useState<string[]>();
  const [rename, setRename] = useState<Automation>();
  const [tpl, setTpl] = useState<{ ids: string[]; journeyId?: string }>();

  /** The On/Off switch. */
  const toggle = (a: Automation, on: boolean) => {
    if (!perms.manage) return toast.error('View only', 'You need permission to turn automations on or off.');
    if (!on) return setOff({ ids: [a.id] });
    if (!a.steps.length) return toast.error('Add a step first', 'An automation needs at least one step before it can be turned on.');
    if (!a.deployedAt || a.needsReapproval) return setDeploy({ ids: [a.id] });
    const r = setEnabled([a.id], true);
    if (!r.ok) toast.error('Not turned on', r.error);
    else toast.success(`${a.name} is on`);
  };

  const items = (a: Automation, opts: { inEditor?: boolean } = {}): MenuItem[] => {
    const list: MenuItem[] = [];
    if (perms.manage) list.push({ label: 'Rename', icon: <PenLine />, onSelect: () => setRename(a) });
    if (!opts.inEditor) list.push({ label: perms.manage ? 'Edit in full editor' : 'Open', icon: <Pencil />, onSelect: () => nav.push(`/automations/${a.id}`) });
    if (perms.manage) {
      list.push({ label: 'Duplicate', icon: <Copy />, onSelect: () => { const r = duplicateAutomation(a.id); if (r.ok) toast.success('Duplicated', 'The copy is Off.'); else toast.error('Not duplicated', r.error); } });
      list.push({ label: 'Save as template', icon: <LayoutTemplate />, onSelect: () => setTpl({ ids: [a.id] }) });
    }
    list.push({ label: 'View activity', icon: <History />, onSelect: () => nav.push(`/automations?tab=activity&automation=${a.id}`) });
    list.push({ label: 'Test run', icon: <FlaskConical />, onSelect: () => setTest([a.id]) });
    if (perms.manage && !a.isArchived) list.push({ label: 'Archive', icon: <Archive />, onSelect: () => { const r = archiveAutomations([a.id]); if (r.ok) toast.success('Archived', 'Find it again with "Show archived".'); else toast.error('Not archived', r.error); } });
    if (perms.manage && a.isArchived) list.push({ label: 'Restore', icon: <ArchiveRestore />, onSelect: () => { const r = restoreAutomations([a.id]); if (r.ok) toast.success('Restored', 'It is Off.'); } });
    if (perms.del) list.push({ label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => setDel([a.id]) });
    return list;
  };

  const modals = (
    <>
      <DeployModal open={!!deploy} ids={deploy?.ids ?? []} journeyId={deploy?.journeyId} onClose={() => setDeploy(undefined)} />
      <TurnOffModal open={!!off} ids={off?.ids ?? []} journeyId={off?.journeyId} onClose={() => setOff(undefined)} />
      <DeleteModal open={!!del} ids={del ?? []} onClose={() => setDel(undefined)} onDone={() => { if (location.pathname !== '/automations') nav.push('/automations?tab=all'); }} />
      <TestRunModal open={!!test} ids={test ?? []} onClose={() => setTest(undefined)} />
      <RenameModal key={rename?.id ?? 'none'} automation={rename} onClose={() => setRename(undefined)} />
      {tpl && <SaveAsTemplateModal ids={tpl.ids} journeyId={tpl.journeyId} onClose={() => setTpl(undefined)} />}
    </>
  );

  return {
    toggle, items, modals,
    openDeploy: (ids: string[], journeyId?: string) => setDeploy({ ids, journeyId }),
    openTurnOff: (ids: string[], journeyId?: string) => setOff({ ids, journeyId }),
    openDelete: (ids: string[]) => setDel(ids),
    openTest: (ids: string[]) => setTest(ids),
    openSaveTemplate: (ids: string[], journeyId?: string) => setTpl({ ids, journeyId }),
  };
}
