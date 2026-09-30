/*
  Core sample data: team, customers, leads, estimates, jobs, work orders,
  invoices, presentations, calendar events and dashboard items.

  The first records (Sam Sample, Korah Singer, Steven Omodth, EST-2026-1..9,
  JOB-2026-1..5, INV-2026-1..5) mirror the live app screenshots from June 2026.
  The rest are added so every list has 10-20 rows to work with.
*/
import type {
  Activity, CalendarEvent, Customer, Estimate, EstimateArea, EstimateLineItem, EstimateStatus,
  Invoice, Job, Lead, Message, Presentation, Task, TeamMember, WorkOrder,
} from '../types';
import { estimateTotals, lineTotal, round2, versionSnapshot } from '../calculations';
import { applicationHours, lineGallons, materialPerUnit } from '../estimating';
import { areaTemplates, estimateTypes, paintProducts, surfaceRates } from './settings-library';

/* ============ TEAM ============ */

export const team: TeamMember[] = [
  { id: 'u_kevin', firstName: 'Kevin', lastName: 'Soriano', email: 'kevin@estimatemaster.example', phone: '', role: 'Owner', roleId: 'role_owner', status: 'Active', hourlyRate: 0, capacityHours: 40, color: '#2563EB', isCrew: false, lastActive: '2026-09-27' },
  { id: 'u_kest', firstName: 'Kevin', lastName: 'Estimator', email: 'estimator@estimatemaster.example', phone: '(850) 888-8167', role: 'Estimator', roleId: 'role_estimator', status: 'Active', hourlyRate: 32, capacityHours: 40, color: '#7A5FFF', isCrew: false, lastActive: '2026-09-25' },
  { id: 'u_nina', firstName: 'Nina', lastName: 'Brooks', email: 'nina@estimatemaster.example', phone: '(512) 555-0161', role: 'Project Manager', roleId: 'role_pm', status: 'Active', hourlyRate: 34, capacityHours: 40, color: '#F97316', isCrew: false, lastActive: '2026-09-26' },
  { id: 'u_mike', firstName: 'Mike', lastName: 'Torres', email: 'mike@estimatemaster.example', phone: '(512) 555-0172', role: 'Crew Lead', roleId: 'role_crew', status: 'Active', hourlyRate: 30, capacityHours: 40, color: '#22C55E', isCrew: true },
  { id: 'u_luis', firstName: 'Luis', lastName: 'Garcia', email: 'luis@estimatemaster.example', phone: '(512) 555-0183', role: 'Painter', roleId: 'role_crew', status: 'Active', hourlyRate: 24, capacityHours: 40, color: '#06B6D4', isCrew: true },
  { id: 'u_jess', firstName: 'Jess', lastName: 'Parker', email: 'jess@estimatemaster.example', phone: '(512) 555-0194', role: 'Painter', roleId: 'role_crew', status: 'Active', hourlyRate: 24, capacityHours: 32, color: '#EC4899', isCrew: true },
  { id: 'u_aaron', firstName: 'Aaron', lastName: 'Wu', email: 'aaron@estimatemaster.example', phone: '(512) 555-0105', role: 'Painter', roleId: 'role_crew', status: 'Invited', hourlyRate: 22, capacityHours: 40, color: '#EAB308', isCrew: true },
];

/* ============ CUSTOMERS ============ */

const cust = (
  id: string, firstName: string, lastName: string, street: string, city: string, state: string, zip: string,
  source: string, type: Customer['type'], createdAt: string, extra: Partial<Customer> = {},
): Customer => ({
  id, firstName, lastName, street, city, state, zip, source, type, createdAt,
  email: `${firstName}.${lastName}`.toLowerCase().replace(/\s/g, '') + '@example.com',
  phone: `(512) 555-${String(1000 + Number(id.replace(/\D/g, '')) * 37).slice(-4)}`,
  ...extra,
});

export const customers: Customer[] = [
  cust('c1', 'Sam', 'Sample', '101 Sample St', 'Austin', 'TX', '78701', 'Website', 'Client', '2026-06-10T09:00:00Z'),
  cust('c2', 'Korah', 'Singer', '1314 Korah', 'Sons', 'SY', '00000', 'Existing Customer', 'Client', '2026-03-20T09:00:00Z'),
  cust('c3', 'Steven', 'Omodth', 'B8 L10 A. Luna St.', 'Dallas', 'TE', '75201', 'Website', 'Client', '2026-03-25T09:00:00Z'),
  cust('c4', 'Jeremy', 'Irons', '22 Oak Ln', 'Milwaukee', 'TN', '37201', 'Referral', 'Client', '2026-04-08T09:00:00Z'),
  cust('c5', 'Asaph', 'Songer', '88 Ridge Rd', 'Milwaukee', 'TN', '37203', 'Website', 'Contact', '2026-04-08T09:00:00Z'),
  cust('c6', 'Maria', 'Lopez', '4512 Avenue F', 'Austin', 'TX', '78751', 'Google', 'Contact', '2026-09-10T09:00:00Z'),
  cust('c7', 'Daniel', 'Kim', '901 Sundance Pkwy', 'Round Rock', 'TX', '78681', 'Facebook', 'Contact', '2026-08-01T09:00:00Z'),
  cust('c8', 'Priya', 'Patel', '1700 Cypress Creek Rd', 'Cedar Park', 'TX', '78613', 'Referral', 'Contact', '2026-09-05T09:00:00Z'),
  cust('c9', 'Tom', 'Becker', '305 Pecan St', 'Pflugerville', 'TX', '78660', 'Yard Sign', 'Lead', '2026-09-24T09:00:00Z'),
  cust('c10', 'Hannah', 'Brooks', '2210 Windsor Rd', 'Austin', 'TX', '78703', 'Website', 'Client', '2026-08-20T09:00:00Z'),
  cust('c11', 'Carlos', 'Rivera', '600 Main St', 'Georgetown', 'TX', '78626', 'Referral', 'Client', '2026-08-10T09:00:00Z'),
  cust('c12', 'Emily', 'Chen', '1520 S Lamar Blvd', 'Austin', 'TX', '78704', 'Google', 'Lead', '2026-09-21T09:00:00Z'),
  cust('c13', 'Greg', 'Walters', '8100 Burnet Rd', 'Austin', 'TX', '78757', 'Website', 'Client', '2026-06-28T09:00:00Z', { companyName: 'Walters Property Mgmt' }),
  cust('c14', 'Olivia', 'Martin', '3 Lakeway Dr', 'Lakeway', 'TX', '78734', 'HomeAdvisor', 'Lead', '2026-09-22T09:00:00Z'),
];

const customerById = (id: string) => customers.find((c) => c.id === id)!;
const addr = (c: Customer) => `${c.street}, ${c.city}, ${c.state}`;

/* ============ LEADS ============ */

const lead = (
  n: number, customerId: string, status: Lead['status'], leadSource: string, serviceType: string,
  date: string, estimatedValue: number, contactType: Lead['contactType'], extra: Partial<Lead> = {},
): Lead => {
  const c = customerById(customerId);
  return {
    id: `l${n}`, leadNumber: `LEAD-2026-${n}`, firstName: c.firstName, lastName: c.lastName, companyName: c.companyName,
    phone: c.phone, email: c.email, street: c.street, city: c.city, state: c.state, zip: c.zip,
    leadSource, serviceType, status, estimatedValue, date, createdAt: date, updatedAt: date,
    customerId, contactType, qualityRating: 3, assignedTo: 'u_kest', appointment: null, ...extra,
  };
};

export const leads: Lead[] = [
  lead(1, 'c3', 'Sold', 'Website', 'Exterior', '2026-03-25T10:00:00Z', 11197.4, 'CLIENT', { estimateId: 'e8', qualityRating: 4 }),
  lead(2, 'c5', 'Pending', 'Website', 'Exterior', '2026-04-08T10:00:00Z', 7586, 'CONTACT', { estimateId: 'e7' }),
  lead(3, 'c2', 'Pending', 'Website', 'Interior', '2026-04-08T10:00:00Z', 5485.9, 'CONTACT', { estimateId: 'e6' }),
  lead(4, 'c4', 'Sold', 'Referral', 'Exterior', '2026-04-08T10:00:00Z', 27442.8, 'CLIENT', { estimateId: 'e5', qualityRating: 5 }),
  lead(5, 'c2', 'New', 'Existing Customer', 'Interior', '2026-05-15T10:00:00Z', 4500, 'LEAD', { notes: 'Wants the upstairs hallway and two bedrooms done.' }),
  lead(6, 'c1', 'Sold', 'Website', 'Interior', '2026-06-10T10:00:00Z', 4992.9, 'CLIENT', { estimateId: 'e9', qualityRating: 5 }),
  lead(7, 'c6', 'Scheduled', 'Google', 'Interior', '2026-09-10T10:00:00Z', 6200, 'CONTACT', { estimateId: 'e10', appointment: { date: '2026-09-29', time: '10:00', estimatorId: 'u_kest' } }),
  lead(8, 'c7', 'Lost', 'Facebook', 'Exterior', '2026-08-01T10:00:00Z', 14800, 'CONTACT', { estimateId: 'e11', notes: 'Went with a cheaper bid.' }),
  lead(9, 'c8', 'Pending', 'Referral', 'Cabinets', '2026-09-05T10:00:00Z', 5600, 'CONTACT', { estimateId: 'e12' }),
  lead(10, 'c9', 'New', 'Yard Sign', 'Exterior', '2026-09-24T10:00:00Z', 9000, 'LEAD'),
  lead(11, 'c12', 'Contacted', 'Google', 'Interior', '2026-09-21T10:00:00Z', 3800, 'LEAD', { notes: 'Left voicemail 9/22. Called back 9/23, wants a quote for the living room.' }),
  lead(12, 'c14', 'Contacted', 'HomeAdvisor', 'Exterior', '2026-09-22T10:00:00Z', 12000, 'LEAD', { appointment: { date: '2026-10-01', time: '14:00', estimatorId: 'u_kest' } }),
  lead(13, 'c10', 'Sold', 'Website', 'Interior', '2026-08-20T10:00:00Z', 8950, 'CLIENT', { estimateId: 'e13' }),
  lead(14, 'c11', 'Sold', 'Referral', 'Exterior', '2026-08-10T10:00:00Z', 18400, 'CLIENT', { estimateId: 'e14' }),
  lead(15, 'c13', 'Archived', 'Website', 'Interior', '2026-06-28T10:00:00Z', 12600, 'CLIENT', { estimateId: 'e15' }),
];

/* ============ ESTIMATES ============ */

type AreaSpec = { area: string; surfaces: [surfaceRateId: string, qty: number][] };

const typeIdByName: Record<string, string> = { Interior: 'et_interior', Exterior: 'et_exterior', Cabinets: 'et_cabinets' };
const templateByType: Record<string, string> = { Interior: 'tpl_interior', Exterior: 'tpl_exterior', Cabinets: 'tpl_cabinets' };
const paintByType: Record<string, string> = { Interior: 'pp_emerald', Exterior: 'pp_duration', Cabinets: 'pp_advance' };

const INTERIOR: AreaSpec[] = [
  { area: 'Living Room', surfaces: [['sr_stdwalls', 520], ['sr_ceiling', 300], ['sr_baseboard', 80]] },
  { area: 'Master Bedroom', surfaces: [['sr_stdwalls', 440], ['sr_ceiling', 220], ['sr_baseboard', 64]] },
  { area: 'Kitchen', surfaces: [['sr_stdwalls', 300], ['sr_ceiling', 180]] },
  { area: 'Hallway', surfaces: [['sr_stdwalls', 260], ['sr_doortrim', 60]] },
];
const EXTERIOR: AreaSpec[] = [
  { area: 'Front Elevation', surfaces: [['sr_siding', 900], ['sr_windowtrim', 120], ['sr_doortrim', 30]] },
  { area: 'Rear Elevation', surfaces: [['sr_siding', 850], ['sr_windowtrim', 90]] },
  { area: 'Side Elevations', surfaces: [['sr_siding', 1100], ['sr_stucco', 300]] },
  { area: 'Fascia & Soffits', surfaces: [['sr_crown', 260]] },
];
const CABINETS: AreaSpec[] = [
  { area: 'Upper Cabinets', surfaces: [['sr_cabinets', 60]] },
  { area: 'Lower Cabinets', surfaces: [['sr_cabinets', 70]] },
  { area: 'Island', surfaces: [['sr_cabinets', 30]] },
];
const SPECS: Record<string, AreaSpec[]> = { Interior: INTERIOR, Exterior: EXTERIOR, Cabinets: CABINETS };

/**
 * Builds an estimate from area specs, then adds a "Surface Preparation" extra
 * so the total lands on `target` (the value shown in the live app).
 */
function buildEstimate(o: {
  n: number; title: string; type: 'Interior' | 'Exterior' | 'Cabinets'; customerId: string; leadId?: string;
  status: EstimateStatus; date: string; target: number; jobId?: string; margin?: number;
}): Estimate {
  const et = estimateTypes.find((t) => t.id === typeIdByName[o.type])!;
  const paint = paintProducts.find((p) => p.id === paintByType[o.type])!;
  const margin = o.margin ?? 20;
  const specs = SPECS[o.type]!;

  const makeLines = (scale: number) => {
    const areas: EstimateArea[] = [];
    const lines: EstimateLineItem[] = [];
    specs.forEach((spec, ai) => {
      const areaId = `e${o.n}_a${ai + 1}`;
      const tpl = areaTemplates.find((a) => a.name === spec.area);
      areas.push({ id: areaId, name: spec.area, areaTemplateId: tpl?.id });
      spec.surfaces.forEach(([srId, qty], si) => {
        const sr = surfaceRates.find((s) => s.id === srId)!;
        const quantity = Math.max(1, Math.round(qty * scale));
        const coats = sr.defaultCoats;
        const unit = sr.unit === 'each' ? 'each' : sr.unit;
        // Same engine as the builder (lib/estimating.ts): per-coat rates and coverage.
        const laborHours = applicationHours({ quantity, coats }, sr);
        const unitPrice = materialPerUnit({ unit, quantity, coats }, paint);
        const base = { laborHours, laborRate: et.hourlyRate, difficultyMultiplier: 1, quantity, unitPrice };
        lines.push({
          id: `${areaId}_l${si + 1}`, areaId, description: sr.name, surfaceType: sr.name, paintProductId: paint.id, paintName: paint.name,
          location: spec.area, sheen: paint.finish,
          quantity, unit, unitPrice, laborHours, applicationHours: laborHours, prepHours: 0, gallons: lineGallons({ unit, quantity, coats }, paint),
          laborRate: et.hourlyRate, coats, difficultyMultiplier: 1,
          total: lineTotal(base, margin),
        });
      });
    });
    return { areas, lines };
  };

  let { areas, lines } = makeLines(1);
  let sub = lines.reduce((s, l) => s + l.total, 0);
  if (sub > o.target * 0.85) {
    ({ areas, lines } = makeLines((o.target * 0.8) / sub));
    sub = lines.reduce((s, l) => s + l.total, 0);
  }
  const prep = round2(o.target - sub);
  const d = o.date;
  const valid = new Date(new Date(d).getTime() + 30 * 86_400_000).toISOString();
  const versions: Estimate['versions'] = [{ version: 1, date: d, total: o.target, status: 'Draft', changedBy: 'Kevin Soriano', note: 'Estimate created' }];
  if (o.status !== 'Draft') versions.push({ version: 2, date: d, total: o.target, status: 'Sent', changedBy: 'Kevin Soriano', note: 'Sent to customer' });
  if (o.status === 'Approved' || o.status === 'Rejected')
    versions.push({ version: 3, date: d, total: o.target, status: o.status, changedBy: 'Customer', note: o.status === 'Approved' ? 'Signed by customer' : 'Declined by customer' });

  const c = customerById(o.customerId);
  const est: Estimate = {
    id: `e${o.n}`, estimateNumber: `EST-2026-${o.n}`, title: o.title, customerId: o.customerId, leadId: o.leadId,
    estimateTemplateId: templateByType[o.type], estimateType: o.type, status: o.status, date: d, validUntil: valid,
    address: addr(c), areas, lineItems: lines,
    extras: prep > 0 ? [{ id: `e${o.n}_x1`, name: 'Surface Preparation', quantity: 1, unitPrice: prep }] : [],
    discountType: 'none', discountValue: 0, taxRegionId: 'tx_none', taxRate: 0, profitMargin: margin,
    termsId: o.type === 'Cabinets' ? 'tc_cabinet' : 'tc_standard',
    notes: 'Price includes all labor and materials listed. Colors to be selected by the customer before the start date.',
    createdBy: 'u_kevin', createdAt: d, updatedAt: d,
    sentAt: o.status !== 'Draft' ? d : undefined,
    viewedAt: ['Viewed', 'Approved', 'Rejected'].includes(o.status) ? d : undefined,
    approvedAt: o.status === 'Approved' ? d : undefined,
    signature: o.status === 'Approved' ? { name: `${c.firstName} ${c.lastName}`, date: d } : null,
    versions, jobId: o.jobId,
  };
  // Every seeded version has the same scope, so each carries the same snapshot.
  const snapshot = versionSnapshot(est);
  est.versions = versions.map((v) => ({ ...v, ...snapshot }));
  return est;
}

export const estimates: Estimate[] = [
  buildEstimate({ n: 1, title: 'Standard Exterior Repaint', type: 'Exterior', customerId: 'c2', status: 'Approved', date: '2026-04-22T10:00:00Z', target: 30252, jobId: 'j1' }),
  buildEstimate({ n: 2, title: 'Standard Interior Repaint', type: 'Interior', customerId: 'c3', status: 'Sent', date: '2026-04-22T11:00:00Z', target: 4992.9 }),
  buildEstimate({ n: 3, title: 'Kitchen Cabinet Refinish', type: 'Cabinets', customerId: 'c3', status: 'Approved', date: '2026-04-24T10:00:00Z', target: 2400, jobId: 'j2', margin: 25 }),
  buildEstimate({ n: 4, title: 'Standard Exterior Repaint', type: 'Exterior', customerId: 'c2', status: 'Viewed', date: '2026-04-28T10:00:00Z', target: 25728.15 }),
  buildEstimate({ n: 5, title: 'Standard Exterior Repaint', type: 'Exterior', customerId: 'c4', leadId: 'l4', status: 'Approved', date: '2026-05-15T10:00:00Z', target: 27442.8, jobId: 'j3' }),
  buildEstimate({ n: 6, title: 'Standard Interior Repaint', type: 'Interior', customerId: 'c2', leadId: 'l3', status: 'Viewed', date: '2026-05-15T11:00:00Z', target: 5485.9 }),
  buildEstimate({ n: 7, title: 'Standard Exterior Repaint', type: 'Exterior', customerId: 'c5', leadId: 'l2', status: 'Viewed', date: '2026-05-19T10:00:00Z', target: 7586 }),
  buildEstimate({ n: 8, title: 'Standard Exterior Repaint', type: 'Exterior', customerId: 'c3', leadId: 'l1', status: 'Approved', date: '2026-05-19T11:00:00Z', target: 11197.4, jobId: 'j4' }),
  buildEstimate({ n: 9, title: 'Standard Interior Repaint', type: 'Interior', customerId: 'c1', leadId: 'l6', status: 'Approved', date: '2026-06-10T10:00:00Z', target: 4992.9, jobId: 'j5' }),
  buildEstimate({ n: 10, title: 'Main Floor Interior Repaint', type: 'Interior', customerId: 'c6', leadId: 'l7', status: 'Draft', date: '2026-09-20T10:00:00Z', target: 6200 }),
  buildEstimate({ n: 11, title: 'Full Exterior Repaint', type: 'Exterior', customerId: 'c7', leadId: 'l8', status: 'Rejected', date: '2026-08-12T10:00:00Z', target: 14800 }),
  buildEstimate({ n: 12, title: 'Kitchen Cabinet Refinish', type: 'Cabinets', customerId: 'c8', leadId: 'l9', status: 'Sent', date: '2026-09-18T10:00:00Z', target: 5600, margin: 25 }),
  buildEstimate({ n: 13, title: 'Whole Home Interior', type: 'Interior', customerId: 'c10', leadId: 'l13', status: 'Approved', date: '2026-09-02T10:00:00Z', target: 8950, jobId: 'j6' }),
  buildEstimate({ n: 14, title: 'Exterior Repaint & Trim', type: 'Exterior', customerId: 'c11', leadId: 'l14', status: 'Approved', date: '2026-08-28T10:00:00Z', target: 18400, jobId: 'j7' }),
  buildEstimate({ n: 15, title: 'Office Suite Interior', type: 'Interior', customerId: 'c13', leadId: 'l15', status: 'Approved', date: '2026-07-10T10:00:00Z', target: 12600, jobId: 'j8' }),
];

const estById = (id: string) => estimates.find((e) => e.id === id)!;

/* ============ JOBS ============ */

const job = (
  n: number, estimateId: string, status: Job['status'], start?: string, end?: string, crew: Job['crew'] = [], extra: Partial<Job> = {},
): Job => {
  const e = estById(estimateId);
  const t = estimateTotals(e);
  return {
    id: `j${n}`, jobNumber: `JOB-2026-${n}`, title: e.title, customerId: e.customerId, estimateId, leadId: e.leadId,
    address: e.address, status, startDate: start, endDate: end, startTime: start ? '08:00' : undefined, endTime: start ? '16:30' : undefined,
    estimatedHours: Math.max(8, Math.round(t.laborHours)), value: t.total, crew, breaks: [], notes: [],
    history: [{ date: e.approvedAt ?? e.date, text: `Job created from ${e.estimateNumber}` }],
    createdAt: e.approvedAt ?? e.date, ...extra,
  };
};

const crewA: Job['crew'] = [
  { memberId: 'u_mike', role: 'Crew Lead', hours: 40 },
  { memberId: 'u_luis', role: 'Painter', hours: 40 },
];
const crewB: Job['crew'] = [
  { memberId: 'u_jess', role: 'Painter', hours: 32 },
  { memberId: 'u_aaron', role: 'Painter', hours: 24 },
];

export const jobs: Job[] = [
  job(1, 'e1', 'In Production', '2026-04-27', '2026-05-31', crewA, {
    notes: [
      { id: 'jn1', date: '2026-04-27T17:00:00Z', authorId: 'u_mike', text: 'Pressure washed all sides. Scraping front elevation tomorrow.', type: 'daily-log' },
      { id: 'jn2', date: '2026-04-29T17:00:00Z', authorId: 'u_mike', text: 'Primed bare wood on the front. Customer asked to add the shed door.', type: 'daily-log' },
    ],
    breaks: [{ id: 'jb1', startDate: '2026-05-08', endDate: '2026-05-11', reason: 'Rain delay' }],
    history: [
      { date: '2026-04-22T10:00:00Z', text: 'Job created from EST-2026-1' },
      { date: '2026-04-24T10:00:00Z', text: 'Scheduled for 4/27/2026 - 5/31/2026' },
      { date: '2026-04-27T08:00:00Z', text: 'Status changed to In Production' },
    ],
  }),
  job(2, 'e3', 'Scheduled', '2026-05-14', '2026-05-31', crewB),
  job(3, 'e5', 'Unscheduled'),
  job(4, 'e8', 'Unscheduled'),
  job(5, 'e9', 'Completed', '2026-06-01', '2026-06-10', crewA, { completedAt: '2026-06-10T16:00:00Z' }),
  job(6, 'e13', 'Scheduled', '2026-09-29', '2026-10-03', crewB),
  job(7, 'e14', 'In Production', '2026-09-21', '2026-10-02', crewA, {
    notes: [{ id: 'jn3', date: '2026-09-24T17:00:00Z', authorId: 'u_mike', text: 'Front and rear siding done. Starting trim Friday.', type: 'daily-log' }],
  }),
  job(8, 'e15', 'Completed', '2026-07-20', '2026-08-01', [...crewA, ...crewB], { completedAt: '2026-08-01T16:00:00Z' }),
];

/* ============ WORK ORDERS ============ */

export const workOrders: WorkOrder[] = [
  { id: 'wo1', workOrderNumber: 'WO-2026-1', jobId: 'j1', title: 'Exterior prep & prime', status: 'Completed', assignedTo: ['u_mike', 'u_luis'], dueDate: '2026-05-02', instructions: 'Pressure wash, scrape loose paint, spot prime bare wood.', tasks: [{ id: 't1', text: 'Pressure wash all sides', done: true }, { id: 't2', text: 'Scrape and sand', done: true }, { id: 't3', text: 'Spot prime', done: true }], createdAt: '2026-04-24T10:00:00Z' },
  { id: 'wo2', workOrderNumber: 'WO-2026-2', jobId: 'j2', title: 'Cabinet doors off-site finish', status: 'Open', assignedTo: ['u_jess'], dueDate: '2026-05-20', instructions: 'Remove doors and drawers, label, spray in shop.', tasks: [{ id: 't4', text: 'Remove and label doors', done: false }, { id: 't5', text: 'Degrease and sand', done: false }, { id: 't6', text: 'Spray 2 coats', done: false }], createdAt: '2026-05-10T10:00:00Z' },
  { id: 'wo3', workOrderNumber: 'WO-2026-3', jobId: 'j7', title: 'Siding & trim', status: 'In Progress', assignedTo: ['u_mike', 'u_luis'], dueDate: '2026-10-02', instructions: 'Two coats Duration Satin on siding. Trim in Pure White.', tasks: [{ id: 't7', text: 'Front elevation', done: true }, { id: 't8', text: 'Rear elevation', done: true }, { id: 't9', text: 'Sides', done: false }, { id: 't10', text: 'Trim & fascia', done: false }], createdAt: '2026-09-19T10:00:00Z' },
  { id: 'wo4', workOrderNumber: 'WO-2026-4', jobId: 'j6', title: 'Interior repaint', status: 'Open', assignedTo: ['u_jess', 'u_aaron'], dueDate: '2026-10-03', instructions: 'Move furniture to center, cover floors. Walls Agreeable Gray, ceilings flat white.', tasks: [{ id: 't11', text: 'Protect floors & furniture', done: false }, { id: 't12', text: 'Patch & caulk', done: false }, { id: 't13', text: 'Paint walls', done: false }, { id: 't14', text: 'Paint ceilings & trim', done: false }], createdAt: '2026-09-25T10:00:00Z' },
];

/* ============ INVOICES ============ */

/** One invoice line per estimate area, plus the prep extra. */
function linesFromEstimate(e: Estimate, fraction = 1): Invoice['lineItems'] {
  const items = e.areas.map((a) => ({
    id: `${e.id}_inv_${a.id}`,
    description: `${a.name} — ${e.title}`,
    quantity: 1,
    rate: round2(e.lineItems.filter((l) => l.areaId === a.id).reduce((s, l) => s + l.total, 0) * fraction),
  }));
  for (const x of e.extras) items.push({ id: `${e.id}_inv_${x.id}`, description: x.name, quantity: x.quantity, rate: round2(x.unitPrice * fraction) });
  return items;
}

const inv = (
  n: number, estimateId: string, jobId: string, status: Invoice['status'], date: string, dueDate: string,
  payments: Invoice['payments'] = [], extra: Partial<Invoice> = {},
): Invoice => {
  const e = estById(estimateId);
  return {
    id: `i${n}`, invoiceNumber: `INV-2026-${n}`, customerId: e.customerId, jobId, estimateId, leadId: e.leadId,
    date, dueDate, status, lineItems: linesFromEstimate(e), taxRate: 0, discount: 0, payments,
    termsId: 'tc_standard', notes: 'Thank you for your business!',
    history: [{ date, text: 'Invoice created' }], ...extra,
  };
};

export const invoices: Invoice[] = [
  inv(1, 'e1', 'j1', 'Draft', '2026-04-22', '2026-05-07'),
  inv(2, 'e3', 'j2', 'Draft', '2026-04-24', '2026-05-09'),
  inv(3, 'e5', 'j3', 'Draft', '2026-05-15', '2026-05-30'),
  inv(4, 'e8', 'j4', 'Draft', '2026-05-19', '2026-06-03'),
  inv(5, 'e9', 'j5', 'Paid', '2026-06-10', '2026-06-25', [{ id: 'p1', date: '2026-06-10', amount: 4992.9, method: 'Credit Card', reference: 'ch_3PXa91' }], {
    sentAt: '2026-06-10', history: [{ date: '2026-06-10', text: 'Invoice created' }, { date: '2026-06-10', text: 'Sent to customer' }, { date: '2026-06-10', text: 'Payment received $4,992.90' }],
  }),
  inv(6, 'e15', 'j8', 'Paid', '2026-08-01', '2026-08-16', [
    { id: 'p2', date: '2026-07-10', amount: 3780, method: 'Check', reference: '#1043', note: 'Deposit' },
    { id: 'p3', date: '2026-08-05', amount: 8820, method: 'ACH', reference: 'ACH-77120' },
  ], { sentAt: '2026-08-01' }),
  inv(7, 'e14', 'j7', 'Partial', '2026-09-21', '2026-10-06', [{ id: 'p4', date: '2026-09-21', amount: 5520, method: 'Credit Card', reference: 'ch_9KqL02', note: '30% deposit' }], { sentAt: '2026-09-21' }),
  inv(8, 'e13', 'j6', 'Sent', '2026-09-20', '2026-10-05', [], { sentAt: '2026-09-20' }),
];

/* ============ PRESENTATIONS ============ */

const sections = (company = 'our team'): Presentation['sections'] => [
  { id: 's1', type: 'cover', title: 'Cover', content: 'Your Home, Beautifully Painted', enabled: true },
  // Estimate content, filled from the estimate in Client Preview (patent 11).
  { id: 's8', type: 'property', title: 'Your Property', content: '', enabled: true },
  { id: 's9', type: 'scope', title: 'Scope of Work', subtitle: 'Every surface, with its colour, product, sheen, coats and preparation.', content: '', enabled: true },
  { id: 's10', type: 'specs', title: 'Paint Specifications', content: '', enabled: true },
  { id: 's11', type: 'optional', title: 'Optional Items', content: '', enabled: true },
  { id: 's12', type: 'pricing', title: 'Investment', content: '', enabled: true },
  { id: 's2', type: 'about', title: 'About Us', content: `Family-owned and operated, ${company} has painted over 1,200 homes across Central Texas.`, enabled: true },
  { id: 's3', type: 'process', title: 'Our Process', content: '1. Walkthrough & color consult\n2. Protect & prep\n3. Two coats of premium paint\n4. Final walkthrough', enabled: true },
  { id: 's4', type: 'gallery', title: 'Recent Work', content: 'Before and after photos from recent projects.', enabled: true },
  { id: 's5', type: 'testimonials', title: 'What Clients Say', content: 'Customer reviews are pulled from your Google Business profile.', enabled: false },
  { id: 's6', type: 'warranty', title: 'Warranty', content: '2-year labor warranty against peeling, blistering and flaking.', enabled: true },
  { id: 's7', type: 'estimate', title: 'Your Estimate', content: 'Linked estimate summary and approve button.', enabled: false },
];

const COVERS = {
  a: 'linear-gradient(135deg,#1e3a8a 0%,#2563eb 55%,#60a5fa 100%)',
  b: 'linear-gradient(135deg,#7c2d12 0%,#ea580c 55%,#fdba74 100%)',
  c: 'linear-gradient(135deg,#312e81 0%,#7a5fff 55%,#c2b7ff 100%)',
  d: 'linear-gradient(135deg,#064e3b 0%,#10b981 55%,#a7f3d0 100%)',
};

export const presentations: Presentation[] = [
  { id: 'pr1', title: 'Combo', description: 'Interior, exterior and cabinet overview.', status: 'Draft', theme: 'blue', isTemplate: false, scopes: ['Interior', 'Exterior', 'Cabinets'], cover: COVERS.a, sections: sections(), views: 0, sharedWith: [], createdAt: '2026-04-22T10:00:00Z', updatedAt: '2026-04-22T10:00:00Z' },
  { id: 'pr2', title: 'b', description: 'Exterior proposal deck.', status: 'Draft', theme: 'blue', isTemplate: false, scopes: ['Exterior'], cover: COVERS.b, sections: sections(), views: 0, sharedWith: [], createdAt: '2026-04-22T10:00:00Z', updatedAt: '2026-04-22T10:00:00Z' },
  { id: 'pr3', title: 'a', description: 'Interior proposal deck.', status: 'Draft', theme: 'blue', isTemplate: false, scopes: ['Interior'], cover: COVERS.c, sections: sections(), views: 0, sharedWith: [], createdAt: '2026-04-22T10:00:00Z', updatedAt: '2026-04-22T10:00:00Z' },
  { id: 'pr4', title: 'Hannah Brooks — Whole Home', description: 'Proposal for EST-2026-13.', status: 'Published', theme: 'green', isTemplate: false, scopes: ['Interior'], cover: COVERS.d, sections: sections(), estimateId: 'e13', customerId: 'c10', views: 4, sharedWith: ['hannah.brooks@example.com'], createdAt: '2026-09-02T10:00:00Z', updatedAt: '2026-09-03T10:00:00Z' },
];

/* ============ CALENDAR ============ */

export const events: CalendarEvent[] = [
  { id: 'ev1', title: 'Estimate: Maria Lopez', type: 'Estimate Appointment', date: '2026-09-29', startTime: '10:00', endTime: '11:00', leadId: 'l7', customerId: 'c6', assignedTo: 'u_kest', address: '4512 Avenue F, Austin, TX' },
  { id: 'ev2', title: 'Follow up: Emily Chen', type: 'Follow Up', date: '2026-09-28', startTime: '09:30', endTime: '09:45', leadId: 'l11', customerId: 'c12', assignedTo: 'u_kest' },
  { id: 'ev3', title: 'Estimate: Olivia Martin', type: 'Estimate Appointment', date: '2026-10-01', startTime: '14:00', endTime: '15:00', leadId: 'l12', customerId: 'c14', assignedTo: 'u_kest', address: '3 Lakeway Dr, Lakeway, TX' },
  { id: 'ev4', title: 'Crew meeting', type: 'Meeting', date: '2026-09-28', startTime: '07:30', endTime: '08:00', assignedTo: 'u_nina', notes: 'Weekly safety and schedule review.' },
  { id: 'ev5', title: 'Final walkthrough: Carlos Rivera', type: 'Job', date: '2026-10-02', startTime: '15:00', endTime: '16:00', jobId: 'j7', customerId: 'c11', assignedTo: 'u_nina', address: '600 Main St, Georgetown, TX' },
  { id: 'ev6', title: 'Color consult: Hannah Brooks', type: 'Meeting', date: '2026-09-27', startTime: '13:00', endTime: '14:00', customerId: 'c10', assignedTo: 'u_kest' },
  { id: 'ev7', title: 'Estimate: Tom Becker', type: 'Estimate Appointment', date: '2026-10-05', startTime: '11:00', endTime: '12:00', leadId: 'l10', customerId: 'c9', assignedTo: 'u_kest', address: '305 Pecan St, Pflugerville, TX' },
];

/* ============ DASHBOARD ============ */

export const tasks: Task[] = [
  { id: 'tk1', text: 'Test 01', done: true, createdAt: '2026-06-10T10:00:00Z' },
  { id: 'tk2', text: 'Call Priya about cabinet colors', done: false, createdAt: '2026-09-25T10:00:00Z' },
  { id: 'tk3', text: 'Order paint for Brooks job', done: false, createdAt: '2026-09-26T10:00:00Z' },
];

export const activity: Activity[] = [
  { id: 'ac1', date: '2026-09-25T16:00:00Z', text: 'Carlos Rivera - Daily log added', entity: 'job', entityId: 'j7' },
  { id: 'ac2', date: '2026-09-21T10:00:00Z', text: 'Carlos Rivera - Payment Received', entity: 'invoice', entityId: 'i7' },
  { id: 'ac3', date: '2026-09-20T10:00:00Z', text: 'Hannah Brooks - Invoice Sent', entity: 'invoice', entityId: 'i8' },
  { id: 'ac4', date: '2026-09-18T10:00:00Z', text: 'Priya Patel - Estimate Sent', entity: 'estimate', entityId: 'e12' },
  { id: 'ac5', date: '2026-06-10T16:00:00Z', text: 'Sam Sample - Job Marked COMPLETED', entity: 'job', entityId: 'j5' },
  { id: 'ac6', date: '2026-06-10T15:00:00Z', text: 'Sam Sample - Job Marked READY FOR INSPECTION', entity: 'job', entityId: 'j5' },
  { id: 'ac7', date: '2026-06-10T14:00:00Z', text: 'Sam Sample - Payment Received', entity: 'invoice', entityId: 'i5' },
  { id: 'ac8', date: '2026-06-10T12:00:00Z', text: 'Kevin Soriano (USER) - Lead SOLD', entity: 'lead', entityId: 'l6' },
];

export const messages: Message[] = [
  { id: 'm1', from: 'Kevin', channel: 'email', preview: 'Your Growth account has been suspended', date: '2026-06-11T10:00:00Z', unread: false },
  { id: 'm2', from: 'Sam Sample', customerId: 'c1', channel: 'email', preview: 'Thank you for choosing Tecnologia', date: '2026-06-10T12:00:00Z', unread: true },
  { id: 'm3', from: 'Sam Sample', customerId: 'c1', channel: 'sms', preview: 'Hi Sam Sample, your estimate for "Standard Interior Repaint" is ready', date: '2026-06-10T11:00:00Z', unread: true },
  { id: 'm4', from: 'Sam Sample', customerId: 'c1', channel: 'email', preview: 'Estimate for Standard Interior Repaint', date: '2026-06-10T10:30:00Z', unread: true },
  { id: 'm5', from: 'Kevin', channel: 'email', preview: 'Welcome to Estimate Master', date: '2026-05-30T10:00:00Z', unread: false },
  { id: 'm6', from: 'Priya Patel', customerId: 'c8', channel: 'sms', preview: 'Can we do a darker blue on the island?', date: '2026-09-26T15:00:00Z', unread: true },
];
