/*
  Automated messages for lead pipeline stages (patent 1, steps 7-9).

  Moving a lead into a stage sends the active Settings > Automated Messages
  whose trigger belongs to that stage, by email and/or SMS (the message's
  channel), through /api/messaging. Each message is sent once per lead: the
  lead's sentMessages log is checked first, so moving a card back and forth
  doesn't repeat it. Without a live email/SMS service the server runs in
  sandbox mode and the log says so.
 A message with a delay is scheduled on
  the lead instead and sent when due (LeadMessageScheduler); it is cancelled
  if the lead leaves that stage first, or by hand.
*/
import type { AutomatedMessage, Lead, LeadMessageLog, LeadStatus, ScheduledLeadMessage } from '@/lib/types';

/** Triggers sent when a lead enters each stage. */
export const STAGE_TRIGGERS: Record<LeadStatus, string[]> = {
  New: ['Lead Received'],
  Contacted: ['Lead Contacted'],
  Scheduled: ['Estimate Scheduled'],
  Pending: ['Lead Pending'],
  Sold: ['Estimate Accepted'],
  Lost: ['Lead Lost'],
  Archived: [],
};

/** Active messages this stage will send (Settings > Automated Messages). */
export function stageMessages(status: LeadStatus, all: readonly AutomatedMessage[]): AutomatedMessage[] {
  const triggers = STAGE_TRIGGERS[status] ?? [];
  return all.filter((m) => m.isActive && triggers.includes(m.trigger));
}

/** Replaces {{variable}} placeholders; unknown variables become empty. */
export function fillMessage(text: string, vars: Record<string, string | undefined>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? '');
}

export function leadVars(lead: Lead, orgName: string, extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  const name = `${lead.firstName} ${lead.lastName}`.trim() || lead.companyName || 'there';
  return {
    customerName: name, clientName: name, firstName: lead.firstName || name, leadNumber: lead.leadNumber, orgName,
    appointmentDate: lead.appointment?.date, appointmentTime: lead.appointment?.time, ...extra,
  };
}

export interface PlannedSend { message: AutomatedMessage; channel: 'EMAIL' | 'SMS'; to: string; subject?: string; body: string }

/**
 * What entering `status` should send for this lead: one entry per message and
 * channel, skipping messages already sent to this lead and channels with no
 * address on file.
 */
export function planStageSends(lead: Lead, status: LeadStatus, all: readonly AutomatedMessage[], vars: Record<string, string | undefined>): { sends: PlannedSend[]; skipped: string[] } {
  const sends: PlannedSend[] = [];
  const skipped: string[] = [];
  const already = new Set([
    ...(lead.sentMessages ?? []).filter((s) => s.ok),
    ...pendingMessages(lead),
  ].map((s) => `${s.messageId}|${s.channel}`));
  for (const m of stageMessages(status, all)) {
    const channels: ('EMAIL' | 'SMS')[] = m.channel === 'BOTH' ? ['EMAIL', 'SMS'] : [m.channel];
    for (const ch of channels) {
      if (already.has(`${m.id}|${ch}`)) continue;
      const to = ch === 'EMAIL' ? lead.email?.trim() : lead.phone?.trim();
      if (!to) {
        skipped.push(`${m.name} (${ch === 'EMAIL' ? 'no email' : 'no phone'})`);
        continue;
      }
      sends.push({
        message: m, channel: ch, to,
        subject: ch === 'EMAIL' ? fillMessage(m.subject ?? m.name, vars) : undefined,
        body: fillMessage(m.body, vars),
      });
    }
  }
  return { sends, skipped };
}

const UNIT_MS = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 } as const;

/** The message's delay after the stage change, in milliseconds. */
export function delayMs(m: Pick<AutomatedMessage, 'delayValue' | 'delayUnit'>): number {
  return Math.max(0, m.delayValue || 0) * (UNIT_MS[m.delayUnit] ?? 0);
}

/** Messages with no delay go now; the rest become scheduled entries on the lead. */
export function splitByDelay(sends: PlannedSend[], stage: LeadStatus, fromIso: string, newId: () => string): { now: PlannedSend[]; later: ScheduledLeadMessage[] } {
  const now: PlannedSend[] = [];
  const later: ScheduledLeadMessage[] = [];
  for (const p of sends) {
    const ms = delayMs(p.message);
    if (!ms) now.push(p);
    else later.push({
      id: newId(), messageId: p.message.id, name: p.message.name, stage, channel: p.channel, to: p.to, subject: p.subject, body: p.body,
      createdAt: fromIso, sendAt: new Date(new Date(fromIso).getTime() + ms).toISOString(),
    });
  }
  return { now, later };
}

/** Scheduled messages still waiting (not cancelled). */
export function pendingMessages(lead: Pick<Lead, 'scheduledMessages'>): ScheduledLeadMessage[] {
  return (lead.scheduledMessages ?? []).filter((m) => !m.cancelledAt);
}

/** Waiting messages whose send time has come. */
export function dueMessages(lead: Pick<Lead, 'scheduledMessages'>, nowIso: string): ScheduledLeadMessage[] {
  return pendingMessages(lead).filter((m) => m.sendAt <= nowIso);
}

/** Cancels waiting messages from other stages when the lead moves (they no longer apply). */
export function cancelForStageChange(list: ScheduledLeadMessage[] | undefined, status: LeadStatus, atIso: string): ScheduledLeadMessage[] | undefined {
  if (!list?.length) return list;
  return list.map((m) => (m.cancelledAt || m.stage === status ? m : { ...m, cancelledAt: atIso, cancelReason: `Lead moved to ${status}` }));
}

export function scheduledToPlanned(m: ScheduledLeadMessage): PlannedSend {
  return { message: { id: m.messageId, name: m.name } as AutomatedMessage, channel: m.channel, to: m.to, subject: m.subject, body: m.body };
}

/** Sends one planned message through the server connector. Never throws. */
export async function deliver(p: PlannedSend, stage: LeadStatus, fetchImpl: typeof fetch = fetch): Promise<LeadMessageLog> {
  const base = { messageId: p.message.id, name: p.message.name, stage, channel: p.channel, to: p.to, at: new Date().toISOString() };
  try {
    const res = await fetchImpl('/api/messaging', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: p.channel === 'EMAIL' ? 'email' : 'sms', to: p.to, subject: p.subject, body: p.body, tag: `lead-stage:${stage.toLowerCase()}` }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; sandbox?: boolean; messageId?: string; error?: string };
    return { ...base, ok: !!data.ok, sandbox: !!data.sandbox, externalId: data.messageId, error: data.ok ? undefined : data.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ...base, ok: false, sandbox: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}
