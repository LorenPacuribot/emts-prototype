'use client';

/*
  Automations home (spec 6.1): header with "New automation", the tab row
  (kept in the URL as ?tab=), and the health strip. With no automations
  yet, Board and All automations show the empty state instead.
*/
import { useState } from 'react';
import * as DM from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Layers, LayoutTemplate, Plus, Route, Settings2, Zap } from 'lucide-react';
import type { PipelineModule } from '@/lib/automations/types';
import { PIPELINES, stagesOf } from '@/lib/automations/registry';
import { createForStage, healthOf, useAuto } from '@/lib/automations/store';
import { useNav, useParam } from '@/features/lib/navigation';
import { toast } from '@/features/lib/toast';
import { Screen, PageHeader } from '@/features/components/layout/screen';
import { Banner, Button } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { usePerms } from './hooks';
import { BoardTab } from './BoardTab';
import { AllAutomationsTab } from './AllAutomationsTab';
import { MessagesTab } from './MessagesTab';
import { TemplatesTab } from './TemplatesTab';
import { ActivityTab } from './ActivityTab';
import { ReviewTab } from './ReviewTab';
import { ModuleSettingsModal } from './modals';
import { CARD } from './shared';

type Tab = 'board' | 'all' | 'messages' | 'templates' | 'activity' | 'review';

function EmptyState({ onJourney, onBoard }: { onJourney: () => void; onBoard: () => void }) {
  return (
    <div className={cn(CARD, 'mx-auto max-w-3xl p-8 text-center')}>
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700"><Zap className="h-6 w-6" /></span>
      <h2 className="font-heading text-2xl font-bold text-gray-900 dark:text-white">Let the app handle the next steps</h2>
      <p className="mt-2 text-gray-600 dark:text-gray-300">Set up a full journey in a few minutes, or build automations one at a time.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={onJourney} className="rounded-2xl border-2 border-primary-200 p-5 text-left hover:border-primary-400 hover:bg-primary-50/50">
          <Route className="mb-2 h-6 w-6 text-primary-700" /><div className="font-bold">Set up a full journey</div><div className="text-sm text-gray-600 dark:text-gray-300">From first lead to final payment, from a ready template.</div>
        </button>
        <button type="button" onClick={onBoard} className="rounded-2xl border-2 border-gray-200 p-5 text-left hover:border-primary-300 dark:border-gray-700">
          <Layers className="mb-2 h-6 w-6 text-gray-700 dark:text-gray-200" /><div className="font-bold">Start with one automation</div><div className="text-sm text-gray-600 dark:text-gray-300">Drag building blocks onto the stage you want.</div>
        </button>
      </div>
    </div>
  );
}

export function AutomationsHome() {
  const nav = useNav();
  const tabParam = (useParam('tab') as Tab | undefined) ?? 'board';
  const journeyParam = useParam('journey') ?? '';
  const pipelineParam = useParam('pipeline') as PipelineModule | undefined;
  const stageParam = useParam('stage');
  const automationParam = useParam('automation');
  const runParam = useParam('run');
  const itemParam = useParam('item');
  const s = useAuto((x) => x);
  const perms = usePerms();
  const [pipeline, setPipeline] = useState<PipelineModule>(pipelineParam && PIPELINES.includes(pipelineParam) ? pipelineParam : 'LEAD');
  const [journeyId, setJourneyId] = useState(journeyParam);
  const [boardForced, setBoardForced] = useState(!!stageParam || !!journeyParam);
  const [settings, setSettings] = useState(false);
  const health = healthOf(s);
  const tab: Tab = tabParam === 'review' && !perms.review ? 'board' : tabParam;
  const go = (t: Tab, extra = '') => nav.push(`/automations?tab=${t}${extra}`);
  const live = s.automations.filter((a) => !a.isDeleted);
  const empty = live.length === 0 && !boardForced;

  if (!perms.view) {
    return (
      <Screen crumbs={[{ label: 'Automations' }]}>
        <Banner tone="warn" title="No access">Your role can't see Automations. Ask the business owner for access.</Banner>
      </Screen>
    );
  }

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'board', label: 'Board' },
    { value: 'all', label: 'All automations', count: live.length },
    { value: 'messages', label: 'Messages' },
    { value: 'templates', label: 'Templates' },
    { value: 'activity', label: 'Activity' },
    ...(perms.review ? [{ value: 'review' as Tab, label: 'Waiting for review', count: health.waiting }] : []),
  ];

  const startBlank = () => {
    const r = createForStage(pipeline, stagesOf(pipeline)[0]!.value, [], 'New automation');
    if (!r.ok) return toast.error('Not created', r.error);
    nav.push(`/automations/${r.value!.id}`);
  };

  return (
    <Screen crumbs={[{ label: 'Automations' }]}>
      <PageHeader
        title="Automations"
        subtitle="Set up each next step once. It happens on its own, or lands with the right person."
        details="Deploying an automation approves its steps to run on their own, including customer messages. Mark any step “Ask me first” to review it each time. Customer messages always respect opt-outs and the 8 a.m. to 7 p.m. contact window."
        actions={<>
          <Button onClick={() => setSettings(true)}><Settings2 className="h-4 w-4" /> Settings</Button>
          {perms.manage && (
            <DM.Root>
              <DM.Trigger asChild><Button variant="primary"><Plus className="h-4 w-4" /> New automation <ChevronDown className="h-4 w-4" /></Button></DM.Trigger>
              <DM.Portal>
                <DM.Content align="end" sideOffset={4} className="z-50 min-w-56 rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:bg-gray-800">
                  <DM.Item onSelect={startBlank} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100"><Plus className="h-4 w-4" /> Start from blank</DM.Item>
                  <DM.Item onSelect={() => go('templates')} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100"><LayoutTemplate className="h-4 w-4" /> Start from a template</DM.Item>
                  <DM.Item onSelect={() => go('templates')} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100"><Route className="h-4 w-4" /> Set up a full journey</DM.Item>
                </DM.Content>
              </DM.Portal>
            </DM.Root>
          )}
        </>}
      />
      <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 no-scrollbar dark:bg-gray-900" role="tablist" aria-label="Automations sections">
        {tabs.map((t) => (
          <button key={t.value} role="tab" aria-selected={tab === t.value} onClick={() => go(t.value)}
            className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold', tab === t.value ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-600 hover:text-gray-900 dark:text-gray-300')}>
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className={cn('rounded-full px-1.5 text-xs font-bold', t.value === 'review' ? 'bg-amber-100 text-amber-800' : 'text-gray-500')}>{t.count}</span>}
          </button>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-x-1 text-sm text-gray-600 dark:text-gray-300" aria-label="Health">
        <button className="hover:underline" onClick={() => go('all')}>{health.on} {health.on === 1 ? 'automation' : 'automations'} on</button>
        <span aria-hidden>·</span>
        <button className={cn('hover:underline', health.problems && 'font-semibold text-red-700')} onClick={() => go('activity')}>{health.problems} {health.problems === 1 ? 'problem' : 'problems'}</button>
        {perms.review && <><span aria-hidden>·</span><button className={cn('hover:underline', health.waiting && 'font-semibold text-amber-800')} onClick={() => go('review')}>{health.waiting} waiting for review</button></>}
        {(() => { const c = s.settings.sending; return !c.provider ? <><span aria-hidden>·</span><span className="text-xs text-gray-500">Sending provider not set up</span></> : null; })()}
      </div>

      {(tab === 'board' || tab === 'all') && empty ? (
        <EmptyState onJourney={() => go('templates')} onBoard={() => { setBoardForced(true); go('board'); }} />
      ) : tab === 'board' ? <BoardTab pipeline={pipeline} setPipeline={setPipeline} journeyId={journeyId} setJourneyId={setJourneyId} focusStage={stageParam} />
        : tab === 'all' ? <AllAutomationsTab initialJourney={journeyParam || undefined} />
        : tab === 'messages' ? <MessagesTab />
        : tab === 'templates' ? <TemplatesTab />
        : tab === 'activity' ? <ActivityTab initialAutomation={automationParam} initialRun={runParam} />
        : <ReviewTab initialItem={itemParam} />}
      <ModuleSettingsModal open={settings} onClose={() => setSettings(false)} />
    </Screen>
  );
}
