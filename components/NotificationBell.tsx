'use client';

/*
  Header bell: the signed-in person's notifications (patent 12: estimate accepted),
  plus Automations notices (spec 6.12). An "Ask me first" item has an Approve
  button; approving happens in the app only, never by email.
*/
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Popover from '@radix-ui/react-popover';
import { Bell, CheckCircle2 } from 'lucide-react';
import { act, useCurrentUser, useDb } from '@/features/lib/store';
import { markAllNotificationsRead, markNotificationRead } from '@/features/lib/store/actions/notifications';
import { dateTime } from '@/features/lib/format';
import { cn } from '@/lib/utils';
import { can } from '@/features/lib/permissions';
import { approveReviewItem, useAuto } from '@/lib/automations/store';
import { toast } from '@/features/lib/toast';

export function NotificationBell() {
  const router = useRouter();
  const user = useCurrentUser();
  const all = useDb((d) => d.notifications);
  const [open, setOpen] = useState(false);
  const reviews = useAuto((x) => x.reviews);
  const canReview = can(user, 'automation.review');
  const mine = (all ?? []).filter((n) => n.userId === user.id).slice(0, 20);
  const unread = mine.filter((n) => !n.readAt).length;

  const openOne = (id: string, href: string) => {
    act(markNotificationRead, id);
    setOpen(false);
    router.push(href);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="relative rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell className="h-6 w-6" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white ring-2 ring-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-[150] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="font-bold text-gray-900">Notifications</span>
            {unread > 0 && (
              <button onClick={() => act(markAllNotificationsRead)} className="text-xs font-semibold text-primary-600 hover:underline">
                Mark all as read
              </button>
            )}
          </div>
          {mine.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center text-sm text-gray-500">
              <CheckCircle2 className="h-6 w-6 text-gray-300" />
              You&apos;re all caught up. You&apos;ll be told here about accepted estimates, new leads and QuickBooks problems.
            </div>
          ) : (
            <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
              {mine.map((n) => (
                <li key={n.id} className="relative">
                  <button onClick={() => openOne(n.id, n.href)} className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-gray-50', !n.readAt && 'bg-primary-50/40')}>
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary-600')} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900">{n.title}</span>
                      <span className="block text-xs text-gray-600">{n.body}</span>
                      <span className="mt-0.5 block text-xs text-gray-500">{dateTime(n.createdAt)}{!n.readAt && <span className="sr-only"> · unread</span>}</span>
                    </span>
                  </button>
                  {n.reviewItemId && canReview && reviews.some((r) => r.id === n.reviewItemId && r.status === 'WAITING') && (
                    <button
                      onClick={() => { const r = approveReviewItem(n.reviewItemId!); if (r.ok) { act(markNotificationRead, n.id); toast.success('Approved', 'The step runs now.'); } else toast.error('Not approved', r.error); }}
                      className="absolute right-3 top-3 rounded-lg bg-primary-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-primary-700"
                    >
                      Approve
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canReview && (
            <div className="border-t border-gray-100 px-4 py-2 text-right">
              <button onClick={() => { setOpen(false); router.push('/automations?tab=review'); }} className="text-xs font-semibold text-primary-600 hover:underline">See all</button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
