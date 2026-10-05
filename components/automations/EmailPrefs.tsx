'use client';

/*
  Settings › My Profile: which automation notices also come by email
  (spec 6.12). In-app is always on. Emails only link back to the app
  ("Open in Estimate Master"); nothing is approved by email.
*/
import { Bell } from 'lucide-react';
import { setEmailPref, useAuto } from '@/lib/automations/store';
import { useCurrentUser } from '@/features/lib/store';
import { can } from '@/features/lib/permissions';
import { Checkbox } from '@/features/components/ui';

/** Stable empty list: a selector must not return a new array each time. */
const NONE: string[] = [];

const KINDS = [
  { value: 'REVIEW_WAITING', label: 'A step marked "Ask me first" is waiting' },
  { value: 'STEP_FAILED', label: 'A step failed' },
  { value: 'STUCK_ALERT', label: 'A record is stuck in a stage' },
  { value: 'DEPLOYED_BY_OTHER', label: 'Someone else deployed an automation that messages customers' },
  { value: 'MESSAGE_NEEDS_APPROVAL', label: 'A message used by a deployed automation needs approval' },
];

export function AutomationEmailPrefs() {
  const user = useCurrentUser();
  const prefs = useAuto((s) => s.settings.emailPrefs[user.id] ?? NONE);
  if (!can(user, 'automation.view')) return null;
  const toggle = (k: string, on: boolean) => setEmailPref(user.id, on ? [...prefs, k] : prefs.filter((x) => x !== k));
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-1 flex items-center gap-2 font-bold text-gray-900 dark:text-white"><Bell className="h-4 w-4 text-gray-500" /> Automation notifications</h3>
      <p className="mb-3 text-sm text-gray-500">You always see these under the bell. Tick the ones you also want by email. Emails only link back to the app; approving happens in the app.</p>
      <div className="space-y-2">{KINDS.map((k) => <Checkbox key={k.value} checked={prefs.includes(k.value)} onCheckedChange={(v) => toggle(k.value, v)} label={k.label} />)}</div>
    </div>
  );
}
