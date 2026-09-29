"use client";
/** Small pieces shared by the Workforce screens (feature 22). */
import type { TimeEntryState } from "@/features/types";
import { now } from "@/features/lib/clock";
import { addDaysToDay, hm, localDay, weekStartOf } from "@/features/lib/rules/payroll";
import { Badge, Select } from "@/features/components/ui";
import type { Tone } from "@/features/components/ui/badge";

export const ENTRY_STATE: Record<TimeEntryState, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "gray" },
  submitted: { label: "Submitted", tone: "blue" },
  approved: { label: "Approved", tone: "green" },
  locked: { label: "Locked in batch", tone: "indigo" },
  paid: { label: "Paid", tone: "purple" },
};

export function EntryStateBadge({ state }: { state: TimeEntryState }) {
  const s = ENTRY_STATE[state];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function thisWeek(): string {
  return weekStartOf(localDay(new Date(now())));
}

/** Pay weeks offered in selectors: this week and the three before it. */
export function weekOptions() {
  const w0 = thisWeek();
  return [0, 1, 2, 3].map((i) => {
    const start = addDaysToDay(w0, -7 * i);
    const label = i === 0 ? "This week" : i === 1 ? "Last week" : `${i} weeks ago`;
    return { value: start, label: `${label} · ${dayLabel(start, false)} – ${dayLabel(addDaysToDay(start, 6), false)}` };
  });
}

export function WeekSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-auto" aria-label="Pay week">
      {weekOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );
}

/** "Mon 21 Sep" from a YYYY-MM-DD local day. */
export function dayLabel(day: string, weekday = true): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return dt.toLocaleDateString("en-US", weekday ? { weekday: "short", month: "short", day: "numeric" } : { month: "short", day: "numeric" });
}

export function timeLabel(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function HoursCell({ minutes, muted }: { minutes: number; muted?: boolean }) {
  return <span className={muted ? "tabular-nums text-gray-400" : "tabular-nums font-semibold text-ink"}>{hm(minutes)}</span>;
}

export function JobChips({ rows }: { rows: { jobId?: string; allocated: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {rows.map((r) => (
        <span key={r.jobId ?? "oh"} className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${r.jobId ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
          {r.jobId ?? "Overhead"} {hm(r.allocated)}
        </span>
      ))}
    </div>
  );
}
