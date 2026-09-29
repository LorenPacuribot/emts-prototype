'use client';

/*
  Left-column dashboard cards: My Tasks, Messages, Recent Leads, Jobs To Do
  and Activity. Layout and copy follow the live app widgets
  (features/(main)/dashboard/components/*).
*/
import React, { useState } from 'react';
import Link from 'next/link';
import { CheckSquare, ChevronRight, Clock, Mail, MapPin, MessageSquare, Plus, Square, Trash2, UserPlus } from 'lucide-react';
import { useCollection } from '@/lib/store';
import { JOB_STATUS_BADGE } from '@/lib/constants';
import type { Activity, Lead, Message } from '@/lib/types';
import { cn, shortDate, uid } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { EmptyLine, SectionHeader } from './SectionHeader';
import type { DashboardData } from './metrics';

/* ---------- Relative times ---------- */

function relativeTime(iso: string, suffix: boolean) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m${suffix ? ' ago' : ''}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h${suffix ? ' ago' : ''}`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d${suffix ? ' ago' : ''}`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ---------- My Tasks ---------- */

export function TasksWidget() {
  const { items, add, update, remove } = useCollection('tasks');
  const { toast } = useToast();
  const [text, setText] = useState('');
  const tasks = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const completed = tasks.filter((t) => t.done).length;

  const handleAdd = () => {
    const title = text.trim();
    if (!title) return;
    add({ id: uid('tk'), text: title, done: false, createdAt: new Date().toISOString() }, { atStart: true });
    setText('');
    toast('Task created');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-2">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-primary-500" />
          <h3 className="text-xs font-black uppercase tracking-[0.15em] text-gray-500">My Tasks</h3>
        </div>
        <span className="text-xs font-bold text-gray-500">{completed}/{tasks.length}</span>
      </div>

      <div className="relative mb-4">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Add a task..."
          aria-label="New task"
          className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-3 pr-9 text-xs placeholder:text-gray-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
        />
        <button
          onClick={handleAdd}
          disabled={!text.trim()}
          aria-label="Add task"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded bg-primary-600 p-1 text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {tasks.length === 0 ? (
          <div className="py-6 text-center text-xs italic text-gray-500">No tasks yet. Add one above!</div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                'group flex items-center gap-2 rounded-lg border p-2 transition-all',
                task.done ? 'border-transparent bg-gray-50 opacity-60' : 'border-gray-100 bg-white hover:border-primary-200',
              )}
            >
              <button
                onClick={() => {
                  update(task.id, { done: !task.done });
                  toast(task.done ? 'Task marked incomplete' : 'Task completed');
                }}
                aria-label={task.done ? 'Mark incomplete' : 'Mark complete'}
                className={cn('shrink-0', task.done ? 'text-green-500' : 'text-gray-300 hover:text-primary-500')}
              >
                {task.done ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              </button>
              <p className={cn('min-w-0 flex-1 break-words text-xs font-medium leading-snug', task.done ? 'text-gray-500 line-through' : 'text-gray-900')}>
                {task.text}
              </p>
              <button
                onClick={() => {
                  remove(task.id);
                  toast('Task deleted');
                }}
                aria-label="Delete task"
                className="rounded p-1 text-gray-500 transition-all hover:bg-red-50 hover:text-red-500 lg:opacity-0 lg:group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------- Messages ---------- */

const AVATAR_PALETTE = [
  'bg-rose-100 text-rose-600', 'bg-blue-100 text-blue-600', 'bg-indigo-100 text-indigo-600',
  'bg-green-100 text-green-600', 'bg-amber-100 text-amber-600', 'bg-purple-100 text-purple-600',
];
function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export function MessagesWidget({ items }: { items: Message[] }) {
  return (
    <div className="flex h-full flex-col">
      <SectionHeader title="Messages" icon={MessageSquare} colorClass="text-rose-500" href="/contacts" />
      <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
        {items.length === 0 ? (
          <EmptyLine>No recent conversations.</EmptyLine>
        ) : (
          items.map((m) => {
            const Icon = m.channel === 'email' ? Mail : MessageSquare;
            const body = (
              <>
                <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm', avatarColor(m.customerId ?? m.id))}>
                  {(m.from.trim()[0] ?? '?').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-xs font-bold text-gray-900 group-hover:text-primary-600">{m.from || 'Unknown'}</span>
                      <Icon className={cn('h-3 w-3 shrink-0', m.channel === 'email' ? 'text-blue-500' : 'text-green-500')} />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {m.unread && <span className="h-1.5 w-1.5 rounded-full bg-primary-500" aria-label="Unread" />}
                      <span className="text-xs font-bold text-gray-500">{relativeTime(m.date, false)}</span>
                    </div>
                  </div>
                  <p className={cn('truncate text-xs', m.unread ? 'font-semibold text-gray-700' : 'text-gray-500')}>{m.preview}</p>
                </div>
              </>
            );
            return m.customerId ? (
              <Link key={m.id} href={`/contacts/${m.customerId}`} className="group -m-1 flex gap-3 rounded-xl p-1 transition-all hover:bg-gray-50">
                {body}
              </Link>
            ) : (
              <div key={m.id} className="group -m-1 flex gap-3 rounded-xl p-1">{body}</div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ---------- Recent Leads ---------- */

function sourceBadge(source: string) {
  const s = source.toLowerCase();
  if (s.includes('web') || s.includes('facebook')) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (s.includes('google')) return 'bg-green-50 text-green-700 border-green-200';
  if (s.includes('referral')) return 'bg-purple-50 text-purple-700 border-purple-200';
  return 'bg-gray-50 text-gray-600 border-gray-200';
}

export function RecentLeadsWidget({ leads }: { leads: Lead[] }) {
  return (
    <div className="flex h-full flex-col">
      <SectionHeader title="Recent Leads" icon={UserPlus} colorClass="text-purple-500" href="/leads" />
      <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto">
        {leads.length === 0 ? (
          <EmptyLine>No recent leads.</EmptyLine>
        ) : (
          leads.map((lead) => {
            const d = new Date(lead.createdAt);
            return (
              <Link key={lead.id} href={`/leads/${lead.id}`} className="group flex items-center gap-3 rounded-xl border border-transparent p-2 transition-all hover:border-gray-100 hover:bg-gray-50">
                <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                  <span className="text-xxs font-bold uppercase leading-none text-gray-500">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
                  <span className="mt-0.5 text-sm font-black leading-none text-gray-900">{d.getDate()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-bold text-gray-900">{lead.firstName} {lead.lastName}</h4>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">{lead.leadSource || 'N/A'}</span>
                  </div>
                </div>
                <span className={cn('rounded-full border px-2 py-0.5 text-xxs font-bold uppercase tracking-wide', sourceBadge(lead.leadSource))}>
                  {lead.leadSource || 'N/A'}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ---------- Jobs To Do ---------- */

export function JobsToDoWidget({ jobs }: { jobs: DashboardData['jobsToDo'] }) {
  return (
    <div className="flex h-full flex-col">
      <SectionHeader title="Jobs To Do" icon={CheckSquare} colorClass="text-green-500" href="/jobs" />
      <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pb-1 pr-1">
        {jobs.length === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center">
            <p className="text-xs italic text-gray-500">No active jobs.</p>
          </div>
        ) : (
          jobs.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`} className="group block space-y-2 rounded-xl border border-gray-100 bg-white p-3 shadow-sm transition-all hover:border-primary-300 hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className={cn('rounded-full border px-2 py-0.5 text-xxs font-black uppercase leading-none tracking-wider', JOB_STATUS_BADGE[job.status])}>
                  {job.status}
                </span>
                <span className="text-xs font-black text-gray-500">{job.startDate ? shortDate(job.startDate) : 'TBD'}</span>
              </div>
              <div className="flex items-center justify-between">
                <h4 className="truncate text-sm font-black leading-tight text-gray-900 group-hover:text-primary-700">{job.customerName}</h4>
                <ChevronRight className="h-4 w-4 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-primary-500" />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------- Activity ---------- */

const ENTITY_HREF: Record<NonNullable<Activity['entity']>, string> = {
  lead: '/leads', estimate: '/estimates', job: '/jobs', invoice: '/invoices',
};

export function ActivityWidget({ items }: { items: Activity[] }) {
  return (
    <div className="flex h-full flex-col">
      <SectionHeader title="Activity" icon={Clock} colorClass="text-orange-500" href="/reports?tab=activity" />
      <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-xs italic text-gray-500">No recent activity.</p>
          </div>
        ) : (
          items.map((a) => {
            const inner = (
              <>
                <div className="mb-1 text-xxs font-bold uppercase text-gray-500">{relativeTime(a.date, true)}</div>
                <div className="text-sm font-bold leading-tight text-gray-900">{a.text}</div>
              </>
            );
            return a.entity && a.entityId ? (
              <Link key={a.id} href={`${ENTITY_HREF[a.entity]}/${a.entityId}`} className="flex flex-col hover:opacity-80">{inner}</Link>
            ) : (
              <div key={a.id} className="flex flex-col">{inner}</div>
            );
          })
        )}
      </div>
    </div>
  );
}
