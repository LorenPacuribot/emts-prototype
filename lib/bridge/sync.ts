/*
  Bridge sync engine: keeps the replica store and the feature prototype's
  store in step, record by record, with the SAME id on both sides.

  - A prototype record with no replica twin is projected into the replica
    (lib/bridge/map.ts). This is how the demo story, and anything the
    features create (jobs on acceptance, follow-up leads, deposit invoices,
    estimates from history), shows up on the replica screens.
  - A replica record with no prototype twin (made on a replica screen) is
    mirrored into the prototype, so the feature panels work for it too.
  - Each linked record has "facets" (status, contact, schedule...). The
    engine keeps the last synced value of every facet. When one side
    differs from it, that side changed, and the change is pushed across.
    Status changes go through the prototype's own actions, so its rules
    (access, lead pipeline, closeout) still apply. A refused change is
    rolled back on the replica side and the reason shows as a toast.

  runSync(replicaDb) writes prototype changes directly and returns the
  replica changes as ops for the replica reducer (lib/store.tsx).
*/
import { produce } from 'immer';
import type * as P from '@/features/types';
import type { CollectionKey, Database as RDb, Estimate, Invoice, Job, Lead, Customer, TeamMember, WorkOrder, CalendarEvent, Activity } from '@/lib/types';
import { act, getDb, useStore } from '@/features/lib/store';
import { toast } from '@/features/lib/toast';
import { remoteSave } from '@/lib/remote-state';
import { randomRef, nextNumber } from '@/features/lib/store/helpers';
import { sourceFromLabel } from '@/features/lib/rules/lead-pipeline';
import { acceptEstimateByToken, amendEstimate, deleteEstimate, markEstimateApproved, sendEstimate } from '@/features/lib/store/actions/estimates';
import { scheduleLeadEstimate, setLeadStage } from '@/features/lib/store/actions/leads';
import { setJobStage } from '@/features/lib/store/actions/jobs';
import { markUnscheduled, scheduleWorkOrder, setWorkOrderStatus } from '@/features/lib/store/actions/work-orders';
import { invoiceBalance, invoicePaid, reconcileInvoicePayments, sendInvoice } from '@/features/lib/store/actions/invoices';
import { estimateTotals as replicaTotals, includedLine, invoiceTotals, round2 } from '@/lib/calculations';
import * as M from './map';

/* ---------- replica ops ---------- */

export type BridgeOp =
  | { kind: 'upsert'; key: CollectionKey; item: { id: string } }
  | { kind: 'patch'; key: CollectionKey; id: string; patch: object }
  | { kind: 'remove'; key: CollectionKey; id: string }
  | { kind: 'singleton'; key: 'currentUserId'; value: string };

export function applyOps(db: RDb, ops: BridgeOp[]): RDb {
  if (!ops.length) return db;
  const collections = { ...db.collections } as Record<string, { id: string }[]>;
  const singletons = { ...db.singletons } as Record<string, unknown>;
  for (const op of ops) {
    if (op.kind === 'singleton') {
      singletons[op.key] = op.value;
      continue;
    }
    const list = collections[op.key] ?? [];
    if (op.kind === 'upsert') {
      const i = list.findIndex((x) => x.id === op.item.id);
      collections[op.key] = i < 0 ? [op.item, ...list] : list.map((x, j) => (j === i ? { ...x, ...op.item } : x));
    } else if (op.kind === 'patch') {
      collections[op.key] = list.map((x) => (x.id === op.id ? { ...x, ...op.patch } : x));
    } else {
      collections[op.key] = list.filter((x) => x.id !== op.id);
    }
  }
  return { collections: collections as unknown as RDb['collections'], singletons: singletons as unknown as RDb['singletons'] };
}

/* ---------- prototype writes ---------- */

/** Direct change to the prototype database (no access checks: the bridge itself). */
function pWrite(fn: (db: P.Database) => void) {
  useStore.setState((s) => ({ db: produce(s.db, (d) => { fn(d as P.Database); }) }));
}

/* ---------- engine state ---------- */

const snapshots = new Map<string, string>();
const known = new Set<string>();
/** Ids each side had after the last run: a record missing now was deleted on that side. */
const seenR = new Map<string, Set<string>>();
const seenP = new Map<string, Set<string>>();
/** Records mirrored from the replica in this session: the replica side wins on first sight. */
const replicaOrigin = new Set<string>();
const TOMB_KEY = 'emts-bridge-tombstones-v2';
let tombstones: Set<string> | undefined;

function tombs(): Set<string> {
  if (!tombstones) {
    try {
      tombstones = new Set(JSON.parse(localStorage.getItem(TOMB_KEY) ?? '[]') as string[]);
    } catch {
      tombstones = new Set();
    }
  }
  return tombstones;
}
function bury(k: string) {
  tombs().add(k);
  const raw = JSON.stringify([...tombs()]);
  remoteSave(TOMB_KEY, raw);
  try {
    localStorage.setItem(TOMB_KEY, raw);
  } catch {
    /* ignore */
  }
}

/** Forget every link (after a demo reset of both stores). */
export function resetBridge() {
  snapshots.clear();
  known.clear();
  seenR.clear();
  seenP.clear();
  replicaOrigin.clear();
  tombstones = new Set();
  remoteSave(TOMB_KEY, null);
  try {
    localStorage.removeItem(TOMB_KEY);
  } catch {
    /* ignore */
  }
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const iso = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).toISOString();

/* ---------- facets ---------- */

type WriteResult = void | 'keep';

interface Facet<R> {
  name: string;
  /** both: either side's change wins; toP: replica owns it; toR: prototype owns it. */
  dir: 'both' | 'toP' | 'toR';
  readP(p: P.Database, id: string): unknown;
  readR(r: R, rdb: RDb): unknown;
  writeR?(v: unknown, r: R, p: P.Database): Partial<R>;
  /** Return 'keep' to accept the replica value even if the prototype didn't take it. */
  writeP?(v: unknown, id: string, r: R): WriteResult;
}

interface Entity<R extends { id: string }> {
  key: CollectionKey;
  pIds(p: P.Database): string[];
  project(p: P.Database, id: string): R;
  /** Create the prototype twin of a replica-only record. Returns false if it can't be linked. */
  mirror?(r: R, rdb: RDb): boolean;
  /** The replica deleted a linked record. */
  onReplicaDelete?(id: string): void;
  facets: Facet<R>[];
}

const byId = <T extends { id: string }>(list: T[] | undefined, id?: string) => (id ? list?.find((x) => x.id === id) : undefined);
const users = () => getDb().users;

/* customers */

const customers: Entity<Customer> = {
  key: 'customers',
  pIds: (p) => p.customers.filter((c) => !c.personalDataDeleted && !c.leadOnly).map((c) => c.id),
  project: (p, id) => M.projectCustomer(p, byId(p.customers, id)!),
  mirror(r) {
    const name = M.joinName(r.firstName, r.lastName) || r.companyName || 'New contact';
    pWrite((d) => {
      d.customers.push({
        id: r.id, name, email: r.email || undefined, phone: r.phone || undefined, contactVerified: false,
        preferredChannel: r.phone ? 'phone' : 'email', consentSigned: false, authorisedSigners: [],
      });
      if (r.street) addProperty(d, `PROP-${r.id}`, r.id, { address: r.street, city: r.city, state: r.state, zip: r.zip });
    });
    return true;
  },
  onReplicaDelete(id) {
    const p = getDb();
    const used = p.leads.some((l) => l.customerId === id) || p.estimates.some((e) => e.customerId === id) || p.jobs.some((j) => j.customerId === id);
    if (!used) pWrite((d) => { d.customers = d.customers.filter((c) => c.id !== id); });
  },
  facets: [
    {
      name: 'contact', dir: 'both',
      readP: (p, id) => { const c = byId(p.customers, id)!; return { name: c.name, email: c.email ?? '', phone: c.phone ?? '' }; },
      readR: (r) => ({ name: M.joinName(r.firstName, r.lastName) || r.companyName || '', email: r.email ?? '', phone: r.phone ?? '' }),
      writeR: (v) => { const x = v as { name: string; email: string; phone: string }; const n = M.splitName(x.name); return { firstName: n.firstName, lastName: n.lastName, ...(n.companyName ? { companyName: n.companyName } : {}), email: x.email, phone: x.phone }; },
      writeP: (v, id) => { const x = v as { name: string; email: string; phone: string }; pWrite((d) => { const c = byId(d.customers, id); if (c) { c.name = x.name; c.email = x.email || undefined; c.phone = x.phone || undefined; } }); },
    },
    {
      name: 'address', dir: 'both',
      readP: (p, id) => { const pr = M.currentProperty(p, id, { primaryOnly: true }); return { street: pr?.address ?? '', city: pr?.city ?? '', state: pr?.state ?? '', zip: pr?.zip ?? '' }; },
      readR: (r) => ({ street: r.street ?? '', city: r.city ?? '', state: r.state ?? '', zip: r.zip ?? '' }),
      writeR: (v) => v as Partial<Customer>,
      writeP: (v, id) => {
        const a = v as { street: string; city: string; state: string; zip: string };
        pWrite((d) => {
          const pr = M.currentProperty(d, id, { primaryOnly: true });
          if (pr) Object.assign(pr, { address: a.street, city: a.city, state: a.state, zip: a.zip });
          else if (a.street) addProperty(d, `PROP-${id}`, id, { address: a.street, city: a.city, state: a.state, zip: a.zip });
        });
      },
    },
    {
      // Extra service locations become prototype properties (id PROP-<location id>), so paint history,
      // repaint alerts and the QR record work per property.
      name: 'locations', dir: 'toP',
      readP: (p, id) => p.properties
        .filter((pr) => M.isServiceLocationProperty(pr) && pr.ownership.some((o) => o.customerId === id))
        .map((pr) => [pr.id.slice(5), pr.address, pr.city, pr.state, pr.zip])
        .sort((a, b) => a[0]!.localeCompare(b[0]!)),
      readR: (r) => locationRows(r),
      writeP: (v, id) => {
        const rows = v as string[][];
        pWrite((d) => {
          for (const [lid, street, city, state, zip] of rows) {
            const pr = byId(d.properties, `PROP-${lid}`);
            if (pr) Object.assign(pr, { address: street, city, state: state || pr.state, zip });
            else addProperty(d, `PROP-${lid}`, id, { address: street!, city: city!, state: state!, zip: zip! });
          }
        });
      },
    },
  ],
};

/** Service locations as [id, street, city, state, zip] rows (property id is PROP-<id>). */
function locationRows(r: Pick<Customer, 'serviceLocations'>): string[][] {
  return (r.serviceLocations ?? [])
    .filter((l) => l.street.trim())
    .map((l) => [l.id, [l.street, l.unit].filter(Boolean).join(' '), l.city, l.state, l.zip])
    .sort((a, b) => a[0]!.localeCompare(b[0]!));
}

function addProperty(d: P.Database, id: string, customerId: string, a: { address: string; city: string; state: string; zip: string }) {
  if (d.properties.some((p) => p.id === id)) return id;
  d.properties.push({
    id, address: a.address, city: a.city, state: a.state || 'TX', zip: a.zip, type: 'single_family', optOut: false,
    ownership: [{ id: `OWN-${id}`, customerId, start: new Date().toISOString() }],
  });
  return id;
}

/* leads */

const leads: Entity<Lead> = {
  key: 'leads',
  pIds: (p) => p.leads.map((l) => l.id),
  project: (p, id) => M.projectLead(p, byId(p.leads, id)!),
  mirror(r) {
    pWrite((d) => {
      let customerId = r.customerId && byId(d.customers, r.customerId) ? r.customerId : undefined;
      if (!customerId) {
        // Placeholder contact: the replica makes the real customer when the lead is converted.
        customerId = `C-${r.id}`;
        if (!byId(d.customers, customerId)) {
          d.customers.push({
            id: customerId, name: M.joinName(r.firstName, r.lastName) || r.companyName || 'New lead', email: r.email || undefined, phone: r.phone || undefined,
            contactVerified: false, preferredChannel: r.phone ? 'phone' : 'email', consentSigned: false, authorisedSigners: [], leadOnly: true,
          });
        }
      }
      const propertyId = r.street ? addProperty(d, `PROP-${r.id}`, customerId, { address: r.street, city: r.city, state: r.state, zip: r.zip }) : M.currentProperty(d, customerId)?.id;
      d.leads.unshift({
        id: r.id, customerId, propertyId, stage: M.LEAD_STAGE_P[r.status], createdAt: r.createdAt, lastActivityAt: r.updatedAt, manual: true,
        name: M.joinName(r.firstName, r.lastName) || undefined, phone: r.phone || undefined, email: r.email || undefined, town: r.city || undefined,
        note: r.notes, estimateId: r.estimateId && byId(d.estimates, r.estimateId) ? r.estimateId : undefined,
        scheduledAt: r.appointment ? new Date(`${r.appointment.date}T${r.appointment.time}:00`).toISOString() : undefined,
        assignedUserId: r.appointment?.estimatorId ?? r.assignedTo, durationMin: r.appointmentDuration,
        ...sourceFromLabel(r.leadSource || 'Other'),
      });
    });
    return true;
  },
  onReplicaDelete(id) {
    const l = byId(getDb().leads, id);
    if (l && !l.estimateId) pWrite((d) => { d.leads = d.leads.filter((x) => x.id !== id); });
  },
  facets: [
    {
      name: 'contact', dir: 'both',
      readP: (p, id) => M.leadContact(p, byId(p.leads, id)!),
      readR: (r) => ({ firstName: r.firstName ?? '', lastName: r.lastName ?? '', phone: r.phone ?? '', email: r.email ?? '' }),
      writeR: (v) => v as Partial<Lead>,
      writeP: (v, id) => { const x = v as { firstName: string; lastName: string; phone: string; email: string }; pWrite((d) => { const l = byId(d.leads, id); if (l) { l.name = M.joinName(x.firstName, x.lastName); l.phone = x.phone; l.email = x.email; } }); },
    },
    {
      name: 'appointment', dir: 'both',
      readP: (p, id) => M.leadAppointment(byId(p.leads, id)!),
      readR: (r) => (r.appointment ? { date: r.appointment.date, time: r.appointment.time, estimatorId: r.appointment.estimatorId } : null),
      writeR: (v) => ({ appointment: v as Lead['appointment'] }),
      writeP: (v, id) => {
        const a = v as Lead['appointment'];
        pWrite((d) => {
          const l = byId(d.leads, id);
          if (!l) return;
          l.scheduledAt = a ? new Date(`${a.date}T${a.time}:00`).toISOString() : undefined;
          l.assignedUserId = a?.estimatorId ?? l.assignedUserId;
        });
      },
    },
    {
      name: 'assignee', dir: 'both',
      readP: (p, id) => byId(p.leads, id)!.assignedUserId ?? null,
      readR: (r) => r.assignedTo ?? null,
      writeR: (v) => ({ assignedTo: (v as string | null) ?? undefined }),
      writeP: (v, id) => { pWrite((d) => { const l = byId(d.leads, id); if (l) l.assignedUserId = (v as string | null) ?? undefined; }); },
    },
    {
      name: 'links', dir: 'both',
      readP: (p, id) => { const l = byId(p.leads, id)!; const c = byId(p.customers, l.customerId); return { customerId: c?.leadOnly ? undefined : l.customerId, estimateId: l.estimateId }; },
      readR: (r) => ({ customerId: r.customerId, estimateId: r.estimateId }),
      writeR: (v) => v as Partial<Lead>,
      writeP: (v, id) => {
        const x = v as { customerId?: string; estimateId?: string };
        pWrite((d) => {
          const l = byId(d.leads, id);
          if (!l) return;
          if (x.customerId && byId(d.customers, x.customerId)) l.customerId = x.customerId;
          l.estimateId = x.estimateId && byId(d.estimates, x.estimateId) ? x.estimateId : undefined;
        });
      },
    },
    {
      name: 'status', dir: 'both',
      readP: (p, id) => M.LEAD_STATUS_R[byId(p.leads, id)!.stage],
      readR: (r) => r.status,
      writeR: (v, r) => ({ status: v as Lead['status'], contactType: v === 'Sold' ? 'CLIENT' : r.contactType }),
      writeP: (v, id, r) => {
        const l = byId(getDb().leads, id);
        // Booking the appointment is what makes a lead Scheduled (live POST /leads/{id}/schedule).
        if (v === 'Scheduled' && r.appointment && l && (l.stage === 'contacted' || l.stage === 'estimate_scheduled')) {
          const a = r.appointment;
          const estimatorId = a.estimatorId && byId(users(), a.estimatorId) ? a.estimatorId : undefined;
          if (estimatorId) act(scheduleLeadEstimate, id, { date: a.date, time: a.time, durationMin: r.appointmentDuration ?? 60, estimatorId });
          else pWrite((d) => { const x = byId(d.leads, id); if (x) x.stage = 'estimate_scheduled'; });
          return;
        }
        act(setLeadStage, id, M.LEAD_STAGE_P[v as Lead['status']]);
      },
    },
  ],
};

/* estimates */

type ScopeValue = { areas: [string, string][]; lines: [string, string, P.SurfaceType, number, string, string, number][] };

function replicaScope(r: Estimate): ScopeValue {
  const lines = r.lineItems
    .filter(includedLine)
    .map((l) => [l.id, l.areaId, M.surfaceTypeP(l.surfaceType || l.description), l.quantity, l.description || l.surfaceType, l.unit, l.unit === 'sqft' ? l.quantity : (l.coatingAreaSqft ?? 0)] as [string, string, P.SurfaceType | undefined, number, string, string, number])
    .filter((l): l is [string, string, P.SurfaceType, number, string, string, number] => !!l[2] && Number.isFinite(l[3]) && l[3] > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const used = new Set(lines.map((l) => l[1]));
  const areas = r.areas.filter((a) => used.has(a.id)).map((a) => [a.id, a.name] as [string, string]).sort((a, b) => a[0].localeCompare(b[0]));
  return { areas, lines };
}

function protoScope(p: P.Database, estId: string): ScopeValue {
  const est = byId(p.estimates, estId)!;
  const job = M.scopeJob(p, est);
  if (!job) return { areas: [], lines: [] };
  const surfaces = job.surfaceIds.map((id) => byId(p.surfaces, id)).filter((s): s is P.Surface => !!s && !s.removedAt);
  const lines = surfaces.map((s) => [s.id, s.areaId, s.type, s.measuredQuantity ?? s.areaSqft, s.name, s.measurementUnit ?? 'sqft', s.areaSqft] as [string, string, P.SurfaceType, number, string, string, number]).sort((a, b) => a[0].localeCompare(b[0]));
  const used = [...new Set(lines.map((l) => l[1]))];
  const areas = used.map((id) => [id, byId(p.areas, id)?.name ?? 'Area'] as [string, string]).sort((a, b) => a[0].localeCompare(b[0]));
  return { areas, lines };
}

function roomTypeFor(name: string, kind: P.AreaKind): P.RoomType {
  const n = name.toLowerCase();
  if (kind === 'exterior') return /trim|door|fascia|soffit/.test(n) ? 'exterior_trim' : 'exterior_body';
  if (n.includes('kitchen')) return 'kitchen';
  if (n.includes('bath')) return 'bathroom';
  if (n.includes('bed')) return 'bedroom';
  if (/hall|stair|entry|foyer/.test(n)) return 'hall_stairs';
  return 'living_room';
}

const editable = (s?: P.EstimateStatus) => s === 'DRAFT' || s === 'AMENDED_DRAFT';

function canSyncPricing(est: P.Estimate, r: Estimate) {
  if (editable(est.status)) return true;
  if (!['SENT', 'VIEWED'].includes(est.status) || !est.pricingSnapshot) return false;
  const stripSelection = (lines: Estimate['lineItems']) => lines.map(({ selected: _selected, ...line }) => line);
  const old = est.pricingSnapshot;
  // Customer selection may change only selection flags on an otherwise frozen quote.
  return eq(stripSelection(old.lineItems), stripSelection(r.lineItems)) && eq(old.extras, r.extras)
    && old.taxRate === r.taxRate && old.discountType === r.discountType && old.discountValue === r.discountValue;
}

const P_EST_STATUS: Record<Estimate['status'], P.EstimateStatus> = {
  Draft: 'DRAFT', Sent: 'SENT', Viewed: 'VIEWED', Approved: 'ACCEPTED', Rejected: 'DECLINED', Expired: 'EXPIRED',
};

const estimates: Entity<Estimate> = {
  key: 'estimates',
  pIds: (p) => p.estimates.map((e) => e.id),
  project: (p, id) => M.projectEstimate(p, byId(p.estimates, id)!),
  mirror(r, rdb) {
    const p = getDb();
    if (!byId(p.customers, r.customerId)) return false;
    const rLead = byId(rdb.collections.leads, r.leadId);
    const pLead = byId(p.leads, r.leadId);
    const loc = r.serviceLocationId ? byId(rdb.collections.customers, r.customerId)?.serviceLocations?.find((l) => l.id === r.serviceLocationId) : undefined;
    pWrite((d) => {
      const propertyId = (loc && addProperty(d, `PROP-${loc.id}`, r.customerId, { address: [loc.street, loc.unit].filter(Boolean).join(' '), city: loc.city, state: loc.state, zip: loc.zip }))
        ?? (pLead?.propertyId && byId(d.properties, pLead.propertyId)?.id)
        ?? M.currentProperty(d, r.customerId)?.id
        ?? addProperty(d, `PROP-${r.id}`, r.customerId, { address: r.address || rLead?.street || 'Address not set', city: rLead?.city ?? '', state: rLead?.state ?? '', zip: rLead?.zip ?? '' });
      const y = new Date().getFullYear();
      const jobId = `JOB-${y}-${nextNumber(d, 'job')}`;
      const status = P_EST_STATUS[r.status];
      const signed = status === 'ACCEPTED';
      const kind = /exterior/i.test(r.estimateType) ? 'exterior_repaint' : 'interior_repaint';
      const estimatorId = r.estimatorId && byId(d.users, r.estimatorId) ? r.estimatorId : byId(d.users, r.createdBy)?.id ?? 'U-EST';
      d.jobs.push({
        id: jobId, name: r.title, propertyId, customerId: r.customerId, estimateId: r.id, leadId: pLead?.id, status: signed ? 'confirmed' : 'estimating',
        contractSigned: signed, contractSignedAt: signed ? r.approvedAt : undefined, contractValue: signed ? replicaTotals(r).total : 0, depositsCollected: 0,
        markupPct: 45, taxRatePct: r.taxRate, estimatorId, crewLeadId: 'U-CREW', surfaceIds: [], cardVersion: 1, cardRowVersion: 0, jobType: kind,
      });
      d.estimates.push({
        id: r.id, title: r.title, customerId: r.customerId, propertyId, leadId: pLead?.id, status, total: replicaTotals(r).total, createdAt: r.createdAt,
        estimatorId, estimateDate: r.date, validUntil: r.validUntil, jobId, publicToken: randomRef(16), amendmentNumber: 0,
        sentAt: r.sentAt, viewedAt: r.viewedAt, acceptedAt: r.approvedAt, signatureName: r.signature?.name, customerNotes: r.notes, internalNotes: r.internalNotes,
      });
      if (pLead && !pLead.estimateId) byId(d.leads, pLead.id)!.estimateId = r.id;
    });
    return true;
  },
  onReplicaDelete(id) {
    const e = byId(getDb().estimates, id);
    if (e?.status === 'DRAFT') act(deleteEstimate, id);
  },
  facets: [
    {
      name: 'scope', dir: 'toP',
      readP: protoScope,
      readR: replicaScope,
      writeP: (v, id, r) => {
        const x = v as ScopeValue;
        const est = byId(getDb().estimates, id);
        if (!est || !canSyncPricing(est, r)) return 'keep';
        pWrite((d) => {
          const e = byId(d.estimates, id)!;
          const job = byId(d.jobs, e.jobId);
          if (!job) return;
          const kind: P.AreaKind = /exterior/i.test(r.estimateType) ? 'exterior' : 'interior';
          for (const [aid, name] of x.areas) {
            const a = byId(d.areas, aid);
            if (a) a.name = name;
            else d.areas.push({ id: aid, propertyId: job.propertyId, name, kind, roomType: roomTypeFor(name, kind) });
          }
          for (const [sid, aid, type, qty, name, unit, coatingArea] of x.lines) {
            const s = byId(d.surfaces, sid);
            if (s) Object.assign(s, { areaId: aid, type, areaSqft: coatingArea, measuredQuantity: qty, measurementUnit: unit as P.Surface['measurementUnit'], name });
            else d.surfaces.push({ id: sid, propertyId: job.propertyId, areaId: aid, name: name || type, type, areaSqft: coatingArea, measuredQuantity: qty, measurementUnit: unit as P.Surface['measurementUnit'], condition: 'sound' });
          }
          job.surfaceIds = x.lines.map((l) => l[0]);
          // Removed scope must no longer contribute to this job's paint demand.
          for (const spec of d.specs.filter((s) => s.jobId === job.id && s.state !== 'superseded')) {
            spec.surfaceIds = spec.surfaceIds.filter((sid) => job.surfaceIds.includes(sid));
          }
        });
      },
    },
    {
      name: 'total', dir: 'toP',
      readP: (p, id) => round2(byId(p.estimates, id)!.total),
      readR: (r) => round2(replicaTotals(r).total),
      writeP: (v, id, r) => {
        const est = byId(getDb().estimates, id);
        if (!est || !canSyncPricing(est, r)) return 'keep';
        pWrite((d) => { const e = byId(d.estimates, id); if (e) e.total = v as number; });
      },
    },
    {
      name: 'pricing', dir: 'toP',
      readP: (p, id) => byId(p.estimates, id)!.pricingSnapshot,
      readR: (r) => ({ lineItems: r.lineItems, extras: r.extras, discountType: r.discountType, discountValue: r.discountValue, taxRate: r.taxRate }),
      writeP: (v, id, r) => {
        const est = byId(getDb().estimates, id);
        if (!est || !canSyncPricing(est, r)) return 'keep';
        pWrite((d) => {
          const e = byId(d.estimates, id)!;
          e.pricingSnapshot = structuredClone(v) as P.Estimate['pricingSnapshot'];
          const job = byId(d.jobs, e.jobId);
          if (job) {
            job.taxRatePct = r.taxRate;
            for (const area of r.areas) {
              if (!byId(d.areas, area.id)) d.areas.push({ id: area.id, propertyId: job.propertyId, name: area.name, kind: 'interior', roomType: 'living_room' });
            }
            for (const line of r.lineItems.filter((l) => l.optional)) {
              const type = M.surfaceTypeP(line.surfaceType || line.description);
              if (!type) continue;
              const fields = { areaId: line.areaId, name: line.description, type,
                areaSqft: line.unit === 'sqft' ? line.quantity : line.coatingAreaSqft ?? 0, measurementUnit: line.unit, measuredQuantity: line.quantity };
              const existing = byId(d.surfaces, line.id);
              if (existing) Object.assign(existing, fields);
              else d.surfaces.push({ id: line.id, propertyId: job.propertyId, ...fields, condition: 'sound' });
            }
          }
        });
      },
    },
    {
      name: 'approvedPricing', dir: 'toR',
      readP: (p, id) => { const e = byId(p.estimates, id)!; return e.status === 'ACCEPTED' ? e.pricingSnapshot : undefined; },
      readR: (r) => ({ lineItems: r.lineItems, extras: r.extras, discountType: r.discountType, discountValue: r.discountValue, taxRate: r.taxRate }),
      writeR: (v) => v ? v as Partial<Estimate> : {},
    },
    {
      name: 'meta', dir: 'both',
      readP: (p, id) => { const e = byId(p.estimates, id)!; return { title: e.title, date: M.dayOf(e.estimateDate ?? e.createdAt), validUntil: M.dayOf(e.validUntil) }; },
      readR: (r) => ({ title: r.title, date: M.dayOf(r.date), validUntil: M.dayOf(r.validUntil) }),
      writeR: (v) => { const x = v as { title: string; date?: string; validUntil?: string }; return { title: x.title, ...(x.date ? { date: iso(x.date) } : {}), ...(x.validUntil ? { validUntil: iso(x.validUntil) } : {}) }; },
      writeP: (v, id) => {
        const x = v as { title: string; date?: string; validUntil?: string };
        pWrite((d) => { const e = byId(d.estimates, id); if (!e) return; e.title = x.title; if (x.date) e.estimateDate = iso(x.date); if (x.validUntil) e.validUntil = iso(x.validUntil); });
      },
    },
    {
      name: 'notes', dir: 'both',
      readP: (p, id) => { const e = byId(p.estimates, id)!; return { notes: e.customerNotes ?? '', internal: e.internalNotes ?? '' }; },
      readR: (r) => ({ notes: r.notes ?? '', internal: r.internalNotes ?? '' }),
      writeR: (v) => { const x = v as { notes: string; internal: string }; return { notes: x.notes || undefined, internalNotes: x.internal || undefined }; },
      writeP: (v, id) => { const x = v as { notes: string; internal: string }; pWrite((d) => { const e = byId(d.estimates, id); if (e) { e.customerNotes = x.notes || undefined; e.internalNotes = x.internal || undefined; } }); },
    },
    {
      name: 'estimator', dir: 'both',
      readP: (p, id) => byId(p.estimates, id)!.estimatorId ?? null,
      readR: (r) => r.estimatorId ?? null,
      writeR: (v) => ({ estimatorId: (v as string | null) ?? undefined }),
      writeP: (v, id) => { pWrite((d) => { const e = byId(d.estimates, id); if (e) e.estimatorId = (v as string | null) ?? undefined; }); },
    },
    {
      name: 'status', dir: 'both',
      readP: (p, id) => M.EST_STATUS_R[byId(p.estimates, id)!.status],
      readR: (r) => r.status,
      writeR: (v, _r, p) => {
        const e = p.estimates.find((x) => x.id === _r.id)!;
        return {
          status: v as Estimate['status'], sentAt: e.sentAt, viewedAt: e.viewedAt, approvedAt: e.acceptedAt,
          signature: e.status === 'ACCEPTED' && e.signatureName ? { name: e.signatureName, date: e.acceptedAt ?? new Date().toISOString() } : _r.signature,
        };
      },
      writeP: (v, id, r) => {
        const e = byId(getDb().estimates, id);
        if (!e) return;
        switch (v as Estimate['status']) {
          case 'Sent':
            act(sendEstimate, id);
            break;
          case 'Viewed':
            if (e.status === 'DRAFT') act(sendEstimate, id);
            pWrite((d) => { const x = byId(d.estimates, id); if (x && x.status === 'SENT') { x.status = 'VIEWED'; x.viewedAt = r.viewedAt ?? new Date().toISOString(); } });
            break;
          case 'Approved':
            if (r.signature?.name && (e.status === 'SENT' || e.status === 'VIEWED' || e.status === 'PENDING_REAPPROVAL') && e.publicToken) {
              act(acceptEstimateByToken, e.publicToken, { signatureName: r.signature.name, signed: true });
            } else act(markEstimateApproved, id);
            break;
          case 'Rejected':
            pWrite((d) => {
              const x = byId(d.estimates, id);
              if (!x || x.status === 'ACCEPTED') return;
              x.status = 'DECLINED';
              x.declinedAt = new Date().toISOString();
              const l = byId(d.leads, x.leadId);
              if (l && l.stage !== 'sold') l.stage = 'lost';
            });
            break;
          case 'Draft':
            if (e.status === 'ACCEPTED' || e.status === 'SENT' || e.status === 'VIEWED' || e.status === 'PENDING_REAPPROVAL') act(amendEstimate, id);
            break;
          case 'Expired':
            pWrite((d) => { const x = byId(d.estimates, id); if (x && x.status !== 'ACCEPTED') x.status = 'EXPIRED'; });
            break;
        }
      },
    },
    {
      name: 'job', dir: 'toR',
      readP: (p, id) => { const j = M.scopeJob(p, byId(p.estimates, id)!); return j && j.status !== 'estimating' ? j.id : null; },
      readR: (r) => r.jobId ?? null,
      writeR: (v) => (v ? { jobId: v as string } : {}),
    },
  ],
};

/* jobs */

const jobs: Entity<Job> = {
  key: 'jobs',
  pIds: (p) => p.jobs.filter((j) => j.status !== 'estimating').map((j) => j.id),
  project: (p, id) => M.projectJob(p, byId(p.jobs, id)!),
  facets: [
    {
      name: 'protection', dir: 'both',
      readP: (p, id) => !!byId(p.jobs, id)!.scheduleProtected,
      readR: (r) => !!r.scheduleProtected,
      writeR: (v) => ({ scheduleProtected: v as boolean }),
      writeP: (v, id) => pWrite((d) => { const j = byId(d.jobs, id); if (j) j.scheduleProtected = v as boolean; }),
    },
    {
      name: 'hours', dir: 'toR',
      readP: (p, id) => M.projectJob(p, byId(p.jobs, id)!).estimatedHours,
      readR: (r) => r.estimatedHours,
      writeR: (v) => ({ estimatedHours: v as number }),
    },
    /*
      Order matters: crew and shifts go across before the schedule, so the
      prototype checks the new dates against the new crew hours (not the old
      ones); status comes after the schedule, because scheduling the work
      order is what makes the job Scheduled on the prototype side.
    */
    {
      name: 'crew', dir: 'both',
      readP: (p, id) => M.jobCrew(p, id).sort((a, b) => a.memberId.localeCompare(b.memberId)),
      readR: (r) => [...r.crew].sort((a, b) => a.memberId.localeCompare(b.memberId)),
      writeR: (v) => ({ crew: v as Job['crew'] }),
      writeP: (v, id, r) => {
        const crew = v as Job['crew'];
        const ids = crew.map((c) => c.memberId);
        pWrite((d) => {
          const j = byId(d.jobs, id);
          if (j) j.crewAssignments = structuredClone(crew);
          const wo = d.workOrders.find((w) => w.jobId === id);
          if (!wo) return;
          const empIds = ids.map((m) => d.employees?.find((e) => e.userId === m)?.id ?? m);
          if (r.shifts?.length) return;
          if (wo.shifts[0]) wo.shifts[0].memberIds = empIds;
          else if (empIds.length) {
            const start = r.startDate ?? M.dayOf(new Date().toISOString())!;
            wo.shifts.push({ id: `SH-${id}`, name: 'Crew', startDate: start, endDate: r.endDate ?? start, startTime: r.startTime ?? '08:00', endTime: r.endTime ?? '16:00', memberIds: empIds });
          }
        });
      },
    },
    {
      // Named shifts from the scheduling panel become the work order's shifts (same shape).
      name: 'shifts', dir: 'toP',
      readP: (p, id) => {
        const wo = p.workOrders.find((w) => w.jobId === id);
        const userOf = (emp: string) => p.employees?.find((e) => e.id === emp)?.userId ?? emp;
        return (wo?.shifts ?? []).map((s) => ({ ...s, memberIds: s.memberIds.map(userOf) }));
      },
      readR: (r) => r.shifts ?? [],
      writeP: (v, id) => {
        const shifts = v as NonNullable<Job['shifts']>;
        // A job scheduled without shifts keeps the crew facet's single shift.
        if (!shifts.length) return 'keep';
        pWrite((d) => {
          const wo = d.workOrders.find((w) => w.jobId === id);
          if (!wo) return;
          const empOf = (m: string) => d.employees?.find((e) => e.userId === m)?.id ?? m;
          wo.shifts = shifts.map((s) => ({ ...s, memberIds: s.memberIds.map(empOf) }));
        });
      },
    },
    {
      name: 'schedule', dir: 'both',
      readP: (p, id) => M.jobSchedule(p, byId(p.jobs, id)!),
      readR: (r) => ({ startDate: r.startDate, endDate: r.endDate, startTime: r.startTime, endTime: r.endTime }),
      writeR: (v) => v as Partial<Job>,
      writeP: (v, id, r) => {
        const x = v as { startDate?: string; endDate?: string; startTime?: string; endTime?: string };
        const p = getDb();
        const wo = p.workOrders.find((w) => w.jobId === id);
        if (wo && x.startDate && x.endDate) act(scheduleWorkOrder, wo.id, { startDate: x.startDate, endDate: x.endDate, startTime: x.startTime, endTime: x.endTime, preserveShiftTimes: !!r.shifts?.length });
        else if (wo && !x.startDate && wo.status === 'SCHEDULED') act(markUnscheduled, wo.id);
        else if (!wo) pWrite((d) => { const j = byId(d.jobs, id); if (j) { j.scheduleStart = x.startDate ? iso(x.startDate, 8) : undefined; j.scheduleEnd = x.endDate ? iso(x.endDate, 17) : undefined; } });
      },
    },
    {
      name: 'status', dir: 'both',
      readP: (p, id) => M.JOB_STATUS_R[byId(p.jobs, id)!.status as Exclude<P.JobStatus, 'estimating'>] ?? 'Unscheduled',
      readR: (r) => r.status,
      writeR: (v) => ({ status: v as Job['status'] }),
      writeP: (v, id) => {
        const to = M.JOB_STATUS_P[v as Job['status']];
        // Marketing and Cancelled are replica-only stages: keep them on the replica side.
        if (!to || to === 'marketing') return 'keep';
        act(setJobStage, id, to);
      },
    },
    {
      name: 'value', dir: 'toR',
      readP: (p, id) => round2(byId(p.jobs, id)!.contractValue),
      readR: (r) => round2(r.value),
      writeR: (v) => ((v as number) > 0 ? { value: v as number } : {}),
    },
  ],
};

/* work orders */

const woBucket = (s: string) => (s === 'IN_PROGRESS' || s === 'In Progress' ? 'IN_PROGRESS' : s === 'COMPLETED' || s === 'Completed' ? 'COMPLETED' : 'OPEN');

const workOrders: Entity<WorkOrder> = {
  key: 'workOrders',
  pIds: (p) => p.workOrders.map((w) => w.id),
  project: (p, id) => M.projectWorkOrder(p, byId(p.workOrders, id)!),
  facets: [
    {
      name: 'status', dir: 'both',
      readP: (p, id) => woBucket(byId(p.workOrders, id)!.status),
      readR: (r) => woBucket(r.status),
      writeR: (v) => ({ status: v === 'IN_PROGRESS' ? 'In Progress' : v === 'COMPLETED' ? 'Completed' : 'Open' }),
      writeP: (v, id) => {
        if (v === 'IN_PROGRESS') act(setWorkOrderStatus, id, 'IN_PROGRESS');
        else if (v === 'COMPLETED') toast.error('Use Mark Complete', 'Completing a work order runs the closeout: confirm each surface, then close the job.');
      },
    },
    {
      name: 'crew', dir: 'toR',
      readP: (p, id) => M.projectWorkOrder(p, byId(p.workOrders, id)!).assignedTo.slice().sort(),
      readR: (r) => r.assignedTo.slice().sort(),
      writeR: (v) => ({ assignedTo: v as string[] }),
    },
  ],
};

/* invoices */

const invBucket: Record<Invoice['status'], P.InvoiceStatus> = { Draft: 'draft', Sent: 'sent', Unpaid: 'sent', Overdue: 'sent', Partial: 'partial', Paid: 'paid', Void: 'void' };
type PayValue = { id: string; amount: number; method: string; date: string }[];

const invoices: Entity<Invoice> = {
  key: 'invoices',
  pIds: (p) => p.invoices.map((i) => i.id),
  project: (p, id) => M.projectInvoice(p, byId(p.invoices, id)!),
  mirror(r) {
    const p = getDb();
    const job = byId(p.jobs, r.jobId);
    if (!job) return false;
    pWrite((d) => {
      d.invoices.push({
        id: r.id, jobId: job.id, kind: 'standard', status: invBucket[r.status], amount: invoiceTotals(r).total, createdAt: iso(r.date.slice(0, 10)), sentAt: r.sentAt,
        payments: r.payments.map((x) => ({ id: x.id, amount: x.amount, method: M.PAY_METHOD_P[x.method], reference: x.reference, notes: x.note, at: iso(x.date.slice(0, 10)), by: 'U-OFFICE' })),
      });
    });
    return true;
  },
  facets: [
    {
      name: 'amount', dir: 'toP',
      readP: (p, id) => round2(byId(p.invoices, id)!.amount),
      readR: (r) => round2(invoiceTotals(r).total),
      writeP: (v, id) => {
        if (byId(getDb().invoices, id)?.status !== 'draft') return 'keep';
        pWrite((d) => { const i = byId(d.invoices, id); if (i) i.amount = v as number; });
      },
    },
    {
      name: 'payments', dir: 'both',
      readP: (p, id) => M.projectPayments(byId(p.invoices, id)!).map((x) => ({ id: x.id, amount: round2(x.amount), method: x.method, date: x.date, reference: x.reference ?? '', note: x.note ?? '' })).sort((a, b) => a.id.localeCompare(b.id)),
      readR: (r) => r.payments.map((x) => ({ id: x.id, amount: round2(x.amount), method: x.method, date: x.date.slice(0, 10), reference: x.reference ?? '', note: x.note ?? '' })).sort((a, b) => a.id.localeCompare(b.id)),
      writeR: (v, r, p) => ({ payments: M.projectPayments(byId(p.invoices, r.id)!).map((x) => ({ ...x, cardLast4: r.payments.find((y) => y.id === x.id)?.cardLast4 })) }),
      writeP: (v, id, r) => {
        const want = v as PayValue;
        const prior = byId(getDb().invoices, id)?.payments ?? [];
        act(reconcileInvoicePayments, id, want.map((x) => {
          const src = r.payments.find((p) => p.id === x.id)!;
          return { id: x.id, amount: x.amount, method: M.PAY_METHOD_P[src.method], reference: src.reference,
            notes: src.note, at: iso(x.date), by: prior.find((p) => p.id === x.id)?.by ?? useStore.getState().currentUserId };
        }), 'Payment list updated on invoice');
      },
    },
    {
      name: 'status', dir: 'both',
      readP: (p, id) => byId(p.invoices, id)!.status,
      readR: (r) => invBucket[r.status],
      writeR: (v, r) => (invBucket[r.status] === v ? {} : { status: M.INV_STATUS_R[v as P.InvoiceStatus] }),
      writeP: (v, id) => {
        const i = byId(getDb().invoices, id);
        if (!i) return;
        if (v === 'sent' && i.status === 'draft') act(sendInvoice, id);
        else if (v === 'paid' || v === 'partial') {
          // A rejected payment must not be bypassed by the replica's optimistic status.
          const status = invoicePaid(i) > 0 ? (invoiceBalance(i) <= 0 ? 'paid' : 'partial') : undefined;
          if (status) pWrite((d) => { const x = byId(d.invoices, id); if (x) x.status = status; });
        }
        else if (v !== 'sent') pWrite((d) => { const x = byId(d.invoices, id); if (x) x.status = v as P.InvoiceStatus; });
      },
    },
  ],
};

/** Order matters: records are created parents first; estimate status runs before lead status. */
const ENTITIES = [customers, leads, estimates, jobs, workOrders, invoices] as unknown as Entity<{ id: string }>[];
const FACET_ORDER = [customers, estimates, jobs, workOrders, invoices, leads] as unknown as Entity<{ id: string }>[];

/* ---------- the run ---------- */

/**
 * One sync pass. `baseline` is for a freshly loaded or reset replica store:
 * nothing is treated as deleted, missing records are simply projected again.
 */
export function runSync(rdb: RDb, opts: { baseline?: boolean } = {}): BridgeOp[] {
  const ops: BridgeOp[] = [];
  const rList = (key: CollectionKey) => {
    // Include this run's upserts so later entities see new parents.
    const base = rdb.collections[key] as unknown as { id: string }[];
    const added = ops.filter((o): o is Extract<BridgeOp, { kind: 'upsert' }> => o.kind === 'upsert' && o.key === key).map((o) => o.item);
    const removed = new Set(ops.filter((o) => o.kind === 'remove' && o.key === key).map((o) => (o as { id: string }).id));
    return [...added, ...base.filter((x) => !removed.has(x.id) && !added.some((a) => a.id === x.id))];
  };

  syncTeam(rdb, ops);

  /* Phase A: which records exist on each side. */
  for (const ent of ENTITIES) {
    const p = getDb();
    const pIds = new Set(ent.pIds(p).filter((id) => !tombs().has(`${ent.key}:${id}`)));
    const rItems = rList(ent.key);
    const rIds = new Set(rItems.map((x) => x.id));
    for (const id of pIds) {
      const k = `${ent.key}:${id}`;
      if (rIds.has(id)) {
        known.add(k);
        continue;
      }
      if (!opts.baseline && known.has(k) && seenR.get(ent.key)?.has(id)) {
        // Deleted on a replica screen.
        known.delete(k);
        bury(k);
        ent.onReplicaDelete?.(id);
        continue;
      }
      const item = ent.project(getDb(), id);
      ops.push({ kind: 'upsert', key: ent.key, item });
      known.add(k);
      for (const f of ent.facets) snapshots.set(`${k}:${f.name}`, JSON.stringify(f.readP(getDb(), id) ?? null));
    }
    const pAll = new Set(ent.pIds(getDb()));
    for (const r of rItems) {
      const k = `${ent.key}:${r.id}`;
      if (pAll.has(r.id) || tombs().has(k)) continue;
      if (!opts.baseline && known.has(k) && seenP.get(ent.key)?.has(r.id)) {
        // Deleted by a feature (e.g. a draft estimate removed): drop it here too.
        known.delete(k);
        ops.push({ kind: 'remove', key: ent.key, id: r.id });
        continue;
      }
      if (ent.mirror && !replicaOrigin.has(k) && ent.mirror(r, rdb)) {
        replicaOrigin.add(k);
        known.add(k);
      }
    }
    seenP.set(ent.key, new Set(ent.pIds(getDb())));
    seenR.set(ent.key, new Set(rList(ent.key).map((x) => x.id)));
  }

  /* Phase B: facets of linked records. */
  for (const ent of FACET_ORDER) {
    const rItems = rList(ent.key);
    for (const r0 of rItems) {
      const k = `${ent.key}:${r0.id}`;
      if (!known.has(k) || !ent.pIds(getDb()).includes(r0.id)) continue;
      let r = r0;
      const pending = ops.filter((o): o is Extract<BridgeOp, { kind: 'patch' }> => o.kind === 'patch' && o.key === ent.key && o.id === r.id);
      for (const o of pending) r = { ...r, ...o.patch };
      for (const f of ent.facets) {
        const sk = `${k}:${f.name}`;
        const vp = f.readP(getDb(), r.id);
        const vr = f.readR(r, rdb);
        if (eq(vp, vr)) {
          snapshots.set(sk, JSON.stringify(vp ?? null));
          continue;
        }
        const snap = snapshots.get(sk);
        const pChanged = snap === undefined ? !replicaOrigin.has(k) && f.dir !== 'toP' : snap !== JSON.stringify(vp ?? null);
        if ((pChanged && f.dir !== 'toP') || f.dir === 'toR') {
          if (f.writeR) {
            const patch = f.writeR(vp, r, getDb());
            if (Object.keys(patch).length) {
              ops.push({ kind: 'patch', key: ent.key, id: r.id, patch });
              r = { ...r, ...patch };
            }
          }
          snapshots.set(sk, JSON.stringify(vp ?? null));
          continue;
        }
        // The replica changed it: push across.
        const before = new Map(ent.facets.map((g) => [g.name, JSON.stringify(g.readP(getDb(), r.id) ?? null)]));
        const res = f.writeP?.(vr, r.id, r);
        // A push can change other facets of the same record (new shifts change the
        // schedule's daily times; scheduling changes the job status). Those changes
        // came from this push, not from the prototype, so their snapshots move too.
        for (const g of ent.facets) {
          if (g === f) continue;
          const gk = `${k}:${g.name}`;
          const now = JSON.stringify(g.readP(getDb(), r.id) ?? null);
          if (now !== before.get(g.name) && snapshots.get(gk) === before.get(g.name)) snapshots.set(gk, now);
        }
        const vp2 = f.readP(getDb(), r.id);
        if (eq(vp2, vr) || res === 'keep' || !f.writeR || f.dir === 'toP') {
          snapshots.set(sk, JSON.stringify(vp2 ?? null));
          continue;
        }
        // The prototype refused (its rules): roll the replica back.
        const patch = f.writeR(vp2, r, getDb());
        if (Object.keys(patch).length) {
          ops.push({ kind: 'patch', key: ent.key, id: r.id, patch });
          r = { ...r, ...patch };
        }
        snapshots.set(sk, JSON.stringify(vp2 ?? null));
      }
    }
  }

  syncEvents(rdb, ops);
  syncActivity(rdb, ops);
  return ops;
}

/* ---------- one-way extras ---------- */

/** Prototype users and crew become replica team members; the demo user is the replica's current user. */
function syncTeam(rdb: RDb, ops: BridgeOp[]) {
  const p = getDb();
  const team = rdb.collections.team;
  const want: TeamMember[] = [
    ...p.users.map((u, i) => M.projectUser(u, i)),
    ...(p.employees ?? []).filter((e) => !e.userId && e.type === 'hourly').map((e, i) => M.projectEmployee(e, i)),
  ];
  for (const m of want) {
    const have = team.find((t) => t.id === m.id);
    if (!have) ops.push({ kind: 'upsert', key: 'team', item: m });
    else if (have.firstName !== m.firstName || have.lastName !== m.lastName || have.role !== m.role) ops.push({ kind: 'patch', key: 'team', id: m.id, patch: { firstName: m.firstName, lastName: m.lastName, role: m.role, roleId: m.roleId } });
  }
  const current = useStore.getState().currentUserId;
  if (rdb.singletons.currentUserId !== current) ops.push({ kind: 'singleton', key: 'currentUserId', value: current });
}

/** Estimate appointments booked on the prototype side appear on the replica calendar. */
function syncEvents(rdb: RDb, ops: BridgeOp[]) {
  const p = getDb();
  const events = rdb.collections.events;
  const activeIds = new Set<string>();
  for (const l of p.leads) {
    if (!l.scheduledAt || !['estimate_scheduled', 'pending'].includes(l.stage)) continue;
    const own = events.find((e) => e.leadId === l.id && e.id !== `ev-${l.id}`);
    if (own) continue;
    const start = new Date(l.scheduledAt);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + (l.durationMin ?? 60) * 60_000);
    const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const prop = byId(p.properties, l.propertyId);
    const ev: CalendarEvent = {
      id: `ev-${l.id}`, title: `Estimate: ${l.name ?? M.customerName(p, l.customerId)}`, type: 'Estimate Appointment', date: M.dayOf(l.scheduledAt)!,
      startTime: hhmm(start), endTime: hhmm(end), leadId: l.id, customerId: byId(p.customers, l.customerId)?.leadOnly ? undefined : l.customerId,
      assignedTo: l.assignedUserId, address: M.addressLine(prop),
    };
    activeIds.add(ev.id);
    const have = events.find((e) => e.id === ev.id);
    if (!have) ops.push({ kind: 'upsert', key: 'events', item: ev });
    else if (Object.entries(ev).some(([key, value]) => have[key as keyof CalendarEvent] !== value)) ops.push({ kind: 'patch', key: 'events', id: ev.id, patch: ev });
  }
  for (const ev of events) {
    // Only remove bridge-owned events; manually created calendar entries belong to the user.
    if (ev.leadId && ev.id === `ev-${ev.leadId}` && !activeIds.has(ev.id)) {
      ops.push({ kind: 'remove', key: 'events', id: ev.id });
    }
  }
}

const REF_ENTITY: Record<string, Activity['entity']> = { LEAD: 'lead', EST: 'estimate', JOB: 'job', INV: 'invoice' };

/** The prototype's activity log feeds the replica dashboard's Activity card. */
function syncActivity(rdb: RDb, ops: BridgeOp[]) {
  const have = new Set(rdb.collections.activity.map((a) => a.id));
  const entries = getDb().activity.filter((a) => !a.blocked).slice(0, 150);
  for (const a of [...entries].reverse()) {
    const id = `pa-${a.id}`;
    if (have.has(id)) continue;
    const ref = a.message.match(/\b(LEAD|EST|JOB|INV)-\d{4}-\d+\b/)?.[0];
    const entity = ref ? REF_ENTITY[ref.split('-')[0]!] : undefined;
    ops.push({ kind: 'upsert', key: 'activity', item: { id, date: a.at, text: a.message, entity: ref ? entity : undefined, entityId: ref && entity ? ref : undefined } as Activity });
  }
}
