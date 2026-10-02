import { describe, expect, it } from 'vitest';
import {
  CONTACT_REQUIRED, PAINT_TYPES, RATE_LIMIT, THANKS_MESSAGE, addressSuggestions, checkSubmission, HONEYPOT_FIELD, isUsPhone, leadSourceFor, MIN_FILL_MS, RateLimiter, trackedLinkPath,
} from './website-form';

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
    // D6: a tag the organisation's list doesn't have is Other.
    expect(leadSourceFor({ src: 'spring-mailer' })).toBe('Other');
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

describe('2 Oct 2026 — D4 rate limit and D5 fields', () => {
  it('D4: 5 submissions per hour per address', () => {
    expect(RATE_LIMIT).toEqual({ max: 5, windowMs: 3_600_000 });
    const l = new RateLimiter(RATE_LIMIT.max, RATE_LIMIT.windowMs);
    const t = [0, 1, 2, 3, 4].map((i) => l.allow('a', i * 600_000));
    expect(t).toEqual([true, true, true, true, true]);
    expect(l.allow('a', 50 * 60_000)).toBe(false); // sixth inside the hour
    expect(l.allow('a', 60 * 60_000)).toBe(true); // a new hour
  });
  it('full name: required, 2 to 80 characters', () => {
    expect(checkSubmission({ ...good, name: 'A' }, opts)).toMatchObject({ ok: false, field: 'name' });
    expect(checkSubmission({ ...good, name: 'x'.repeat(81) }, opts)).toMatchObject({ ok: false, field: 'name' });
    expect(checkSubmission({ ...good, name: 'Al' }, opts).ok).toBe(true);
  });
  it('phone is a 10-digit US number; email a valid address; one of them is required', () => {
    expect(checkSubmission({ ...good, email: '', phone: '' }, opts)).toMatchObject({ ok: false, field: 'phone', error: CONTACT_REQUIRED });
    expect(CONTACT_REQUIRED).toBe('Please give us a phone number or email.');
    expect(checkSubmission({ ...good, email: '', phone: '555-0161' }, opts)).toMatchObject({ ok: false, field: 'phone' });
    expect(checkSubmission({ ...good, email: '', phone: '+1 (214) 555-0161' }, opts).ok).toBe(true);
    expect(checkSubmission({ ...good, email: 'a@b' }, opts)).toMatchObject({ ok: false, field: 'email' });
    expect(isUsPhone('214.555.0161')).toBe(true);
  });
  it('keeps the property address and "What would you like painted?" apart from the message', () => {
    const r = checkSubmission({ ...good, address: '12 Elm St, Allen TX', paintType: 'Cabinets', message: 'Kitchen and vanity' }, opts);
    expect(r.ok && !r.spam && r.submission).toMatchObject({ address: '12 Elm St, Allen TX', paintType: 'Cabinets', message: 'Kitchen and vanity' });
    expect(PAINT_TYPES).toEqual(['Interior', 'Exterior', 'Both', 'Cabinets', 'Other']);
    expect(checkSubmission({ ...good, paintType: 'Roof' }, opts)).toMatchObject({ ok: false, field: 'paintType' });
  });
  it('the message takes up to 1,000 characters', () => {
    expect(checkSubmission({ ...good, message: 'x'.repeat(1000) }, opts).ok).toBe(true);
    expect(checkSubmission({ ...good, message: 'x'.repeat(1001) }, opts)).toMatchObject({ ok: false, field: 'message' });
  });
  it('thanks the visitor in the agreed words', () => {
    expect(THANKS_MESSAGE).toBe("Thanks, we've received your request and will be in touch soon.");
  });
});

describe('Tab 2 — property address lookup', () => {
  it('suggests addresses once 3 characters are typed', () => {
    expect(addressSuggestions('el')).toEqual([]);
    expect(addressSuggestions('elm')).toContain('12 Elm St, Lakewood, TX 75214');
    expect(addressSuggestions('plano').length).toBeGreaterThan(1);
  });
});
