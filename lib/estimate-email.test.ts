import { describe, expect, it, vi } from 'vitest';
import type { EstimateDelivery } from '@/lib/types';
import {
  buildEstimateEmail, buildEstimateSms, customerLinkFor, defaultEstimateSubject, deliveryFromResponse, deliveryLogText, deliveryText,
  deliveryToast, isEmailAddress, latestDeliveries, parseRecipients, postEstimateMessage, sendSucceeded, statusAfterSend,
} from './estimate-email';

const estimate = { estimateNumber: 'EST-2026-9', title: 'Standard Interior Repaint' };
const link = 'https://app.example.com/estimates/view?token=abc123';
const input = { estimate, customerFirstName: 'Olivia', companyName: 'Acme Painting', link, linkExpires: 'October 29, 2026' };

const d = (o: Partial<EstimateDelivery> = {}): EstimateDelivery => ({
  id: 'dlv1', sendId: 'snd1', at: '2026-09-29T15:42:00.000Z', to: 'olivia@example.com', channel: 'email', status: 'delivered', ...o,
});

describe('building the estimate email (patent 11)', () => {
  it('uses the default subject and message and appends the secure link', () => {
    const m = buildEstimateEmail(input);
    expect(m.subject).toBe('Your estimate EST-2026-9 from Acme Painting');
    expect(m.body).toContain('Hi Olivia,');
    expect(m.body).toContain('"Standard Interior Repaint"');
    expect(m.body).toContain(`View your estimate: ${link}`);
    expect(m.body).toContain('works until October 29, 2026');
  });

  it('keeps a custom message and still adds the link once', () => {
    const m = buildEstimateEmail(input, { subject: 'Your quote', message: 'Hello!' });
    expect(m.subject).toBe('Your quote');
    expect(m.body.startsWith('Hello!')).toBe(true);
    expect(m.body.split(link)).toHaveLength(2);
    const already = buildEstimateEmail(input, { message: `See ${link} please` });
    expect(already.body).toBe(`See ${link} please`);
  });

  it('keeps the subject on one line and greets "there" without a name', () => {
    expect(buildEstimateEmail(input, { subject: 'a\r\nb' }).subject).toBe('a b');
    expect(buildEstimateEmail({ ...input, customerFirstName: ' ' }).body).toContain('Hi there,');
    expect(defaultEstimateSubject({ estimate, companyName: 'X' })).toBe('Your estimate EST-2026-9 from X');
  });

  it('builds the SMS with the link', () => {
    expect(buildEstimateSms(input)).toBe(`Acme Painting: your estimate EST-2026-9 is ready. View, sign and approve: ${link}`);
  });

  it('links to the secure token page, or the client view without a token', () => {
    expect(customerLinkFor('https://a.test', 'EST-1', 'tok')).toBe('https://a.test/estimates/view?token=tok');
    expect(customerLinkFor('https://a.test', 'EST-1')).toBe('https://a.test/estimates/EST-1/client-view');
  });

  it('parses and checks recipients', () => {
    expect(parseRecipients(' a@x.com, b@y.com ; A@x.com,, ')).toEqual(['a@x.com', 'b@y.com']);
    expect(isEmailAddress('olivia@example.com')).toBe(true);
    expect(isEmailAddress('olivia@example')).toBe(false);
    expect(isEmailAddress('a b@example.com')).toBe(false);
  });
});

describe('deciding the delivery status from /api/messaging', () => {
  it('delivered when the provider returned an id', () => {
    expect(deliveryFromResponse({ httpStatus: 200, data: { ok: true, sandbox: false, messageId: 'msg_1' } })).toEqual({ status: 'delivered', providerMessageId: 'msg_1' });
  });
  it('sandbox when the server has no email keys', () => {
    expect(deliveryFromResponse({ httpStatus: 200, data: { ok: true, sandbox: true, messageId: 'SBX-1' } })).toEqual({ status: 'sandbox', providerMessageId: 'SBX-1' });
  });
  it('failed with the server reason, the HTTP status, or the network error', () => {
    expect(deliveryFromResponse({ httpStatus: 502, data: { ok: false, sandbox: false, error: 'mail.example.com refused the message (HTTP 500).' } }))
      .toEqual({ status: 'failed', error: 'mail.example.com refused the message (HTTP 500).' });
    expect(deliveryFromResponse({ httpStatus: 500, data: undefined })).toEqual({ status: 'failed', error: 'The messaging service answered HTTP 500.' });
    expect(deliveryFromResponse({ httpStatus: 500, data: { ok: true } }).status).toBe('failed');
    expect(deliveryFromResponse({ networkError: 'Failed to fetch' })).toEqual({ status: 'failed', error: 'Failed to fetch' });
  });
  it('posts one email to the messaging route and never throws', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, sandbox: true, messageId: 'SBX-9' }), { status: 200 }));
    const out = await postEstimateMessage({ channel: 'email', to: 'olivia@example.com', subject: 's', body: 'b', tag: 'estimate:EST-1' }, fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ status: 'sandbox', providerMessageId: 'SBX-9' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/messaging');
    expect(JSON.parse(String(init.body))).toEqual({ channel: 'email', to: 'olivia@example.com', subject: 's', body: 'b', tag: 'estimate:EST-1' });
    const boom = vi.fn(async () => { throw new Error('offline'); });
    expect(await postEstimateMessage({ channel: 'email', to: 'x@y.com', body: 'b' }, boom as unknown as typeof fetch)).toEqual({ status: 'failed', error: 'offline' });
  });
});

describe('the Sent rule', () => {
  it('marks Sent only when something was delivered or sandboxed', () => {
    expect(statusAfterSend('Draft', [d()])).toBe('Sent');
    expect(statusAfterSend('Draft', [d({ status: 'sandbox' })])).toBe('Sent');
    expect(statusAfterSend('Draft', [d({ status: 'failed' }), d({ status: 'delivered' })])).toBe('Sent');
    expect(statusAfterSend('Draft', [d({ status: 'failed' })])).toBeUndefined();
    expect(statusAfterSend('Sent', [])).toBeUndefined();
    expect(sendSucceeded([d({ status: 'failed' })])).toBe(false);
  });
  it('keeps an approved estimate Approved', () => {
    expect(statusAfterSend('Approved', [d()])).toBe('Approved');
  });
});

describe('showing the result', () => {
  const time = () => '3:42 pm';
  it('badge texts carry the state in words', () => {
    expect(deliveryText(d(), time)).toBe('Emailed to olivia@example.com · Delivered 3:42 pm');
    expect(deliveryText(d({ status: 'sandbox' }), time)).toBe('Sandbox — not really sent to olivia@example.com: email keys not set');
    expect(deliveryText(d({ status: 'failed', error: 'HTTP 500' }), time)).toBe('Failed: HTTP 500 (olivia@example.com)');
  });
  it('shows only the latest send, and nothing for old data', () => {
    expect(latestDeliveries({})).toEqual([]);
    const all = [d({ id: 'a', sendId: 's1' }), d({ id: 'b', sendId: 's2' }), d({ id: 'c', sendId: 's2', channel: 'sms', to: '+15125550101' })];
    expect(latestDeliveries({ deliveries: all }).map((x) => x.id)).toEqual(['b', 'c']);
  });
  it('activity log lines and toasts say exactly what happened', () => {
    expect(deliveryLogText('EST-1', d({ providerMessageId: 'msg_1' }))).toBe('EST-1: Email to olivia@example.com delivered to the provider (id msg_1)');
    expect(deliveryLogText('EST-1', d({ status: 'sandbox' }))).toContain('sandbox, not sent');
    expect(deliveryToast([d()], { before: 'Draft', after: 'Sent' })).toEqual({ message: 'Estimate emailed to olivia@example.com. Marked Sent.', variant: 'success' });
    const sbx = deliveryToast([d({ status: 'sandbox' })], { before: 'Draft', after: 'Sent' });
    expect(sbx.variant).toBe('info');
    expect(sbx.message).toContain('Sandbox: nothing was emailed');
    const failed = deliveryToast([d({ status: 'failed', error: 'refused' })], { before: 'Draft' });
    expect(failed).toEqual({ message: 'Failed for olivia@example.com (refused). Not marked Sent: the estimate stays Draft.', variant: 'error' });
  });
});
