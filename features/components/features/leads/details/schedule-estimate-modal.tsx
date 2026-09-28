"use client";
/**
 * "Schedule Estimate" / "Reschedule Estimate" (live: leads/details/modals/schedule-estimate.tsx).
 * Date, Time (24h), Assigned Estimator, Duration and appointment notes.
 */
import { useEffect, useState } from "react";
import type { Lead } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import { addLeadNote, scheduleLeadEstimate } from "@/features/lib/store/actions/leads";
import { nowDate } from "@/features/lib/clock";
import { toast } from "@/features/lib/toast";
import { Button, Field, Input, Modal, Select, Textarea } from "@/features/components/ui";

/** Live DURATION_OPTIONS. */
const DURATIONS = [["15", "15 Minutes"], ["30", "30 Minutes"], ["45", "45 Minutes"], ["60", "1 Hour"], ["90", "1.5 Hours"], ["120", "2 Hours"]];

const pad = (n: number) => String(n).padStart(2, "0");

export function ScheduleEstimateModal({ open, onOpenChange, lead }: { open: boolean; onOpenChange: (v: boolean) => void; lead: Lead }) {
  const db = useDb((d) => d);
  const re = !!lead.scheduledAt;
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("60");
  const [estimatorId, setEstimatorId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<{ field?: string; message: string }>();
  useEffect(() => {
    if (!open) return;
    const at = lead.scheduledAt ? new Date(lead.scheduledAt) : undefined;
    const day = at ?? nowDate();
    setDate(`${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`);
    setTime(at ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : "10:00");
    setDuration(String(lead.durationMin ?? 60));
    setEstimatorId(lead.assignedUserId ?? "");
    setNotes("");
    setError(undefined);
  }, [open, lead]);
  const estimators = db.users.filter((u) => u.role === "estimator" || u.role === "senior_estimator" || u.role === "owner");
  const submit = () => {
    const r = act(scheduleLeadEstimate, lead.id, { date, time, durationMin: Number(duration), estimatorId });
    if (!r.ok) return setError({ field: r.field, message: r.error });
    if (notes.trim()) act(addLeadNote, lead.id, `${re ? "Rescheduled" : "Appointment"}: ${notes.trim()}`);
    toast.success(re ? "Estimate rescheduled" : "Estimate scheduled", "It now shows on the Calendar.");
    onOpenChange(false);
  };
  const err = (f: string) => (error?.field === f ? error.message : undefined);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={re ? "Reschedule Estimate" : "Schedule Estimate"}
      footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={submit}>{re ? "Reschedule" : "Schedule"}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="DATE" required error={err("date")}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="TIME (24H)" required error={err("time")}><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label="ASSIGNED ESTIMATOR" required error={err("estimatorId")}>
            <Select value={estimatorId} onChange={(e) => setEstimatorId(e.target.value)}>
              <option value="">Select Estimator...</option>
              {estimators.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="DURATION" required>
            <Select value={duration} onChange={(e) => setDuration(e.target.value)}>{DURATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          </Field>
        </div>
        <Field label="APPOINTMENT NOTES"><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={re ? "Reason for rescheduling..." : "Entry codes, parking info, specific requests..."} /></Field>
      </div>
    </Modal>
  );
}
