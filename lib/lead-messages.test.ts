import { describe, expect, it } from 'vitest';
import type { AutomatedMessage, Lead } from '@/lib/types';
import { automatedMessages } from '@/lib/data/settings-config';
import { cancelForStageChange, delayMs, deliver, dueMessages, fillMessage, leadVars, pendingMessages, planStageSends, scheduledToPlanned, splitByDelay, stageMessages } from './lead-messages';

const lead = (o: Partial<Lead> = {}): Lead => ({
  id: 'LEAD-2026-99', leadNumber: 'LEAD-2026-99', firstName: 'Olivia', lastName: 'Bennett', phone: '(512) 555-0101', email: 'olivia@example.com',
  street: '1 Main St', city: 'Austin', state: 'TX', zip: '78701', leadSource: 'Website', serviceType: 'Interior', status: 'New', estimatedValue: 0,
  date: '2026-09-01', createdAt: '2026-09-01', updatedAt: '2026-09-01', contactType: 'LEAD', ...o,
});

describe('lead stage automated messages (patent 1)', () => {
  it('maps every pipeline stage with a message to an active seeded message', () => {
    expect(stageMessages('New', automatedMessages).map((m) => m.id)).toEqual(['am_lead_new']);
    expect(stageMessages('Contacted', automatedMessages).map((m) => m.id)).toEqual(['am_lead_contacted']);
    expect(stageMessages('Scheduled', automatedMessages).map((m) => m.id)).toEqual(['am_newlead']);
    expect(stageMessages('Pending', automatedMessages).map((m) => m.id)).toEqual(['am_lead_pending']);
    expect(stageMessages('Sold', automatedMessages).map((m) => m.id)).toEqual(['am_accept']);
    // "Lead Closed" ships switched off.
    expect(stageMessages('Lost', automatedMessages)).toEqual([]);
    expect(stageMessages('Archived', automatedMessages)).toEqual([]);
  });

  it('fills the template and sends each channel once per lead', () => {
    const vars = leadVars(lead(), 'Acme Painting');
    const plan = planStageSends(lead(), 'New', automatedMessages, vars);
    expect(plan.sends.map((s) => s.channel)).toEqual(['EMAIL', 'SMS']);
    expect(plan.sends[0]!.subject).toBe('Thanks for contacting Acme Painting');
    expect(plan.sends[1]!.body).toContain('Hi Olivia Bennett');

    const sent = lead({ sentMessages: [{ messageId: 'am_lead_new', name: 'x', stage: 'New', channel: 'EMAIL', to: 'olivia@example.com', at: '', ok: true, sandbox: true }] });
    expect(planStageSends(sent, 'New', automatedMessages, vars).sends.map((s) => s.channel)).toEqual(['SMS']);
    // A failed attempt is retried.
    const failed = lead({ sentMessages: [{ messageId: 'am_lead_new', name: 'x', stage: 'New', channel: 'EMAIL', to: 'o', at: '', ok: false, sandbox: false }] });
    expect(planStageSends(failed, 'New', automatedMessages, vars).sends).toHaveLength(2);
  });

  it('reports a channel it cannot reach', () => {
    const plan = planStageSends(lead({ phone: '' }), 'New', automatedMessages, {});
    expect(plan.sends.map((s) => s.channel)).toEqual(['EMAIL']);
    expect(plan.skipped).toEqual(['New Lead Received (no phone)']);
  });

  it('fills unknown variables with nothing', () => {
    expect(fillMessage('Hi {{ customerName }}, {{nope}}!', { customerName: 'Sam' })).toBe('Hi Sam, !');
  });

  it('posts to the messaging route and records the outcome', async () => {
    let body: Record<string, unknown> = {};
    const ok = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, sandbox: true, messageId: 'SBX-1' }));
    }) as unknown as typeof fetch;
    const msg = automatedMessages.find((m) => m.id === 'am_lead_contacted') as AutomatedMessage;
    const log = await deliver({ message: msg, channel: 'EMAIL', to: 'olivia@example.com', subject: 'S', body: 'B' }, 'Contacted', ok);
    expect(body).toMatchObject({ channel: 'email', to: 'olivia@example.com', tag: 'lead-stage:contacted' });
    expect(log).toMatchObject({ ok: true, sandbox: true, externalId: 'SBX-1', messageId: 'am_lead_contacted' });

    const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await deliver({ message: msg, channel: 'SMS', to: '5125550101', body: 'B' }, 'Contacted', down)).toMatchObject({ ok: false, error: 'offline' });
  });
});

describe('delayed stage messages (patent 1)', () => {
  const contacted = { ...(automatedMessages.find((m) => m.id === 'am_lead_contacted') as AutomatedMessage), delayValue: 2, delayUnit: 'hours' as const };
  const at = '2026-09-30T10:00:00.000Z';
  let n = 0;
  const id = () => `sm-${++n}`;

  it('schedules a message with a delay instead of sending it', () => {
    expect(delayMs({ delayValue: 3, delayUnit: 'days' })).toBe(3 * 86_400_000);
    const plan = planStageSends(lead(), 'Contacted', [contacted], {});
    const { now, later } = splitByDelay(plan.sends, 'Contacted', at, id);
    expect(now).toEqual([]);
    expect(later).toHaveLength(1);
    expect(later[0]).toMatchObject({ messageId: 'am_lead_contacted', stage: 'Contacted', channel: 'EMAIL', sendAt: '2026-09-30T12:00:00.000Z' });
  });

  it('does not schedule the same message twice and sends it when due', () => {
    const later = splitByDelay(planStageSends(lead(), 'Contacted', [contacted], {}).sends, 'Contacted', at, id).later;
    const l = lead({ scheduledMessages: later });
    expect(planStageSends(l, 'Contacted', [contacted], {}).sends).toEqual([]);
    expect(dueMessages(l, '2026-09-30T11:59:00.000Z')).toEqual([]);
    expect(dueMessages(l, '2026-09-30T12:00:00.000Z').map((m) => m.messageId)).toEqual(['am_lead_contacted']);
    expect(scheduledToPlanned(later[0]!)).toMatchObject({ channel: 'EMAIL', to: 'olivia@example.com', message: { id: 'am_lead_contacted' } });
  });

  it('cancels waiting messages when the lead moves to another stage', () => {
    const later = splitByDelay(planStageSends(lead(), 'Contacted', [contacted], {}).sends, 'Contacted', at, id).later;
    expect(cancelForStageChange(later, 'Contacted', at)).toEqual(later);
    const moved = cancelForStageChange(later, 'Lost', '2026-09-30T11:00:00.000Z')!;
    expect(moved[0]).toMatchObject({ cancelledAt: '2026-09-30T11:00:00.000Z', cancelReason: 'Lead moved to Lost' });
    expect(pendingMessages({ scheduledMessages: moved })).toEqual([]);
    expect(dueMessages({ scheduledMessages: moved }, '2026-10-01T00:00:00.000Z')).toEqual([]);
  });
});
