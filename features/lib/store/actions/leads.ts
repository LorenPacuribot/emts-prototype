/**
 * Lead Pipeline actions (live /leads). Each one mirrors a live endpoint:
 *   createLead           POST  /leads
 *   setLeadStage         PATCH /leads/{id}/status
 *   scheduleLeadEstimate POST  /leads/{id}/schedule (the calendar event)
 *   addLeadNote          POST  /leads/{id}/notes
 * NEW (29, D5): a lead worked by an open repaint follow-up takes its stage
 * from the follow-up, so it can't be moved by hand.
 */
import type { Database, Lead, PipelineStage, User } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId } from "@/features/lib/selectors";
import { dateTime } from "@/features/lib/format";
import { isClosedFollowUp } from "@/features/lib/rules/alerts";
import { LIVE_LEAD_STATUS, canArchiveStage, canManuallySetStage, refusedMoveMessage, sourceFromLabel } from "@/features/lib/rules/lead-pipeline";
import { denied, fail, log, nextId, nextNumber, ok } from "../helpers";

const MODULE = "Leads";

export interface LeadDraft {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  /** Live job location: street, city, state, zip. The street creates the service location. */
  address: string;
  city: string;
  state: string;
  zip: string;
  source: string;
  note: string;
  /** An existing contact picked in the live contact-selection step. */
  customerId?: string;
  /** One of that contact's service locations. */
  propertyId?: string;
}

export function createLead(db: Database, actor: User, draft: LeadDraft) {
  if (!can(actor, "lead.create")) return denied(db, actor, MODULE, "create a lead", whoCan("lead.create"));
  let customerId = draft.customerId;
  if (customerId) {
    if (!byId(db.customers, customerId)) return fail("Contact not found.", "customerId");
  } else {
    if (!draft.firstName.trim()) return fail("First name is required.", "firstName");
    if (!draft.phone.trim() && !draft.email.trim()) return fail("Enter a phone number or an email.", "phone");
    if (draft.email.trim() && !/^\S+@\S+\.\S+$/.test(draft.email.trim())) return fail("Enter a valid email.", "email");
  }
  if (!draft.source.trim()) return fail("Choose where the lead came from.", "source");
  if (draft.propertyId && !byId(db.properties, draft.propertyId)) return fail("Service location not found.", "propertyId");
  if (!draft.propertyId && draft.address.trim() && !draft.city.trim()) return fail("Enter the city for this address.", "city");
  const t = now();
  if (!customerId) {
    customerId = nextId(db, "cust", "C-NEW-");
    db.customers.push({
      id: customerId, name: `${draft.firstName.trim()} ${draft.lastName.trim()}`.trim(), phone: draft.phone.trim() || undefined, email: draft.email.trim() || undefined,
      contactVerified: false, preferredChannel: draft.phone.trim() ? "phone" : "email", consentSigned: false, authorisedSigners: [],
    });
  }
  let propertyId = draft.propertyId;
  if (!propertyId && draft.address.trim()) {
    propertyId = `PROP-${2000 + nextNumber(db, "prop")}`;
    db.properties.push({
      id: propertyId, address: draft.address.trim(), city: draft.city.trim(), state: draft.state.trim() || "TX", zip: draft.zip.trim(), type: "single_family", optOut: false,
      ownership: [{ id: `OWN-${propertyId.slice(5)}-1`, customerId, start: t }],
    });
  }
  const id = nextId(db, "lead", "LEAD-2026-");
  const lead: Lead = { id, customerId, propertyId, stage: "new_lead", createdAt: t, lastActivityAt: t, town: draft.city.trim() || undefined, manual: true, ...sourceFromLabel(draft.source.trim()) };
  if (draft.note.trim()) lead.notes = [{ id: nextId(db, "leadnote", "LN-"), at: t, by: actor.id, text: draft.note.trim() }];
  db.leads.unshift(lead);
  log(db, actor, MODULE, `Lead ${id} created by ${actor.name} at ${dateTime(t)}. Source: ${draft.source.trim()}`);
  return ok(id);
}

/** The open repaint follow-up that drives this lead's stage, if any. */
export function drivingFollowUp(db: Database, lead: Pick<Lead, "id">) {
  return db.followUps.find((f) => f.leadId === lead.id && !isClosedFollowUp(f));
}

export function setLeadStage(db: Database, actor: User, leadId: string, to: PipelineStage) {
  if (!can(actor, "lead.update")) return denied(db, actor, MODULE, "change a lead's status", whoCan("lead.update"));
  const lead = byId(db.leads, leadId);
  if (!lead) return fail("Lead not found.");
  if (lead.stage === to) return ok();
  const fu = drivingFollowUp(db, lead);
  if (fu) return fail(`This lead follows repaint follow-up ${fu.id}. Record the call or close the follow-up to move it.`);
  if (lead.stage === "archived") {
    if (to !== "contacted") return fail("Restore an archived lead to Contacted first.");
  } else if (to === "archived") {
    if (!canArchiveStage(lead.stage)) return fail("Only Scheduled, Pending and Lost leads can be archived.");
  } else if (!canManuallySetStage(lead.stage, to)) {
    return fail(refusedMoveMessage(to));
  }
  const from = lead.stage;
  lead.stage = to;
  lead.lastActivityAt = now();
  log(db, actor, MODULE, `Lead ${leadId} moved from ${LIVE_LEAD_STATUS[from]} to ${LIVE_LEAD_STATUS[to]} by ${actor.name}`);
  return ok();
}

export interface ScheduleDraft {
  date: string; // yyyy-mm-dd
  time: string; // HH:mm
  durationMin: number;
  estimatorId: string;
}

/** Live "Schedule Estimate": books the appointment and moves the lead to Scheduled. */
export function scheduleLeadEstimate(db: Database, actor: User, leadId: string, draft: ScheduleDraft) {
  if (!can(actor, "calendar.manage")) return denied(db, actor, MODULE, "schedule an estimate", whoCan("calendar.manage"));
  const lead = byId(db.leads, leadId);
  if (!lead) return fail("Lead not found.");
  if (lead.stage !== "contacted" && lead.stage !== "estimate_scheduled") return fail("Schedule the estimate once the lead is Contacted.");
  if (lead.estimateId) return fail("This lead already has its estimate.");
  if (!draft.date) return fail("Choose a date.", "date");
  if (!draft.time) return fail("Choose a time.", "time");
  if (!byId(db.users, draft.estimatorId)) return fail("Assign an estimator.", "estimatorId");
  const at = new Date(`${draft.date}T${draft.time}:00`);
  if (Number.isNaN(at.getTime())) return fail("Choose a valid date and time.", "date");
  const re = !!lead.scheduledAt;
  lead.scheduledAt = at.toISOString();
  lead.durationMin = draft.durationMin;
  lead.assignedUserId = draft.estimatorId;
  lead.stage = "estimate_scheduled";
  lead.lastActivityAt = now();
  log(db, actor, MODULE, `Estimate ${re ? "rescheduled" : "scheduled"} for lead ${leadId} on ${dateTime(lead.scheduledAt)} with ${byId(db.users, draft.estimatorId)!.name}, by ${actor.name}`);
  return ok();
}

export function addLeadNote(db: Database, actor: User, leadId: string, text: string) {
  if (!can(actor, "lead.update")) return denied(db, actor, MODULE, "add a note", whoCan("lead.update"));
  const lead = byId(db.leads, leadId);
  if (!lead) return fail("Lead not found.");
  if (!text.trim()) return fail("Write the note first.", "note");
  const t = now();
  lead.notes = [{ id: nextId(db, "leadnote", "LN-"), at: t, by: actor.id, text: text.trim() }, ...(lead.notes ?? [])];
  lead.lastActivityAt = t;
  return ok();
}
