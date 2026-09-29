"use client";
/**
 * Lead Pipeline — live route /leads (features/(main)/leads/listings).
 *
 * Existing: "Lead Pipeline" header, View Archived and Add New Lead, the
 * search and Board/Table toggle (?view=table), the six kanban columns with
 * drag and drop under the live status rules, the lead card (next stage,
 * archive), the table and the archived view with Restore.
 * NEW (29): the "Repaint alert" source. A lead worked by an open repaint
 * follow-up takes its stage from the follow-up (decision D5).
 * NEW (34): Website Lead Review — website-form leads, the review list and
 * the simulated form, moved here from /marketing/leads.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Archive, ArrowRight, BellRing, Calendar, FileText, Globe, GripVertical, LayoutGrid, List, Mail, MapPin, Phone, RotateCcw, Search, UserPlus } from "lucide-react";
import type { Lead, PipelineStage } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { AppLink, useNav, useParam } from "@/features/lib/navigation";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { date, dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { estimateHref, leadHref } from "@/features/lib/hrefs";
import {
  LIVE_LEAD_STATUS, NEXT_STAGE, PIPELINE_COLUMNS, canArchiveStage, canManuallySetStage, leadSourceLabel, lifecycleType, refusedMoveMessage,
} from "@/features/lib/rules/lead-pipeline";
import { drivingFollowUp, setLeadStage } from "@/features/lib/store/actions/leads";
import { Screen } from "@/features/components/layout/screen";
import { Button, EmptyState, Input, NewBadge, StatusPill, Tooltip } from "@/features/components/ui";
import { leadDisplay, timeAgo } from "../lead-shared";
import { LeadFormModal } from "./lead-form-modal";
import { WebsiteLeadsPanel } from "./website-leads-panel";

const STATUS_TONE: Record<PipelineStage, "blue" | "purple" | "amber" | "green" | "red" | "gray"> = {
  new_lead: "blue", contacted: "purple", estimate_scheduled: "amber", pending: "purple", sold: "green", lost: "red", archived: "gray",
};

export function LeadsListScreen() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const nav = useNav();
  const viewParam = useParam("view");
  const view = viewParam === "table" ? "table" : viewParam === "website" ? "website" : "kanban";
  const [archived, setArchived] = useState(false);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const openReviews = db.leads.filter((l) => l.review?.status === "open").length;

  const leads = useMemo(() => db.leads
    .filter((l) => (l.stage === "archived") === archived)
    .filter((l) => {
      const d = leadDisplay(db, l);
      return [d.name, d.email, d.city, l.id].join(" ").toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db, archived, q]);

  const move = (id: string, to: PipelineStage) => {
    if (act(setLeadStage, id, to).ok) toast.success(to === "contacted" && byId(db.leads, id)?.stage === "archived" ? "Lead restored successfully" : "Lead status updated successfully");
  };
  const setView = (v: "kanban" | "table" | "website") => nav.push(v === "kanban" ? "/leads" : `/leads?view=${v}`);

  return (
    <Screen crumbs={[{ label: "Leads" }]} bare>
      <div id="leads-pipeline-board" className="w-full flex-1 overflow-auto bg-gray-100 px-4 py-8 md:px-6 lg:px-8">
        <div className="mb-8 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <h1 className="mb-4 font-heading text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Lead Pipeline</h1>
            <p className="text-lg text-gray-600">Manage potential customers from initial contact to booked job.</p>
          </div>
          <div className="flex w-full flex-wrap gap-3 lg:w-auto">
            <Button onClick={() => setArchived(!archived)} className={cn("h-14 w-full lg:w-auto", archived && "bg-gray-200 shadow-inner")}>
              <Archive className="h-5 w-5" /> {archived ? "View Active" : "View Archived"}
            </Button>
            {can(user, "lead.create") && (
              <Button variant="primary" className="h-14 w-full shadow-xl shadow-primary-500/20 lg:w-auto" onClick={() => setAdding(true)} data-tour="leads-add">
                <UserPlus className="h-5 w-5" /> Add New Lead
              </Button>
            )}
          </div>
        </div>

        <div className="mb-6 flex flex-col items-center justify-between gap-4 lg:flex-row">
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads by name, email, or city..." className="h-10 rounded-xl pl-9" />
          </div>
          <div className="flex w-full self-start rounded-xl border border-gray-200 bg-gray-100 p-1 lg:w-auto lg:self-auto">
            {([["kanban", "Board", <LayoutGrid key="b" className="h-5 w-5" />], ["table", "Table", <List key="t" className="h-5 w-5" />]] as const).map(([v, label, icon]) => (
              <button key={v} type="button" onClick={() => setView(v)} title={`${label} View`}
                className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg p-2 transition-all lg:flex-none", view === v ? "bg-white text-primary-700 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
                {icon}<span className="hidden text-xs font-bold uppercase sm:inline">{label}</span>
              </button>
            ))}
            <button type="button" onClick={() => setView("website")} title="Website Lead Review" data-tour="leads-website"
              className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg p-2 transition-all lg:flex-none", view === "website" ? "bg-white text-primary-700 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
              <Globe className="h-5 w-5" /><span className="hidden text-xs font-bold uppercase sm:inline">Website</span>
              {openReviews > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-700">{openReviews}</span>}
              <NewBadge feature={34} />
            </button>
          </div>
        </div>

        {archived && view !== "website" && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-100 p-4">
            <span className="flex items-center gap-2 font-bold text-gray-700"><Archive className="h-5 w-5" /> Archived Leads</span>
            <span className="text-sm text-gray-500">Showing {leads.length} archived items</span>
          </div>
        )}

        {view === "website" ? <WebsiteLeadsPanel />
          : archived ? <ArchivedView leads={leads} onRestore={(id) => move(id, "contacted")} />
            : view === "table" ? <LeadsTable leads={leads} />
              : <KanbanBoard leads={leads} onMove={move} />}
      </div>
      <LeadFormModal open={adding} onOpenChange={setAdding} onCreated={(id) => nav.push(leadHref(id))} />
    </Screen>
  );
}

function KanbanBoard({ leads, onMove }: { leads: Lead[]; onMove: (id: string, to: PipelineStage) => void }) {
  const user = useCurrentUser();
  const canUpdate = can(user, "lead.update");
  const [dragged, setDragged] = useState<Lead>();
  const [over, setOver] = useState<PipelineStage>();
  const drop = (to: PipelineStage) => {
    if (dragged && dragged.stage !== to) {
      if (!canManuallySetStage(dragged.stage, to)) toast.error("Can't move this lead", refusedMoveMessage(to));
      else onMove(dragged.id, to);
    }
    setDragged(undefined);
    setOver(undefined);
  };
  return (
    <div className="overflow-x-auto scroll-smooth pb-8" data-tour="leads-board">
      <div className="flex h-full min-w-[1000px] gap-6">
        {PIPELINE_COLUMNS.map((stage) => {
          const list = leads.filter((l) => l.stage === stage.id);
          const allowed = dragged ? canManuallySetStage(dragged.stage, stage.id) : true;
          return (
            <div key={stage.id}
              onDragOver={(e) => { e.preventDefault(); if (dragged && over !== stage.id) setOver(stage.id); }}
              onDrop={(e) => { e.preventDefault(); drop(stage.id); }}
              className={cn("flex min-w-[280px] max-w-[350px] flex-1 flex-col rounded-2xl border bg-gray-50/50 transition-colors",
                over === stage.id && allowed ? "border-primary-300 bg-primary-50/80 ring-2 ring-primary-200" : "border-transparent",
                dragged && over !== stage.id && allowed && "border-dashed border-gray-300",
                dragged && !allowed && "opacity-60")}>
              <div className={cn("mb-4 flex items-center justify-between rounded-t-2xl border-b-4 bg-white p-4 shadow-sm", stage.border)}>
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-900">{stage.label}</h3>
                <span className={cn("rounded-full px-2 py-1 text-xs font-bold", stage.color)}>{list.length}</span>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-2 pb-4">
                {list.map((l) => <LeadCard key={l.id} lead={l} draggable={canUpdate} onDragStart={() => setDragged(l)} onMove={onMove} />)}
                {list.length === 0 && (
                  <div className={cn("flex h-24 items-center justify-center rounded-xl border-2 border-dashed text-sm font-medium italic text-gray-300", over === stage.id ? "border-primary-300 bg-primary-50/50" : "border-gray-200")}>Drop leads here</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadCard({ lead, draggable, onDragStart, onMove }: { lead: Lead; draggable: boolean; onDragStart: () => void; onMove: (id: string, to: PipelineStage) => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const nav = useNav();
  const d = leadDisplay(db, lead);
  const life = lifecycleType(lead.stage);
  const fu = drivingFollowUp(db, lead);
  const next = fu ? null : NEXT_STAGE[lead.stage];
  const estimator = byId(db.users, lead.assignedUserId);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div draggable={draggable && !fu} onDragStart={onDragStart} onClick={() => nav.push(leadHref(lead.id))}
      className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-primary-300 hover:shadow-md">
      <div className="absolute right-4 top-4 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100"><GripVertical className="h-4 w-4" /></div>
      <div className="mb-3">
        <div className="mb-1 pr-6 text-lg font-bold leading-tight text-gray-900">{d.name}</div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /><span className="max-w-[180px] truncate">{d.place}</span></span>
          <span className={cn("rounded-full px-2 py-0.5 text-xxs font-bold uppercase tracking-wide", life.color)}>{life.label}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="whitespace-nowrap text-xxs font-bold text-gray-600">{lead.id}</span>
          {lead.estimateId && (
            <AppLink href={estimateHref(lead.estimateId)} onClick={stop} className="inline-flex items-center rounded border border-primary-100 bg-primary-50 px-2 py-0.5 text-xxs font-medium text-primary-700 hover:bg-primary-100">
              <FileText className="mr-1 h-3 w-3" />{lead.estimateId}
            </AppLink>
          )}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip><Calendar className="mr-1 h-3 w-3 text-gray-400" />{date(lead.createdAt)}</Chip>
        {lead.source === "repaint_alert"
          ? <span className="inline-flex items-center gap-1 rounded border border-primary-200 bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-800"><BellRing className="h-3 w-3" /> Repaint alert <NewBadge feature={29} /></span>
          : <Chip>{leadSourceLabel(lead)}</Chip>}
        <Chip>{timeAgo(lead.createdAt)}</Chip>
      </div>
      {lead.scheduledAt && estimator ? (
        <AppLink href="/calendar" onClick={stop} className="mb-4 inline-flex items-center gap-1.5 rounded-md border border-primary-100 bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100">
          <Calendar className="h-3.5 w-3.5 shrink-0" /><span>{dateTime(lead.scheduledAt)} with {estimator.name}</span>
        </AppLink>
      ) : lead.stage === "estimate_scheduled" ? (
        <Tooltip content="Won't appear on the Calendar until scheduled with an estimator.">
          <div className="mb-4 inline-flex cursor-help items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-800"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> No estimator assigned</div>
        </Tooltip>
      ) : null}
      {fu && (
        <div className="mb-3 flex items-center gap-1.5 rounded-md border border-primary-100 bg-primary-50/60 px-2 py-1 text-xs text-primary-800">
          <BellRing className="h-3 w-3 shrink-0" /> Stage follows repaint follow-up {fu.id}
        </div>
      )}
      <div className="flex items-center justify-between border-t border-gray-50 pt-3">
        <div className="flex gap-1">
          <button type="button" onClick={stop} title={d.phone ?? ""} className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"><Phone className="h-4 w-4" /></button>
          <button type="button" onClick={stop} title={d.email ?? ""} className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"><Mail className="h-4 w-4" /></button>
        </div>
        {can(user, "lead.update") && !fu && (
          <div className="flex items-center gap-2">
            {canArchiveStage(lead.stage) && (
              <button type="button" title="Archive Lead" onClick={(e) => { stop(e); onMove(lead.id, "archived"); }} className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><Archive className="h-4 w-4" /></button>
            )}
            {next && (
              <button type="button" title={`Move to ${LIVE_LEAD_STATUS[next]}`} onClick={(e) => { stop(e); onMove(lead.id, next); }} className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"><ArrowRight className="h-4 w-4" /></button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{children}</span>;
}

function LeadsTable({ leads }: { leads: Lead[] }) {
  const db = useDb((d) => d);
  const nav = useNav();
  const th = "px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider text-gray-500";
  const td = "px-4 py-3 text-sm text-gray-700";
  if (leads.length === 0) return <EmptyState title="No leads found" />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[980px]">
        <thead className="border-b border-gray-100 bg-gray-50/60"><tr>{["Lead #", "Lead Name", "Status", "Estimate", "Contact", "Location", "Source", "Created"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">
          {leads.map((l) => {
            const d = leadDisplay(db, l);
            const life = lifecycleType(l.stage);
            return (
              <tr key={l.id} className="cursor-pointer hover:bg-gray-50" onClick={() => nav.push(leadHref(l.id))}>
                <td className={cn(td, "text-xs font-medium text-gray-500")}>{l.id}</td>
                <td className={td}><div className="text-base font-bold text-gray-900">{d.name}</div><span className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-xxs font-bold uppercase tracking-wide", life.color)}>{life.label}</span></td>
                <td className={td}><StatusPill tone={STATUS_TONE[l.stage]}>{LIVE_LEAD_STATUS[l.stage]}</StatusPill></td>
                <td className={td}>{l.estimateId ? <AppLink href={estimateHref(l.estimateId)} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:underline"><FileText className="h-3.5 w-3.5" />{l.estimateId}</AppLink> : "-"}</td>
                <td className={td}>{d.phone && <div className="flex items-center gap-1.5 text-xs"><Phone className="h-3 w-3 text-gray-400" />{d.phone}</div>}{d.email && <div className="flex items-center gap-1.5 text-xs"><Mail className="h-3 w-3 text-gray-400" />{d.email}</div>}</td>
                <td className={td}>{d.place}</td>
                <td className={td}>{l.source === "repaint_alert" ? <span className="inline-flex items-center gap-1">Repaint alert</span> : leadSourceLabel(l)}</td>
                <td className={cn(td, "whitespace-nowrap")}>{date(l.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ArchivedView({ leads, onRestore }: { leads: Lead[]; onRestore: (id: string) => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {leads.map((l) => {
        const d = leadDisplay(db, l);
        const fu = drivingFollowUp(db, l);
        return (
          <div key={l.id} className="rounded-xl border border-gray-200 bg-white p-6 opacity-90 shadow-sm transition-opacity hover:opacity-100">
            <AppLink href={leadHref(l.id)} className="font-bold text-gray-900 hover:text-primary-700">{d.name}</AppLink>
            <div className="text-sm text-gray-500">{d.email}</div>
            {l.note && <div className="mt-2 line-clamp-2 text-xs text-gray-500">{l.note}</div>}
            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
              <StatusPill tone="gray">Archived</StatusPill>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{timeAgo(l.createdAt)}</span>
                {can(user, "lead.update") && !fu && <Button size="sm" onClick={() => onRestore(l.id)}><RotateCcw className="h-3.5 w-3.5" /> Restore</Button>}
              </div>
            </div>
          </div>
        );
      })}
      {leads.length === 0 && <div className="col-span-full py-12 text-center italic text-gray-400">No archived leads found matching search.</div>}
    </div>
  );
}
