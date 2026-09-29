/**
 * Feature 25 — Historical Property Paint Record.
 *
 * Closeout (crew confirmation and job close), post-close corrections and
 * notices, surface structure, customer-reported work, ownership changes,
 * predecessor consent, personal-data deletion and merge / renumber requests.
 *
 * Each exported function is one user action: validate first, then mutate.
 */
import type { Application, CloseoutRow, Customer, Database, Job, Sheen, Surface, SurfaceType, UnknownException, User } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId, currentOwnership, surfaceLabel } from "@/features/lib/selectors";
import { closeoutBlockers, closeoutRowGaps, CLOSEOUT_FIELD_LABEL, correctionNeedsNotice, purgeDueDate, unreachableCheck, type CorrectionField } from "@/features/lib/rules/property";
import { denied, fail, log, nextId, ok, userName } from "../helpers";
import { dateLong, dateTime } from "@/features/lib/format";
import { activeLinkFor, generateLinkInternal, revokeLinkInternal, uniqueId } from "./qr";

const MODULE = "Property Record";

/* ================================================================== */
/* Closeout (component 25.2)                                           */
/* ================================================================== */

/**
 * The closeout checklist for a job: one row per surface in the approved
 * scope. Saved rows win; the rest are prefilled from the approved spec so
 * the crew lead only confirms (nothing is silently omitted).
 */
export function closeoutRowsFor(db: Database, job: Job): CloseoutRow[] {
  const saved = (db.closeouts ?? []).find((c) => c.jobId === job.id)?.rows ?? [];
  return job.surfaceIds.map((sid) => {
    const existing = saved.find((r) => r.surfaceId === sid);
    if (existing) return existing;
    const spec = db.specs.find((s) => s.jobId === job.id && s.state === "approved" && s.surfaceIds.includes(sid));
    const colour = spec && byId(db.colours, spec.colourId);
    return {
      surfaceId: sid,
      specId: spec?.id,
      painted: true,
      manufacturer: colour?.manufacturer ?? "",
      colourName: colour?.name ?? "",
      colourNumber: colour?.number ?? "",
      hex: colour?.hex ?? "#CBD5E1",
      product: spec?.product ?? "",
      sheen: spec?.sheen,
      coats: spec?.coats,
      tintFormula: colour?.tintFormula,
      unknowns: [],
    };
  });
}

function closeoutFor(db: Database, jobId: string) {
  db.closeouts ??= [];
  let c = db.closeouts.find((x) => x.jobId === jobId);
  if (!c) {
    c = { jobId, rows: [] };
    db.closeouts.push(c);
  }
  return c;
}

export interface CloseoutRowDraft {
  surfaceId: string;
  painted: boolean;
  notPaintedReason?: string;
  manufacturer: string;
  colourName: string;
  colourNumber: string;
  hex: string;
  product: string;
  sheen?: Sheen | "Unknown";
  coats?: number;
  completedAt?: string;
  actualHours?: number;
  actualGallons?: number;
  photoCount?: number;
  tintFormula?: string;
}

function numberOk(v: number | undefined) {
  return v === undefined || (Number.isFinite(v) && v >= 0);
}

/** Save a closeout row. With `confirm`, the crew lead confirms it and every required fact is checked. */
export function saveCloseoutRow(db: Database, actor: User, jobId: string, draft: CloseoutRowDraft, confirm: boolean) {
  if (!can(actor, "property.confirmApplications")) return denied(db, actor, MODULE, "confirm applications at closeout", whoCan("property.confirmApplications"));
  const job = byId(db.jobs, jobId);
  if (!job) return fail("Job not found.");
  if (job.status === "completed") return fail("This job is closed. Use a correction on the property record instead.");
  if (!job.surfaceIds.includes(draft.surfaceId)) return fail("That surface is not in this job's approved scope.");
  if (!numberOk(draft.actualHours)) return fail("Hours must be zero or more, or left blank.", "actualHours");
  if (!numberOk(draft.actualGallons)) return fail("Gallons must be zero or more, or left blank.", "actualGallons");
  if (!numberOk(draft.photoCount)) return fail("Photograph count must be zero or more.", "photoCount");
  if (!draft.painted && !draft.notPaintedReason?.trim()) return fail("Say why this surface was not painted.", "notPaintedReason");
  if (draft.completedAt && draft.completedAt > now()) return fail("The completion date can't be in the future.", "completedAt");

  const current = closeoutRowsFor(db, job).find((r) => r.surfaceId === draft.surfaceId)!;
  const merged: CloseoutRow = { ...current, ...draft, unknowns: current.unknowns };
  // A value typed over an approved Unknown replaces the exception.
  if (merged.sheen && merged.sheen !== "Unknown") merged.unknowns = merged.unknowns.filter((u) => u.field !== "sheen");
  if (merged.completedAt) merged.unknowns = merged.unknowns.filter((u) => u.field !== "completedAt");
  if (merged.colourName && merged.colourName !== "Unknown") merged.unknowns = merged.unknowns.filter((u) => u.field !== "colour");
  if (merged.sheen === "Unknown" && !merged.unknowns.some((u) => u.field === "sheen")) {
    return fail("Unknown sheen needs the Business Owner's approval. Use Record Unknown.", "sheen");
  }

  if (confirm) {
    const gaps = closeoutRowGaps(merged);
    if (gaps.length) {
      const first = gaps[0];
      return fail(`Can't confirm ${surfaceLabel(db, draft.surfaceId)}: ${gaps.map((g) => CLOSEOUT_FIELD_LABEL[g]).join(", ")} required.`, first);
    }
    merged.confirmedBy = actor.id;
    merged.confirmedAt = now();
  } else {
    merged.confirmedBy = undefined;
    merged.confirmedAt = undefined;
  }
  merged.savedBy = actor.id;
  merged.savedAt = now();

  const c = closeoutFor(db, jobId);
  c.rows = [...c.rows.filter((r) => r.surfaceId !== draft.surfaceId), merged];
  log(
    db,
    actor,
    MODULE,
    confirm
      ? `Closeout: Job ${jobId} – ${surfaceLabel(db, draft.surfaceId)} ${merged.painted ? `confirmed as ${merged.colourName} ${merged.colourNumber}, ${merged.sheen ?? "—"}, ${merged.coats ?? "—"} coats, completed ${dateLong(merged.completedAt)}` : `confirmed not painted (${merged.notPaintedReason})`} by ${actor.name}`
      : `Closeout: Job ${jobId} – ${surfaceLabel(db, draft.surfaceId)} saved (not yet confirmed) by ${actor.name}`,
  );
  return ok();
}

/**
 * Log Material Usage during production (patent 20): adds gallons used on a
 * surface to its closeout actuals. Unlike saveCloseoutRow it leaves the
 * crew lead's confirmation in place, so usage can be logged day by day.
 */
export function logMaterialUsage(db: Database, actor: User, jobId: string, entry: { surfaceId: string; gallons: number; date: string; note?: string }) {
  if (!can(actor, "property.confirmApplications")) return denied(db, actor, MODULE, "log material usage", whoCan("property.confirmApplications"));
  const job = byId(db.jobs, jobId);
  if (!job) return fail("Job not found.");
  if (job.status === "completed") return fail("This job is closed. Use a correction on the property record instead.");
  if (!job.surfaceIds.includes(entry.surfaceId)) return fail("Choose a surface in this job's approved scope.", "surfaceId");
  if (!Number.isFinite(entry.gallons) || entry.gallons <= 0) return fail("Enter the gallons used (more than zero).", "gallons");
  if (!entry.date) return fail("Choose the date the material was used.", "date");
  if (entry.date > now()) return fail("The usage date can't be in the future.", "date");

  const current = closeoutRowsFor(db, job).find((r) => r.surfaceId === entry.surfaceId)!;
  const total = Math.round(((current.actualGallons ?? 0) + entry.gallons) * 100) / 100;
  const c = closeoutFor(db, jobId);
  c.rows = [...c.rows.filter((r) => r.surfaceId !== entry.surfaceId), { ...current, actualGallons: total, savedBy: actor.id, savedAt: now() }];
  log(
    db,
    actor,
    MODULE,
    `Material usage: Job ${jobId} – ${surfaceLabel(db, entry.surfaceId)} ${entry.gallons} gal on ${dateLong(entry.date)} (total ${total} gal) by ${actor.name}${entry.note?.trim() ? `. Note: ${entry.note.trim()}` : ""}`,
  );
  return ok(total);
}

/** Confirm All Matching: confirms every unconfirmed row that still matches its approved spec. */
export function confirmAllMatching(db: Database, actor: User, jobId: string, completedAt: string) {
  if (!can(actor, "property.confirmApplications")) return denied(db, actor, MODULE, "confirm applications at closeout", whoCan("property.confirmApplications"));
  const job = byId(db.jobs, jobId);
  if (!job) return fail("Job not found.");
  if (job.status === "completed") return fail("This job is closed.");
  if (!completedAt) return fail("Choose the surface completion date to apply.", "completedAt");
  if (completedAt > now()) return fail("The completion date can't be in the future.", "completedAt");
  const rows = closeoutRowsFor(db, job);
  const targets = rows.filter((r) => {
    if (r.confirmedBy || !r.painted) return false;
    const spec = byId(db.specs, r.specId);
    const colour = spec && byId(db.colours, spec.colourId);
    return !!spec && !!colour && r.sheen === spec.sheen && r.coats === spec.coats && r.colourNumber === colour.number && r.product === spec.product;
  });
  if (!targets.length) return fail("No unconfirmed surfaces still match their approved specification. Confirm the others one by one.");
  const c = closeoutFor(db, jobId);
  for (const r of targets) {
    const row: CloseoutRow = { ...r, completedAt: r.completedAt ?? completedAt, confirmedBy: actor.id, confirmedAt: now(), savedBy: actor.id, savedAt: now() };
    c.rows = [...c.rows.filter((x) => x.surfaceId !== r.surfaceId), row];
  }
  log(db, actor, MODULE, `Closeout: Job ${jobId} – ${targets.length} surface${targets.length === 1 ? "" : "s"} confirmed as matching the approved specification by ${actor.name}: ${targets.map((t) => surfaceLabel(db, t.surfaceId)).join(", ")}`);
  return ok(targets.length);
}

/** Record Unknown: Business Owner only, legacy or subcontractor work only. */
export function recordUnknown(db: Database, actor: User, jobId: string, surfaceId: string, field: UnknownException["field"], kind: UnknownException["kind"], reason: string) {
  const job = byId(db.jobs, jobId);
  if (!job) return fail("Job not found.");
  if (!can(actor, "property.approveUnknown")) return denied(db, actor, MODULE, `approve an Unknown ${CLOSEOUT_FIELD_LABEL[field]}`, whoCan("property.approveUnknown"));
  if (!["legacy", "subcontractor"].includes(kind)) return fail("Unknown is allowed only for legacy or subcontractor work.", "kind");
  if (!reason.trim()) return fail("Give the reason the value is unknown.", "reason");
  if (job.status === "completed") return fail("This job is closed.");
  const row = closeoutRowsFor(db, job).find((r) => r.surfaceId === surfaceId);
  if (!row) return fail("Surface not in scope.");
  const exception: UnknownException = { field, kind, approvedBy: actor.id, reason: reason.trim(), at: now() };
  const next: CloseoutRow = { ...row, unknowns: [...row.unknowns.filter((u) => u.field !== field), exception], confirmedBy: undefined, confirmedAt: undefined };
  if (field === "sheen") next.sheen = "Unknown";
  if (field === "completedAt") next.completedAt = undefined;
  if (field === "colour") {
    next.colourName = "Unknown";
    next.colourNumber = "Unknown";
  }
  const c = closeoutFor(db, jobId);
  c.rows = [...c.rows.filter((r) => r.surfaceId !== surfaceId), next];
  const fieldLabel = { colour: "colour", sheen: "sheen", completedAt: "completion date" }[field];
  log(db, actor, MODULE, `Property ${job.propertyId} – Surface ${surfaceId} recorded with Unknown ${fieldLabel} for ${kind === "legacy" ? "Legacy" : "Subcontractor"} work, approved by ${actor.name}. Reason: ${exception.reason}`);
  return ok();
}

/** Close job: office manager or owner. Writes the applications into the property record. */
export function closeJob(db: Database, actor: User, jobId: string, customerAcceptedAt?: string) {
  if (!can(actor, "property.closeJob")) return denied(db, actor, MODULE, "close a job", whoCan("property.closeJob"));
  const job = byId(db.jobs, jobId);
  if (!job) return fail("Job not found.");
  if (job.status === "completed") return fail("This job is already closed.");
  const workOrder = db.workOrders.find((w) => w.jobId === jobId);
  if (workOrder && workOrder.status !== "IN_PROGRESS") return fail("Mark Complete is available once the work order is In Progress.");
  const rows = closeoutRowsFor(db, job);
  const blockers = closeoutBlockers(job.surfaceIds, rows);
  if (blockers.length) {
    const list = blockers.map((b) => `${surfaceLabel(db, b.surfaceId)} (missing ${b.missing.join(", ")})`).join("; ");
    log(db, actor, MODULE, `Blocked: Job ${jobId} closeout attempted by ${actor.name} with incomplete surfaces: ${list}`, true);
    return fail(`Closeout blocked. Incomplete: ${list}.`);
  }
  if (customerAcceptedAt && customerAcceptedAt > now()) return fail("The customer acceptance date can't be in the future.", "customerAcceptedAt");

  const t = now();
  const created: Application[] = [];
  for (const r of rows.filter((x) => x.painted)) {
    const spec = byId(db.specs, r.specId);
    const catalog = db.catalog.find((c) => c.product === r.product);
    const app: Application = {
      id: uniqueId(db, "app", "APP-", (id) => db.applications.some((a) => a.id === id)),
      propertyId: job.propertyId,
      surfaceId: r.surfaceId,
      jobId,
      manufacturer: r.manufacturer,
      colourName: r.colourName,
      colourNumber: r.colourNumber,
      hex: r.hex,
      product: r.product,
      sheen: (r.sheen ?? "Unknown") as Sheen | "Unknown",
      coats: r.coats ?? 0,
      completedAt: r.completedAt,
      confirmedBy: r.confirmedBy,
      verification: "confirmed",
      productTier: catalog?.tier,
      productLine: catalog?.productLine ?? spec?.productLine,
      // Feature 3: the card's expected life drives the repaint date (feature 27).
      lifespanYears: spec?.lifespanYears,
      specId: spec?.id,
      actualHours: r.actualHours,
      actualGallons: r.actualGallons,
      tintFormula: r.tintFormula || undefined,
      photoCount: r.photoCount ?? 0,
      touchUps: [],
      unknowns: r.unknowns.length ? r.unknowns : undefined,
      customerAcceptedAt: customerAcceptedAt || undefined,
    };
    db.applications.push(app);
    created.push(app);
    if (spec && !spec.referencedBy.includes("history")) spec.referencedBy.push("history");
  }
  job.status = "completed";
  job.closedAt = t;
  job.closedBy = actor.id;
  // Live "Mark Complete": the work order becomes COMPLETED when the job closes.
  const wo = db.workOrders.find((w) => w.jobId === jobId);
  if (wo && wo.status !== "COMPLETED") {
    wo.statusHistory.push({ id: nextId(db, "wsh", "WSH-"), from: wo.status, to: "COMPLETED", by: actor.id, at: t, notes: "Closeout confirmed and job closed." });
    wo.status = "COMPLETED";
    wo.completedAt = t;
  }
  const c = closeoutFor(db, jobId);
  c.customerAcceptedAt = customerAcceptedAt || undefined;
  const crew = Array.from(new Set(rows.map((r) => r.confirmedBy).filter(Boolean))).map((id) => userName(db, id)).join(", ");
  log(db, actor, MODULE, `Property ${job.propertyId} – Job ${jobId} applications confirmed by crew lead ${crew || userName(db, job.crewLeadId)}; job closed by ${actor.name} at ${dateTime(t)}`);
  return ok(created.map((a) => a.id));
}

/* ================================================================== */
/* Corrections and notices (component 25.3)                            */
/* ================================================================== */

export interface CorrectionInput {
  field: CorrectionField;
  reason: string;
  colour?: { manufacturer: string; name: string; number: string; hex: string };
  text?: string; // product, sheen
  coats?: number;
  date?: string;
  surfaceId?: string; // location
  photoCount?: number;
}

export function correctApplication(db: Database, actor: User, applicationId: string, input: CorrectionInput) {
  if (!can(actor, "property.correct")) return denied(db, actor, MODULE, "correct the property record", whoCan("property.correct"));
  const app = byId(db.applications, applicationId);
  if (!app) return fail("Application not found.");
  if (!input.reason.trim()) return fail("A reason is required on every correction.", "reason");
  let oldValue = "";
  let newValue = "";
  switch (input.field) {
    case "Colour": {
      const c = input.colour;
      if (!c || !c.name.trim() || !c.number.trim() || !c.manufacturer.trim()) return fail("Enter the manufacturer, color name and number.", "colour");
      oldValue = `${app.manufacturer} ${app.colourName} ${app.colourNumber}`;
      newValue = `${c.manufacturer.trim()} ${c.name.trim()} ${c.number.trim()}`;
      if (oldValue === newValue) return fail("The new value is the same as the current one.", "colour");
      Object.assign(app, { manufacturer: c.manufacturer.trim(), colourName: c.name.trim(), colourNumber: c.number.trim(), hex: c.hex || app.hex });
      break;
    }
    case "Product":
    case "Sheen": {
      const v = input.text?.trim();
      if (!v) return fail(`Enter the corrected ${input.field.toLowerCase()}.`, "text");
      oldValue = input.field === "Product" ? app.product : app.sheen;
      newValue = v;
      if (oldValue === newValue) return fail("The new value is the same as the current one.", "text");
      if (input.field === "Product") app.product = v;
      else app.sheen = v as Sheen;
      if (input.field === "Sheen" && app.unknowns) app.unknowns = app.unknowns.filter((u) => u.field !== "sheen");
      break;
    }
    case "Coats": {
      if (!input.coats || input.coats < 1 || !Number.isInteger(input.coats)) return fail("Coats must be a whole number of one or more.", "coats");
      oldValue = String(app.coats);
      newValue = String(input.coats);
      if (oldValue === newValue) return fail("The new value is the same as the current one.", "coats");
      app.coats = input.coats;
      break;
    }
    case "Location": {
      const s = byId(db.surfaces, input.surfaceId);
      if (!s || s.propertyId !== app.propertyId) return fail("Choose a surface at this property.", "surfaceId");
      if (s.id === app.surfaceId) return fail("The new value is the same as the current one.", "surfaceId");
      oldValue = surfaceLabel(db, app.surfaceId);
      newValue = surfaceLabel(db, s.id);
      app.surfaceId = s.id;
      break;
    }
    case "Completion date": {
      if (!input.date) return fail("Choose the corrected date.", "date");
      if (input.date > now()) return fail("The completion date can't be in the future.", "date");
      oldValue = app.completedAt ? dateLong(app.completedAt) : "Not recorded";
      newValue = dateLong(input.date);
      if (oldValue === newValue) return fail("The new value is the same as the current one.", "date");
      app.completedAt = input.date;
      if (app.unknowns) app.unknowns = app.unknowns.filter((u) => u.field !== "completedAt");
      break;
    }
    case "Photographs": {
      if (input.photoCount === undefined || input.photoCount < 0 || !Number.isInteger(input.photoCount)) return fail("Enter the corrected photograph count.", "photoCount");
      oldValue = `${app.photoCount} photos`;
      newValue = `${input.photoCount} photos`;
      if (oldValue === newValue) return fail("The new value is the same as the current one.", "photoCount");
      app.photoCount = input.photoCount;
      break;
    }
  }
  const t = now();
  const noticeRequired = correctionNeedsNotice(input.field);
  db.corrections.unshift({
    id: uniqueId(db, "corr", "COR-", (id) => db.corrections.some((c) => c.id === id)),
    applicationId,
    field: input.field,
    oldValue,
    newValue,
    by: actor.id,
    at: t,
    reason: input.reason.trim(),
    noticeSent: false,
    noticeRequired,
    approvedBy: actor.id,
  });
  log(db, actor, MODULE, `Property ${app.propertyId} – Application ${app.id} ${input.field} changed from "${oldValue}" to "${newValue}" by ${actor.name} on ${dateLong(t)}. Reason: ${input.reason.trim()}. Approved by: ${actor.name}`);
  return ok({ noticeRequired });
}

/** Rule 4: a person presses send on the shared-record correction notice. */
export function sendCorrectionNotice(db: Database, actor: User, correctionId: string) {
  if (!can(actor, "property.correct")) return denied(db, actor, MODULE, "send a correction notice", whoCan("property.correct"));
  const cor = byId(db.corrections, correctionId);
  if (!cor) return fail("Correction not found.");
  if (!cor.noticeRequired) return fail("This correction does not need a customer notice (date and photograph changes never do).");
  if (cor.noticeSent) return fail("The notice has already been sent.");
  const app = byId(db.applications, cor.applicationId);
  const property = byId(db.properties, app?.propertyId);
  if (!app || !property) return fail("Record not found.");
  const owner = byId(db.customers, currentOwnership(property)?.customerId);
  if (!owner || owner.personalDataDeleted) return fail("There is no current owner on file to notify.");
  if (!owner.contactVerified) return fail(`${owner.name}'s contact details are not verified. Verify them on the QR Links tab before sending.`);
  cor.noticeSent = true;
  cor.noticeSentAt = now();
  cor.noticeSentBy = actor.id;
  log(db, actor, MODULE, `Property ${property.id} – Shared-record correction notice sent to ${owner.name} by ${actor.name} for change to ${cor.field}`);
  return ok(owner.name);
}

/* ================================================================== */
/* Structure: surfaces, address (component 25.1)                       */
/* ================================================================== */

export function markSurfaceRemoved(db: Database, actor: User, surfaceId: string, date: string, reason: string) {
  if (!can(actor, "property.editStructure")) return denied(db, actor, MODULE, "mark a surface removed", whoCan("property.editStructure"));
  const s = byId(db.surfaces, surfaceId);
  if (!s) return fail("Surface not found.");
  if (s.removedAt) return fail("This surface is already marked Removed.");
  if (!date) return fail("Choose the removal date.", "date");
  if (date > now()) return fail("The removal date can't be in the future.", "date");
  if (!reason.trim()) return fail("Give the reason, for example \"demolished\" or \"siding replaced\".", "reason");
  s.removedAt = date;
  s.removedReason = reason.trim();
  s.removedBy = actor.id;
  log(db, actor, MODULE, `Property ${s.propertyId} – Surface ${s.id} marked Removed on ${dateLong(date)} by ${actor.name}. Reason: ${reason.trim()}`);
  return ok();
}

export interface SurfaceDraft {
  areaId: string;
  name: string;
  type: SurfaceType;
  areaSqft: number;
  replacesSurfaceId?: string;
}

export function addSurface(db: Database, actor: User, propertyId: string, draft: SurfaceDraft) {
  if (!can(actor, "property.editStructure")) return denied(db, actor, MODULE, "add a surface", whoCan("property.editStructure"));
  const area = byId(db.areas, draft.areaId);
  if (!area || area.propertyId !== propertyId) return fail("Choose a room or elevation at this property.", "areaId");
  if (!draft.name.trim()) return fail("Surface name is required.", "name");
  if (!Number.isFinite(draft.areaSqft) || draft.areaSqft <= 0) return fail("Area must be more than zero square feet.", "areaSqft");
  const replaced = draft.replacesSurfaceId ? byId(db.surfaces, draft.replacesSurfaceId) : undefined;
  if (draft.replacesSurfaceId && (!replaced || replaced.propertyId !== propertyId)) return fail("Choose a surface at this property to replace.", "replacesSurfaceId");
  const surface: Surface = {
    id: uniqueId(db, "surface", `SF-${propertyId.replace(/\D/g, "").slice(-1)}9`, (id) => db.surfaces.some((s) => s.id === id)),
    propertyId,
    areaId: area.id,
    name: draft.name.trim(),
    type: draft.type,
    areaSqft: draft.areaSqft,
    condition: "sound",
    replacesSurfaceId: replaced?.id,
  };
  db.surfaces.push(surface);
  if (replaced && !replaced.removedAt) {
    replaced.removedAt = now();
    replaced.removedReason = `Replaced by ${surface.id} (${surface.name})`;
    replaced.removedBy = actor.id;
    log(db, actor, MODULE, `Property ${propertyId} – Surface ${replaced.id} marked Removed on ${dateLong(now())} by ${actor.name}. Reason: Replaced by ${surface.id}`);
  }
  log(db, actor, MODULE, `Property ${propertyId} – Surface ${surface.id} "${surface.name}" added under ${area.name} by ${actor.name}${replaced ? `, replacing ${replaced.id}. Earlier applications stay on ${replaced.id}` : ""}`);
  return ok(surface.id);
}

export function correctAddress(db: Database, actor: User, propertyId: string, address: string) {
  if (!can(actor, "property.editStructure")) return denied(db, actor, MODULE, "correct a property address", whoCan("property.editStructure"));
  const p = byId(db.properties, propertyId);
  if (!p) return fail("Property not found.");
  const next = address.trim();
  if (!next) return fail("Address is required.", "address");
  if (next === p.address) return fail("The address is unchanged.", "address");
  (p.addressHistory ??= []).push({ address: p.address, changedAt: now(), changedBy: actor.id });
  const before = p.address;
  p.address = next;
  const jobs = db.jobs.filter((j) => j.propertyId === p.id).length;
  log(db, actor, MODULE, `Property ${p.id} – Address corrected from "${before}" to "${next}" by ${actor.name}. Stable identifier unchanged; ${jobs} job${jobs === 1 ? "" : "s"} remain attached. No merge performed.`);
  return ok();
}

/* ================================================================== */
/* Touch-ups and customer-reported work                                */
/* ================================================================== */

export function logTouchUp(db: Database, actor: User, applicationId: string, date: string, note: string) {
  if (!can(actor, "property.logReportedWork")) return denied(db, actor, MODULE, "log a touch-up", whoCan("property.logReportedWork"));
  const app = byId(db.applications, applicationId);
  if (!app) return fail("Application not found.");
  if (!date) return fail("Choose the touch-up date.", "date");
  if (date > now()) return fail("The touch-up date can't be in the future.", "date");
  if (!note.trim()) return fail("Describe the touch-up.", "note");
  app.touchUps.push({ date, note: note.trim(), by: actor.id });
  log(db, actor, MODULE, `Property ${app.propertyId} – Touch-up logged against Application ${app.id} (${surfaceLabel(db, app.surfaceId)}) by ${actor.name}. No new application created.`);
  return ok();
}

export interface ReportedWorkDraft {
  surfaceId: string;
  manufacturer: string;
  colourName: string;
  colourNumber: string;
  hex: string;
  product: string;
  sheen: Sheen | "Unknown";
  coats: number;
  completedAt?: string;
  source: string;
}

export function logReportedWork(db: Database, actor: User, propertyId: string, d: ReportedWorkDraft) {
  if (!can(actor, "property.logReportedWork")) return denied(db, actor, MODULE, "record customer-reported work", whoCan("property.logReportedWork"));
  const s = byId(db.surfaces, d.surfaceId);
  if (!s || s.propertyId !== propertyId) return fail("Choose a surface at this property.", "surfaceId");
  if (!d.source.trim()) return fail("Record the source, for example \"Homeowner phone call, 12 May\".", "source");
  if (!d.colourName.trim()) return fail("Color name is required. Use \"Unknown\" if the customer doesn't know.", "colourName");
  if (!d.coats || d.coats < 1 || !Number.isInteger(d.coats)) return fail("Coats must be a whole number of one or more.", "coats");
  if (d.completedAt && d.completedAt > now()) return fail("The date can't be in the future.", "completedAt");
  const app: Application = {
    id: uniqueId(db, "app", "APP-", (id) => db.applications.some((a) => a.id === id)),
    propertyId,
    surfaceId: s.id,
    manufacturer: d.manufacturer.trim() || "Unknown",
    colourName: d.colourName.trim(),
    colourNumber: d.colourNumber.trim() || "—",
    hex: d.hex || "#CBD5E1",
    product: d.product.trim() || "Unknown",
    sheen: d.sheen,
    coats: d.coats,
    completedAt: d.completedAt || undefined,
    verification: "unverified",
    source: d.source.trim(),
    photoCount: 0,
    touchUps: [],
    recordedAt: now(),
    recordedBy: actor.id,
  };
  db.applications.push(app);
  log(db, actor, MODULE, `Property ${propertyId} – Customer-reported work recorded Unverified. Source: ${app.source}, recorded by ${actor.name}`);
  return ok(app.id);
}

/* ================================================================== */
/* Ownership, consent and deletion (component 25.4)                    */
/* ================================================================== */

export interface OwnershipChangeInput {
  saleDate: string;
  buyerCustomerId?: string;
  buyer?: { name: string; email: string; phone: string };
}

/**
 * Sale: revoke the old link first, issue the former owner a permanent PDF,
 * start the buyer's ownership period, then issue the buyer a new link.
 */
export function recordOwnershipChange(db: Database, actor: User, propertyId: string, input: OwnershipChangeInput) {
  if (!can(actor, "property.ownershipChange")) return denied(db, actor, MODULE, "record an ownership change", whoCan("property.ownershipChange"));
  const p = byId(db.properties, propertyId);
  if (!p) return fail("Property not found.");
  const old = currentOwnership(p);
  if (!input.saleDate) return fail("Choose the sale date.", "saleDate");
  if (input.saleDate > now()) return fail("The sale date can't be in the future.", "saleDate");
  if (old && input.saleDate <= old.start) return fail("The sale date must be after the current owner's start date.", "saleDate");
  let buyer: Customer | undefined;
  if (input.buyerCustomerId) {
    buyer = byId(db.customers, input.buyerCustomerId);
    if (!buyer) return fail("Choose the buyer.", "buyer");
    if (buyer.id === old?.customerId) return fail("The buyer is already the current owner.", "buyer");
  } else {
    const b = input.buyer;
    if (!b?.name.trim()) return fail("Enter the buyer's name.", "buyerName");
    if (b.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email.trim())) return fail("That email address doesn't look right.", "buyerEmail");
  }

  // 1. Revoke the old link before anything new is issued.
  const oldLink = old && activeLinkFor(db, p.id, old.id);
  if (oldLink) revokeLinkInternal(db, actor, oldLink, "Sale");
  // 2. Former-owner permanent PDF (a fixed copy; no live updates).
  const former = byId(db.customers, old?.customerId);
  if (old) {
    old.end = input.saleDate;
    const recipient = former?.email ?? former?.name ?? "former owner";
    old.formerOwnerPdf = { issuedAt: now(), issuedBy: actor.id, recipient };
    log(db, actor, "QR Record", `QR Link: Property ${p.id} – Former-owner PDF issued to ${former?.name ?? "former owner"} by ${actor.name}`);
  }
  // 3. Buyer's ownership period.
  if (!buyer) {
    const b = input.buyer!;
    buyer = {
      id: uniqueId(db, "customer", "C-", (id) => db.customers.some((c) => c.id === id)),
      name: b.name.trim(),
      email: b.email.trim() || undefined,
      phone: b.phone.trim() || undefined,
      contactVerified: false,
      preferredChannel: b.email.trim() ? "email" : "phone",
      consentSigned: false,
      authorisedSigners: [],
    };
    db.customers.push(buyer);
  }
  const period = { id: `OWN-${p.id.replace(/\D/g, "")}-${p.ownership.length + 1}`, customerId: buyer.id, start: input.saleDate, predecessorConsent: "not_requested" as const };
  p.ownership.push(period);
  // 4. New link for the buyer.
  const link = generateLinkInternal(db, actor, p.id, period.id);
  log(db, actor, MODULE, `Property ${p.id} – Ownership changed on ${dateLong(input.saleDate)}. Old link revoked, former-owner PDF issued, new link issued by ${actor.name}`);
  return ok({ ref: link.ref, buyer: buyer.name, revoked: oldLink?.ref });
}

function periodOf(db: Database, propertyId: string, periodId: string) {
  const p = byId(db.properties, propertyId);
  const period = p?.ownership.find((o) => o.id === periodId);
  return { p, period };
}

export function recordConsent(db: Database, actor: User, propertyId: string, periodId: string, decision: "granted" | "refused", rec: { at: string; channel: string; spokeTo: string }) {
  if (!can(actor, "property.recordConsent")) return denied(db, actor, MODULE, "record seller consent", whoCan("property.recordConsent"));
  const { p, period } = periodOf(db, propertyId, periodId);
  if (!p || !period) return fail("Ownership period not found.");
  if (p.ownership[0].id === periodId) return fail("The first recorded owner has no predecessor.");
  if (!rec.at) return fail("Choose the date of the seller's written answer.", "at");
  if (rec.at > now()) return fail("The date can't be in the future.", "at");
  if (!rec.channel.trim()) return fail("Record the channel, for example \"Signed letter\" or \"Email\".", "channel");
  if (!rec.spokeTo.trim()) return fail("Record who the office spoke to.", "spokeTo");
  period.consentRecord = { decision, at: rec.at, channel: rec.channel.trim(), spokeTo: rec.spokeTo.trim(), recordedBy: actor.id };
  period.predecessorConsent = decision;
  log(db, actor, MODULE, `Property ${p.id} – Seller ${decision === "granted" ? "Consent" : "Refusal"} recorded by ${actor.name} on ${dateLong(rec.at)} via ${rec.channel.trim()}. Spoke to: ${rec.spokeTo.trim()}`);
  return ok();
}

export function logConsentAttempt(db: Database, actor: User, propertyId: string, periodId: string, attempt: { at: string; channel: "phone" | "email" | "letter" | "text"; note: string }) {
  if (!can(actor, "property.recordConsent")) return denied(db, actor, MODULE, "log a seller contact attempt", whoCan("property.recordConsent"));
  const { p, period } = periodOf(db, propertyId, periodId);
  if (!p || !period) return fail("Ownership period not found.");
  if (period.consentRecord) return fail("The seller has already answered. No further attempts are needed.");
  if (!attempt.at) return fail("Choose the date of the attempt.", "at");
  if (attempt.at > now()) return fail("The date can't be in the future.", "at");
  if (!attempt.note.trim()) return fail("Describe the attempt and its result.", "note");
  (period.consentAttempts ??= []).push({
    id: uniqueId(db, "cattempt", "CAT-", (id) => db.properties.some((x) => x.ownership.some((o) => o.consentAttempts?.some((a) => a.id === id)))),
    at: attempt.at,
    channel: attempt.channel,
    note: attempt.note.trim(),
    by: actor.id,
  });
  log(db, actor, MODULE, `Property ${p.id} – Seller contact attempt ${period.consentAttempts.length} logged via ${attempt.channel} by ${actor.name}`);
  return ok();
}

export function requestUnreachable(db: Database, actor: User, propertyId: string, periodId: string) {
  if (!can(actor, "property.recordConsent")) return denied(db, actor, MODULE, "request an unreachable determination", whoCan("property.recordConsent"));
  const { p, period } = periodOf(db, propertyId, periodId);
  if (!p || !period) return fail("Ownership period not found.");
  if (period.consentRecord) return fail(`The seller has ${period.consentRecord.decision === "refused" ? "refused" : "consented"}. A reachable seller can't be declared unreachable.`);
  const check = unreachableCheck(period.consentAttempts ?? []);
  if (!check.ok) return fail(`Not yet unreachable: ${check.problems.join(", ")}. Unreachable means three documented attempts over 14 days across at least two channels.`);
  period.unreachableRequestedAt = now();
  log(db, actor, MODULE, `Property ${p.id} – Unreachable determination requested by ${actor.name} after ${check.attempts} attempts over ${check.days} days. Waiting on Business Owner approval`);
  return ok();
}

export function approveUnreachable(db: Database, actor: User, propertyId: string, periodId: string) {
  if (!can(actor, "property.approveUnreachable")) return denied(db, actor, MODULE, "approve an unreachable determination", whoCan("property.approveUnreachable"));
  const { p, period } = periodOf(db, propertyId, periodId);
  if (!p || !period) return fail("Ownership period not found.");
  if (!period.unreachableRequestedAt) return fail("The office manager has not requested this determination yet.");
  const check = unreachableCheck(period.consentAttempts ?? []);
  if (!check.ok) return fail(`Blocked: ${check.problems.join(", ")}.`);
  period.unreachableApprovedBy = actor.id;
  period.unreachableApprovedAt = now();
  period.predecessorConsent = "unreachable_spec_only";
  log(db, actor, MODULE, `Property ${p.id} – Seller declared unreachable after ${check.attempts} attempts over ${check.days} days across ${check.channels.join(", ")}. Approved by ${actor.name}`);
  return ok();
}

/** Removes names, contacts and identifying photographs; keeps the paint specification at the address. */
export function deletePersonalData(db: Database, actor: User, propertyId: string, customerId: string) {
  if (!can(actor, "property.deletePersonalData")) return denied(db, actor, MODULE, "delete personal data", whoCan("property.deletePersonalData"));
  const p = byId(db.properties, propertyId);
  const c = byId(db.customers, customerId);
  if (!p || !c) return fail("Record not found.");
  if (!p.ownership.some((o) => o.customerId === customerId)) return fail("That person is not an owner of this property.");
  if (c.personalDataDeleted) return fail("Personal data for this person has already been deleted.");
  const oldName = c.name;
  const t = now();
  c.name = `Deleted person (${c.id})`;
  c.email = undefined;
  c.phone = undefined;
  c.contactVerified = false;
  c.authorisedSigners = [];
  c.personalDataDeleted = true;
  // Identifying photographs at the property.
  for (const ph of db.sharedPhotos ?? []) if (ph.propertyId === propertyId && ph.identifying && !ph.deletedAt) {
    ph.deletedAt = t;
    ph.selected = false;
  }
  // Names and contacts on touch-up requests and seller records.
  for (const r of db.touchUpRequests) if (r.propertyId === propertyId && r.requesterName === oldName) {
    r.requesterName = c.name;
    r.contact = "Deleted";
  }
  for (const o of p.ownership) {
    if (o.consentRecord?.spokeTo === oldName) o.consentRecord.spokeTo = c.name;
    if (o.formerOwnerPdf && o.customerId === customerId) o.formerOwnerPdf.recipient = c.name;
  }
  const purgeDue = purgeDueDate(t);
  (p.personalDataDeletions ??= []).push({ id: uniqueId(db, "pdd", "PDD-", () => false), subject: `customer ${c.id}`, customerId, by: actor.id, at: t, purgeDue });
  log(db, actor, MODULE, `Property ${p.id} – Personal data deleted for customer ${c.id} by ${actor.name} on ${dateLong(t)}. Backup purge due ${dateLong(purgeDue)}`);
  return ok();
}

/* ================================================================== */
/* Merge and unit renumber (individual owner approval)                 */
/* ================================================================== */

export function requestStructureChange(
  db: Database,
  actor: User,
  input: { kind: "merge" | "renumber"; propertyId: string; targetPropertyId?: string; oldUnit?: string; newUnit?: string; reason: string },
) {
  if (!can(actor, "property.editStructure")) return denied(db, actor, MODULE, "request a merge or unit renumber", whoCan("property.editStructure"));
  const p = byId(db.properties, input.propertyId);
  if (!p) return fail("Property not found.");
  if (!input.reason.trim()) return fail("Give the reason for the request.", "reason");
  if (input.kind === "merge") {
    const target = byId(db.properties, input.targetPropertyId);
    if (!target || target.id === p.id) return fail("Choose a different property to merge into.", "targetPropertyId");
    if (target.mergedInto || p.mergedInto) return fail("One of these properties has already been merged.");
  } else {
    const units = new Set(db.areas.filter((a) => a.propertyId === p.id && a.unit).map((a) => a.unit!));
    if (!input.oldUnit || !units.has(input.oldUnit)) return fail("Choose an existing unit.", "oldUnit");
    if (!input.newUnit?.trim() || input.newUnit.trim() === input.oldUnit) return fail("Enter the new unit label.", "newUnit");
  }
  const list = (db.propertyRequests ??= []);
  if (list.some((r) => r.status === "pending" && r.kind === input.kind && r.propertyId === p.id)) return fail("A request of this kind is already waiting for the owner.");
  const id = uniqueId(db, "psr", "PSR-", (x) => list.some((r) => r.id === x));
  list.unshift({
    id,
    kind: input.kind,
    propertyId: p.id,
    targetPropertyId: input.kind === "merge" ? input.targetPropertyId : undefined,
    oldUnit: input.kind === "renumber" ? input.oldUnit : undefined,
    newUnit: input.kind === "renumber" ? input.newUnit?.trim() : undefined,
    reason: input.reason.trim(),
    requestedBy: actor.id,
    requestedAt: now(),
    status: "pending",
  });
  log(db, actor, MODULE, `Property ${p.id} – ${input.kind === "merge" ? `Merge into ${input.targetPropertyId}` : `Unit ${input.oldUnit} renumber to ${input.newUnit}`} requested by ${actor.name}. Waiting on individual owner approval`);
  return ok(id);
}

/** One request at a time. There is no bulk approval. */
export function decideStructureRequest(db: Database, actor: User, requestId: string, approve: boolean) {
  const r = (db.propertyRequests ?? []).find((x) => x.id === requestId);
  if (!r) return fail("Request not found.");
  if (!can(actor, "property.approveStructure")) {
    return denied(db, actor, MODULE, `${approve ? "approve" : "reject"} ${r.kind === "merge" ? "a property merge" : "a unit renumber"}`, whoCan("property.approveStructure"));
  }
  if (r.status !== "pending") return fail("This request has already been decided.");
  const t = now();
  if (!approve) {
    r.status = "rejected";
    r.decidedBy = actor.id;
    r.decidedAt = t;
    log(db, actor, MODULE, `Property ${r.propertyId} – ${r.kind === "merge" ? "Merge" : "Unit renumber"} request ${r.id} rejected by ${actor.name}`);
    return ok();
  }
  if (r.kind === "merge") {
    const source = byId(db.properties, r.propertyId);
    const target = byId(db.properties, r.targetPropertyId);
    if (!source || !target) return fail("Property not found.");
    if (source.mergedInto || target.mergedInto) return fail("One of these properties has already been merged.");
    for (const list of [db.areas, db.surfaces, db.applications, db.jobs, db.estimates, db.qrLinks, db.touchUpRequests] as { propertyId?: string }[][]) {
      for (const x of list) if (x.propertyId === source.id) x.propertyId = target.id;
    }
    for (const ph of db.sharedPhotos ?? []) if (ph.propertyId === source.id) ph.propertyId = target.id;
    source.mergedInto = target.id;
    source.mergeCandidateOf = undefined;
    target.mergedFrom = Array.from(new Set([...(target.mergedFrom ?? []), source.id, ...(source.mergedFrom ?? [])]));
    log(db, actor, MODULE, `Property ${source.id} merged into ${target.id} by ${actor.name}. Approved individually by ${actor.name}. Originating identifiers preserved.`);
  } else {
    const areas = db.areas.filter((a) => a.propertyId === r.propertyId && a.unit === r.oldUnit);
    for (const a of areas) a.unit = r.newUnit;
    log(db, actor, MODULE, `Property ${r.propertyId} – Unit ${r.oldUnit} renumbered to ${r.newUnit} by ${userName(db, r.requestedBy)}. Approved by ${actor.name}`);
  }
  r.status = "approved";
  r.decidedBy = actor.id;
  r.decidedAt = t;
  return ok();
}
