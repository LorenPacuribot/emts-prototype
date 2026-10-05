'use client';

/*
  Messages tab (spec 6.11): every customer email and text automations
  send, in one library shared with Settings › Automated Messages and SMS
  Templates. Account messages (password emails) are not listed.
*/
import { useState } from 'react';
import { Copy, Pencil, Plus, Search, Send, Trash2 } from 'lucide-react';
import { useAuto } from '@/lib/automations/store';
import { useNav } from '@/features/lib/navigation';
import { toast } from '@/features/lib/toast';
import { Badge, Button, Input, RowMenu } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { useLibrary, useMessageActions, usePerms } from './hooks';
import { MessageEditor } from './MessageEditor';
import { DeleteMessageModal } from './BoardTab';
import { CARD, EmptyNote, relTime } from './shared';

export function MessagesTab() {
  const library = useLibrary();
  const automations = useAuto((s) => s.automations);
  const perms = usePerms();
  const nav = useNav();
  const actions = useMessageActions();
  const [chip, setChip] = useState<'ALL' | 'EMAIL' | 'SMS'>('ALL');
  const [q, setQ] = useState('');
  const [editor, setEditor] = useState<{ id?: string; start?: Parameters<typeof MessageEditor>[0]['start'] }>();
  const [del, setDel] = useState<string>();
  const rows = library.filter((m) => (chip === 'ALL' || m.channel === chip) && (!q || `${m.name} ${m.subject ?? ''} ${m.body}`.toLowerCase().includes(q.toLowerCase())));
  const needsApproval = new Set(automations.filter((a) => a.needsReapproval && !a.isDeleted).flatMap((a) => a.steps.map((s) => s.config.messageId)));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Channel">
          {(['ALL', 'EMAIL', 'SMS'] as const).map((c) => (
            <button key={c} type="button" aria-pressed={chip === c} onClick={() => setChip(c)} className={cn('rounded-full border px-3 py-1 text-sm font-semibold', chip === c ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600')}>
              {c === 'ALL' ? 'All' : c === 'EMAIL' ? 'Email' : 'SMS'}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input aria-label="Search messages" placeholder="Search messages" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        {perms.manage && <Button variant="primary" className="ml-auto" onClick={() => setEditor({})}><Plus className="h-4 w-4" /> New message</Button>}
      </div>
      {rows.length === 0 ? <EmptyNote>No messages match.</EmptyNote> : (
        <ul className={cn(CARD, 'divide-y divide-gray-100 dark:divide-gray-700')}>
          {rows.map((m) => (
            <li key={m.id} className="flex items-start gap-3 px-4 py-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditor({ id: m.id })}>
                <div className="flex flex-wrap items-center gap-2 font-semibold text-gray-900 dark:text-white">
                  {m.name}<Badge tone={m.channel === 'SMS' ? 'indigo' : 'gray'}>{m.channel === 'SMS' ? 'SMS' : 'Email'}</Badge>
                  {needsApproval.has(m.id) && <Badge tone="amber">Change waiting for approval</Badge>}
                </div>
                <p className="truncate text-sm text-gray-600 dark:text-gray-300">{m.body.split('\n').find((l) => l.trim())}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                  {m.usedInAutomationIds.length ? (
                    <span role="link" tabIndex={0} className="font-semibold text-primary-700 hover:underline" onClick={(e) => { e.stopPropagation(); nav.push('/automations?tab=all'); }}>
                      {m.usedInAutomationIds.length} {m.usedInAutomationIds.length === 1 ? 'automation' : 'automations'}
                    </span>
                  ) : <span>Not used yet</span>}
                  <span>{m.updatedAt ? `Last edited ${relTime(m.updatedAt)}, by ${m.updatedBy}` : 'From Settings'}</span>
                  <span>Version {m.version}</span>
                </div>
              </button>
              <RowMenu label={`Actions for ${m.name}`} items={[
                { label: perms.manage ? 'Edit' : 'Open', icon: <Pencil />, onSelect: () => setEditor({ id: m.id }) },
                ...(perms.manage ? [{ label: 'Duplicate', icon: <Copy />, onSelect: () => setEditor({ start: { name: `${m.name} (copy)`, channel: m.channel, subject: m.subject, body: m.body, category: m.category } }) }] : []),
                { label: 'Send me a test', icon: <Send />, onSelect: () => toast.success('Test sent', `"${m.name}" sent to you (${perms.user.email}). Sandbox: recorded, not delivered.`) },
                ...(perms.del ? [{ label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => setDel(m.id) }] : []),
              ]} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-gray-500">Account messages such as password emails are system messages: they are not listed here and can't be used in automations.</p>
      <MessageEditor open={!!editor} messageId={editor?.id} start={editor?.start} onClose={() => setEditor(undefined)} />
      <DeleteMessageModal id={del} onClose={() => setDel(undefined)} remove={actions.remove} />
    </div>
  );
}
