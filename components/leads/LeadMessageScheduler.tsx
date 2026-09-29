'use client';

/*
  Sends delayed stage messages when their time comes (patent 1). Checks every
  30 seconds and when the tab regains focus while a staff member is signed
  in. A due message is taken off the lead's schedule before it is sent, so a
  later check (or another open tab) never sends it twice; the result is
  logged in sentMessages like an immediate send.
*/
import { useCallback, useEffect, useRef } from 'react';
import { useCollection, useLogActivity } from '@/lib/store';
import { deliver, dueMessages, scheduledToPlanned } from '@/lib/lead-messages';
import { getSession } from '@/features/lib/auth/client-session';
import { fullName } from '@/lib/utils';

const CHECK_MS = 30_000;

export function LeadMessageScheduler() {
  const leads = useCollection('leads');
  const log = useLogActivity();
  const ref = useRef({ leads, log });
  ref.current = { leads, log };

  const run = useCallback(() => {
    if (!getSession()) return;
    const nowIso = new Date().toISOString();
    for (const lead of ref.current.leads.items) {
      const due = dueMessages(lead, nowIso);
      if (!due.length) continue;
      const ids = new Set(due.map((m) => m.id));
      ref.current.leads.update(lead.id, { scheduledMessages: (lead.scheduledMessages ?? []).filter((m) => !ids.has(m.id)) });
      void Promise.all(due.map((m) => deliver(scheduledToPlanned(m), m.stage))).then((results) => {
        const current = ref.current.leads.get(lead.id);
        if (current) ref.current.leads.update(lead.id, { sentMessages: [...(current.sentMessages ?? []), ...results] });
        for (const r of results) {
          ref.current.log(
            r.ok
              ? `Scheduled message "${r.name}" sent to ${fullName(lead)} by ${r.channel === 'EMAIL' ? 'email' : 'SMS'}${r.sandbox ? ' (sandbox)' : ''}`
              : `Scheduled message "${r.name}" to ${fullName(lead)} failed: ${r.error ?? 'unknown error'}`,
            'lead',
            lead.id,
          );
        }
      });
    }
  }, []);

  useEffect(() => {
    run();
    const t = setInterval(run, CHECK_MS);
    window.addEventListener('focus', run);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', run);
    };
  }, [run]);
  return null;
}
