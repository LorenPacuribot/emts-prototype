import { describe, expect, it } from "vitest";
import {
  DEFAULT_CREW_SUBJECT, baselineSnapshots, markNotified, messageText, peopleWaiting, personChanges, scheduleLogText, scheduleSubject, scheduleUpdateMessage, unsentJobIds, type NotifyJob,
} from "./schedule-notify";

const AT = "2026-09-30T10:00:00Z";

const job = (id: string, start: string, members: string[], extra: Partial<NotifyJob> = {}): NotifyJob => ({
  id, jobNumber: `JOB-${id}`, title: `Job ${id}`, status: "Scheduled", startDate: start, endDate: start, startTime: "08:00", endTime: "16:00",
  crew: members.map((memberId) => ({ memberId, hours: 8 })), ...extra,
});

const move = (j: NotifyJob, start: string): NotifyJob => ({ ...j, startDate: start, endDate: start });

describe("schedule notify", () => {
  it("nothing is unsent right after the baseline", () => {
    const jobs = [job("1", "2026-10-05", ["ana", "luis"])];
    const snaps = baselineSnapshots(jobs, AT);
    expect(peopleWaiting(jobs, snaps)).toEqual([]);
    expect(unsentJobIds(jobs, snaps).size).toBe(0);
  });

  it("a move is unsent for everyone on the job", () => {
    const before = [job("1", "2026-10-05", ["ana", "luis"])];
    const snaps = baselineSnapshots(before, AT);
    const after = [move(before[0]!, "2026-10-06")];
    expect(peopleWaiting(after, snaps).map((p) => p.memberId).sort()).toEqual(["ana", "luis"]);
    expect([...unsentJobIds(after, snaps)]).toEqual(["1"]);
    expect(personChanges("ana", after, snaps)[0]).toMatchObject({ kind: "changed", before: { startDate: "2026-10-05" }, after: { startDate: "2026-10-06" } });
  });

  it("moving a job and moving it back clears the pill without a send", () => {
    const original = [job("1", "2026-10-05", ["ana"])];
    const snaps = baselineSnapshots(original, AT);
    expect(unsentJobIds([move(original[0]!, "2026-10-09")], snaps).size).toBe(1);
    expect(unsentJobIds([move(original[0]!, "2026-10-05")], snaps).size).toBe(0);
  });

  it("new assignments, time changes and removals count", () => {
    const before = [job("1", "2026-10-05", ["ana"]), job("2", "2026-10-06", ["ana", "luis"])];
    const snaps = baselineSnapshots(before, AT);
    const after = [
      job("1", "2026-10-05", ["ana", "kevin"]),
      { ...before[1]!, crew: [{ memberId: "luis", hours: 8 }], startTime: "07:00" },
      job("3", "2026-10-07", ["ana"]),
    ];
    const byPerson = Object.fromEntries(peopleWaiting(after, snaps).map((p) => [p.memberId, p.changes.map((c) => `${c.kind}:${c.jobId}`)]));
    expect(byPerson).toEqual({ ana: ["removed:2", "new:3"], luis: ["changed:2"], kevin: ["new:1"] });
  });

  it("a cancelled or deleted job is a removal", () => {
    const before = [job("1", "2026-10-05", ["ana"]), job("2", "2026-10-06", ["ana"])];
    const snaps = baselineSnapshots(before, AT);
    const after = [{ ...before[0]!, startDate: undefined, endDate: undefined, status: "Unscheduled" }];
    expect(personChanges("ana", after, snaps).map((c) => `${c.kind}:${c.jobId}`).sort()).toEqual(["removed:1", "removed:2"]);
  });

  it("20 jobs changed for one person gives exactly one message", () => {
    const before = Array.from({ length: 20 }, (_, i) => job(String(i + 1), `2026-10-${String(i + 1).padStart(2, "0")}`, ["ana"]));
    const snaps = baselineSnapshots(before, AT);
    const after = before.map((j) => move(j, "2026-11-02"));
    const waiting = peopleWaiting(after, snaps);
    expect(waiting).toHaveLength(1);
    const msg = scheduleUpdateMessage("Ana", waiting[0]!.changes);
    expect(msg.sections).toHaveLength(1);
    expect(msg.sections[0]!.title).toBe("Changed jobs");
    expect(msg.sections[0]!.lines).toHaveLength(20);
  });

  it("sending clears only the people sent to; an unticked person keeps their pill", () => {
    const before = [job("1", "2026-10-05", ["ana", "luis"])];
    const snaps = baselineSnapshots(before, AT);
    const after = [move(before[0]!, "2026-10-08")];
    const sent = markNotified(snaps, "ana", after, AT);
    expect(peopleWaiting(after, sent).map((p) => p.memberId)).toEqual(["luis"]);
    expect(unsentJobIds(after, sent).has("1")).toBe(true);
  });

  it("a send limited to one job leaves the person's other changes waiting", () => {
    const before = [job("1", "2026-10-05", ["ana"]), job("2", "2026-10-06", ["ana"])];
    const snaps = baselineSnapshots(before, AT);
    const after = [move(before[0]!, "2026-10-09"), move(before[1]!, "2026-10-10")];
    expect(peopleWaiting(after, snaps, ["1"])[0]!.changes.map((c) => c.jobId)).toEqual(["1"]);
    const sent = markNotified(snaps, "ana", after, AT, ["1"]);
    expect(personChanges("ana", after, sent).map((c) => c.jobId)).toEqual(["2"]);
  });

  it("shift assignments count, not only the crew list", () => {
    const base = job("1", "2026-10-05", [], {
      shifts: [{ id: "s1", name: "Shift 1", startDate: "2026-10-05", endDate: "2026-10-06", startTime: "08:00", endTime: "16:00", memberIds: ["ana"] }],
    });
    const snaps = baselineSnapshots([base], AT);
    const later = { ...base, shifts: [{ ...base.shifts![0]!, endTime: "15:00" }] };
    expect(personChanges("ana", [later], snaps)).toHaveLength(1);
  });

  it("the message leaves out empty sections, and speaks Spanish", () => {
    const before = [job("1", "2026-10-05", ["ana"])];
    const snaps = baselineSnapshots(before, AT);
    const after = [...before, job("2", "2026-10-07", ["ana"])];
    const changes = personChanges("ana", after, snaps);
    const en = scheduleUpdateMessage("Ana", changes, { subject: "Schedule update" });
    expect(en.subject).toBe("Schedule update");
    expect(en.sections.map((s) => s.title)).toEqual(["New jobs"]);
    expect(messageText(en)).toContain("Job 2 (JOB-2)");
    const es = scheduleUpdateMessage("Ana", changes, { lang: "es" });
    expect(es.greeting).toBe("Hola Ana,");
    expect(es.sections[0]!.title).toBe("Trabajos nuevos");
  });

  it("D7: the subject names the company and how many jobs changed, in English and Spanish", () => {
    const before = [job("1", "2026-10-05", ["ana"]), job("3", "2026-10-09", ["ana"])];
    const snaps = baselineSnapshots(before, AT);
    const after = [job("1", "2026-10-06", ["ana"]), job("2", "2026-10-07", ["ana"]), job("3", "2026-10-09", ["ana"])];
    const changes = personChanges("ana", after, snaps);
    expect(scheduleUpdateMessage("Ana", changes, { company: "Paint Pro", subject: DEFAULT_CREW_SUBJECT }).subject).toBe("Schedule update from Paint Pro: 2 jobs changed");
    expect(scheduleUpdateMessage("Ana", changes, { company: "Paint Pro", lang: "es" }).subject).toBe("Actualización de horario de Paint Pro: 2 trabajos cambiados");
    expect(scheduleSubject("Paint Pro", 1)).toBe("Schedule update from Paint Pro: 1 job changed");
    // A subject the office wrote keeps its words; the variables are filled in.
    expect(scheduleUpdateMessage("Ana", changes, { company: "Paint Pro", subject: "{{orgName}} schedule: {{jobCount}} updates" }).subject).toBe("Paint Pro schedule: 2 updates");
    // The changed job keeps its old dates for the preview to cross through.
    const changed = scheduleUpdateMessage("Ana", changes).sections.find((s) => s.kind === "changed")!;
    expect(changed.lines[0]!.was).toBeDefined();
  });
});

describe("Tab 4 — activity log lines, word for word", () => {
  it("logs sent, skipped and failed updates per person", () => {
    expect(scheduleLogText.sent("Braden Skelly", "Tim Skelly", ["JOB-2026-37", "JOB-2026-38"])).toBe("Scheduling: Schedule update sent to Braden Skelly by Tim Skelly covering 2 jobs: JOB-2026-37, JOB-2026-38.");
    expect(scheduleLogText.skipped("Luis Ortega", "Tim Skelly", ["JOB-2026-37"])).toBe("Scheduling: Luis Ortega unticked by Tim Skelly. Update not sent for JOB-2026-37.");
    expect(scheduleLogText.failed("Dana Ruiz", "The address is not a valid email.")).toBe("Scheduling: Schedule update to Dana Ruiz not delivered. Reason: The address is not a valid email.");
  });
});
