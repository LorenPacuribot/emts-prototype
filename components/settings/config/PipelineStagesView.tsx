'use client';

/*
  Settings > Pipeline Stages ("Pipeline Configuration"). One card per lead
  stage with an editable display name. The colored bar under each name is the
  stage color: click it to pick a new color. The stage IDs (NEW, SOLD...) are
  fixed. "Save Changes" writes all edits to the `pipelineStages` collection;
  the Lead Pipeline board uses these names and colors.
*/
import React, { useState } from 'react';
import { Kanban, Save } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import type { PipelineStage } from '@/lib/types';

export function PipelineStagesView() {
  const { items, setAll } = useCollection('pipelineStages');
  const { toast } = useToast();
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const [draft, setDraft] = useState<Record<string, { displayName: string; color: string }>>(
    () => Object.fromEntries(sorted.map((s) => [s.id, { displayName: s.displayName, color: s.color }])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dirty = sorted.some((s) => draft[s.id] && (draft[s.id]!.displayName !== s.displayName || draft[s.id]!.color.toLowerCase() !== s.color.toLowerCase()));
  const set = (id: string, patch: Partial<{ displayName: string; color: string }>) => {
    setDraft((d) => ({ ...d, [id]: { ...d[id]!, ...patch } }));
    if (patch.displayName !== undefined) setErrors((e) => ({ ...e, [id]: '' }));
  };

  const save = () => {
    const e: Record<string, string> = {};
    const seen = new Map<string, string>();
    sorted.forEach((s) => {
      const name = draft[s.id]!.displayName.trim();
      if (!name) e[s.id] = 'Display name is required';
      else if (name.length > 30) e[s.id] = 'Keep it under 30 characters';
      else if (seen.has(name.toLowerCase())) e[s.id] = 'Each stage needs a unique name';
      seen.set(name.toLowerCase(), s.id);
    });
    setErrors(e);
    if (Object.keys(e).length) {
      toast('Please fix the validation errors before saving', 'error');
      return;
    }
    setAll(items.map((s): PipelineStage => ({ ...s, displayName: draft[s.id]!.displayName.trim(), color: draft[s.id]!.color })));
    toast('Pipeline stages updated successfully');
  };

  return (
    <SettingsPage title="Pipeline Configuration" subtitle="Customize the column names for your lead tracking board.">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {sorted.map((s) => {
          const d = draft[s.id]!;
          return (
            <div key={s.id} className="rounded-2xl bg-white p-5 shadow-lg">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${d.color}1A`, color: d.color }}>
                  <Kanban className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Stage ID</div>
                  <div className="text-xs font-bold text-gray-700">{s.stageId}</div>
                </div>
              </div>
              <Field label="Display Name" required error={errors[s.id]}>
                <Input value={d.displayName} invalid={!!errors[s.id]} onChange={(e) => set(s.id, { displayName: e.target.value })} onClear={() => set(s.id, { displayName: '' })} />
              </Field>
              <label className="mt-5 block cursor-pointer border-t border-gray-100 pt-4" title="Click to change the stage color">
                <span className="sr-only">{s.stageId} color</span>
                <span className="block h-1.5 w-full rounded-full" style={{ backgroundColor: d.color }} />
                <input type="color" value={d.color} onChange={(e) => set(s.id, { color: e.target.value.toUpperCase() })} className="sr-only" />
              </label>
            </div>
          );
        })}
      </div>
      <div className="mt-8 flex justify-end">
        <Button onClick={save} disabled={!dirty} icon={<Save className="h-4 w-4" />}>Save Changes</Button>
      </div>
    </SettingsPage>
  );
}
