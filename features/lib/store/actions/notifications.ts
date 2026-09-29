/**
 * Staff notifications (patent 12: "The contractor can receive notification
 * when the customer accepts the estimate"). Shown under the header bell.
 */
import type { Database, Notification, User } from "@/features/types";
import { now } from "@/features/lib/clock";
import { fail, nextId, ok } from "../helpers";

/** Adds one notification per recipient (duplicates and unknown users skipped). */
export function notify(db: Database, userIds: (string | undefined)[], n: Omit<Notification, "id" | "userId" | "createdAt" | "readAt">) {
  db.notifications ??= [];
  const t = now();
  for (const userId of new Set(userIds.filter((u): u is string => !!u && db.users.some((x) => x.id === u)))) {
    db.notifications.unshift({ ...n, id: nextId(db, "notification", "N-"), userId, createdAt: t });
  }
}

/** Who hears about an accepted estimate: its estimator, plus the owner and office manager. */
export function acceptanceRecipients(db: Database, estimatorId?: string): string[] {
  return [estimatorId, ...db.users.filter((u) => (u.role === "owner" || u.role === "office_manager") && !u.outOfOffice).map((u) => u.id)].filter((u): u is string => !!u);
}

export function markNotificationRead(db: Database, actor: User, id: string) {
  const n = db.notifications?.find((x) => x.id === id);
  if (!n || n.userId !== actor.id) return fail("This notification is no longer available.");
  n.readAt ??= now();
  return ok();
}

export function markAllNotificationsRead(db: Database, actor: User) {
  const t = now();
  for (const n of db.notifications ?? []) if (n.userId === actor.id && !n.readAt) n.readAt = t;
  return ok();
}
