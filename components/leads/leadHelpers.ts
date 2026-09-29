/*
  Lead pipeline rules and small helpers shared by the Lead Pipeline and
  Contacts screens. The rules mirror the live app (features/(main)/leads/listings/lib/constants.ts):

  - New, Contacted, Scheduled and Archived can be set by hand.
  - Pending, Sold and Lost are normally driven by the estimate lifecycle,
    except Sold (from Scheduled) and Lost (from Contacted or Scheduled).
  - A lead becomes a "Contact" once an estimate is scheduled and a "Client" once sold.
*/
import type { ContactType, Lead, LeadStatus, PipelineStage } from '@/lib/types';

/** Pipeline columns in order (Archived is not a column). */
export const PIPELINE_STEPS: LeadStatus[] = ['New', 'Contacted', 'Scheduled', 'Pending', 'Sold', 'Lost'];

export const MANUAL_LEAD_STATUSES: LeadStatus[] = ['New', 'Contacted', 'Scheduled', 'Archived'];

export const isManualLeadStatus = (s: LeadStatus) => MANUAL_LEAD_STATUSES.includes(s);

/** Can a user move a lead from one status to another by hand (drag, stage bar)? */
export function canManuallySetStatus(from: LeadStatus, to: LeadStatus): boolean {
  if (to === 'Sold') return from === 'Scheduled';
  if (to === 'Lost') return from === 'Contacted' || from === 'Scheduled';
  return isManualLeadStatus(to);
}

/** Message shown when a drop is not allowed (same copy as the live app). */
export function blockedMoveMessage(to: LeadStatus) {
  if (to === 'Lost') return 'A lead can only be marked Lost from the Contacted or Scheduled stage.';
  if (to === 'Sold') return 'A lead can only be marked Sold from the Scheduled stage.';
  return `${to} is set by the estimate lifecycle. Send / accept / decline the estimate to move the lead there.`;
}

/** Statuses a lead can be archived from. New leads show the button too, as in the live screenshot. */
export const canArchiveLeadStatus = (s: LeadStatus) => s !== 'Sold' && s !== 'Archived';

/** Where the arrow button on a card moves the lead. */
export const NEXT_STAGE_MAP: Record<LeadStatus, LeadStatus | null> = {
  New: 'Contacted',
  Contacted: 'Scheduled',
  Scheduled: null,
  Pending: null,
  Sold: null,
  Lost: 'Contacted',
  Archived: 'Contacted',
};

/** Friendly names used in a few places (e.g. contact Leads tab). */
export const LEAD_STATUS_DISPLAY_NAMES: Record<LeadStatus, string> = {
  New: 'New',
  Contacted: 'Contacted',
  Scheduled: 'Estimate Scheduled',
  Pending: 'Pending',
  Sold: 'Sold',
  Lost: 'Lost',
  Archived: 'Archived',
};

/** Badge colors for a lead status in the table and archived view. */
export const LEAD_STATUS_BADGE: Record<LeadStatus, string> = {
  New: 'bg-blue-50 text-blue-700 border-blue-200',
  Contacted: 'bg-purple-50 text-purple-700 border-purple-200',
  Scheduled: 'bg-amber-50 text-amber-700 border-amber-200',
  Pending: 'bg-purple-50 text-purple-700 border-purple-200',
  Sold: 'bg-green-50 text-green-700 border-green-200',
  Lost: 'bg-red-50 text-red-700 border-red-200',
  Archived: 'bg-gray-100 text-gray-600 border-gray-200',
};

/** LEAD / CONTACT / CLIENT badge, based on how far the lead has progressed. */
export const LEAD_LIFECYCLE: Record<LeadStatus, { label: string; type: Lead['contactType']; color: string }> = {
  New: { label: 'Lead', type: 'LEAD', color: 'bg-blue-100 text-blue-700' },
  Contacted: { label: 'Lead', type: 'LEAD', color: 'bg-blue-100 text-blue-700' },
  Scheduled: { label: 'Contact', type: 'CONTACT', color: 'bg-purple-100 text-purple-700' },
  Pending: { label: 'Contact', type: 'CONTACT', color: 'bg-purple-100 text-purple-700' },
  Sold: { label: 'Client', type: 'CLIENT', color: 'bg-green-100 text-green-700' },
  Lost: { label: 'Lead', type: 'LEAD', color: 'bg-gray-100 text-gray-500' },
  Archived: { label: 'Lead', type: 'LEAD', color: 'bg-gray-100 text-gray-500' },
};

/** Contact type a customer should have once their lead reaches a status (never downgrades a Client). */
export function customerTypeFor(status: LeadStatus, current: ContactType): ContactType {
  if (current === 'Client') return 'Client';
  if (status === 'Sold') return 'Client';
  if (status === 'Scheduled' || status === 'Pending') return 'Contact';
  return current;
}

/** Lead sources in the Add Lead dropdown (live COMMON_SOURCES + Existing Client). */
export const COMMON_SOURCES = [
  'Website', 'Referral', 'Google', 'Facebook', 'Instagram', 'Thumbtack', 'Angi', 'Nextdoor', 'Yard Sign', 'Truck Wrap',
];

export const DURATION_OPTIONS = [
  { label: '15 Minutes', value: '15' },
  { label: '30 Minutes', value: '30' },
  { label: '45 Minutes', value: '45' },
  { label: '1 Hour', value: '60' },
  { label: '1.5 Hours', value: '90' },
  { label: '2 Hours', value: '120' },
];

/** Turns a pipelineStages record ("NEW") into the matching lead status ("New"). */
export function stageToStatus(stage: PipelineStage): LeadStatus {
  const s = stage.stageId;
  return (s.charAt(0) + s.slice(1).toLowerCase()) as LeadStatus;
}

/* ---------- Formatting ---------- */

/** (555) 123-4567 from any string of digits. Leaves other text alone. */
export function formatPhone(v?: string) {
  if (!v) return '';
  const d = v.replace(/\D/g, '');
  if (d.length !== 10) return v;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Formats a phone number while the user types (max 10 digits). */
export function formatPhoneInput(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** "Today", "Yesterday" or "12 days ago" (same wording as the live cards). */
export function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

/** 9:00 AM from "09:00" */
export function time12(t?: string) {
  if (!t) return '';
  const [h = 0, m = 0] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Adds minutes to "HH:mm" and returns "HH:mm" (caps at 23:59). */
export function addMinutes(t: string, minutes: number) {
  const [h = 0, m = 0] = t.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/* ---------- Validation ---------- */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ZIP_RE = /^\d{5}(-\d{4})?$/;

export function isValidPhone(v: string) {
  return /^[\d\s\-()+]+$/.test(v) && v.replace(/\D/g, '').length >= 10;
}

/* ---------- Notes ---------- */

/** "[2026-09-27 14:05] text" — the format the live app stores notes in. */
export function appendNote(existing: string | undefined, text: string, now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const entry = `[${stamp}] ${text.trim()}`;
  return existing?.trim() ? `${existing.trim()}\n${entry}` : entry;
}

export interface ParsedNote {
  id: number;
  timestamp: string;
  content: string;
}

/** Splits stored notes into entries, newest first. Text without a timestamp becomes one entry. */
export function parseNotes(notes?: string): ParsedNote[] {
  if (!notes?.trim()) return [];
  const segments = notes.match(/\[[\d-]+\s[\d:]+\][^[]*/g);
  const out: ParsedNote[] = [];
  // Any text before the first timestamp is an older, untimed note.
  const firstIdx = segments ? notes.indexOf(segments[0]!) : -1;
  const leading = segments ? notes.slice(0, firstIdx).trim() : notes.trim();
  if (leading) out.push({ id: 0, timestamp: '', content: leading });
  segments?.forEach((seg, i) => {
    const m = seg.match(/^\[(.*?)\]\s*([\s\S]*)/);
    if (!m) return;
    const d = new Date(m[1]!.replace(' ', 'T'));
    const timestamp = isNaN(d.getTime())
      ? m[1]!
      : d.toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const content = m[2]!.trim();
    if (content) out.push({ id: i + 1, timestamp, content });
  });
  return out.reverse();
}
