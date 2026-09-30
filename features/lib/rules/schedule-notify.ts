/**
 * Crew schedule notifications (JS-M2, JS-M4).
 *
 * Saving, moving or cancelling a shift sends nothing. For each person we keep
 * a snapshot of what they were last told about each job. A job is "unsent"
 * for a person when its dates, times or their assignment differ from that
 * snapshot; changing it back clears it without a send. "Send updates" builds
 * one Schedule Update message per person, then their snapshots move to the
 * current schedule.
 */

/** The parts of a job this rule reads (lib/types Job). */
export interface NotifyJob {
  id: string;
  jobNumber: string;
  title: string;
  address?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  crew: { memberId: string; hours: number; date?: string; shiftId?: string }[];
  shifts?: {
    id: string;
    name?: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    memberIds: string[];
    dailyHours?: Record<string, { startTime: string; endTime: string } | null>;
  }[];
}

/** What one person is (or was) told about one job. */
export interface PersonJobView {
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  /** Their shifts on this job: dates and daily window, with any per-day overrides. */
  shifts: { name: string; startDate: string; endDate: string; startTime: string; endTime: string; days?: string }[];
  /** Days they have hours on (split crew assignments), sorted. */
  days: string[];
}

export interface NotifySnapshot {
  /** `${memberId}:${jobId}` */
  id: string;
  memberId: string;
  jobId: string;
  /** Kept so "Removed from" can name a job that was deleted since. */
  jobNumber: string;
  title: string;
  view: PersonJobView;
  notifiedAt: string;
}

export type ChangeKind = "new" | "changed" | "removed";

export interface PersonChange {
  kind: ChangeKind;
  jobId: string;
  jobNumber: string;
  title: string;
  before?: PersonJobView;
  after?: PersonJobView;
}

const snapshotId = (memberId: string, jobId: string) => `${memberId}:${jobId}`;

/** True when a job with dates counts as on someone's schedule. */
const onSchedule = (j: NotifyJob) => !!j.startDate && j.status !== "Cancelled" && j.status !== "Completed";

/** The person's view of a job, or undefined when they are not on it (or it has no dates). */
export function personView(job: NotifyJob, memberId: string): PersonJobView | undefined {
  if (!onSchedule(job)) return undefined;
  const shifts = (job.shifts ?? []).filter((s) => s.memberIds.includes(memberId));
  const inCrew = job.crew.some((c) => c.memberId === memberId);
  if (!shifts.length && !inCrew) return undefined;
  const days = [...new Set(job.crew.filter((c) => c.memberId === memberId && c.date && c.hours > 0).map((c) => c.date!))].sort();
  return {
    startDate: job.startDate,
    endDate: job.endDate ?? job.startDate,
    startTime: job.startTime,
    endTime: job.endTime,
    shifts: shifts
      .map((s) => ({
        name: s.name ?? "",
        startDate: s.startDate,
        endDate: s.endDate,
        startTime: s.startTime,
        endTime: s.endTime,
        ...(s.dailyHours && Object.keys(s.dailyHours).length ? { days: JSON.stringify(Object.entries(s.dailyHours).sort(([a], [b]) => a.localeCompare(b))) } : {}),
      }))
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name)),
    days,
  };
}

const same = (a?: PersonJobView, b?: PersonJobView) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Everything a person has not been told yet: new jobs, changed jobs and jobs they were taken off. */
export function personChanges(memberId: string, jobs: NotifyJob[], snapshots: NotifySnapshot[]): PersonChange[] {
  const mine = new Map(snapshots.filter((s) => s.memberId === memberId).map((s) => [s.jobId, s]));
  const out: PersonChange[] = [];
  for (const j of jobs) {
    const after = personView(j, memberId);
    const snap = mine.get(j.id);
    if (after && !snap) out.push({ kind: "new", jobId: j.id, jobNumber: j.jobNumber, title: j.title, after });
    else if (after && snap && !same(after, snap.view)) out.push({ kind: "changed", jobId: j.id, jobNumber: j.jobNumber, title: j.title, before: snap.view, after });
    else if (!after && snap) out.push({ kind: "removed", jobId: j.id, jobNumber: j.jobNumber, title: j.title, before: snap.view });
  }
  // Jobs deleted since the person was told about them.
  const ids = new Set(jobs.map((j) => j.id));
  for (const snap of mine.values()) {
    if (!ids.has(snap.jobId)) out.push({ kind: "removed", jobId: snap.jobId, jobNumber: snap.jobNumber, title: snap.title, before: snap.view });
  }
  return out.sort((a, b) => (a.after?.startDate ?? a.before?.startDate ?? "").localeCompare(b.after?.startDate ?? b.before?.startDate ?? ""));
}

/** Everyone on or recently taken off a job: the people a change could concern. */
function peopleOn(jobs: NotifyJob[], snapshots: NotifySnapshot[]): string[] {
  const ids = new Set<string>(snapshots.map((s) => s.memberId));
  for (const j of jobs) {
    j.crew.forEach((c) => ids.add(c.memberId));
    (j.shifts ?? []).forEach((s) => s.memberIds.forEach((m) => ids.add(m)));
  }
  return [...ids];
}

/**
 * People waiting for a schedule update, with their changes.
 * `jobIds` limits it to changes on those jobs (Send Email on one job, after Bulk Reschedule).
 */
export function peopleWaiting(jobs: NotifyJob[], snapshots: NotifySnapshot[], jobIds?: string[]): { memberId: string; changes: PersonChange[] }[] {
  return peopleOn(jobs, snapshots)
    .map((memberId) => ({ memberId, changes: personChanges(memberId, jobs, snapshots).filter((c) => !jobIds || jobIds.includes(c.jobId)) }))
    .filter((p) => p.changes.length > 0);
}

/** Jobs whose bar shows "Changes not sent": someone on (or taken off) the job has not been told. */
export function unsentJobIds(jobs: NotifyJob[], snapshots: NotifySnapshot[]): Set<string> {
  return new Set(peopleWaiting(jobs, snapshots).flatMap((p) => p.changes.map((c) => c.jobId)));
}

/**
 * Snapshots after a person was told. Only the listed jobs move when `jobIds`
 * is given; everything else they were told stays as it was.
 */
export function markNotified(snapshots: NotifySnapshot[], memberId: string, jobs: NotifyJob[], at: string, jobIds?: string[]): NotifySnapshot[] {
  const covers = (jobId: string) => !jobIds || jobIds.includes(jobId);
  const kept = snapshots.filter((s) => s.memberId !== memberId || !covers(s.jobId));
  const fresh: NotifySnapshot[] = jobs
    .filter((j) => covers(j.id))
    .flatMap((j) => {
      const view = personView(j, memberId);
      return view ? [{ id: snapshotId(memberId, j.id), memberId, jobId: j.id, jobNumber: j.jobNumber, title: j.title, view, notifiedAt: at }] : [];
    });
  return [...kept, ...fresh];
}

/** Snapshots matching the schedule as it is: nobody has anything unsent. */
export function baselineSnapshots(jobs: NotifyJob[], at: string): NotifySnapshot[] {
  return peopleOn(jobs, []).reduce<NotifySnapshot[]>((acc, m) => markNotified(acc, m, jobs, at), []);
}

/* ------------------------------ Message ------------------------------ */

export type NotifyLang = "en" | "es";

const WORDS = {
  en: {
    subject: "Your schedule has changed",
    hi: (n: string) => `Hi ${n},`,
    intro: "Your work schedule has changed. Here is what is new.",
    new: "New jobs",
    changed: "Changed jobs",
    removed: "Removed from",
    was: "was",
    outro: "Reply to this email if you have a question.",
  },
  es: {
    subject: "Su horario ha cambiado",
    hi: (n: string) => `Hola ${n},`,
    intro: "Su horario de trabajo ha cambiado. Esto es lo nuevo.",
    new: "Trabajos nuevos",
    changed: "Trabajos cambiados",
    removed: "Ya no está en",
    was: "antes",
    outro: "Responda a este correo si tiene alguna pregunta.",
  },
} as const;

export interface ScheduleMessage {
  subject: string;
  greeting: string;
  intro: string;
  sections: { kind: ChangeKind; title: string; lines: { job: string; when: string; was?: string; address?: string }[] }[];
  outro: string;
  /** "was" before the old dates of a changed job. */
  wasLabel: string;
}

const fmtDate = (iso: string, lang: NotifyLang) =>
  new Date(iso + "T12:00:00").toLocaleDateString(lang === "es" ? "es-US" : "en-US", { weekday: "short", month: "short", day: "numeric" });

const fmtTime = (t: string | undefined, lang: NotifyLang) => {
  if (!t) return "";
  const [h = 0, m = 0] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(lang === "es" ? "es-US" : "en-US", { hour: "numeric", minute: "2-digit" });
};

/** "Mon, Oct 5 – Wed, Oct 7 · 8:00 AM – 4:00 PM" for a person's view of a job. */
export function describeView(v: PersonJobView, lang: NotifyLang = "en"): string {
  const parts = v.shifts.length
    ? v.shifts.map((s) => `${fmtDate(s.startDate, lang)}${s.endDate !== s.startDate ? ` – ${fmtDate(s.endDate, lang)}` : ""} · ${fmtTime(s.startTime, lang)} – ${fmtTime(s.endTime, lang)}`)
    : [`${fmtDate(v.startDate!, lang)}${v.endDate && v.endDate !== v.startDate ? ` – ${fmtDate(v.endDate, lang)}` : ""}${v.startTime ? ` · ${fmtTime(v.startTime, lang)} – ${fmtTime(v.endTime, lang)}` : ""}`];
  return parts.join("; ");
}

/**
 * One Schedule Update message for one person, listing New jobs, Changed jobs
 * and Removed from. Empty sections are left out.
 */
export function scheduleUpdateMessage(firstName: string, changes: PersonChange[], opts: { lang?: NotifyLang; subject?: string; addressOf?: (jobId: string) => string | undefined } = {}): ScheduleMessage {
  const lang = opts.lang ?? "en";
  const w = WORDS[lang];
  const order: ChangeKind[] = ["new", "changed", "removed"];
  return {
    subject: lang === "en" && opts.subject ? opts.subject : w.subject,
    greeting: w.hi(firstName),
    intro: w.intro,
    sections: order
      .map((kind) => ({
        kind,
        title: w[kind],
        lines: changes
          .filter((c) => c.kind === kind)
          .map((c) => ({
            job: `${c.title} (${c.jobNumber})`,
            when: c.after ? describeView(c.after, lang) : describeView(c.before!, lang),
            was: kind === "changed" && c.before ? describeView(c.before, lang) : undefined,
            address: kind !== "removed" ? opts.addressOf?.(c.jobId) : undefined,
          })),
      }))
      .filter((s) => s.lines.length > 0),
    outro: w.outro,
    wasLabel: w.was,
  };
}

/** Plain-text body of a Schedule Update, as stored in the send log. */
export function messageText(m: ScheduleMessage): string {
  const body = m.sections.map((s) => [s.title.toUpperCase(), ...s.lines.map((l) => `- ${l.job}: ${l.when}${l.was ? ` (${m.wasLabel} ${l.was})` : ""}${l.address ? `, ${l.address}` : ""}`)].join("\n"));
  return [m.greeting, "", m.intro, "", ...body.flatMap((b) => [b, ""]), m.outro].join("\n");
}
