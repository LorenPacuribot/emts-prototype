import { describe, expect, it } from 'vitest';
import { checkSubmission, HONEYPOT_FIELD, leadSourceFor, MIN_FILL_MS, RateLimiter, trackedLinkPath } from './website-form';

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

describe('lead source (CRM-M5)', () => {
  it('uses the src tag first', () => {
    expect(leadSourceFor({ src: 'facebook', referrer: 'https://www.google.com/' })).toBe('Facebook');
    expect(leadSourceFor({ src: 'yard-sign' })).toBe('Yard Sign');
    expect(leadSourceFor({ src: 'spring-mailer' })).toBe('Spring Mailer');
  });
  it('then the referring site', () => {
    expect(leadSourceFor({ referrer: 'https://m.facebook.com/somepage' })).toBe('Facebook');
    expect(leadSourceFor({ referrer: 'https://l.instagram.com/?u=x' })).toBe('Instagram');
    expect(leadSourceFor({ referrer: 'https://www.google.co.uk/search?q=painter' })).toBe('Google');
  });
  it('otherwise Website', () => {
    expect(leadSourceFor({})).toBe('Website');
    expect(leadSourceFor({ referrer: 'https://example.com' })).toBe('Website');
    expect(leadSourceFor({ referrer: 'not a url' })).toBe('Website');
  });
  it('a lead from ?src=facebook has source Facebook, and keeps its link', () => {
    const now = Date.now();
    const r = checkSubmission({ siteKey: 'k', name: 'Ann', phone: '2145550100', src: 'facebook', l: 'tl_facebook', startedAt: now - 10_000 }, { siteKey: 'k', now, newRef: () => 'WEB-1' });
    expect(r.ok && !r.spam && r.submission).toMatchObject({ source: 'Facebook', trackedLinkId: 'tl_facebook' });
  });
  it('builds the tracked link path', () => {
    expect(trackedLinkPath({ id: 'tl_1', source: 'Yard Sign' })).toBe('/website-form?src=yard-sign&l=tl_1');
  });
});
