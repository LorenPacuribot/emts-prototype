/**
 * Patent 22: approved hours carry the employee, project, work order, date
 * and shift. A punch on a job is tagged with that job's work order and the
 * shift the employee is scheduled on for that day, when there is one.
 */
import type { Database, TimeSegment } from "@/features/types";

export function punchTags(db: Database, employeeId: string, jobId: string | undefined, workDate: string): Pick<TimeSegment, "workOrderId" | "shiftId"> {
  if (!jobId) return {};
  const wo = db.workOrders.find((w) => w.jobId === jobId);
  if (!wo) return {};
  const emp = db.employees.find((e) => e.id === employeeId);
  const onShift = wo.shifts.find((s) =>
    s.startDate <= workDate && workDate <= s.endDate &&
    s.dailyHours?.[workDate] !== null &&
    s.memberIds.some((m) => m === employeeId || (!!emp?.userId && m === emp.userId)));
  return { workOrderId: wo.id, shiftId: onShift?.id };
}

/** "WO-2026-1 · Exterior crew" for a punch, or undefined when it has neither. */
export function punchTagLabel(db: Database, s: Pick<TimeSegment, "workOrderId" | "shiftId">): string | undefined {
  if (!s.workOrderId) return undefined;
  const wo = db.workOrders.find((w) => w.id === s.workOrderId);
  const shift = s.shiftId ? wo?.shifts.find((x) => x.id === s.shiftId) : undefined;
  return [s.workOrderId, shift ? shift.name || `Shift ${shift.id}` : s.shiftId ? `Shift ${s.shiftId}` : "No scheduled shift"].join(" · ");
}
