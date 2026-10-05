'use client';

/*
  Turns website form submissions waiting at /api/website-form into leads.
  Runs while someone is signed in: on load, every 30 seconds and when the tab
  regains focus. submitWebsiteForm is idempotent by reference, so two open
  browsers draining the same inbox still create one lead.
*/
import { useEffect } from 'react';
import { useCollection } from '@/lib/store';
import type { LeadSourceDef } from '@/lib/types';
import { leadSourceFor } from '@/features/lib/rules/lead-sources';
import { act, useStore } from '@/features/lib/store';
import { submitWebsiteForm } from '@/features/lib/store/actions/marketing';
import { toast } from '@/features/lib/toast';
import { getSession } from '@/features/lib/auth/client-session';
import type { InboxSubmission } from '@/lib/website-form';

// Spec 02: a new lead shows within 10 seconds.
const POLL_MS = 8_000;
let draining = false;
/** D6: the organisation's lead sources, so a link tag resolves against its own list. */
let orgSources: LeadSourceDef[] | undefined;

/*
  References this browser has already recorded. The inbox keeps submissions
  for a week when there is no shared data (so every staff browser gets them),
  so a reference is recorded once per browser: no log line on every poll, and
  a lead someone deleted is not recreated.
*/
const SEEN_KEY = 'emts-website-inbox-seen';
const SEEN_MAX = 500;
function readSeen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function markSeen(seen: string[], ref: string) {
  seen.push(ref);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-SEEN_MAX)));
  } catch {
    /* storage blocked: the reference check in submitWebsiteForm still prevents a second lead */
  }
}

async function drain() {
  if (draining || !getSession() || !useStore.getState().currentUserId) return;
  draining = true;
  try {
    const res = await fetch('/api/website-form', { cache: 'no-store' });
    if (!res.ok) return;
    const { submissions } = (await res.json()) as { submissions?: InboxSubmission[] };
    const seen = readSeen();
    for (const s of submissions ?? []) {
      if (seen.includes(s.ref)) continue;
      const r = act(submitWebsiteForm, {
        ref: s.ref, name: s.name, phone: s.phone, email: s.email, town: s.town, address: s.address, paintType: s.paintType, message: s.message,
        sourceLabel: (s.srcTag || s.referrer) && orgSources ? leadSourceFor({ src: s.srcTag, referrer: s.referrer }, orgSources) : s.source,
        trackedLinkId: s.trackedLinkId,
      });
      if (!r.ok) continue;
      markSeen(seen, s.ref);
      if (r.value!.outcome !== 'duplicate') {
        toast.success('New website enquiry', r.value!.outcome === 'possible_duplicate' ? `${s.name} — lead ${r.value!.leadId}, possible duplicate` : `${s.name} — lead ${r.value!.leadId}`);
      }
      await fetch(`/api/website-form?ref=${encodeURIComponent(s.ref)}`, { method: 'DELETE' });
    }
  } catch {
    /* offline: try again on the next tick */
  } finally {
    draining = false;
  }
}

export function WebsiteInboxSync() {
  const { items: sources } = useCollection('leadSources');
  const { items: links } = useCollection('trackedLinks');
  // QA C-04: without shared data the server learns the paused links from signed-in browsers.
  const pausedIds = links.filter((l) => l.status === 'paused').map((l) => l.id).join(',');
  useEffect(() => {
    if (!getSession()) return;
    void fetch('/api/website-form/links', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: pausedIds ? pausedIds.split(',') : [] }) }).catch(() => {});
  }, [pausedIds]);
  useEffect(() => {
    orgSources = sources;
  }, [sources]);
  useEffect(() => {
    void drain();
    const t = setInterval(() => void drain(), POLL_MS);
    const onFocus = () => void drain();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
  return null;
}
