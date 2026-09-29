"use client";
/**
 * Contacts — live route /contacts (features/(main)/contacts/listings).
 * Header, the three stats cards (Total Clients, Active Projects, Lifetime
 * Value), search, and one row per contact with the active job status and
 * contact info. Nothing here is new.
 */
import { useState } from "react";
import { Building, DollarSign, Mail, Phone, Search, User } from "lucide-react";
import { useDb } from "@/features/lib/store";
import { AppLink } from "@/features/lib/navigation";
import { contactHref } from "@/features/lib/hrefs";
import { money } from "@/features/lib/format";
import { Screen } from "@/features/components/layout/screen";
import { EmptyState, Input, StatusPill } from "@/features/components/ui";
import { JOB_STATUS_DISPLAY } from "@/features/components/features/jobs/details/job-details-screen";
import { contactLocations } from "../details/contact-shared";

export function ContactsListScreen() {
  const db = useDb((d) => d);
  const [q, setQ] = useState("");
  const liveJobs = db.jobs.filter((j) => j.status !== "estimating");
  const list = db.customers
    .filter((c) => !c.personalDataDeleted)
    .filter((c) => [c.name, c.email, c.phone].join(" ").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const active = liveJobs.filter((j) => j.status !== "completed");
  const lifetime = liveJobs.reduce((a, j) => a + j.contractValue, 0);
  return (
    <Screen crumbs={[{ label: "Contacts" }]} bare>
      <div className="mx-auto w-full px-4 py-8 pb-32 md:px-8">
        <h1 className="font-heading text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Contacts</h1>
        <p className="mb-8 mt-2 text-lg text-gray-500 md:text-xl">Manage your client relationships and history.</p>
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { label: "Total Clients", value: list.length, icon: <User />, sub: "In your database" },
            { label: "Active Projects", value: active.length, icon: <Building />, sub: "Jobs in progress" },
            { label: "Lifetime Value", value: money(lifetime), icon: <DollarSign />, sub: "Total revenue generated" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 [&>svg]:h-4 [&>svg]:w-4">{s.icon} {s.label}</div>
              <div className="font-heading text-3xl font-black text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500">{s.sub}</div>
            </div>
          ))}
        </div>
        <div className="relative mb-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email, or phone..." className="h-11 pl-9" />
        </div>
        {list.length === 0 && <EmptyState title="No contacts found" />}
        <div className="space-y-3">
          {list.map((c) => {
            const job = active.find((j) => j.customerId === c.id);
            const status = job ? JOB_STATUS_DISPLAY[job.status] : undefined;
            const loc = contactLocations(db, c.id)[0];
            return (
              <AppLink key={c.id} href={contactHref(c.id)} className="group flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-xl font-bold text-gray-500 ring-2 ring-gray-100">{c.name[0]}</div>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold text-gray-900 group-hover:text-primary-700">{c.name}</h3>
                    <div className="truncate text-sm text-gray-500">{loc ? `${loc.address}, ${loc.city}` : "No service location"}</div>
                  </div>
                </div>
                <div className="md:w-44">
                  <div className="mb-1 text-xxs font-bold uppercase tracking-wider text-gray-500">Status</div>
                  {status ? <StatusPill tone={status.tone}>{status.label}</StatusPill> : <StatusPill tone="gray">No Active Jobs</StatusPill>}
                </div>
                <div className="space-y-1 text-sm text-gray-600 md:w-64">
                  {c.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-500" /> {c.phone}</div>}
                  {c.email && <div className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5 text-gray-500" /> {c.email}</div>}
                </div>
              </AppLink>
            );
          })}
        </div>
      </div>
    </Screen>
  );
}
