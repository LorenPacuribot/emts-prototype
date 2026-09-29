import { describe, expect, it } from 'vitest';
import { featureDbOf, guestAllowed } from './guest-access';

const db = {
  estimates: [{ id: 'E-1', publicToken: 'tok-est-123' }, { id: 'E-2' }],
  qrLinks: [{ ref: 'qr-live' }, { ref: 'qr-revoked', revokedAt: '2026-01-01' }],
  paintPassports: [{ ref: 'pp-live' }],
  mktLinks: [{ code: 'FALL10', active: true }, { code: 'OLD', active: false }],
  mktLandingPages: [{ slug: 'fall-special', status: 'published' }, { slug: 'draft-page', status: 'draft' }],
};

describe('customer pages allowed to use shared data', () => {
  it('accepts a valid token on each kind of customer link', () => {
    expect(guestAllowed('/estimates/view?token=tok-est-123', db)).toBe(true);
    expect(guestAllowed('/estimates/EST-2026-1/client-view?t=tok-est-123', db)).toBe(true);
    expect(guestAllowed('/paint-record/view/?token=qr-live', db)).toBe(true);
    expect(guestAllowed('/paint-record/view?ref=pp-live', db)).toBe(true);
    expect(guestAllowed('/r/fall10?via=qr', db)).toBe(true);
    expect(guestAllowed('/lp/fall-special', db)).toBe(true);
  });

  it('refuses wrong, missing, revoked or inactive tokens and every staff page', () => {
    expect(guestAllowed('/estimates/view?token=guess', db)).toBe(false);
    expect(guestAllowed('/estimates/view', db)).toBe(false);
    expect(guestAllowed('/estimates/view?token=', { estimates: [{ id: 'X', publicToken: '' }] })).toBe(false);
    expect(guestAllowed('/estimates/EST-2026-1/client-view', db)).toBe(false);
    expect(guestAllowed('/paint-record/view?token=qr-revoked', db)).toBe(false);
    expect(guestAllowed('/r/OLD', db)).toBe(false);
    expect(guestAllowed('/lp/draft-page', db)).toBe(false);
    expect(guestAllowed('/dashboard', db)).toBe(false);
    expect(guestAllowed('/website-form', db)).toBe(false);
    expect(guestAllowed(null, db)).toBe(false);
    expect(guestAllowed('/estimates/view?token=tok-est-123', undefined)).toBe(false);
  });

  it('reads the database out of the saved feature blob', () => {
    expect(featureDbOf(JSON.stringify({ state: { db } }))).toEqual(db);
    expect(featureDbOf('not json')).toBeUndefined();
    expect(featureDbOf(null)).toBeUndefined();
  });
});
