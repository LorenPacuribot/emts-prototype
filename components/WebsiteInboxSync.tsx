'use client';

/*
  Turns website form submissions waiting at /api/website-form into leads.
  Runs while someone is signed in: on load, every 30 seconds and when the tab
  regains focus. submitWebsiteForm is idempotent by reference, so two open
  browsers draining the same inbox still create one lead.
*/
import { useEffect } from 'react';
import { act, useStore } from '@/features/lib/store';
import { submitWebsiteForm } from '@/features/lib/store/actions/marketing';
import { toast } from '@/features/lib/toast';
import { getSession } from '@/features/lib/auth/client-session';
import type { InboxSubmission } from '@/lib/website-form';

const POLL_MS = 30_000;
let draining = false;

async function drain() {
  if (draining || !getSession() || !useStore.getState().currentUserId) return;
  draining = true;
  try {
    const res = await fetch('/api/website-form', { cache: 'no-store' });
    if (!res.ok) return;
    const { submissions } = (await res.json()) as { submissions?: InboxSubmission[] };
    for (const s of submissions ?? []) {
      const r = act(submitWebsiteForm, { ref: s.ref, name: s.name, phone: s.phone, email: s.email, town: s.town, message: s.message });
      if (!r.ok) continue;
      if (r.value!.outcome !== 'duplicate') {
        toast.success('New website enquiry', r.value!.outcome === 'attached' ? `${s.name} — added to ${r.value!.leadId}` : `${s.name} — lead ${r.value!.leadId}`);
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
