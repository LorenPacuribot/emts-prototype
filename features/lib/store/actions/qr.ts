/**
 * Feature 26 — Customer QR Paint Record.
 *
 * Link generation, sending, printing, revocation and replacement; photo
 * sharing approvals; touch-up requests; and the two public actions the
 * customer page performs (record an open, submit a touch-up request).
 */
import type { Database, QrLink, TouchUpRequest, User } from "@/features/types";
import { can, ROLE_LABEL, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId, currentOwnership, propertyAddress, surfaceLabel } from "@/features/lib/selectors";
import { photoShareable, refIsSafe, touchUpRateLimited, verifyCaller, type CallerClaims } from "@/features/lib/rules/property";
import { denied, fail, log, nextNumber, ok, randomRef } from "../helpers";
import { dateLong, dateTime } from "@/features/lib/format";

const MODULE = "QR Record";

/** The customer page has no signed-in user. Its log entries use this actor. */
export const PUBLIC_ACTOR: User = { id: "PUBLIC", name: "Customer (QR link)", role: "estimator", email: "" };

/** Next free ID for a list, even if saved data and counters drift apart. */
export function uniqueId(db: Database, counter: string, prefix: string, taken: (id: string) => boolean): string {
  let id = `${prefix}${nextNumber(db, counter)}`;
  while (taken(id)) id = `${prefix}${nextNumber(db, counter)}`;
  return id;
}

export function activeLinkFor(db: Database, propertyId: string, periodId?: string): QrLink | undefined {
  return db.qrLinks.find((l) => l.propertyId === propertyId && !l.revokedAt && (!periodId || l.ownershipPeriodId === periodId));
}

/* ----------------------------- Internal steps ----------------------------- */

/** Revoke without permission checks. Callers check first. */
export function revokeLinkInternal(db: Database, actor: User, link: QrLink, reason: string) {
  const t = now();
  link.revokedAt = t;
  link.revokeReason = reason;
  log(db, actor, MODULE, `QR Link: Property ${link.propertyId} – Link ${link.ref} revoked by ${ROLE_LABEL[actor.role]} ${actor.name} at ${dateTime(t)}. Reason: ${reason}`);
}

/** Generate without permission checks. Refuses if the period already has an active link. */
export function generateLinkInternal(db: Database, actor: User, propertyId: string, periodId: string, extra: Partial<QrLink> = {}) {
  const property = byId(db.properties, propertyId)!;
  let ref = randomRef();
  while (db.qrLinks.some((l) => l.ref === ref) || !refIsSafe(ref, property.id, property.address)) ref = randomRef();
  const link: QrLink = {
    id: uniqueId(db, "qr", "QR-", (id) => db.qrLinks.some((l) => l.id === id)),
    ref,
    propertyId,
    ownershipPeriodId: periodId,
    createdAt: now(),
    createdBy: actor.id,
    openCount: 0,
    opens: [],
    ...extra,
  };
  db.qrLinks.push(link);
  log(db, actor, MODULE, `QR Link: Property ${propertyId} – Link ${ref} generated for ownership period ${periodId} by ${actor.name}`);
  return link;
}

/* ------------------------------- Links -------------------------------- */

export function generateLink(db: Database, actor: User, propertyId: string) {
  if (!can(actor, "qr.generate")) return denied(db, actor, MODULE, "generate a QR link", whoCan("qr.generate"));
  const property = byId(db.properties, propertyId);
  if (!property) return fail("Property not found.");
  if (property.mergedInto) return fail(`This property was merged into ${property.mergedInto}. Generate the link there.`);
  const period = currentOwnership(property);
  if (!period) return fail("Record the current owner before generating a link.");
  if (activeLinkFor(db, propertyId, period.id)) {
    return fail("This ownership period already has an active link. Active links are not rotated: a new one would break the printed card. Use Regenerate (Business Owner or Office Manager) if it must be replaced.");
  }
  const link = generateLinkInternal(db, actor, propertyId, period.id);
  return ok(link.ref);
}

export function regenerateLink(db: Database, actor: User, propertyId: string, reason: string) {
  if (!can(actor, "qr.revoke")) return denied(db, actor, MODULE, "regenerate a QR link", whoCan("qr.revoke"));
  if (!reason.trim()) return fail("Give a reason for regenerating the link.", "reason");
  const property = byId(db.properties, propertyId);
  if (!property) return fail("Property not found.");
  const period = currentOwnership(property);
  const current = activeLinkFor(db, propertyId, period.id);
  if (current) revokeLinkInternal(db, actor, current, `Other — ${reason.trim()}`);
  const link = generateLinkInternal(db, actor, propertyId, period.id);
  return ok(link.ref);
}

export function revokeLink(db: Database, actor: User, linkId: string, reason: "Sale" | "Other", note: string) {
  if (!can(actor, "qr.revoke")) return denied(db, actor, MODULE, "revoke a QR link", whoCan("qr.revoke"));
  const link = byId(db.qrLinks, linkId);
  if (!link) return fail("Link not found.");
  if (link.revokedAt) return fail("This link is already revoked.");
  if (reason === "Other" && !note.trim()) return fail("Describe the reason for revoking.", "note");
  revokeLinkInternal(db, actor, link, reason === "Sale" ? `Sale${note.trim() ? ` — ${note.trim()}` : ""}` : `Other — ${note.trim()}`);
  return ok();
}

/* ------------------------- Contact verification ------------------------ */

export function verifyContact(db: Database, actor: User, propertyId: string, customerId: string) {
  if (!can(actor, "qr.verifyContact")) return denied(db, actor, MODULE, "verify customer contact details", whoCan("qr.verifyContact"));
  const c = byId(db.customers, customerId);
  if (!c) return fail("Customer not found.");
  if (!c.email && !c.phone) return fail("There is no email or phone number on file to verify.");
  c.contactVerified = true;
  c.contactVerifiedAt = now();
  c.contactVerifiedBy = actor.id;
  log(db, actor, MODULE, `QR Link: Property ${propertyId} – Customer contact verified by ${actor.name} on ${dateLong(now())}`);
  return ok();
}

export function updateContact(db: Database, actor: User, propertyId: string, customerId: string, contact: { email: string; phone: string }) {
  if (!can(actor, "qr.generate")) return denied(db, actor, MODULE, "change customer contact details", whoCan("qr.generate"));
  const c = byId(db.customers, customerId);
  if (!c) return fail("Customer not found.");
  const email = contact.email.trim();
  const phone = contact.phone.trim();
  if (!email && !phone) return fail("Keep at least an email address or a phone number.", "email");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("That email address doesn't look right.", "email");
  const changed = (c.email ?? "") !== email || (c.phone ?? "") !== phone;
  if (!changed) return ok(false);
  c.email = email || undefined;
  c.phone = phone || undefined;
  c.contactVerified = false;
  c.contactVerifiedAt = undefined;
  c.contactVerifiedBy = undefined;
  log(db, actor, MODULE, `QR Link: Property ${propertyId} – Contact details changed; verification reset on ${dateLong(now())}`);
  return ok(true);
}

/* ------------------------------- Sending ------------------------------- */

export function sendLink(db: Database, actor: User, linkId: string, channel: "email" | "text") {
  if (!can(actor, "qr.generate")) return denied(db, actor, MODULE, "send a QR link", whoCan("qr.generate"));
  const link = byId(db.qrLinks, linkId);
  if (!link || link.revokedAt) return fail("Only an active link can be sent.");
  const property = byId(db.properties, link.propertyId)!;
  const period = property.ownership.find((o) => o.id === link.ownershipPeriodId);
  const customer = byId(db.customers, period?.customerId);
  if (!customer) return fail("No owner on file for this link's ownership period.");
  if (!customer.contactVerified) return fail("The office must verify this customer's email or phone before the link is sent.");
  const recipient = channel === "email" ? customer.email : customer.phone;
  if (!recipient) return fail(channel === "email" ? "No email address on file. Send by text, or hand over the printed card." : "No phone number on file. Send by email, or hand over the printed card.");
  link.lastSentAt = now();
  link.lastSentTo = recipient;
  link.lastSentChannel = channel;
  link.lastSentResult = "delivered";
  log(db, actor, MODULE, `QR Link: Property ${link.propertyId} – Link ${link.ref} sent to ${recipient} via ${channel === "email" ? "Email" : "Text"} by ${actor.name}. Result: Delivered`);
  return ok(recipient);
}

export function recordPrint(db: Database, actor: User, linkId: string, format: "BusinessCard" | "Sticker") {
  if (!can(actor, "qr.generate")) return denied(db, actor, MODULE, "print a QR card", whoCan("qr.generate"));
  const link = byId(db.qrLinks, linkId);
  if (!link || link.revokedAt) return fail("Only an active link can be printed.");
  log(db, actor, MODULE, `QR Link: Property ${link.propertyId} – ${format} printed by ${actor.name}`);
  return ok();
}

/* ----------------------- Replacement link (26.Q01) ---------------------- */

export function reissueAfterVerification(db: Database, actor: User, propertyId: string, claims: CallerClaims) {
  if (!can(actor, "qr.revoke")) return denied(db, actor, MODULE, "issue a replacement link", whoCan("qr.revoke"));
  const property = byId(db.properties, propertyId);
  if (!property) return fail("Property not found.");
  const period = currentOwnership(property);
  const owner = byId(db.customers, period.customerId);
  const apps = db.applications.filter((a) => a.propertyId === propertyId && (!a.completedAt || a.completedAt >= period.start));
  const facts = {
    ownerNames: owner && !owner.personalDataDeleted ? [owner.name] : [],
    jobYears: apps.filter((a) => a.completedAt).map((a) => new Date(a.completedAt!).getFullYear()),
    coloursAndRooms: [
      ...apps.flatMap((a) => [a.colourName, a.colourNumber]),
      ...db.areas.filter((a) => a.propertyId === propertyId).map((a) => a.name),
    ],
  };
  const result = verifyCaller(claims, facts);
  const evidence = [
    `address ${claims.addressMatches ? "confirmed" : "not confirmed"}`,
    claims.contractName ? `contract name "${claims.contractName}"` : "",
    claims.jobYear ? `job year "${claims.jobYear}"` : "",
    claims.colourOrRoom ? `colour/room "${claims.colourOrRoom}"` : "",
  ].filter(Boolean).join("; ");

  const current = activeLinkFor(db, propertyId, period.id);
  if (current) revokeLinkInternal(db, actor, current, "Other — replacement link requested by caller");
  const link = generateLinkInternal(db, actor, propertyId, period.id, {
    replacesLinkId: current?.id,
    verificationNotes: `${result.passed ? "Passed" : "Failed"}: ${evidence}. Matched: ${result.matched.join(", ") || "none"}.`,
  });

  let deliveredTo: string;
  if (result.passed) {
    deliveredTo = "the verified caller";
    log(db, actor, MODULE, `QR Link: Property ${propertyId} – Replacement link ${link.ref} issued by ${actor.name} after caller verification. Evidence: ${evidence}`);
  } else if (owner?.email) {
    deliveredTo = `${owner.email} (contact on file)`;
    link.lastSentAt = now();
    link.lastSentTo = owner.email;
    link.lastSentChannel = "email";
    link.lastSentResult = "delivered";
    log(db, actor, MODULE, `QR Link: Property ${propertyId} – Caller verification failed (${evidence}). Replacement link ${link.ref} sent to the contact on file, not the caller, by ${actor.name}`);
  } else {
    deliveredTo = `printed card and posted PDF to ${propertyAddress(property, true)}`;
    link.lastSentAt = now();
    link.lastSentTo = propertyAddress(property, true);
    link.lastSentChannel = "post";
    link.lastSentResult = "delivered";
    log(db, actor, MODULE, `QR Link: Property ${propertyId} – Caller verification failed (${evidence}). Replacement card and PDF posted to the address on file by ${actor.name}`);
  }
  return ok({ passed: result.passed, matched: result.matched, ref: link.ref, deliveredTo });
}

/* ------------------------------ Photographs ----------------------------- */

export function selectPhoto(db: Database, actor: User, photoId: string, selected: boolean) {
  if (!can(actor, "qr.selectPhotos")) return denied(db, actor, MODULE, "select photographs for sharing", whoCan("qr.selectPhotos"));
  const p = (db.sharedPhotos ?? []).find((x) => x.id === photoId);
  if (!p || p.deletedAt) return fail("Photograph not found.");
  p.selected = selected;
  log(db, actor, MODULE, `QR Link: Property ${p.propertyId} – Photograph ${p.id} ${selected ? "selected for" : "removed from"} sharing by ${actor.name}${selected && p.identifying && !photoShareable(p) ? ". Waiting on owner approval and signed release" : ""}`);
  return ok();
}

export function approvePhoto(db: Database, actor: User, photoId: string, releaseRef: string) {
  if (!can(actor, "qr.approvePhoto")) return denied(db, actor, MODULE, "approve an identifying photograph", whoCan("qr.approvePhoto"));
  const p = (db.sharedPhotos ?? []).find((x) => x.id === photoId);
  if (!p || p.deletedAt) return fail("Photograph not found.");
  if (!releaseRef.trim()) return fail("A job-linked signed release reference is required.", "releaseRef");
  p.ownerApprovedBy = actor.id;
  p.ownerApprovedAt = now();
  p.releaseRef = releaseRef.trim();
  log(db, actor, MODULE, `QR Link: Property ${p.propertyId} – Photograph ${p.id} approved for sharing by ${actor.name}. Release: ${p.releaseRef}`);
  return ok();
}

/* ------------------------------ Touch-ups ------------------------------- */

export function setTouchUpStatus(db: Database, actor: User, id: string, status: TouchUpRequest["status"]) {
  if (!can(actor, "qr.touchUps")) return denied(db, actor, MODULE, "update a touch-up request", whoCan("qr.touchUps"));
  const r = byId(db.touchUpRequests, id);
  if (!r) return fail("Request not found.");
  if (r.status === status) return ok();
  const before = r.status;
  r.status = status;
  log(db, actor, MODULE, `Touch-up Request: ${r.id} for Property ${r.propertyId} changed from ${before} to ${status} by ${actor.name}`);
  return ok();
}

/* --------------------------- Public page actions ------------------------ */

/** Count an open. Stores link reference, date and coarse device type only. */
export function recordOpen(db: Database, _actor: User, ref: string, device: "mobile" | "tablet" | "desktop") {
  const link = db.qrLinks.find((l) => l.ref === ref);
  if (!link || link.revokedAt) return ok();
  const t = now();
  link.openCount += 1;
  link.lastOpenAt = t;
  (link.opens ??= []).unshift({ at: t, device });
  return ok();
}

export interface TouchUpDraft {
  surfaceId?: string;
  colourLabel?: string;
  requesterName: string;
  phone: string;
  email: string;
  note: string;
}

export function submitTouchUp(db: Database, _actor: User, ref: string, draft: TouchUpDraft) {
  const link = db.qrLinks.find((l) => l.ref === ref);
  if (!link || link.revokedAt) return fail("This record link is no longer active.");
  if (!draft.requesterName.trim()) return fail("Please enter your name.", "name");
  if (!draft.phone.trim() && !draft.email.trim()) return fail("Please give a phone number or an email address.", "contact");
  const times = db.touchUpRequests.filter((r) => r.linkRef === ref).map((r) => r.createdAt);
  if (touchUpRateLimited(times, now())) return fail("You have already sent a request recently.", "rate");
  const contact = [draft.phone.trim(), draft.email.trim()].filter(Boolean).join(" · ");
  const req: TouchUpRequest = {
    id: uniqueId(db, "tu", "TU-", (id) => db.touchUpRequests.some((r) => r.id === id)),
    propertyId: link.propertyId,
    linkRef: ref,
    surfaceId: draft.surfaceId || undefined,
    colourLabel: draft.colourLabel || undefined,
    requesterName: draft.requesterName.trim(),
    contact,
    note: draft.note.trim(),
    createdAt: now(),
    status: "new",
  };
  db.touchUpRequests.unshift(req);
  const where = req.surfaceId ? surfaceLabel(db, req.surfaceId).replace(" · ", "/") : "No room/No surface";
  log(
    db,
    PUBLIC_ACTOR,
    MODULE,
    `Touch-up Request: Property ${link.propertyId} – Received from ${req.requesterName} (${contact}) for ${where}/${req.colourLabel ?? "No colour"} at ${dateTime(req.createdAt)}. Acknowledgment sent automatically.`,
  );
  return ok(req.id);
}
