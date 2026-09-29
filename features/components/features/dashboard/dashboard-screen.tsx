"use client";
/**
 * Dashboard — live route /dashboard (features/(main)/dashboard).
 *
 * Existing: "Hi, {name}" header with Customize, the period filter and
 * Create (New Lead, New Estimate); the widget grid (DEFAULT_WIDGET_CARDS),
 * rebuilt with the prototype data: My Tasks, Recent Leads, Jobs To Do,
 * Pending Sales, Win Rate, Revenue, Invoices Due, Estimate Status, Monthly
 * Goal, Active Jobs, Pipeline.
 * NEW widgets (each with its own endpoint, like the live ones):
 *   repaint-alerts (27, 29), change-order-exceptions (24),
 *   supplier-order-exceptions (19), time-to-approve (22).
 * The "Demo journey" card is prototype-only: it is not part of the live app.
 */
import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Activity, AlertTriangle, BellRing, Briefcase, CheckSquare, ChevronDown, ChevronRight, CircleDollarSign, Compass, FileDiff, Filter, Gauge, ListChecks, PackageSearch,
  Plus, Settings2, Sparkles, Target, Timer, TrendingUp, Users,
} from "lucide-react";
import type { Database, User } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { AppLink, useParam } from "@/features/lib/navigation";
import { byId, propertyAddress } from "@/features/lib/selectors";
import { contactHref, estimateHref, jobHref, leadHref, reportsHref, workOrderHref } from "@/features/lib/hrefs";
import { fail, nextId, ok } from "@/features/lib/store/helpers";
import { now } from "@/features/lib/clock";
import { ackException } from "@/features/lib/rules/procurement";
import { alertQueueState } from "@/features/lib/rules/alerts";
import { can } from "@/features/lib/permissions";
import { date, money } from "@/features/lib/format";
import { cn } from "@/features/lib/cn";
import { canResume, useTour } from "@/features/lib/tour";
import { useStartTour } from "@/features/components/tour/product-tour";
import { Screen } from "@/features/components/layout/screen";
import { Button, Checkbox, Drawer, Input, NewBadge, Select } from "@/features/components/ui";
import { ChangeOrderExceptionsPanel } from "@/features/components/features/change-orders/exceptions-panel";
import { JOB_STATUS_DISPLAY } from "@/features/components/features/jobs/details/job-details-screen";
import { LEAD_STAGE } from "@/features/components/features/contacts/details/contact-shared";
import { usText } from "@/features/lib/display-text";

/** Live tasks widget: POST /tasks, PATCH /tasks/:id { isCompleted }. */
function addTask(db: Database, _actor: User, title: string) {
  if (!title.trim()) return fail("Enter a task first.");
  db.tasks.unshift({ id: nextId(db, "task", "T-"), title: title.trim(), done: false, createdAt: now() });
  return ok();
}
function toggleTask(db: Database, _actor: User, id: string) {
  const t = db.tasks.find((x) => x.id === id);
  if (t) t.done = !t.done;
  return ok();
}

/** The demo journey (prototype-only), in the order the client asked for. */
export const JOURNEY: { title: string; body: string; href: string; features?: string }[] = [
  { title: "Lead", body: "Lead Pipeline › Olivia Bennett, estimate appointment booked", href: leadHref("LEAD-2026-10") },
  { title: "Estimate", body: "Create New Estimate on her lead (or Estimates › Create New Estimate)", href: leadHref("LEAD-2026-10") },
  { title: "Color card", body: "Add New Color with coats, primer and tint base", href: "/estimates", features: "3" },
  { title: "Scope", body: "Add an area and line items, paint them with the color", href: "/estimates" },
  { title: "Accept", body: "Send, then Client Preview › Accept Estimate with a signature", href: "/estimates", features: "3" },
  { title: "Job, work order, draft invoice", body: "Created on acceptance: Pending Deposit", href: "/work-orders" },
  { title: "Schedule", body: "Confirm Deposit, then Schedule", href: "/work-orders" },
  { title: "Start job", body: "Start Job on the work order; clock the crew in", href: workOrderHref("WO-2026-1", "section-materials"), features: "18, 19, 22" },
  { title: "Log hours", body: "Log Hours with crew member, date, start and end", href: workOrderHref("WO-2026-1"), features: "22" },
  { title: "Mark complete with closeout", body: "WO-2026-5: confirm surfaces, then Close job", href: workOrderHref("WO-2026-5"), features: "25" },
  { title: "Paint history", body: "The closed job's surfaces on the contact's Paint History tab", href: contactHref("C-STEVEN", "paint-history"), features: "25" },
  { title: "QR", body: "Generate, send and print the customer's QR record", href: contactHref("C-ELENA", "paint-history", { view: "qr" }), features: "26" },
  { title: "Repaint alert", body: "RA-1001 › Convert: check address, owner and opportunity", href: "/repaint-alerts?alert=RA-1001", features: "27" },
  { title: "Follow-up lead", body: "It opens a Repaint alert lead in New Leads; its stage follows the follow-up", href: "/leads", features: "29" },
  { title: "New estimate from history", body: "On that lead: New Estimate from History, pick surfaces, book on the same lead", href: "/leads", features: "28" },
];
export const ALSO_NEW = [
  { label: "Change orders (24)", href: estimateHref("EST-2026-1", "section-change-orders") },
  { label: "Supplier orders (19)", href: "/supplier-orders" },
  { label: "Time & payroll (22)", href: "/time" },
  { label: "Job performance (21)", href: reportsHref("job_performance") },
  { label: "Estimating feedback (30)", href: reportsHref("estimating_feedback") },
  { label: "Accounting (33)", href: "/accounting" },
  { label: "Marketing (34)", href: "/marketing" },
  { label: "Repaint intervals (27)", href: "/settings/repaint-intervals" },
];

function Widget({ icon, title, color = "text-primary-600", href, isNew, feature, children, className, tour }: {
  icon: React.ReactNode; title: string; color?: string; href?: string; isNew?: boolean; feature?: number | number[]; children: React.ReactNode; className?: string; tour?: string;
}) {
  return (
    <div className={cn("rounded-2xl border bg-white p-5 shadow-sm", isNew ? "border-green-300 ring-1 ring-green-100" : "border-gray-200", className)} data-tour={tour}>
      <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-2">
        <h3 className={cn("flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-500 [&>svg]:h-4 [&>svg]:w-4", `[&>svg]:${color}`)}>
          <span className={color}>{icon}</span> {title} {isNew && <NewBadge feature={feature} />}
        </h3>
        {href && <AppLink href={href} className="text-gray-300 hover:text-primary-600" aria-label={`View ${title}`}><ChevronRight className="h-4 w-4" /></AppLink>}
      </div>
      {children}
    </div>
  );
}

export function DashboardScreen() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [task, setTask] = useState("");
  const [customize, setCustomize] = useState(false);
  const [coPanel, setCoPanel] = useState(useParam("open") === "co-exceptions");
  const startTour = useStartTour();
  const tourStop = useTour((s) => s.stop);
  const resumable = useTour((s) => !s.active && canResume(s));
  const nowIso = now();

  const liveJobs = db.jobs.filter((j) => j.status !== "estimating");
  const pending = db.estimates.filter((e) => ["SENT", "VIEWED", "PENDING_REAPPROVAL"].includes(e.status));
  const sold = db.estimates.filter((e) => e.status === "ACCEPTED");
  const decided = db.estimates.filter((e) => e.status === "ACCEPTED" || e.status === "DECLINED");
  const winRate = decided.length ? sold.length / decided.length : 0;
  const revenue = db.invoices.filter((i) => i.status === "paid").reduce((a, i) => a + i.amount, 0);
  const goal = 25000;
  const active = liveJobs.filter((j) => j.status !== "completed");
  const stages = ["new_lead", "contacted", "estimate_scheduled", "pending", "sold", "lost"] as const;
  const stageColor: Record<string, string> = { new_lead: "bg-blue-500", contacted: "bg-purple-500", estimate_scheduled: "bg-orange-500", pending: "bg-amber-400", sold: "bg-green-500", lost: "bg-red-500" };

  // NEW widgets
  const alerts = db.repaintAlerts.filter((a) => alertQueueState(db, a, nowIso).state === "live");
  const coEx = db.changeOrders.filter((c) => !c.isColourReapproval && (Object.values(c.downstream).includes("failed") || (c.emergency && !c.emergency.writtenConfirmedAt)));
  const poEx = db.purchaseOrders.filter((p) => ackException(p, db.users, nowIso)?.overdue || p.uncertainSend || p.status === "problem");
  const toApprove = db.timeEntries.filter((e) => e.state === "submitted");

  return (
    <Screen crumbs={[{ label: "Home" }, { label: "Dashboard" }]} bare>
      <div className="mx-auto w-full bg-gray-100 px-4 py-8 md:px-8 lg:px-12">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-heading text-3xl font-black tracking-tighter text-gray-900">Hi, {user.name}</h1>
            <p className="text-gray-500">Here&apos;s what&apos;s happening with your <span className="font-bold text-primary-600">projects</span> today.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button className={cn("h-11 rounded-2xl px-4", customize && "border-primary-600 bg-primary-600 text-white hover:bg-primary-700")} onClick={() => setCustomize(!customize)}>
              <Settings2 className="h-4 w-4" /> {customize ? "Done" : "Customize"}
            </Button>
            <Select className="h-11 w-40 rounded-2xl" defaultValue="this_month" aria-label="Period">
              <option value="all_time">All Time</option>
              <option value="this_month">This Month</option>
              <option value="quarterly">Quarterly</option>
              <option value="this_year">This Year</option>
            </Select>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild><Button variant="primary" className="h-11 rounded-2xl px-5"><Plus className="h-4 w-4" /> Create <ChevronDown className="h-3.5 w-3.5" /></Button></DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                  <DropdownMenu.Item asChild><AppLink href="/leads" className="block rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100">New Lead</AppLink></DropdownMenu.Item>
                  <DropdownMenu.Item asChild><AppLink href="/estimates" className="block rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100">New Estimate</AppLink></DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
        {customize && <p className="mb-4 rounded-xl bg-white px-4 py-2 text-sm text-gray-500">Drag widgets anywhere to reorder. Use the Wide/Small button to resize. Click &quot;Done&quot; when finished. (Layout editing is live-app behavior, not rebuilt in the prototype.)</p>}

        {/* Prototype-only demo journey */}
        <div className="mb-6 rounded-2xl border border-dashed border-green-300 bg-gradient-to-r from-green-50/80 to-white p-5" data-tour="walkthrough">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-green-800"><Sparkles className="h-4 w-4" /> Demo journey <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs tracking-wider">Prototype only</span></div>
            <div className="flex gap-2">
              {resumable && <Button size="sm" onClick={() => startTour(true)}>Resume at stop {tourStop + 1}</Button>}
              <Button size="sm" variant="primary" onClick={() => startTour(false)}><Compass className="h-3.5 w-3.5" /> {resumable ? "Start over" : "Start product tour"}</Button>
            </div>
          </div>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {JOURNEY.map((j, i) => (
              <li key={j.title}>
                <AppLink href={j.href} className="group flex h-full items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 hover:border-primary-300">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-gray-900 group-hover:text-primary-700">{j.title}{j.features && <span className="font-medium text-gray-500"> · F{j.features}</span>}</span>
                    <span className="block text-xs text-gray-500">{j.body}</span>
                  </span>
                </AppLink>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-gray-500">Also new:</span>
            {ALSO_NEW.map((a) => <AppLink key={a.label} href={a.href} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 font-semibold text-gray-700 hover:border-primary-300">{a.label}</AppLink>)}
          </div>
          <p className="mt-3 text-xs text-gray-500">Switch roles, pin the clock to business hours or reset the demo data in the Prototype bar (bottom left).</p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
          {/* Left */}
          <div className="space-y-4 lg:col-span-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-500"><CheckSquare className="h-4 w-4 text-primary-500" /> My Tasks</span><span className="text-xs text-gray-500">{db.tasks.filter((t) => t.done).length}/{db.tasks.length}</span></div>
              <form className="relative" onSubmit={(e) => { e.preventDefault(); if (act(addTask, task).ok) setTask(""); }}>
                <Input value={task} onChange={(e) => setTask(e.target.value)} placeholder="Add a task..." className="h-9 pr-10 text-sm" aria-label="New task" />
                <button type="submit" className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-primary-600 text-white" aria-label="Add task"><Plus className="h-3.5 w-3.5" /></button>
              </form>
              <div className="mt-3 max-h-[240px] space-y-2 overflow-y-auto">
                {db.tasks.length === 0 && <p className="text-xs text-gray-500">No tasks yet. Add one above!</p>}
                {db.tasks.map((t) => <div key={t.id} className="rounded-lg border border-gray-100 p-2"><Checkbox checked={t.done} onCheckedChange={() => act(toggleTask, t.id)} label={<span className={cn("text-sm", t.done && "text-gray-500 line-through")}>{usText(t.title)}</span>} /></div>)}
              </div>
            </div>
            {can(user, "time.approve") && (
              <Widget icon={<Timer />} title="Time to Approve" isNew feature={22} href="/time" tour="widget-time">
                <div className="font-heading text-3xl font-black text-gray-900">{toApprove.length}</div>
                <p className="text-xs text-gray-500">submitted crew days waiting for approval. Only approved hours reach payroll and job cost.</p>
              </Widget>
            )}
            <Widget icon={<Users />} title="Recent Leads" href="/leads">
              <div className="space-y-2">
                {[...db.leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4).map((l) => (
                  <AppLink key={l.id} href={leadHref(l.id)} className="flex items-center justify-between gap-2 text-sm hover:text-primary-700">
                    <span className="min-w-0 truncate font-semibold">{byId(db.customers, l.customerId)?.name ?? l.name}</span>
                    <span className="shrink-0 text-xs text-gray-500">{LEAD_STAGE[l.stage]}</span>
                  </AppLink>
                ))}
              </div>
            </Widget>
            <Widget icon={<ListChecks />} title="Jobs To Do" href={reportsHref("production")}>
              <div className="space-y-2">
                {active.slice(0, 4).map((j) => <AppLink key={j.id} href={jobHref(j.id)} className="flex justify-between gap-2 text-sm"><span className="truncate font-semibold">{j.name}</span><span className="shrink-0 text-xs text-gray-500">{j.id}</span></AppLink>)}
              </div>
            </Widget>
          </div>

          {/* Center */}
          <div className="space-y-4 lg:col-span-6">
            <Widget icon={<Filter />} title="Pending Sales" href="/estimates" className="p-6 shadow-lg">
              <div className="space-y-2">
                {pending.length === 0 && <p className="text-sm text-gray-500">No pending estimates.</p>}
                {pending.map((e) => <AppLink key={e.id} href={estimateHref(e.id)} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2 text-sm hover:border-primary-200"><span className="min-w-0 truncate"><b>{byId(db.customers, e.customerId)?.name}</b> · {e.title}</span><b className="shrink-0">{money(e.total)}</b></AppLink>)}
              </div>
            </Widget>
            <div className="grid gap-4 sm:grid-cols-2">
              <Widget icon={<Target />} title="Win Rate"><div className="font-heading text-4xl font-black text-gray-900">{Math.round(winRate * 100)}%</div><p className="text-xs text-gray-500">{sold.length} won of {decided.length} decided</p></Widget>
              <Widget icon={<TrendingUp />} title="Revenue" color="text-green-600"><div className="font-heading text-4xl font-black text-gray-900">{money(revenue)}</div><p className="text-xs text-gray-500">collected this period</p></Widget>
            </div>
            {can(user, "co.exceptions") && (
              <Widget icon={<FileDiff />} title="Change Order Exceptions" color="text-amber-600" isNew feature={24} tour="widget-co-exceptions">
                <div className="flex items-center justify-between gap-3">
                  <div><div className="font-heading text-3xl font-black text-gray-900">{coEx.length}</div><p className="text-xs text-gray-500">failed downstream updates or emergency work waiting for written confirmation (checked daily at 7 a.m.)</p></div>
                  <Button size="sm" onClick={() => setCoPanel(true)}>Open list</Button>
                </div>
              </Widget>
            )}
            {can(user, "supplier.submit") && (
              <Widget icon={<PackageSearch />} title="Supplier Order Exceptions" color="text-red-600" isNew feature={19} href="/supplier-orders?view=exceptions">
                <div className="space-y-1.5">
                  {poEx.length === 0 && <p className="text-sm text-gray-500">No supplier exceptions.</p>}
                  {poEx.slice(0, 4).map((p) => <AppLink key={p.id} href={`/supplier-orders?po=${p.id}`} className="flex items-center justify-between gap-2 text-sm"><span className="inline-flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5 text-red-500" />{p.id}</span><span className="text-xs text-gray-500">{p.uncertainSend ? "Send uncertain" : p.status === "problem" ? "Problem" : "Not acknowledged"}</span></AppLink>)}
                </div>
              </Widget>
            )}
            <Widget icon={<CircleDollarSign />} title="Invoices Due" color="text-green-600" href="/invoices">
              <div className="grid gap-3 md:grid-cols-2">
                {db.invoices.filter((i) => i.status !== "paid" && i.status !== "void").slice(0, 4).map((i) => {
                  const job = byId(db.jobs, i.jobId);
                  return <div key={i.id} className="rounded-2xl border border-gray-100 p-4"><div className="truncate text-sm font-bold">{byId(db.customers, job?.customerId)?.name}</div><div className="text-xxs font-black uppercase text-gray-500">{i.status === "draft" ? "Draft" : `Due ${date(i.createdAt)}`}</div><div className="font-bold text-green-600">{money(i.amount)}</div></div>;
                })}
              </div>
            </Widget>
          </div>

          {/* Right */}
          <div className="space-y-4 lg:col-span-3">
            {can(user, "alerts.queue") && (
              <Widget icon={<BellRing />} title="Repaint Alerts" color="text-amber-600" isNew feature={[27, 29]} href="/repaint-alerts" tour="widget-repaint-alerts">
                <div className="font-heading text-3xl font-black text-gray-900">{alerts.length}</div>
                <p className="mb-2 text-xs text-gray-500">alerts due in the queue</p>
                <div className="space-y-1.5">
                  {alerts.slice(0, 3).map((a) => <AppLink key={a.id} href={`/repaint-alerts?alert=${a.id}`} className="block truncate text-sm font-semibold hover:text-primary-700">{propertyAddress(byId(db.properties, a.propertyId))}</AppLink>)}
                </div>
              </Widget>
            )}
            <Widget icon={<Gauge />} title="Estimate Status">
              {(["DRAFT", "SENT", "ACCEPTED", "DECLINED"] as const).map((s) => <div key={s} className="flex justify-between text-sm"><span className="text-gray-500">{s === "ACCEPTED" ? "Approved" : s.charAt(0) + s.slice(1).toLowerCase()}</span><b>{db.estimates.filter((e) => e.status === s).length}</b></div>)}
            </Widget>
            <Widget icon={<Target />} title="Monthly Goal">
              <div className="text-sm text-gray-500">{money(revenue)} of {money(goal)}</div>
              <div className="mt-2 h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-primary-600" style={{ width: `${Math.min(100, (revenue / goal) * 100)}%` }} /></div>
            </Widget>
            <Widget icon={<Briefcase />} title="Active Jobs" href="/jobs">
              <div className="space-y-2">
                {active.slice(0, 5).map((j) => {
                  const d = JOB_STATUS_DISPLAY[j.status];
                  return <AppLink key={j.id} href={jobHref(j.id)} className="flex items-center justify-between gap-2 text-sm"><span className="truncate font-semibold">{j.name}</span><span className="shrink-0 text-xs text-gray-500">{d?.label}</span></AppLink>;
                })}
              </div>
            </Widget>
            <Widget icon={<Activity />} title="Pipeline" href="/leads">
              {stages.map((s) => {
                const n = db.leads.filter((l) => l.stage === s).length;
                return <div key={s} className="mb-1.5 flex items-center gap-2 text-xs"><span className="w-28 text-gray-500">{LEAD_STAGE[s]}</span><div className="h-2 flex-1 rounded-full bg-gray-100"><div className={cn("h-2 rounded-full", stageColor[s])} style={{ width: `${Math.min(100, n * 12)}%` }} /></div><b className="w-5 text-right">{n}</b></div>;
              })}
            </Widget>
          </div>
        </div>
      </div>
      <Drawer open={coPanel} onOpenChange={setCoPanel} width="max-w-4xl" title={<span className="inline-flex items-center gap-2">Change Order Exceptions <NewBadge feature={24} /></span>} subtitle="Daily 7 a.m. list for the office manager">
        <ChangeOrderExceptionsPanel />
      </Drawer>
    </Screen>
  );
}
