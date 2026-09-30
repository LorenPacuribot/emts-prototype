/**
 * Seed for the live host screens (estimate details, work orders, contacts).
 *
 * The feature seed in seed.ts was written around jobs and properties. This
 * module adds what the live screens need on top:
 * - every estimate linked to its internal project record and to a lead
 *   (a live estimate always comes from a scheduled lead);
 * - work orders for the three sold jobs, with rendered hours per surface;
 * - the estimate history shown on /estimates/[id]/history;
 * - a new customer with a scheduled lead, so the demo journey can start
 *   from nothing: lead → estimate → colour card → accept → job.
 */
import type { Database, Estimate, EstimateHistoryEntry, WorkOrder } from "@/features/types";
import { addDays } from "@/features/lib/rules/dates";
import { attachEstimate } from "@/features/lib/store/actions/history-estimate";
import { FOLLOW_UP_LEAD_STAGE } from "@/features/lib/store/actions/service";

export function hostSeed(db: Database, nowIso: string) {
  const d = (days: number) => addDays(nowIso, days);
  const at = (days: number, hour: number, minute = 0) => {
    const t = new Date(addDays(nowIso, days));
    t.setHours(hour, minute, 0, 0);
    return t.toISOString();
  };

  /* ---- Journey start: a new customer with an estimate appointment tomorrow ---- */
  db.customers.push({
    id: "C-OLIVIA", name: "Olivia Bennett", email: "olivia.bennett@example.com", phone: "(972) 555-0186",
    contactVerified: true, preferredChannel: "email", consentSigned: true, authorisedSigners: [],
  });
  db.properties.push({
    id: "PROP-1030", address: "12 Aspen Trail", city: "Plano", state: "TX", zip: "75025", type: "single_family", optOut: false,
    ownership: [{ id: "OWN-1030-1", customerId: "C-OLIVIA", start: d(-900) }],
  });

  /* ---- Leads: one per estimate (live one-to-one link) ---- */
  db.leads.push(
    { id: "LEAD-2026-10", customerId: "C-OLIVIA", propertyId: "PROP-1030", source: "website", stage: "estimate_scheduled", createdAt: d(-3), scheduledAt: at(1, 10), assignedUserId: "U-EST", note: "Living room and hallway repaint. Two kids, one dog." },
    { id: "LEAD-2026-11", customerId: "C-SAM", propertyId: "PROP-1002", source: "existing_customer", stage: "estimate_scheduled", createdAt: d(-15), scheduledAt: at(-12, 14), assignedUserId: "U-EST", estimateId: "EST-2026-8" },
    { id: "LEAD-2026-12", customerId: "C-STEVEN", propertyId: "PROP-1004", source: "referral", stage: "sold", createdAt: d(-66), scheduledAt: at(-62, 9), assignedUserId: "U-EST", estimateId: "EST-2026-6" },
    { id: "LEAD-2026-2", customerId: "C-LAKESIDE", propertyId: "PROP-1005", source: "referral", stage: "lost", createdAt: d(-410), scheduledAt: at(-404, 11), assignedUserId: "U-SENIOR", estimateId: "EST-2026-9" },
    { id: "LEAD-2026-13", customerId: "C-BETH", propertyId: "PROP-1024", source: "repaint_alert", stage: "sold", createdAt: d(-56), scheduledAt: at(-50, 15), assignedUserId: "U-EST", estimateId: "EST-2026-41" },
  );
  const leadFor: Record<string, string> = { "EST-2026-8": "LEAD-2026-11", "EST-2026-6": "LEAD-2026-12", "EST-2026-9": "LEAD-2026-2", "EST-2026-41": "LEAD-2026-13" };
  for (const lead of db.leads) {
    const est = db.estimates.find((e) => e.leadId === lead.id && !lead.estimateId);
    if (est && !lead.estimateId) lead.estimateId = est.id;
  }
  for (const l of db.leads.filter((x) => x.stage !== "new_lead" && !x.scheduledAt && x.estimateId)) {
    l.scheduledAt = addDays(l.createdAt, 4);
    l.assignedUserId = "U-EST";
  }
  // LEAD-2026-1 fed two jobs in the old seed; the live app allows one estimate per lead.
  const lead1 = db.leads.find((l) => l.id === "LEAD-2026-1");
  if (lead1) lead1.estimateId = "EST-2026-3";

  /* ---- Estimates: live fields and the link to the internal project record ---- */
  const tokens: Record<string, string> = {
    "EST-2026-1": "Xq7mV2pL9sKd4RtA", "EST-2026-3": "Bn4wT8cZ2hLm6YpQ", "EST-2026-5": "Rt6yU3kP8vDq2LsW", "EST-2026-6": "Mk2dF9qW4zXc7NbV",
    "EST-2026-8": "Pz8nC5vB1mQw3ErT", "EST-2026-9": "Jh3kL6pO9iUy5TrE", "EST-2026-41": "Wq1eR4tY7uIo2PaS",
  };
  for (const e of db.estimates) {
    const job = db.jobs.find((j) => j.estimateId === e.id);
    e.jobId = job?.id;
    e.leadId = e.leadId ?? leadFor[e.id];
    e.estimatorId = job?.estimatorId ?? "U-EST";
    e.estimateDate = e.createdAt;
    e.validUntil = e.validUntil ?? addDays(e.createdAt, 30);
    e.publicToken = tokens[e.id];
    e.amendmentNumber = 0;
    if (e.status !== "DRAFT") e.sentAt = addDays(e.createdAt, 1);
    if (e.status === "SENT") e.viewedAt = undefined;
    if (e.status === "ACCEPTED") {
      e.acceptedAt = job?.contractSignedAt ?? addDays(e.createdAt, 5);
      e.signatureName = db.customers.find((c) => c.id === e.customerId)?.name;
    }
    if (e.status === "DECLINED") e.declinedAt = addDays(e.createdAt, 9);
  }
  const est1 = db.estimates.find((e) => e.id === "EST-2026-1");
  if (est1) {
    est1.customerNotes = "Front door to be matched to the original 1998 red. Shutters stay on during painting.";
    est1.internalNotes = "Rough west siding: allow extra primer. Customer prefers text updates.";
  }

  /* ---- Estimate history (live GET /estimates/:id/history) ---- */
  db.estimateHistory = db.estimates.flatMap((e) => historyFor(db, e));
  db.counters.eh = db.estimateHistory.length;

  /* ---- Work orders (live /work-orders/[id]) ---- */
  const base = { fieldNotes: [], attachments: [], shifts: [], timeEntries: [], statusHistory: [] };
  const wo1: WorkOrder = {
    ...base, id: "WO-2026-1", jobId: "JOB-2026-1", status: "IN_PROGRESS", startDate: d(-6), endDate: d(12), createdAt: d(-100), scheduledAt: d(-20), startedAt: d(-6),
    gateCode: "4471#", accessNotes: "Side gate code. Park on Maple Ridge, not in the drive.",
    existingConditions: "West siding chalking and cracked caulk around two windows.",
    companyResponsibilities: ["Protect landscaping and walkways", "Remove and re-hang shutters", "Daily clean-up of the work area"],
    customerResponsibilities: ["Keep sprinklers off on painting days", "Move vehicles out of the driveway"],
    shifts: [{ id: "SH-1", name: "Exterior crew", startDate: d(-6).slice(0, 10), endDate: d(12).slice(0, 10), startTime: "07:00", endTime: "14:00", memberIds: ["EMP-1", "EMP-2", "EMP-3"] }],
    timeEntries: [
      { id: "WTE-1", surfaceId: "SF-1011", renderedHours: 14, notes: "Wash, scrape and first coat.", loggedBy: "U-CREW", loggedAt: at(-4, 16, 30), employeeId: "EMP-1", workDate: d(-4).slice(0, 10) },
      { id: "WTE-2", surfaceId: "SF-1021", renderedHours: 11.5, loggedBy: "U-CREW", loggedAt: at(-3, 16, 15), employeeId: "EMP-2", workDate: d(-3).slice(0, 10) },
      { id: "WTE-3", surfaceId: "SF-1031", renderedHours: 6, notes: "Extra primer on the rough boards.", loggedBy: "U-CREW", loggedAt: at(-2, 16, 40), employeeId: "EMP-1", workDate: d(-2).slice(0, 10) },
      { id: "WTE-4", surfaceId: "SF-1051", renderedHours: 4, loggedBy: "U-CREW", loggedAt: at(-1, 16, 5), employeeId: "EMP-3", workDate: d(-1).slice(0, 10) },
    ],
    fieldNotes: [
      { id: "FN-1", content: "Customer asked us to leave the hose bib on the south wall unpainted.", authorId: "U-CREW", createdAt: at(-5, 8, 10) },
      { id: "FN-2", content: "Door red sample round 2 dropped off with the customer.", authorId: "U-EST", createdAt: at(-5, 12, 0) },
    ],
    attachments: [
      { id: "ATT-1", fileName: "front-elevation-before.jpg", fileType: "image/jpeg", fileSize: 2_400_000, createdAt: at(-6, 8, 0), by: "U-CREW", caption: "Front elevation, before" },
      { id: "ATT-2", fileName: "west-siding-prep.jpg", fileType: "image/jpeg", fileSize: 1_900_000, createdAt: at(-3, 11, 0), by: "U-CREW", caption: "West siding after scraping" },
    ],
    statusHistory: [
      { id: "WSH-1", to: "PENDING_DEPOSIT", by: "U-OFFICE", at: d(-100) },
      { id: "WSH-2", from: "PENDING_DEPOSIT", to: "UNSCHEDULED", by: "U-OFFICE", at: d(-98) },
      { id: "WSH-3", from: "UNSCHEDULED", to: "SCHEDULED", by: "U-OFFICE", at: d(-20) },
      { id: "WSH-4", from: "SCHEDULED", to: "IN_PROGRESS", by: "U-CREW", at: d(-6) },
    ],
  };
  const wo2: WorkOrder = {
    ...base, id: "WO-2026-2", jobId: "JOB-2026-2", status: "SCHEDULED", startDate: d(9), endDate: d(16), createdAt: d(-60), scheduledAt: d(-10),
    accessNotes: "Customer works from home. Knock at the side door.",
    companyResponsibilities: ["Remove cabinet doors and hardware, label each door", "Mask countertops and appliances"],
    customerResponsibilities: ["Empty the cabinets before day one"],
    shifts: [{ id: "SH-2", name: "Cabinet crew", startDate: d(9).slice(0, 10), endDate: d(16).slice(0, 10), startTime: "08:00", endTime: "15:00", memberIds: ["EMP-4"] }],
    statusHistory: [
      { id: "WSH-5", to: "PENDING_DEPOSIT", by: "U-OFFICE", at: d(-60) },
      { id: "WSH-6", from: "PENDING_DEPOSIT", to: "UNSCHEDULED", by: "U-OFFICE", at: d(-58) },
      { id: "WSH-7", from: "UNSCHEDULED", to: "SCHEDULED", by: "U-OFFICE", at: d(-10) },
    ],
  };
  const wo5: WorkOrder = {
    ...base, id: "WO-2026-5", jobId: "JOB-2026-5", status: "IN_PROGRESS", startDate: d(-9), endDate: d(-2), createdAt: d(-50), scheduledAt: d(-30), startedAt: d(-9),
    areasExcluded: "Kitchen and bathrooms",
    companyResponsibilities: ["Move and cover furniture", "Patch nail holes before painting"],
    customerResponsibilities: ["Take down wall art and curtains"],
    shifts: [{ id: "SH-3", name: "Interior crew", startDate: d(-9).slice(0, 10), endDate: d(-2).slice(0, 10), startTime: "07:00", endTime: "14:00", memberIds: ["EMP-4"] }],
    timeEntries: [
      { id: "WTE-5", surfaceId: "SF-4011", renderedHours: 7.5, loggedBy: "U-CREW", loggedAt: at(-6, 16, 0), employeeId: "EMP-1", workDate: d(-6).slice(0, 10) },
      { id: "WTE-6", surfaceId: "SF-4012", renderedHours: 5, loggedBy: "U-CREW", loggedAt: at(-6, 16, 10), employeeId: "EMP-2", workDate: d(-6).slice(0, 10) },
      { id: "WTE-7", surfaceId: "SF-4021", renderedHours: 6, loggedBy: "U-CREW", loggedAt: at(-5, 16, 0), employeeId: "EMP-1", workDate: d(-5).slice(0, 10) },
      { id: "WTE-8", surfaceId: "SF-4031", renderedHours: 5.5, loggedBy: "U-CREW", loggedAt: at(-4, 16, 0), employeeId: "EMP-2", workDate: d(-4).slice(0, 10) },
      { id: "WTE-9", surfaceId: "SF-4032", renderedHours: 3, notes: "Baseboard second coat.", loggedBy: "U-CREW", loggedAt: at(-3, 15, 30), employeeId: "EMP-1", workDate: d(-3).slice(0, 10) },
    ],
    fieldNotes: [{ id: "FN-3", content: "Dining room feature wall needs a third coat. Deep red showing through.", authorId: "U-CREW", createdAt: at(-5, 12, 30) }],
    attachments: [
      { id: "ATT-3", fileName: "living-room-after.jpg", fileType: "image/jpeg", fileSize: 2_100_000, createdAt: at(-3, 15, 0), by: "U-CREW", caption: "Living room, after" },
      { id: "ATT-4", fileName: "dining-room-after.jpg", fileType: "image/jpeg", fileSize: 1_800_000, createdAt: at(-3, 15, 5), by: "U-CREW", caption: "Dining room, after" },
    ],
    statusHistory: [
      { id: "WSH-8", to: "PENDING_DEPOSIT", by: "U-OFFICE", at: d(-50) },
      { id: "WSH-9", from: "PENDING_DEPOSIT", to: "UNSCHEDULED", by: "U-OFFICE", at: d(-48) },
      { id: "WSH-10", from: "UNSCHEDULED", to: "SCHEDULED", by: "U-OFFICE", at: d(-30) },
      { id: "WSH-11", from: "SCHEDULED", to: "IN_PROGRESS", by: "U-CREW", at: d(-9) },
    ],
  };
  db.workOrders = [wo1, wo2, wo5];
  Object.assign(db.counters, { wo: 5, wte: 9, wsh: 11, fn: 3, att: 4, shift: 3, job: 5, area: 0, surface: 0, lead: Math.max(db.counters.lead ?? 0, 13) });

  /* ---- Feature 28: a repeat draft is a normal estimate made from a scheduled lead ---- */
  for (const rep of db.repeatEstimates.filter((r) => !r.estimateId)) {
    const p = db.properties.find((x) => x.id === rep.propertyId)!;
    const owner = p.ownership.find((o) => !o.end) ?? p.ownership[p.ownership.length - 1];
    const leadId = `LEAD-2026-${++db.counters.lead}`;
    db.leads.push({ id: leadId, customerId: owner.customerId, propertyId: p.id, source: "existing_customer", stage: "estimate_scheduled", createdAt: addDays(rep.createdAt, -2), scheduledAt: addDays(rep.createdAt, -1), assignedUserId: rep.createdBy, note: "Asked for a repaint quote based on the last job." });
    attachEstimate(db, undefined, rep, leadId, rep.createdBy);
  }

  /* ---- Feature 29 (D5): every follow-up is worked as a Repaint alert lead in the pipeline ---- */
  for (const fu of db.followUps) {
    const est = db.estimates.find((e) => e.id === fu.estimateId);
    if (est?.leadId) { fu.leadId = est.leadId; continue; }
    const p = db.properties.find((x) => x.id === fu.propertyId);
    const owner = p && (p.ownership.find((o) => !o.end) ?? p.ownership[p.ownership.length - 1]);
    if (!owner) continue;
    const leadId = `LEAD-2026-${++db.counters.lead}`;
    const stage = FOLLOW_UP_LEAD_STAGE[fu.status];
    db.leads.push({
      id: leadId, customerId: owner.customerId, propertyId: fu.propertyId, source: "repaint_alert", stage, createdAt: fu.qualifiedAt, lastActivityAt: fu.history.at(-1)?.at,
      note: `Repaint follow-up ${fu.id} (alert ${fu.alertId}).${stage === "archived" ? ` Archived: ${fu.status === "do_not_contact" ? "Do not contact" : "Deferred"}${fu.closedReason ? ` — ${fu.closedReason}` : ""}` : ""}`,
    });
    fu.leadId = leadId;
  }
}

/** History entries that match an estimate's current status (live trigger values). */
function historyFor(db: Database, e: Estimate): EstimateHistoryEntry[] {
  const out: EstimateHistoryEntry[] = [];
  const customer = db.customers.find((c) => c.id === e.customerId)?.name;
  let n = 0;
  const add = (trigger: string, at: string, status: Estimate["status"], by: "ORG_USER" | "CLIENT", extra: Partial<EstimateHistoryEntry> = {}) =>
    out.push({
      id: `EH-${e.id}-${++n}`, estimateId: e.id, amendmentNumber: 0, trigger, status, grandTotal: e.total, performedBy: by,
      userId: by === "ORG_USER" ? e.estimatorId : undefined, customerName: by === "CLIENT" ? customer : undefined, changes: [], createdAt: at, ...extra,
    });
  add("CREATED", e.createdAt, "DRAFT", "ORG_USER", { changes: [{ type: "item_added", entity: "Estimate", entityLabel: e.title }] });
  if (e.sentAt) add("SENT", e.sentAt, "SENT", "ORG_USER");
  if (e.status === "ACCEPTED" && e.acceptedAt) add("ACCEPTED", e.acceptedAt, "ACCEPTED", "CLIENT");
  if (e.status === "DECLINED" && e.declinedAt) add("DECLINED", e.declinedAt, "DECLINED", "CLIENT");
  return out;
}
