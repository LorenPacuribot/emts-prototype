'use client';

/*
  Settings › Pipeline Stages › Lead sources (2 Oct 2026, D6).

  The organisation's own list of lead sources. Eight are built in and can't
  be deleted or switched off (Website, Facebook, Instagram, Google, Referral,
  Repaint alert, Manual, Other). Admins add, rename and deactivate the rest.
  A name is required, at most 30 characters and unique; a source with leads
  can be deactivated, not deleted. Tracked links pick from the active
  sources, and the board's Source filter and Group by Source use the list.
  Rules: features/lib/rules/lead-sources.ts.
*/
import React, { useState } from 'react';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import { cn, uid } from '@/lib/utils';
import { useCurrentUser } from '@/features/lib/store';
import { can } from '@/features/lib/permissions';
import { NewBadge } from '@/features/components/ui';
import { MAX_SOURCE_NAME, deactivateBlocker, deleteBlocker, renamed, resolveSource, validateSourceName } from '@/features/lib/rules/lead-sources';

export function LeadSourcesPanel() {
  const sources = useCollection('leadSources');
  const { items: leads } = useCollection('leads');
  const links = useCollection('trackedLinks');
  const { toast } = useToast();
  // Admin-only (Owner and Admin; ADMIN_MASTER_DATA).
  const admin = can(useCurrentUser(), 'settings.masterData');
  const [name, setName] = useState('');
  const [addError, setAddError] = useState<string>();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const count = (sourceName: string) => leads.filter((l) => resolveSource(l.leadSource, sources.items) === sourceName).length;

  const add = () => {
    const problem = validateSourceName(name, sources.items);
    if (problem) return setAddError(problem);
    sources.add({ id: uid('src'), name: name.trim(), builtIn: false, active: true });
    toast(`${name.trim()} added`);
    setName('');
    setAddError(undefined);
  };
  const rename = (id: string) => {
    const next = edits[id] ?? '';
    const problem = validateSourceName(next, sources.items, id);
    if (problem) return setErrors({ ...errors, [id]: problem });
    const source = sources.items.find((s) => s.id === id)!;
    const before = source.name;
    const updated = renamed(source, next);
    sources.update(id, { name: updated.name, aliases: updated.aliases });
    // Tracked links follow the new name; leads keep theirs and still resolve through the alias.
    links.items.filter((l) => l.source === before).forEach((l) => links.update(l.id, { source: updated.name }));
    const rest = { ...edits };
    delete rest[id];
    setEdits(rest);
    setErrors({ ...errors, [id]: '' });
    toast(`${before} renamed to ${next.trim()}`);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">
        <span className="flex items-center gap-2">Lead sources <NewBadge /></span>
        <span>{sources.items.filter((s) => s.active).length} active</span>
      </div>
      <ul>
        {sources.items.map((s) => {
          const leadsHere = count(s.name);
          const value = edits[s.id] ?? s.name;
          const del = deleteBlocker(s, leadsHere);
          const off = deactivateBlocker(s);
          return (
            <li key={s.id} className={cn('flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3 last:border-0', !s.active && 'bg-gray-50')}>
              <div className="min-w-[200px] flex-1">
                {!admin ? <span className="text-sm font-semibold text-gray-900">{s.name}</span> : <div className="flex items-center gap-2">
                  <Input
                    aria-label={`${s.name} name`}
                    value={value}
                    maxLength={MAX_SOURCE_NAME + 10}
                    disabled={!admin}
                    invalid={!!errors[s.id]}
                    onChange={(e) => setEdits({ ...edits, [s.id]: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && value !== s.name && rename(s.id)}
                  />
                  {value !== s.name && <Button size="sm" onClick={() => rename(s.id)}>Save</Button>}
                </div>}
                {errors[s.id] && <p className="mt-1 text-xs text-red-600">{errors[s.id]}</p>}
              </div>
              {s.builtIn && (
                <span className="flex items-center gap-1 text-xs font-semibold text-gray-500" title="Built in: rename only">
                  <Lock className="h-3.5 w-3.5" /> Built in
                </span>
              )}
              <span className="w-20 text-right text-xs text-gray-500">{leadsHere} {leadsHere === 1 ? 'lead' : 'leads'}</span>
              {!admin && <span className={cn('text-xs font-semibold', s.active ? 'text-green-700' : 'text-gray-500')}>{s.active ? 'Active' : 'Inactive'}</span>}
              {admin && <Button
                size="sm"
                variant="secondary"
                disabled={!!off}
                title={off}
                onClick={() => { sources.update(s.id, { active: !s.active }); toast(`${s.name} ${s.active ? 'deactivated' : 'activated'}`); }}
              >
                {s.active ? 'Deactivate' : 'Activate'}
              </Button>}
              {admin && <button
                type="button"
                onClick={() => { sources.remove(s.id); toast(`${s.name} deleted`); }}
                disabled={!!del}
                aria-label={`Delete ${s.name}`}
                title={del ?? 'Delete source'}
                className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Trash2 className="h-4 w-4" />
              </button>}
            </li>
          );
        })}
      </ul>
      {admin && (
        <div className="border-t border-gray-100 px-5 py-3">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-[200px] flex-1">
              <Input
                aria-label="New source name"
                placeholder="e.g. Truck wrap"
                value={name}
                invalid={!!addError}
                onChange={(e) => { setName(e.target.value); setAddError(undefined); }}
                onKeyDown={(e) => e.key === 'Enter' && add()}
              />
              {addError && <p className="mt-1 text-xs text-red-600">{addError}</p>}
            </div>
            <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={add}>Add source</Button>
          </div>
          <p className="mt-2 text-xs text-gray-500">Up to {MAX_SOURCE_NAME} characters. A source with leads can be deactivated, not deleted.</p>
        </div>
      )}
    </div>
  );
}
