'use client';

/*
  New Features panel (prototype only), at the top of the dashboard
  (#new-features). One place to see every new feature, where to find it, and
  switch it on or off; it replaces the NEW badges scattered across screens.

  - "Show new features": the master switch. Off hides every new feature and
    the prototype looks like the live app; the rows keep their ticks.
  - Tour: starts that feature's own short tour (components/tour/feature-tours.ts).
  - Minimal / Complete per feature. Complete builds on Minimal (ticking it
    ticks Minimal; unticking Minimal unticks Complete). Built features have no
    split: Minimal is "the feature as built", Complete shows "—".
  - "Show NEW badges on screens" brings the green badges and the
    Minimal / Complete markers back, for walkthroughs.

  Rows come from features/lib/feature-registry.ts; the choices live in
  features/lib/feature-visibility.ts (this browser, reset with the demo data).
*/
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Compass, Sparkles } from 'lucide-react';
import { Checkbox } from '@/components/ui/form';
import { Badge, Button, Card, CardTitle, Switch, Table, TD, TH, THead } from '@/features/components/ui';
import { FEATURES, type FeatureDef } from '@/features/lib/feature-registry';
import { useVisibility } from '@/features/lib/feature-visibility';
import { useStartTour } from '@/features/components/tour/product-tour';
import { FEATURE_TOURS } from '@/features/components/tour/feature-tours';
import { cn } from '@/lib/utils';

const GROUPS: { id: FeatureDef['group']; label: string }[] = [
  { id: 'built', label: 'Core modules (each built as one package)' },
  { id: 'sep30', label: 'From the 30 Sep call' },
];

export function NewFeaturesPanel() {
  const v = useVisibility();
  const startTour = useStartTour();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const showing = v.showNew ? FEATURES.filter((f) => v.rows[f.key]?.minimal).length : 0;

  // Opened from a switched-off screen or the Prototype bar (/dashboard#new-features).
  useEffect(() => {
    if (window.location.hash === '#new-features') document.getElementById('new-features')?.scrollIntoView({ block: 'start' });
  }, []);

  return (
    <Card id="new-features" className="mb-6 scroll-mt-24 p-5 md:p-6">
      <CardTitle
        icon={<Sparkles />}
        className="mb-1"
        right={
          <>
            <Button size="sm" variant="secondary" disabled={!v.showNew} onClick={v.allMinimal}>All Minimal</Button>
            <Button size="sm" variant="secondary" disabled={!v.showNew} onClick={v.allComplete}>All Complete</Button>
            <Button size="sm" variant="secondary" onClick={v.reset}>Reset</Button>
          </>
        }
      >
        New Features
      </CardTitle>
      <p className="mb-4 text-xs text-gray-500">{showing} of {FEATURES.length} features showing</p>

      <div className="mb-4">
        <Checkbox
          checked={v.showNew}
          onChange={v.setShowNew}
          label={<span className="font-semibold text-gray-900">Show new features</span>}
        />
        {!v.showNew && <p className="mt-1 pl-6 text-xs text-gray-500">Every new feature is hidden. The prototype looks like the live app.</p>}
      </div>

      <div className={cn(!v.showNew && 'pointer-events-none opacity-50')} aria-disabled={!v.showNew}>
        <Table>
          <THead>
            <tr>
              <TH>Feature</TH>
              <TH>Breakdown</TH>
              <TH>Where to find it</TH>
              <TH className="text-center">Minimal</TH>
              <TH className="text-center">Complete</TH>
            </tr>
          </THead>
          <tbody>
            {GROUPS.map((g) => (
              <React.Fragment key={g.id}>
                <tr className="bg-gray-50/60">
                  <td colSpan={5} className="border-b border-line px-3 py-2 text-xxs font-black uppercase tracking-[0.15em] text-gray-500">{g.label}</td>
                </tr>
                {FEATURES.filter((f) => f.group === g.id).map((f) => {
                  const row = v.rows[f.key];
                  const disabled = !v.showNew || !f.built;
                  const expanded = !!open[f.key];
                  return (
                    <tr key={f.key} className="border-b border-line align-top last:border-0">
                      <TD className="min-w-[180px] align-top">
                        <div className="font-bold text-gray-900">{f.name}</div>
                        <div className="mt-0.5 text-xs text-gray-500">{f.number ? `Feature ${f.number} · Core module` : `${f.prefix} · Minimal + Complete`}</div>
                        {!f.built && <Badge tone="gray" className="mt-1">Not built yet</Badge>}
                        {f.built && FEATURE_TOURS[f.key] && (
                          <button
                            type="button"
                            disabled={!row?.minimal || !v.showNew}
                            title={row?.minimal ? undefined : 'Switch the feature on to take its tour'}
                            onClick={() => startTour(f.key)}
                            className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-0.5 text-xs font-bold text-primary-700 hover:border-primary-300 disabled:cursor-not-allowed disabled:text-gray-400"
                          >
                            <Compass className="h-3 w-3" /> Tour
                          </button>
                        )}
                      </TD>
                      <TD className="max-w-[360px] whitespace-normal align-top">
                        <p className="text-gray-600">{f.breakdown}</p>
                        <button
                          type="button"
                          onClick={() => setOpen({ ...open, [f.key]: !expanded })}
                          aria-expanded={expanded}
                          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700"
                        >
                          Details <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
                        </button>
                        {expanded && (
                          <div className="mt-2 space-y-2 text-xs">
                            <PartList title={f.parts.complete.length ? 'Minimal' : 'Parts'} items={f.parts.minimal} />
                            {f.parts.complete.length > 0 && <PartList title="Complete" items={f.parts.complete} />}
                          </div>
                        )}
                      </TD>
                      <TD className="whitespace-normal align-top">
                        <ul className="space-y-1">
                          {f.where.map((w) => (
                            <li key={w.href + w.label}>
                              <Link href={w.href} className="text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline">{w.label}</Link>
                            </li>
                          ))}
                        </ul>
                      </TD>
                      <TD className="text-center align-top">
                        <Checkbox
                          checked={!!row?.minimal}
                          disabled={disabled}
                          onChange={(on) => v.setMinimal(f.key, on)}
                          ariaLabel={`Show Minimal version of ${f.name}`}
                        />
                      </TD>
                      <TD className="text-center align-top">
                        {f.parts.complete.length === 0 ? (
                          <span className="text-gray-400" aria-label="No Complete version">—</span>
                        ) : (
                          <Checkbox
                            checked={!!row?.complete}
                            disabled={disabled}
                            onChange={(on) => v.setComplete(f.key, on)}
                            ariaLabel={`Show Complete version of ${f.name}`}
                          />
                        )}
                      </TD>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </Table>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <Switch checked={v.showBadges} onCheckedChange={v.setShowBadges} label={<span className="text-sm text-gray-700">Show NEW badges on screens</span>} />
      </div>
    </Card>
  );
}

function PartList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="font-bold uppercase tracking-wider text-gray-500">{title}</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-gray-600">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </div>
  );
}
