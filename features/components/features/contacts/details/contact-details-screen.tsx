"use client";
/**
 * Contact Details — live route /contacts/[id]?tab=
 * (features/(main)/contacts/details/templates/index.tsx).
 *
 * Existing: header card (name, phone / email / address, Schedule Estimate,
 * + Create New Estimate), Service Locations and Customer Stats on the left,
 * and the tabs Leads, Estimates, Invoices, Job History, Conversations,
 * Activity & Notes on the right, with the tab in ?tab=.
 * NEW:
 *   - "Paint History" tab (?tab=paint-history&location=), feature 25, with
 *     Owners & Consent (25), QR Links (26) and Touch-Up Reorders (28).
 *   - Job History cards: "Generate QR Code" (26) and "New Estimate from History" (28).
 *   - Service location cards: paint-history and QR link state (25, 26).
 */
import { useState } from "react";
import { ArrowLeft, Calendar, FilePlus2, History, Mail, MapPin, MessageSquare, Phone, Plus, QrCode, StickyNote } from "lucide-react";
import type { Customer, Property } from "@/features/types";
import { useCurrentUser, useDb } from "@/features/lib/store";
import { AppLink, useNav, useParam } from "@/features/lib/navigation";
import { contactHref, estimateHref, invoiceHref, jobHref, leadHref } from "@/features/lib/hrefs";
import { byId, currentOwnership, propertyAddress } from "@/features/lib/selectors";
import { can } from "@/features/lib/permissions";
import { ESTIMATE_STATUS_LABEL, ESTIMATE_STATUS_TONE } from "@/features/lib/rules/estimate-lifecycle";
import { JOB_STAGES, JOB_STATUS_DISPLAY } from "@/features/components/features/jobs/details/job-details-screen";
import { date, dateTime, money } from "@/features/lib/format";
import { cn } from "@/features/lib/cn";
import { Screen } from "@/features/components/layout/screen";
import { Button, CardTitle, EmptyState, LiveCard, LiveTabs, NewBadge, Select, StatusPill } from "@/features/components/ui";
import { CreateEstimateModal } from "@/features/components/features/estimates/listings/create-estimate-modal";
import { NewEstimateFromHistoryModal } from "@/features/components/features/future-estimate/new-estimate-from-history-modal";
import { PaintHistoryTab } from "./paint-history-tab";
import { contactLocations, LEAD_STAGE } from "./contact-shared";

type TabKey = "leads" | "estimates" | "invoices" | "jobs" | "conversations" | "notes" | "paint-history";
const TAB_KEYS: TabKey[] = ["leads", "estimates", "invoices", "jobs", "conversations", "notes", "paint-history"];

export function ContactDetailsScreen() {
  const id = useParam("id");
  const db = useDb((d) => d);
  const customer = byId(db.customers, id);
  return (
    <Screen crumbs={[{ label: "Contacts", href: "/contacts" }, { label: "Contact Details" }]} bare>
      <div className="mx-auto w-full px-4 py-8 md:px-6 lg:px-8">
        <AppLink href="/contacts" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-primary-700"><ArrowLeft className="h-4 w-4" /> Back to Contacts</AppLink>
        {customer ? <ContactDetails customer={customer} /> : <EmptyState title="Contact not found." />}
      </div>
    </Screen>
  );
}

function ContactDetails({ customer }: { customer: Customer }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const nav = useNav();
  const tabParam = useParam("tab") as TabKey | undefined;
  const tab: TabKey = tabParam && TAB_KEYS.includes(tabParam) ? tabParam : "leads";
  const setTab = (t: TabKey) => nav.push(contactHref(customer.id, t));
  const [creating, setCreating] = useState(false);
  const locations = contactLocations(db, customer.id);
  const jobs = db.jobs.filter((j) => j.customerId === customer.id && j.status !== "estimating");
  const active = jobs.filter((j) => j.status !== "completed");
  const value = jobs.reduce((a, j) => a + j.contractValue, 0);

  return (
    <>
      <div className="mb-8 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h1 className="font-heading text-3xl font-extrabold tracking-tight text-gray-900 md:text-5xl">{customer.name}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
              {customer.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4" /> {customer.phone}</span>}
              {customer.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-4 w-4" /> {customer.email}</span>}
              {locations[0] && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {propertyAddress(locations[0], true)}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {can(user, "calendar.manage") && <AppLink href={db.leads.find((l) => l.customerId === customer.id) ? leadHref(db.leads.find((l) => l.customerId === customer.id)!.id) : "/leads"}><Button className="h-11 px-5 font-black"><Calendar className="h-4 w-4" /> Schedule Estimate</Button></AppLink>}
            {can(user, "estimate.create") && <Button variant="primary" className="h-11 px-5 font-black shadow-lg shadow-primary-500/20" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create New Estimate</Button>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
        <div className="space-y-8">
          <LiveCard>
            <CardTitle icon={<MapPin />}>Service Locations</CardTitle>
            {locations.length === 0 && <p className="text-sm text-gray-500">No service locations found.</p>}
            <div className="space-y-3">
              {locations.map((p) => <LocationCard key={p.id} property={p} customerId={customer.id} />)}
            </div>
          </LiveCard>
          <LiveCard>
            <CardTitle icon={<History />}>Customer Stats</CardTitle>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><div className="text-2xl font-black text-gray-900">{jobs.length}</div><div className="text-xs text-gray-500">Total Jobs</div></div>
              <button onClick={() => setTab("jobs")}><div className={cn("text-2xl font-black", active.length ? "text-amber-600" : "text-gray-900")}>{active.length}</div><div className="text-xs text-gray-500">Active Jobs ↗</div></button>
              <button onClick={() => setTab("jobs")}><div className="text-2xl font-black text-gray-900">{money(value)}</div><div className="text-xs text-gray-500">Total Value</div></button>
            </div>
          </LiveCard>
        </div>
        <div className="min-w-0 lg:col-span-2">
          <LiveTabs<TabKey>
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "leads", label: "Leads" },
              { key: "estimates", label: "Estimates" },
              { key: "invoices", label: "Invoices" },
              { key: "jobs", label: "Job History" },
              { key: "conversations", label: "Conversations" },
              { key: "notes", label: "Activity & Notes" },
              { key: "paint-history", label: "Paint History", isNew: true, feature: [25, 26, 28] },
            ]}
          />
          {tab === "leads" && <LeadsTab customerId={customer.id} />}
          {tab === "estimates" && <EstimatesTab customerId={customer.id} />}
          {tab === "invoices" && <InvoicesTab customerId={customer.id} />}
          {tab === "jobs" && <JobHistoryTab customerId={customer.id} />}
          {tab === "conversations" && <EmptyState icon={<MessageSquare />} title="No conversations yet." body="Email and SMS threads are part of the live app; they are not rebuilt in the prototype because no new feature changes them." />}
          {tab === "notes" && <ActivityTab customer={customer} />}
          {tab === "paint-history" && <PaintHistoryTab customer={customer} />}
        </div>
      </div>
      <CreateEstimateModal open={creating} onOpenChange={setCreating} customerId={customer.id} />
    </>
  );
}

/** Live service location card, with NEW paint-history and QR state (25, 26). */
function LocationCard({ property, customerId }: { property: Property; customerId: string }) {
  const db = useDb((d) => d);
  const apps = db.applications.filter((a) => a.propertyId === property.id).length;
  const period = currentOwnership(property);
  const qr = db.qrLinks.find((q) => q.propertyId === property.id && q.ownershipPeriodId === period.id && !q.revokedAt);
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
      <div className="font-semibold text-gray-900">{property.address}</div>
      <div className="text-sm text-gray-500">{property.city}, {property.state} {property.zip}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <AppLink href={contactHref(customerId, "paint-history", { location: property.id })} className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-white px-1.5 py-0.5 text-xs font-semibold text-green-700 hover:bg-green-50">
          {apps} paint records <NewBadge feature={25} />
        </AppLink>
        {qr && <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-xs font-semibold text-gray-600"><QrCode className="h-3 w-3" /> QR link active</span>}
      </div>
    </div>
  );
}

function SortSelect({ value, onChange, withAmount = true }: { value: string; onChange: (v: string) => void; withAmount?: boolean }) {
  return (
    <div className="mb-4 flex justify-end">
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-48" aria-label="Sort">
        <option value="new">Date (Newest)</option>
        <option value="old">Date (Oldest)</option>
        {withAmount && <option value="high">Amount (High-Low)</option>}
        {withAmount && <option value="low">Amount (Low-High)</option>}
      </Select>
    </div>
  );
}
function sortBy<T>(list: T[], sort: string, dateOf: (x: T) => string, amountOf: (x: T) => number) {
  return [...list].sort((a, b) => (sort === "old" ? dateOf(a).localeCompare(dateOf(b)) : sort === "high" ? amountOf(b) - amountOf(a) : sort === "low" ? amountOf(a) - amountOf(b) : dateOf(b).localeCompare(dateOf(a))));
}

function LeadsTab({ customerId }: { customerId: string }) {
  const db = useDb((d) => d);
  const [sort, setSort] = useState("new");
  const leads = sortBy(db.leads.filter((l) => l.customerId === customerId), sort, (l) => l.createdAt, () => 0);
  return (
    <div>
      <SortSelect value={sort} onChange={setSort} withAmount={false} />
      {leads.length === 0 && <EmptyState title="No leads found for this customer." />}
      <div className="space-y-3">
        {leads.map((l) => {
          const p = byId(db.properties, l.propertyId);
          const fu = db.followUps.find((f) => f.leadId === l.id);
          return (
            <AppLink key={l.id} href={leadHref(l.id)} className="block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-gray-900">{l.id}</span>
                <StatusPill tone="gray">{LEAD_STAGE[l.stage]}</StatusPill>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {p && <span className="rounded-md bg-gray-100 px-2 py-0.5 text-gray-600">{p.city}, {p.state}</span>}
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-gray-600">{l.source === "repaint_alert" ? "Repaint alert" : l.source === "existing_customer" ? "Existing Client" : l.source === "website" ? "Website" : "Referral"}</span>
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-gray-600">{date(l.createdAt)}</span>
                {fu && <span className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-0.5 font-semibold text-green-700">Repaint follow-up {fu.id}</span>}
              </div>
              <div className="mt-2 text-xs font-bold text-primary-700">View Lead →</div>
            </AppLink>
          );
        })}
      </div>
    </div>
  );
}

function EstimatesTab({ customerId }: { customerId: string }) {
  const db = useDb((d) => d);
  const [sort, setSort] = useState("new");
  const list = sortBy(db.estimates.filter((e) => e.customerId === customerId), sort, (e) => e.createdAt, (e) => e.total);
  return (
    <div>
      <SortSelect value={sort} onChange={setSort} />
      {list.length === 0 && <EmptyState title="No estimates found for this customer." />}
      <div className="space-y-3">
        {list.map((e) => (
          <AppLink key={e.id} href={estimateHref(e.id)} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md">
            <div>
              <div className="flex flex-wrap items-center gap-2"><span className="font-bold text-gray-900">{e.id}</span><StatusPill tone={ESTIMATE_STATUS_TONE[e.status]}>{ESTIMATE_STATUS_LABEL[e.status]}</StatusPill>{e.repeatEstimateId && <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-bold text-indigo-700">From history</span>}</div>
              <div className="text-sm text-gray-600">{e.title}</div>
              <div className="text-xs text-gray-500">{date(e.createdAt)}</div>
              <div className="mt-1 text-xs font-bold text-primary-700">View Estimate →</div>
            </div>
            <div className="text-right font-black text-gray-900">{money(e.total, { cents: true })}</div>
          </AppLink>
        ))}
      </div>
    </div>
  );
}

function InvoicesTab({ customerId }: { customerId: string }) {
  const db = useDb((d) => d);
  const [sort, setSort] = useState("new");
  const jobIds = new Set(db.jobs.filter((j) => j.customerId === customerId).map((j) => j.id));
  const list = sortBy(db.invoices.filter((i) => jobIds.has(i.jobId)), sort, (i) => i.createdAt, (i) => i.amount);
  return (
    <div>
      <SortSelect value={sort} onChange={setSort} />
      {list.length === 0 && <EmptyState title="No invoices found for this customer." />}
      <div className="space-y-3">
        {list.map((i) => (
          <AppLink key={i.id} href={invoiceHref(i.id)} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md">
            <div>
              <div className="flex items-center gap-2"><span className="font-bold text-gray-900">{i.id}</span><StatusPill tone={i.status === "paid" ? "green" : i.status === "draft" ? "gray" : "amber"}>{i.status === "paid" ? "Paid" : i.status === "draft" ? "Draft" : i.status === "void" ? "Canceled" : "Sent"}</StatusPill></div>
              <div className="text-xs text-gray-500">{i.jobId}</div>
              <div className="text-xs text-gray-500">{date(i.createdAt)} • Total: {money(i.amount, { cents: true })}</div>
            </div>
            <div className="text-right"><div className="text-xxs font-bold uppercase tracking-widest text-gray-500">Balance Due</div><div className="font-black">{money(i.status === "paid" ? 0 : i.amount, { cents: true })}</div></div>
          </AppLink>
        ))}
      </div>
    </div>
  );
}

/** Live Job History tab: live jobs plus completed jobs imported into the history. */
function JobHistoryTab({ customerId }: { customerId: string }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [sort, setSort] = useState("new");
  const [fromHistory, setFromHistory] = useState<Property>();
  const locations = contactLocations(db, customerId);
  const locIds = new Set(locations.map((p) => p.id));
  const live = db.jobs.filter((j) => j.customerId === customerId && j.status !== "estimating").map((j) => ({ id: j.id, name: j.name, propertyId: j.propertyId, status: j.status as string, value: j.contractValue, at: j.contractSignedAt ?? j.scheduleStart ?? "", live: true }));
  const past = (db.historicalJobs ?? []).filter((h) => locIds.has(h.propertyId)).map((h) => ({ id: h.id, name: h.name, propertyId: h.propertyId, status: "completed", value: Object.values(h.linePrices).reduce((a, b) => a + b, 0), at: h.completedAt, live: false }));
  const list = sortBy([...live, ...past], sort, (j) => j.at, (j) => j.value);
  return (
    <div>
      <SortSelect value={sort} onChange={setSort} />
      {list.length === 0 && <EmptyState title="No job history found for this customer." />}
      <div className="space-y-3">
        {list.map((j) => {
          const p = byId(db.properties, j.propertyId);
          const disp = JOB_STATUS_DISPLAY[j.status] ?? { label: j.status, tone: "gray" as const };
          const idx = JOB_STAGES.findIndex((s) => s.status === j.status);
          const hasHistory = db.applications.some((a) => a.propertyId === j.propertyId);
          return (
            <div key={j.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  {j.live ? <AppLink href={jobHref(j.id)} className="font-bold text-gray-900 hover:text-primary-700">{j.id}</AppLink> : <span className="font-bold text-gray-900">{j.id}</span>}
                  <div className="text-sm text-gray-600">{j.name}</div>
                  <div className="text-xs text-gray-500">{propertyAddress(p)}</div>
                </div>
                <StatusPill tone={disp.tone}>{disp.label}</StatusPill>
              </div>
              <div className="mt-3 flex gap-1">
                {JOB_STAGES.map((s, i) => <div key={s.label} className={cn("h-1.5 flex-1 rounded-full", i <= idx ? (idx >= 5 ? "bg-green-500" : "bg-primary-500") : "bg-gray-100")} title={s.label} />)}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                <span className="text-xs text-gray-500">{j.live ? "Created" : "Completed"}: {date(j.at)} · {money(j.value)}</span>
                <span className="flex flex-wrap gap-2">
                  {p && can(user, "qr.generate") && (
                    <AppLink href={contactHref(customerId, "paint-history", { location: p.id, view: "qr" })}>
                      <Button size="sm"><QrCode className="h-3.5 w-3.5" /> Generate QR Code</Button>
                    </AppLink>
                  )}
                  {p && hasHistory && can(user, "repeat.build") && (
                    <Button size="sm" onClick={() => setFromHistory(p)} data-tour="new-estimate-from-history">
                      <FilePlus2 className="h-3.5 w-3.5" /> New Estimate from History
                    </Button>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {fromHistory && <NewEstimateFromHistoryModal open={!!fromHistory} onOpenChange={(v) => !v && setFromHistory(undefined)} property={fromHistory} />}
    </div>
  );
}

function ActivityTab({ customer }: { customer: Customer }) {
  const db = useDb((d) => d);
  const props = contactLocations(db, customer.id).map((p) => p.id);
  const jobIds = db.jobs.filter((j) => j.customerId === customer.id).map((j) => j.id);
  const needles = [customer.name, ...props, ...jobIds];
  const entries = db.activity.filter((a) => needles.some((n) => a.message.includes(n))).slice(0, 40);
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <LiveCard>
        <CardTitle icon={<StickyNote />}>Notes History</CardTitle>
        {db.leads.filter((l) => l.customerId === customer.id && l.note).length === 0 ? <p className="text-sm text-gray-500">No notes logged yet.</p> : (
          <div className="space-y-2">{db.leads.filter((l) => l.customerId === customer.id && l.note).map((l) => <div key={l.id} className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700"><div className="text-xs text-gray-500">{date(l.createdAt)} · {l.id}</div>{l.note}</div>)}</div>
        )}
      </LiveCard>
      <LiveCard>
        <CardTitle icon={<History />}>Activity Log</CardTitle>
        {entries.length === 0 ? <p className="text-sm text-gray-500">No activity yet.</p> : (
          <div className="space-y-2">{entries.map((a) => <div key={a.id} className="border-l-2 border-gray-200 pl-3 text-sm"><div className="text-xs font-bold uppercase text-gray-500">{dateTime(a.at)}</div><div className={a.blocked ? "text-red-700" : "text-gray-700"}>{a.message}</div></div>)}</div>
        )}
      </LiveCard>
    </div>
  );
}
