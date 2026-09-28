/** Display helpers shared by the lead list and lead details. */
import type { Database, Lead } from "@/features/types";
import { byId } from "@/features/lib/selectors";
import { leadContact } from "@/features/lib/store/actions/marketing";

export function leadDisplay(db: Database, lead: Lead) {
  const c = leadContact(db, lead.id);
  const p = byId(db.properties, lead.propertyId);
  return {
    name: c.name ?? "Unnamed lead",
    phone: c.phone,
    email: c.email,
    street: p?.address,
    city: p?.city ?? lead.town,
    state: p?.state,
    zip: p?.zip,
    place: p ? `${p.city}, ${p.state}` : lead.town ?? "No Location",
  };
}

export function timeAgo(iso: string, nowMs = Date.now()) {
  const days = Math.floor((nowMs - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}
