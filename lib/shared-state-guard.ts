/*
  What a guest (no staff session) may see of the shared data, and what a
  guest save may not change (QA, 6 Oct: /api/state trusted X-EMTS-Page).

  - Payment gateway credentials never leave the server for a guest, and a
    guest save can't change them: the server's values are put back.
  - A public marketing page (/r, /lp) gets the feature data with every list
    emptied except the marketing lists it renders, and no replica data.
*/

const REPLICA_KEY = 'emts-replica-db-v2';
const FEATURE_KEY = 'emts-features-db-v1';
const GATEWAY_SECRETS = ['apiLoginId', 'transactionKey'] as const;
/** Lists a public tracked link or landing page renders. */
const PUBLIC_LISTS = new Set(['mktLinks', 'mktLandingPages', 'mktPromotions', 'mktCampaigns']);
/** Settings a public page has no use for. */
const PUBLIC_DROP = new Set(['financeSettings']);

type Json = Record<string, unknown>;
const parse = (raw: string | null | undefined): Json | undefined => {
  try {
    const v = JSON.parse(raw ?? '');
    return v && typeof v === 'object' ? (v as Json) : undefined;
  } catch {
    return undefined;
  }
};
const gatewayOf = (db: Json | undefined) => ((db?.singletons as Json | undefined)?.paymentGateway as Json | undefined);

/** The replica data without the payment gateway credentials. */
export function withoutSecrets(key: string, raw: string): string {
  if (key !== REPLICA_KEY) return raw;
  const db = parse(raw);
  const gw = gatewayOf(db);
  if (!db || !gw) return raw;
  for (const k of GATEWAY_SECRETS) delete gw[k];
  return JSON.stringify(db);
}

/** A guest's save of the replica data, with the server's gateway credentials kept as they are. */
export function keepSecrets(key: string, incoming: string, current: string | null | undefined): string {
  if (key !== REPLICA_KEY) return incoming;
  const db = parse(incoming);
  const gw = gatewayOf(db);
  const was = gatewayOf(parse(current));
  if (!db || !gw) return incoming;
  for (const k of GATEWAY_SECRETS) {
    if (was && was[k] !== undefined) gw[k] = was[k];
    else delete gw[k];
  }
  return JSON.stringify(db);
}

/** The feature data a public marketing page may read: its own lists, nothing personal. */
export function publicFeatureCopy(raw: string): string {
  const blob = parse(raw);
  const state = blob?.state as Json | undefined;
  const db = state?.db as Json | undefined;
  if (!blob || !state || !db) return JSON.stringify({ state: {}, version: blob?.version ?? 0 });
  const out: Json = {};
  for (const [k, v] of Object.entries(db)) {
    if (PUBLIC_DROP.has(k)) continue;
    // Staff names and roles only (the app shell looks up the current user); no contact details.
    if (k === 'users' && Array.isArray(v)) out[k] = v.map((u: Json) => ({ id: u.id, name: u.name, role: u.role }));
    else out[k] = Array.isArray(v) ? (PUBLIC_LISTS.has(k) ? v : []) : v;
  }
  return JSON.stringify({ ...blob, state: { db: out } });
}

export const SHARED_KEYS = { REPLICA_KEY, FEATURE_KEY };
