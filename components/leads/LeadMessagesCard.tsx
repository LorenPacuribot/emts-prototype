'use client';

/*
  Automated Messages card on Lead Details (patent 1): messages waiting for
  their send time, each with Cancel, then the latest sent, failed and
  cancelled ones.
*/
import React from 'react';
import { Clock, Mail, MessageSquare, Send } from 'lucide-react';
import type { Lead } from '@/lib/types';
import { cn } from '@/lib/utils';
import { pendingMessages } from '@/lib/lead-messages';

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const ChannelIcon = ({ channel }: { channel: 'EMAIL' | 'SMS' }) =>
  channel === 'EMAIL' ? <Mail className="h-4 w-4 shrink-0 text-gray-500" aria-label="Email" /> : <MessageSquare className="h-4 w-4 shrink-0 text-gray-500" aria-label="Text message" />;

export function LeadMessagesCard({ lead, onCancel }: { lead: Lead; onCancel: (id: string) => void }) {
  const waiting = pendingMessages(lead).sort((a, b) => a.sendAt.localeCompare(b.sendAt));
  const history = [
    ...(lead.sentMessages ?? []).map((m) => ({ key: `s-${m.messageId}-${m.channel}-${m.at}`, name: m.name, channel: m.channel, at: m.at, state: m.ok ? (m.sandbox ? 'Sent (sandbox)' : 'Sent') : `Failed: ${m.error ?? 'unknown error'}`, tone: m.ok ? 'text-green-700' : 'text-red-600' })),
    ...(lead.scheduledMessages ?? []).filter((m) => m.cancelledAt).map((m) => ({ key: `c-${m.id}`, name: m.name, channel: m.channel, at: m.cancelledAt!, state: m.cancelReason ?? 'Canceled', tone: 'text-gray-500' })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

  if (!waiting.length && !history.length) return null;
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-gray-500"><Send className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-widest">Automated Messages</span></div>
      {waiting.length > 0 && (
        <ul className="mb-4 space-y-2">
          {waiting.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
              <ChannelIcon channel={m.channel} />
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate font-bold text-gray-900">{m.name}</div>
                <div className="flex items-center gap-1 text-xs text-blue-800"><Clock className="h-3 w-3" /> Scheduled for {when(m.sendAt)} · to {m.to}</div>
              </div>
              <button type="button" onClick={() => onCancel(m.id)} className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
      {history.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {history.map((h) => (
            <li key={h.key} className="flex items-center gap-3 py-2 text-sm">
              <ChannelIcon channel={h.channel} />
              <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{h.name}</span>
              <span className={cn('shrink-0 text-xs font-semibold', h.tone)}>{h.state}</span>
              <span className="shrink-0 text-xs text-gray-500">{when(h.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
