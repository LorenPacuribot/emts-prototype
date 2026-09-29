import { describe, expect, it } from 'vitest';
import { checkSubmission, HONEYPOT_FIELD, MIN_FILL_MS, RateLimiter } from './website-form';

const now = 1_800_000_000_000;
const opts = { siteKey: 'k', now, newRef: () => 'WEB-NEW' };
const good = { siteKey: 'k', name: ' Chris Dale ', phone: '', email: 'chris@example.com', town: 'Allen', message: 'Cabinets', startedAt: now - 10_000 };

describe('Patent 34 — website form endpoint', () => {
  it('accepts a complete submission and trims it', () => {
    const r = checkSubmission(good, opts);
    expect(r.ok && !r.spam && r.submission).toMatchObject({ ref: 'WEB-NEW', name: 'Chris Dale', email: 'chris@example.com' });
  });
  it('keeps the website’s own reference so a retry is one lead', () => {
    const r = checkSubmission({ ...good, ref: 'form-123' }, opts);
    expect(r.ok && !r.spam && r.submission.ref).toBe('WEB-form-123');
  });
  it('rejects a wrong site key and missing contact details', () => {
    expect(checkSubmission({ ...good, siteKey: 'x' }, opts)).toMatchObject({ ok: false, status: 401 });
    expect(checkSubmission({ ...good, name: '' }, opts)).toMatchObject({ ok: false, field: 'name' });
    expect(checkSubmission({ ...good, email: '', phone: '' }, opts)).toMatchObject({ ok: false, field: 'phone' });
    expect(checkSubmission({ ...good, email: 'nope' }, opts)).toMatchObject({ ok: false, field: 'email' });
  });
  it('drops bots silently: honeypot filled or submitted too fast', () => {
    expect(checkSubmission({ ...good, [HONEYPOT_FIELD]: 'http://spam' }, opts)).toEqual({ ok: true, spam: true });
    expect(checkSubmission({ ...good, startedAt: now - MIN_FILL_MS + 100 }, opts)).toEqual({ ok: true, spam: true });
  });
  it('rate limits per address inside the window', () => {
    const l = new RateLimiter(2, 1000);
    expect([l.allow('a', 0), l.allow('a', 1), l.allow('a', 2), l.allow('b', 2), l.allow('a', 1000)]).toEqual([true, true, false, true, true]);
  });
});
