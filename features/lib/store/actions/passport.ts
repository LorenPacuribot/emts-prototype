/**
 * Customer Paint Passport (patent 26, "2. Customer Paint Passport"):
 * Job History → Customer Paint Passport → add jobs → Generate Passport Link
 * → Send → the customer opens the link and sees earlier colours, products
 * and surfaces without contacting the contractor.
 *
 * Only jobs at properties the customer owns today can be added, and the
 * customer page applies the same ownership and consent rules as the QR record.
 */
import type { Database, PaintPassport, User } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId, currentOwnership } from "@/features/lib/selectors";
import { denied, fail, log, nextNumber, ok, randomRef } from "../helpers";

const MODULE = "QR Record";

export interface PassportJob {
  id: string;
  name: string;
  propertyId: string;
  address: string;
  completedAt?: string;
  surfaces: number;
}

/** Completed jobs with recorded paint at properties this customer owns now. */
export function passportJobs(db: Database, customerId: string): PassportJob[] {
  const owned = db.properties.filter((p) => !p.mergedInto && currentOwnership(p)?.customerId === customerId);
  const out: PassportJob[] = [];
  for (const property of owned) {
    const apps = db.applications.filter((a) => a.propertyId === property.id && a.jobId);
    for (const jobId of new Set(apps.map((a) => a.jobId!))) {
      const job = byId(db.jobs, jobId);
      const hist = (db.historicalJobs ?? []).find((j) => j.id === jobId);
      const jobApps = apps.filter((a) => a.jobId === jobId);
      out.push({
        id: jobId,
        name: job?.name ?? hist?.name ?? jobId,
        propertyId: property.id,
        address: property.address,
        completedAt: hist?.completedAt ?? job?.closedAt ?? jobApps.map((a) => a.completedAt).filter(Boolean).sort().at(-1),
        surfaces: new Set(jobApps.map((a) => a.surfaceId)).size,
      });
    }
  }
  return out.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
}

export function passportsFor(db: Database, customerId: string): PaintPassport[] {
  return (db.paintPassports ?? []).filter((p) => p.customerId === customerId);
}

export function createPassport(db: Database, actor: User, customerId: string, jobIds: string[]) {
  if (!can(actor, "qr.generate")) return denied(db, actor, MODULE, "generate a paint passport", whoCan("qr.generate"));
  if (!byId(db.customers, customerId)) return fail("Customer not found.");
  const unique = [...new Set(jobIds)];
  if (!unique.length) return fail("Add at least one job to the passport.", "jobIds");
  const eligible = new Set(passportJobs(db, customerId).map((j) => j.id));
  const bad = unique.find((id) => !eligible.has(id));
  if (bad) return fail(`${bad} can't go on this passport: it has no recorded paint at a property this customer owns now.`, "jobIds");
  db.paintPassports ??= [];
  let ref = randomRef(20);
  while (db.paintPassports.some((p) => p.ref === ref) || db.qrLinks.some((l) => l.ref === ref)) ref = randomRef(20);
  const passport: PaintPassport = {
    id: `PP-${nextNumber(db, "passport")}`, ref, customerId, jobIds: unique, createdAt: now(), createdBy: actor.id, openCount: 0,
  };
  db.paintPassports.unshift(passport);
  log(db, actor, MODULE, `Paint Passport ${passport.id} generated for customer ${customerId} with ${unique.length} job${unique.length === 1 ? "" : "s"} (${unique.join(", ")}) by ${actor.name}`);
  return ok(passport.id);
}

export function sendPassport(db: Database, actor: User, passportId: string, channel: "email" | "text") {
  if (!can(actor, "qr.generate")) return denied(db, actor, MODULE, "send a paint passport", whoCan("qr.generate"));
  const p = (db.paintPassports ?? []).find((x) => x.id === passportId);
  if (!p || p.revokedAt) return fail("Only an active passport can be sent.");
  const customer = byId(db.customers, p.customerId);
  if (!customer) return fail("Customer not found.");
  if (!customer.contactVerified) return fail("The office must verify this customer's email or phone before the passport is sent.");
  const to = channel === "email" ? customer.email : customer.phone;
  if (!to) return fail(channel === "email" ? "No email address on file. Send by text instead." : "No phone number on file. Send by email instead.");
  p.lastSentAt = now();
  p.lastSentTo = to;
  p.lastSentChannel = channel;
  log(db, actor, MODULE, `Paint Passport ${p.id} sent to ${to} via ${channel === "email" ? "Email" : "Text"} by ${actor.name}`);
  return ok(to);
}

export function revokePassport(db: Database, actor: User, passportId: string) {
  if (!can(actor, "qr.revoke")) return denied(db, actor, MODULE, "revoke a paint passport", whoCan("qr.revoke"));
  const p = (db.paintPassports ?? []).find((x) => x.id === passportId);
  if (!p || p.revokedAt) return fail("This passport is not active.");
  p.revokedAt = now();
  log(db, actor, MODULE, `Paint Passport ${p.id} revoked by ${actor.name}`);
  return ok();
}

/** The customer page records an open (no signed-in user). */
export function recordPassportOpen(db: Database, _actor: User, ref: string) {
  const p = (db.paintPassports ?? []).find((x) => x.ref === ref);
  if (!p || p.revokedAt) return ok();
  p.openCount += 1;
  p.lastOpenAt = now();
  return ok();
}
