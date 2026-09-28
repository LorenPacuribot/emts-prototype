/**
 * Small helpers shared by all store actions.
 * Actions receive an Immer draft of the database and mutate it directly.
 */
import type { ActionResult, Database, User } from "@/features/types";
import { now } from "@/features/lib/clock";

/** Next number from a named counter. */
export function nextNumber(db: Database, counter: string): number {
  db.counters[counter] = (db.counters[counter] ?? 0) + 1;
  return db.counters[counter];
}

export function nextId(db: Database, counter: string, prefix: string): string {
  return `${prefix}${nextNumber(db, counter)}`;
}

/** Write to the activity log (Activity Logs sections). */
export function log(db: Database, actor: User, module: string, message: string, blocked = false) {
  db.activity.unshift({ id: nextId(db, "act", "ACT-"), at: now(), userId: actor.id, module, message, blocked });
}

/** Log an entry whose source is a supplier connection rather than a staff member. */
export function logSupplier(db: Database, supplierId: string, module: string, message: string) {
  db.activity.unshift({ id: nextId(db, "act", "ACT-"), at: now(), userId: supplierId, source: "supplier", module, message });
}

/** Name for an activity or order-trail entry, whichever kind of source made it. */
export function sourceName(db: Database, entry: { source?: "supplier"; userId?: string; by?: string }): string {
  const id = entry.userId ?? entry.by;
  if (entry.source === "supplier") return `${db.suppliers.find((s) => s.id === id)?.name ?? "Supplier"} (supplier connection)`;
  return userName(db, id);
}

export const ok = <T>(value?: T): ActionResult<T> => ({ ok: true, value });
export const fail = (error: string, field?: string): ActionResult<never> => ({ ok: false, error, field });

/** Block + log an unauthorised attempt (Access Validations). */
export function denied(db: Database, actor: User, module: string, what: string, needs: string): ActionResult<never> {
  log(db, actor, module, `Blocked: ${actor.name} attempted to ${what}. Requires ${needs}.`, true);
  return fail(`You can't ${what}. This needs ${needs}.`);
}

export function userName(db: Database, id?: string): string {
  return db.users.find((u) => u.id === id)?.name ?? "—";
}

/** Unguessable reference for QR links. Not derived from address or ID. */
export function randomRef(length = 16): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
