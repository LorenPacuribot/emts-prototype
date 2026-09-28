"use client";
/**
 * Lead Details — live route /leads/[id] (features/(main)/leads/details),
 * prototype /leads/detail?id= (decision D2).
 *
 * Existing: Back to Pipeline, the header card (avatar, name, lifecycle type,
 * location, source, created date, appointment badge; Schedule / Reschedule,
 * the estimate link or Create New Estimate, the ⋮ menu with Archive), the
 * pipeline status bar under the live manual-status rules, Contact
 * Information, Job Location and Notes.
 * NEW (29): the Repaint Follow-Up card for a lead that came from a repaint
 * alert; while that follow-up is open it sets the lead's stage.
 */
import { useState } from "react";
import { ArrowLeft, BellRing, Calendar, Check, FileText, Lock, Mail, MapPin, MessageSquare, Phone, Plus, RefreshCw, User } from "lucide-react";
import type { PipelineStage } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { AppLink, useNav, useParam } from "@/features/lib/navigation";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { date, dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { contactHref, estimateHref } from "@/features/lib/hrefs";
import { LIVE_LEAD_STATUS, PIPELINE_STEPS, canArchiveStage, canManuallySetStage, leadSourceLabel, lifecycleType } from "@/features/lib/rules/lead-pipeline";
import { addLeadNote, drivingFollowUp, setLeadStage } from "@/features/lib/store/actions/leads";
import { Screen } from "@/features/components/layout/screen";
import { Button, EmptyState, NewBadge, RowMenu, Textarea } from "@/features/components/ui";
import { CreateEstimateModal } from "@/features/components/features/estimates/listings/create-estimate-modal";
import { leadDisplay } from "../lead-shared";
import { ScheduleEstimateModal } from "./schedule-estimate-modal";
import { RepaintFollowUpCard } from "./repaint-follow-up-card";

export function LeadDetailsScreen() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const nav = useNav();
  const id = useParam("id");
  const lead = byId(db.leads, id);
  const [schedule, setSchedule] = useState(false);
  const [estimate, setEstimate] = useState(false);
  if (!lead) {
    return (
      <Screen crumbs={[{ label: "Leads", href: "/leads" }, { label: "Lead Details" }]} bare>
        <div className="px-4 py-20 text-center text-gray-400">Lead not found.</div>
      </Screen>
    );
  }
  const d = leadDisplay(db, lead);
  const life = lifecycleType(lead.stage);
  const fu = drivingFollowUp(db, lead);
  const estimator = byId(db.users, lead.assignedUserId);
  const move = (to: PipelineStage) => act(setLeadStage, lead.id, to).ok && toast.success("Lead status updated successfully");
  const canSchedule = (lead.stage === "contacted" || lead.stage === "estimate_scheduled") && !lead.estimateId && can(user, "calendar.manage");
  const menu = [
    ...(canArchiveStage(lead.stage) && !fu && can(user, "lead.update") ? [{ label: "Archive Lead", onSelect: () => { if (act(setLeadStage, lead.id, "archived").ok) { toast.success("Lead archived"); nav.push("/leads"); } } }] : []),
    { label: "View Contact", onSelect: () => nav.push(contactHref(lead.customerId)) },
  ];

  return (
    <Screen crumbs={[{ label: "Leads", href: "/leads" }, { label: "Lead Details" }]} bare>
      <div className="mx-auto w-full overflow-y-auto px-4 py-8 md:px-6 lg:px-8">
        <AppLink href="/leads" className="mb-6 flex items-center gap-2 text-sm font-bold text-gray-500 transition-colors hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> Back to Pipeline
        </AppLink>

        <div className="mb-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col items-start justify-between gap-6 lg:flex-row">
            <div className="flex min-w-0 items-center gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-100 text-2xl font-bold text-blue-600 md:h-20 md:w-20 md:text-3xl">{d.name.charAt(0)}</div>
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-3">
                  <h1 className="font-heading text-2xl font-extrabold leading-tight text-gray-900 md:text-3xl">{d.name}</h1>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide", life.color)}>{life.label}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
                  <span className="flex items-center gap-1"><MapPin className="h-4 w-4 text-gray-400" /> {d.place}</span>
                  {lead.source === "repaint_alert"
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-800"><BellRing className="h-3 w-3" /> Repaint alert <NewBadge feature={29} /></span>
                    : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600">{leadSourceLabel(lead)}</span>}
                  <span className="text-gray-400">Created: {date(lead.createdAt)}</span>
                  {lead.scheduledAt && estimator && (
                    <span className="flex items-center gap-1.5 rounded-md border border-primary-100 bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700"><Calendar className="h-3.5 w-3.5" /> {dateTime(lead.scheduledAt)} with {estimator.name}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 self-start lg:self-center" data-tour="lead-actions">
              {canSchedule && (
                <Button className="h-12" onClick={() => setSchedule(true)}>
                  {lead.scheduledAt ? <><RefreshCw className="h-5 w-5" /> Reschedule</> : <><Calendar className="h-5 w-5" /> Schedule</>}
                </Button>
              )}
              {lead.estimateId ? (
                <AppLink href={estimateHref(lead.estimateId)} className="flex items-center gap-2 whitespace-nowrap rounded-xl border border-gray-200 bg-white px-4 py-2.5 font-bold text-gray-700 shadow-sm hover:bg-gray-50">
                  <FileText className="h-5 w-5" /> {lead.estimateId}
                </AppLink>
              ) : lead.stage === "estimate_scheduled" && can(user, "estimate.create") && (
                <Button variant="primary" className="h-12 shadow-xl shadow-primary-500/20" onClick={() => setEstimate(true)}><Plus className="h-5 w-5" /> Create New Estimate</Button>
              )}
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm"><RowMenu items={menu} /></div>
            </div>
          </div>

          <div className="mt-8 border-t border-gray-100 pt-8">
            {fu && <div className="mb-3 flex items-center gap-2 text-xs text-primary-800"><BellRing className="h-3.5 w-3.5" /> The stage follows repaint follow-up {fu.id}. <NewBadge feature={29} /></div>}
            <div className="no-scrollbar flex w-full gap-1 overflow-x-auto rounded-xl bg-gray-50 p-1">
              {PIPELINE_STEPS.map((step) => {
                const active = lead.stage === step;
                const selectable = !fu && canManuallySetStage(lead.stage, step);
                const clickable = selectable && !active && can(user, "lead.update");
                return (
                  <button key={step} type="button" disabled={!clickable} onClick={() => clickable && move(step)}
                    title={!selectable && !active ? (fu ? `Set by follow-up ${fu.id}` : "Set by the estimate lifecycle — not editable manually") : undefined}
                    className={cn("flex min-w-[100px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-3 text-center text-sm font-bold transition-all",
                      clickable ? "cursor-pointer" : "cursor-default",
                      active ? "bg-white text-blue-600 shadow-sm ring-1 ring-black/5" : !selectable ? "text-gray-400 opacity-60" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700")}>
                    {active && <Check className="h-4 w-4" />}
                    {!active && !selectable && <Lock className="h-3 w-3" />}
                    {LIVE_LEAD_STATUS[step]}
                  </button>
                );
              })}
            </div>
            {lead.stage === "archived" && <p className="mt-2 text-xs text-gray-500">Archived. {lead.note}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
          <div className="space-y-8">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-2 text-gray-500"><User className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-widest">Contact Information</span></div>
              <div className="space-y-4">
                <InfoRow icon={<Phone className="h-5 w-5" />} tint="bg-blue-100 text-blue-600" label="Phone" value={d.phone ?? "-"} />
                <InfoRow icon={<Mail className="h-5 w-5" />} tint="bg-purple-100 text-purple-600" label="Email" value={d.email ?? "-"} />
              </div>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-2 text-gray-500"><MapPin className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-widest">Job Location</span></div>
              <div className="mb-6 rounded-xl border border-gray-100 bg-gray-50 p-5">
                <div className="mb-1 text-lg font-bold text-gray-900">{d.street ?? "No address provided"}</div>
                <div className="text-gray-500">{[d.city, [d.state, d.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</div>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                <span className="text-sm font-medium text-gray-500">Auto-ID</span>
                <span className="rounded bg-gray-100 px-2 py-1 font-mono text-xs font-bold text-gray-600">{lead.id}</span>
              </div>
            </div>
          </div>
          <div className="space-y-8 lg:col-span-2">
            <RepaintFollowUpCard lead={lead} />
            <Notes leadId={lead.id} />
          </div>
        </div>
      </div>
      <ScheduleEstimateModal open={schedule} onOpenChange={setSchedule} lead={lead} />
      <CreateEstimateModal open={estimate} onOpenChange={setEstimate} leadId={lead.id} />
    </Screen>
  );
}

function InfoRow({ icon, tint, label, value }: { icon: React.ReactNode; tint: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-4">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", tint)}>{icon}</div>
      <div className="min-w-0">
        <div className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</div>
        <div className="truncate text-lg font-bold text-gray-900">{value}</div>
      </div>
    </div>
  );
}

/** Live NotesSection: add a note, newest first. The lead's original note is shown last. */
function Notes({ leadId }: { leadId: string }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const lead = byId(db.leads, leadId)!;
  const [text, setText] = useState("");
  const add = () => {
    if (act(addLeadNote, leadId, text).ok) { setText(""); toast.success("Note added successfully"); }
  };
  const notes = [...(lead.notes ?? []), ...(lead.note ? [{ id: "orig", at: lead.createdAt, by: undefined as string | undefined, text: lead.note }] : [])];
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center gap-2 text-gray-500"><MessageSquare className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-widest">Notes</span></div>
      {can(user, "lead.update") && (
        <div className="mb-6">
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note about this lead..." />
          <div className="mt-2 flex justify-end"><Button variant="primary" onClick={add} disabled={!text.trim()}>Add Note</Button></div>
        </div>
      )}
      {notes.length === 0 ? <EmptyState title="No notes yet" /> : (
        <div className="space-y-4">
          {notes.map((n) => (
            <div key={n.id} className="rounded-xl bg-gray-50 p-4">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-gray-400"><span className="font-bold text-gray-600">{byId(db.users, n.by)?.name ?? "Lead intake"}</span><span>{dateTime(n.at)}</span></div>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{n.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
