"use client";
/**
 * Estimates — live route /estimates (features/(main)/estimates/listings).
 *
 * Existing: "Estimates" header with "+ Create New Estimate", the four stats
 * cards, search and status filter, and one row per estimate (date box,
 * name, number, client, lead chip, Status, Type, Total Value, View).
 * NEW (feature 28): the "From history" filter for repeat estimates.
 */
import { useState } from "react";
import { CheckCircle2, Clock, DollarSign, Eye, FilePen, FileText, Plus, Search, Send, Users, XCircle } from "lucide-react";
import type { EstimateStatus } from "@/features/types";
import { useCurrentUser, useDb } from "@/features/lib/store";
import { AppLink, useNav } from "@/features/lib/navigation";
import { estimateHref, leadHref } from "@/features/lib/hrefs";
import { ESTIMATE_STATUS_LABEL, ESTIMATE_STATUS_TONE } from "@/features/lib/rules/estimate-lifecycle";
import { byId } from "@/features/lib/selectors";
import { can } from "@/features/lib/permissions";
import { money } from "@/features/lib/format";
import { cn } from "@/features/lib/cn";
import { Screen } from "@/features/components/layout/screen";
import { Button, EmptyState, Input, NewBadge, Select, StatusPill } from "@/features/components/ui";
import { CreateEstimateModal } from "./create-estimate-modal";

const ICON: Partial<Record<EstimateStatus, React.ReactNode>> = {
  SENT: <Send className="h-3 w-3" />,
  VIEWED: <Eye className="h-3 w-3" />,
  ACCEPTED: <CheckCircle2 className="h-3 w-3" />,
  AMENDED_DRAFT: <FilePen className="h-3 w-3" />,
  PENDING_REAPPROVAL: <Clock className="h-3 w-3" />,
  DECLINED: <XCircle className="h-3 w-3" />,
};

type Filter = "all" | EstimateStatus | "from_history";

export function EstimatesListScreen() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const nav = useNav();
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const drafts = db.estimates.filter((e) => e.status === "DRAFT" || e.status === "AMENDED_DRAFT");
  const pending = db.estimates.filter((e) => ["SENT", "VIEWED", "PENDING_REAPPROVAL"].includes(e.status));
  const approved = db.estimates.filter((e) => e.status === "ACCEPTED");
  const pipeline = [...drafts, ...pending].reduce((a, e) => a + e.total, 0);

  const list = [...db.estimates]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((e) => filter === "all" || (filter === "from_history" ? e.isRepaint || !!e.repeatEstimateId : e.status === filter))
    .filter((e) => [e.id, e.title, byId(db.customers, e.customerId)?.name, e.leadId].join(" ").toLowerCase().includes(q.toLowerCase()));

  const stats = [
    { label: "Draft Proposals", value: drafts.length, sub: "In progress", icon: <FileText /> },
    { label: "Sent / Pending", value: pending.length, sub: "Awaiting approval", icon: <Clock /> },
    { label: "Approved", value: approved.length, sub: "Ready for work", icon: <CheckCircle2 /> },
    { label: "Pipeline Value", value: money(pipeline), sub: "Total active value", icon: <DollarSign /> },
  ];

  return (
    <Screen crumbs={[{ label: "Estimates" }]} bare>
      <div className="mx-auto w-full px-4 py-8 md:px-8 lg:px-12">
        <div className="mb-8 flex flex-col items-start justify-between gap-6 md:mb-10 md:flex-row md:items-end">
          <div>
            <h1 className="mb-3 font-heading text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Estimates</h1>
            <p className="text-lg font-medium text-gray-500">Manage your proposals, track status, and win more work.</p>
          </div>
          {can(user, "estimate.create") && (
            <Button variant="primary" className="h-12 w-full justify-center px-6 text-sm font-bold shadow-xl shadow-primary-500/20 md:w-auto" onClick={() => setCreating(true)} data-tour="create-estimate">
              <Plus className="h-5 w-5" /> Create New Estimate
            </Button>
          )}
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xxs font-bold uppercase tracking-widest text-gray-500 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-gray-400">{s.icon} {s.label}</div>
              <div className="mt-2 font-heading text-2xl font-black text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500">{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search estimates..." className="h-11 pl-9" />
          </div>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="h-11 md:w-56" aria-label="Status">
            <option value="all">All Statuses</option>
            {(Object.keys(ESTIMATE_STATUS_LABEL) as EstimateStatus[]).map((s) => <option key={s} value={s}>{ESTIMATE_STATUS_LABEL[s]}</option>)}
            <option value="from_history">From history (repeat work) · NEW</option>
          </Select>
          {filter === "from_history" && <NewBadge feature={28} />}
        </div>

        <div className="space-y-3">
          {list.length === 0 && <EmptyState icon={<FileText />} title="No estimates found" body="Try another search or filter." />}
          {list.map((e) => {
            const c = byId(db.customers, e.customerId);
            const d = new Date(e.estimateDate ?? e.createdAt);
            return (
              <div key={e.id} role="link" tabIndex={0} onClick={() => nav.push(estimateHref(e.id))} onKeyDown={(ev) => ev.key === "Enter" && nav.push(estimateHref(e.id))} className="block cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
                <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:flex-row md:items-center md:p-5">
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-gray-100 bg-gray-50">
                      <span className="text-xxs font-bold uppercase leading-none text-gray-500">{d.toLocaleString(undefined, { month: "short" })}</span>
                      <span className="my-0.5 text-xl font-black leading-none text-gray-900">{d.getDate()}</span>
                      <span className="text-xs font-medium leading-none text-gray-500">{d.getFullYear()}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-extrabold text-gray-900">{e.title}</h3>
                        {(e.isRepaint || e.repeatEstimateId) && <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-bold text-indigo-700">From history</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono font-medium text-gray-600">{e.id}</span>
                        <span className="font-medium">{c?.name}</span>
                        {e.leadId && (
                          <span onClick={(ev) => ev.stopPropagation()}>
                            <AppLink href={leadHref(e.leadId)} className="inline-flex items-center gap-1 rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-xxs font-medium text-blue-700 hover:bg-blue-100">
                              <Users className="h-3 w-3" /> {e.leadId}
                            </AppLink>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-6 md:justify-end md:gap-8">
                    <div className="flex w-32 flex-col gap-1">
                      <span className="text-xxs font-bold uppercase tracking-wider text-gray-500">Status</span>
                      <StatusPill tone={ESTIMATE_STATUS_TONE[e.status]} className="w-fit">{ICON[e.status]}{ESTIMATE_STATUS_LABEL[e.status]}</StatusPill>
                    </div>
                    <div className="hidden w-28 flex-col gap-1 lg:flex">
                      <span className="text-xxs font-bold uppercase tracking-wider text-gray-500">Type</span>
                      <span className="truncate text-sm font-bold text-gray-700">{typeName(db.jobs.find((j) => j.id === e.jobId)?.jobType)}</span>
                    </div>
                    <div className="flex min-w-28 flex-col items-end gap-1 text-right">
                      <span className="text-xxs font-bold uppercase tracking-wider text-gray-500">Total Value</span>
                      <span className="text-sm font-black text-gray-900">{money(e.total, { cents: true })}</span>
                    </div>
                    <span className={cn("hidden h-8 items-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold text-gray-600 shadow-sm md:inline-flex")}>View</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <CreateEstimateModal open={creating} onOpenChange={setCreating} />
    </Screen>
  );
}

function typeName(t?: string) {
  return t === "exterior_repaint" ? "Exterior" : t === "interior_repaint" ? "Interior" : t === "mixed" ? "Int. & Ext." : t === "new_construction" ? "New Build" : "—";
}
