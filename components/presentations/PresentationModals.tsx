'use client';

/*
  Presentation modals:
  - CreatePresentationModal: live "New Presentation" modal (Presentation Name
    + "Estimate Template Source" checklist of estimate types). Creates a draft
    with the default sections and opens the builder.
  - ShareModal: copy the viewer link and share by email. Emails are saved to
    presentation.sharedWith. Sharing a Draft publishes it (a draft link would
    not open for a customer in the live app).
*/
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, Link2, Mail, Send, X } from 'lucide-react';
import type { Presentation } from '@/lib/types';
import { useCollection, useSingleton } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { COVER_GRADIENTS, defaultSections } from './presentation-utils';

/**
 * Estimate templates a presentation is used for (Client Preview picks it for
 * estimates made from these templates), grouped by estimate type.
 */
export function EstimateTemplateChecklist({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { items: types } = useCollection('estimateTypes');
  const { items: templates } = useCollection('estimateTemplates');
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  if (!templates.length) return <p className="py-2 text-sm text-gray-400">No estimate templates yet. Add them in Settings › Estimate Templates.</p>;
  return (
    <div className="max-h-56 space-y-3 overflow-y-auto rounded-xl border border-gray-200 p-2">
      {[...types].sort((a, b) => a.sortOrder - b.sortOrder).map((t) => {
        const list = templates.filter((x) => x.estimateTypeId === t.id);
        if (!list.length) return null;
        return (
          <div key={t.id}>
            <div className="px-2 pb-1 text-xxs font-bold uppercase tracking-wider text-gray-400">{t.name}</div>
            {list.map((x) => (
              <div key={x.id} className={cn('rounded-lg p-2', value.includes(x.id) ? 'bg-primary-50' : 'hover:bg-gray-50')}>
                <Checkbox checked={value.includes(x.id)} onChange={() => toggle(x.id)} label={<span className="font-medium">{x.name}</span>} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function CreatePresentationModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New Presentation" size="lg">
      {open && <CreateForm onDone={() => onOpenChange(false)} />}
    </Modal>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const { items: types } = useCollection('estimateTypes');
  const { items: templates } = useCollection('estimateTemplates');
  const { items: all, add } = useCollection('presentations');
  const [biz] = useSingleton('businessProfile');
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Presentation name is required';
    if (selected.length === 0) e.types = 'Select at least one estimate template';
    setErrors(e);
    if (Object.keys(e).length) return;
    const now = new Date().toISOString();
    const chosen = templates.filter((t) => selected.includes(t.id));
    const saved = add(
      {
        title: name.trim(),
        description: '',
        status: 'Draft',
        theme: 'blue',
        // A presentation used in Client Preview is a template for its estimates.
        isTemplate: true,
        templateIds: chosen.map((t) => t.id),
        scopes: types.filter((t) => chosen.some((x) => x.estimateTypeId === t.id)).map((t) => t.name),
        cover: COVER_GRADIENTS[all.length % COVER_GRADIENTS.length]!,
        sections: defaultSections(biz.companyName),
        views: 0,
        sharedWith: [],
        createdAt: now,
        updatedAt: now,
      },
      { atStart: true },
    );
    toast('Presentation created successfully');
    onDone();
    router.push(`/presentations/${saved.id}`);
  };

  return (
    <div className="space-y-6">
      <Field label="Presentation Name" required error={errors.name}>
        <Input placeholder="e.g. Smith Residence Proposal" value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} onClear={() => setName('')} />
      </Field>
      <div>
        <Field label="Used for Estimate Templates" required error={errors.types}>
          {selected.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {selected.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                  {templates.find((t) => t.id === id)?.name ?? id}
                  <button onClick={() => setSelected((s) => s.filter((x) => x !== id))} className="rounded-full p-0.5 hover:bg-blue-100" aria-label={`Remove ${templates.find((t) => t.id === id)?.name ?? id}`}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
          <EstimateTemplateChecklist value={selected} onChange={setSelected} />
          <p className="mt-1.5 text-xs text-gray-500">Client Preview offers this presentation for estimates made from these templates.</p>
        </Field>
      </div>
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button onClick={create}>Create Presentation</Button>
      </div>
    </div>
  );
}

/* ---------------- Share ---------------- */

export function ShareModal({ presentation, open, onOpenChange }: { presentation: Presentation; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Share Presentation" description={presentation.title} size="md">
      {open && <ShareForm p={presentation} />}
    </Modal>
  );
}

function ShareForm({ p }: { p: Presentation }) {
  const { update } = useCollection('presentations');
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const link = typeof window !== 'undefined' ? `${window.location.origin}/presentations/${p.id}/view` : `/presentations/${p.id}/view`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copied to clipboard');
    } catch {
      toast('Could not copy. Select the link and copy it manually.', 'error');
    }
  };

  const share = () => {
    const list = email.split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!list.length) return setError('Enter at least one email');
    const bad = list.find((x) => !/^\S+@\S+\.\S+$/.test(x));
    if (bad) return setError(`"${bad}" is not a valid email`);
    const next = Array.from(new Set([...p.sharedWith, ...list]));
    update(p.id, { sharedWith: next, status: 'Published', updatedAt: new Date().toISOString() });
    setEmail('');
    setError('');
    toast(`Shared with ${list.length} ${list.length === 1 ? 'person' : 'people'}`);
  };

  return (
    <div className="space-y-6">
      {p.status === 'Draft' && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">This presentation is a draft. Sharing it by email will publish it.</p>
      )}
      <div>
        <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-600">Presentation Link</div>
        <div className="flex gap-2">
          <Input readOnly value={link} leftIcon={<Link2 className="h-4 w-4" />} onFocus={(e) => e.target.select()} />
          <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={copy}>Copy</Button>
        </div>
      </div>
      <div>
        <Field label="Share by Email" error={error}>
          <div className="flex gap-2">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@email.com" leftIcon={<Mail className="h-4 w-4" />} invalid={!!error} onKeyDown={(e) => e.key === 'Enter' && share()} />
            <Button icon={<Send className="h-4 w-4" />} onClick={share}>Share</Button>
          </div>
        </Field>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-gray-600">
          <span>Shared With</span>
          <span className="flex items-center gap-1 normal-case tracking-normal text-gray-400"><Eye className="h-3.5 w-3.5" /> {p.views} {p.views === 1 ? 'view' : 'views'}</span>
        </div>
        {p.sharedWith.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 py-4 text-center text-sm text-gray-400">Not shared with anyone yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {p.sharedWith.map((e) => (
              <li key={e} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-gray-700">{e}</span>
                <button onClick={() => update(p.id, { sharedWith: p.sharedWith.filter((x) => x !== e) })} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${e}`}>
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
