'use client';

/*
  Settings > SMS Templates. Left: list of SMS templates. Right: body editor
  with a live character / segment count (160 characters per SMS segment,
  1600 max), clickable variable chips and "Reset to default".
  Writes the `smsTemplates` collection.
*/
import React, { useRef, useState } from 'react';
import { MessageSquare, RotateCcw, Save } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import { cn } from '@/lib/utils';
import { TemplateListItem, VariablesBox } from './ui';
import { insertAt } from './AutomatedMessagesView';

const MAX = 1600;
const segments = (n: number) => (n === 0 ? 0 : n <= 160 ? 1 : Math.ceil(n / 153));

export function SmsTemplatesView() {
  const { items, update } = useCollection('smsTemplates');
  const { toast } = useToast();
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');
  const active = items.find((t) => t.id === activeId);
  const [body, setBody] = useState(active?.body ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);

  const select = (id: string) => {
    setActiveId(id);
    setBody(items.find((t) => t.id === id)?.body ?? '');
  };

  const dirty = !!active && body !== active.body;
  const save = () => {
    if (!active) return;
    if (!body.trim()) return toast('Message body is required', 'error');
    if (body.length > MAX) return toast(`Message cannot exceed ${MAX} characters`, 'error');
    update(active.id, { body });
    toast('SMS template updated successfully');
  };
  const reset = () => {
    if (!active?.defaultBody) return;
    setBody(active.defaultBody);
    update(active.id, { body: active.defaultBody });
    toast('SMS template reset to default');
  };

  return (
    <SettingsPage wide title="SMS Templates" subtitle="Customize the default SMS templates sent to clients.">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-4">
          {items.length === 0 && <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">No SMS templates.</p>}
          {items.map((t) => (
            <TemplateListItem key={t.id} active={t.id === activeId} icon={<MessageSquare />} title={t.name} subtitle={t.body} onClick={() => select(t.id)} />
          ))}
        </div>
        <div className="lg:col-span-8">
          {active ? (
            <div className="rounded-2xl bg-white p-6 shadow-lg md:p-7">
              <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
                <h3 className="font-heading text-lg font-bold text-gray-900">{active.name}</h3>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xxs font-bold uppercase tracking-wider text-gray-500">SMS</span>
              </div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label className="mb-0">Message Body</Label>
                <span className={cn('text-xs', body.length > MAX ? 'font-bold text-red-600' : 'text-gray-400')}>
                  {body.length} / {MAX} chars · {segments(body.length)} segment{segments(body.length) === 1 ? '' : 's'}
                </span>
              </div>
              <Textarea ref={ref} rows={3} value={body} invalid={body.length > MAX} placeholder="Enter SMS message body..." onChange={(e) => setBody(e.target.value)} className="min-h-[72px]" />
              <div className="mt-5">
                <VariablesBox
                  variables={active.availableVariables}
                  onInsert={(v) => setBody((b) => insertAt(ref.current, b, v))}
                  hint="Copy and paste these codes into your message. They will be automatically replaced with actual data when sending."
                />
              </div>
              <div className="mt-8 flex items-center justify-between border-t border-gray-100 pt-4">
                <Button variant="ghost" disabled={!active.defaultBody || active.body === active.defaultBody} icon={<RotateCcw className="h-4 w-4" />} onClick={reset}>Reset to Default</Button>
                <Button onClick={save} disabled={!dirty} icon={<Save className="h-4 w-4" />}>Save Changes</Button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[300px] items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400">Select a template to edit</div>
          )}
        </div>
      </div>
    </SettingsPage>
  );
}
