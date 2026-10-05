/*
  Runs a public marketing action (tracked link click, landing page view or
  submission). With shared data the page is read-only, so the server applies
  it (/api/public/marketing); otherwise it runs in this browser as before.
*/
import type { ActionResult } from '@/features/types';
import { isReadOnlyShared } from './remote-state';

export type PublicAction =
  | { action: 'link_click'; code: string; via: 'link' | 'qr'; device: string; clickId: string; referrer?: string }
  | { action: 'landing_view'; slug: string }
  | { action: 'landing_submit'; slug: string; values: Record<string, string>; ref: string; utm?: Record<string, string | undefined> };

export async function runPublicAction<T>(req: PublicAction, local: () => ActionResult<T>): Promise<ActionResult<T>> {
  if (!isReadOnlyShared()) return local();
  try {
    const res = await fetch('/api/public/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
    const body = (await res.json()) as ActionResult<T> & { local?: boolean };
    if (body.local) return local();
    return body;
  } catch {
    return { ok: false, error: 'We could not reach the server. Please try again or call us.' };
  }
}
