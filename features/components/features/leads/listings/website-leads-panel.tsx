"use client";
/**
 * NEW (34, needs client confirmation) — Website Lead Review on /leads?view=website.
 * Moved from /marketing/leads: website-form leads, the review list and the
 * simulated form. Manual lead entry stays the live Add New Lead.
 *
 * Website forms are the only integrated lead channel. Each event carries a
 * stable reference, so a retry never duplicates a lead. Matching is phone
 * first, then email, inside 90 days of the lead's most recent activity. A
 * phone that matches one lead and an email that matches another goes to the
 * review list — there is no merge button.
 */
import { useState } from "react";
import { Globe, Send } from "lucide-react";
import type { Lead } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { AppLink } from "@/features/lib/navigation";
import { leadHref } from "@/features/lib/hrefs";
import { dateLong, titleCase } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { leadContact, resolveLeadReview, submitWebsiteForm, type WebsiteSubmission } from "@/features/lib/store/actions/marketing";
import { userName } from "@/features/lib/store/helpers";
import { Badge, Button, Card, CardLabel, ConfirmBadge, EmptyState, Field, Input, NewBadge, PillTabs, Table, TD, TH, THead, TR, Textarea } from "@/features/components/ui";

const ref = () => `WF-${Date.now().toString(36).toUpperCase()}`;

const PRESETS: { label: string; hint: string; make: () => Omit<WebsiteSubmission, "ref"> }[] = [
  { label: "Aisha again (active 30 days ago)", hint: "Attaches by phone", make: () => ({ name: "Aisha Roberts", phone: "214-555-0161", email: "aisha.r@example.com", town: "Lakewood", message: "Also the garage door, please." }) },
  { label: "Tom again (last activity 120 days ago)", hint: "New lead", make: () => ({ name: "Tom Becker", phone: "(972) 555-0182", email: "tom.becker@example.com", town: "Plano", message: "Ready to go ahead with the exterior now." }) },
  { label: "Phone and email disagree", hint: "Review list", make: () => ({ name: "A. Roberts", phone: "(214) 555-0161", email: "tom.becker@example.com", town: "Lakewood", message: "Quote for a fence." }) },
  { label: "Missing phone number", hint: "Gap shown", make: () => ({ name: "Chris Dale", phone: "", email: "chris.dale@example.com", town: "Allen", message: "Kitchen cabinets — ballpark?" }) },
];

export function WebsiteLeadsPanel() {
  const db = useDb((d) => d);
  const [tab, setTab] = useState<"leads" | "review">("leads");
  const website = db.leads.filter((l) => l.source === "website").sort((a, b) => (b.lastActivityAt ?? b.createdAt).localeCompare(a.lastActivityAt ?? a.createdAt));
  const reviews = db.leads.filter((l) => l.review);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-xl font-black text-gray-900">Website Lead Review</h2><NewBadge feature={34} /><ConfirmBadge />
        <p className="w-full text-sm text-gray-500">Website-form enquiries become leads once. A retried event never duplicates a lead.</p>
      </div>
      <div className="mb-4"><PillTabs kind="view" value={tab} onChange={setTab} options={[{ value: "leads", label: `Website leads (${website.length})` }, { value: "review", label: `Lead review (${reviews.filter((r) => r.review!.status === "open").length})` }]} /></div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] [&>*]:min-w-0">
        {tab === "leads" ? <LeadList leads={website} /> : <ReviewList leads={reviews} />}
        <div className="space-y-4"><LiveForm /><Simulator /></div>
      </div>
    </>
  );
}

function matchState(l: Lead) {
  if (l.review?.status === "open") return <Badge tone="amber">Review required</Badge>;
  if (l.review?.status === "resolved") return <Badge tone="gray">Review resolved</Badge>;
  const attached = (l.events ?? []).filter((e) => e.matchedOn);
  if (attached.length) return <Badge tone="blue">{attached.length} repeat enquir{attached.length === 1 ? "y" : "ies"} attached (by {attached.at(-1)!.matchedOn})</Badge>;
  return <Badge tone="green">New lead</Badge>;
}

function LeadList({ leads }: { leads: Lead[] }) {
  const db = useDb((d) => d);
  return (
    <Card className="p-4" data-tour="marketing-leads">
      <CardLabel icon={<Globe />}>Website leads</CardLabel>
      <div className="mt-3">
        {leads.length === 0 ? <EmptyState title="No website leads" body="Requests sent from the website form show here for review before they become leads." /> : (
          <Table>
            <THead><tr><TH>Lead</TH><TH>Phone</TH><TH>Email</TH><TH>Town</TH><TH>Message</TH><TH>Created</TH><TH>Last activity</TH><TH>Match</TH></tr></THead>
            <tbody>
              {leads.map((l) => {
                const c = leadContact(db, l.id);
                const missing = new Set(l.missingFields ?? []);
                const cell = (field: string, v?: string) => (missing.has(field) || !v ? <Badge tone="red">Missing</Badge> : v);
                return (
                  <TR key={l.id}>
                    <TD className="whitespace-nowrap font-semibold text-ink"><AppLink href={leadHref(l.id)} className="hover:text-primary-700">{c.name}</AppLink><div className="text-xs font-normal text-gray-500">{l.id} · {titleCase(l.source)} · {l.eventRef ?? "manual"}</div></TD>
                    <TD className="whitespace-nowrap">{cell("phone", c.phone)}</TD>
                    <TD className="whitespace-nowrap">{cell("email", c.email)}</TD>
                    <TD>{cell("town", l.town)}</TD>
                    <TD className="max-w-[220px] whitespace-normal text-xs text-gray-600">{l.message ?? byId(db.customers, l.customerId)?.name}{(l.events?.length ?? 0) > 1 && <div className="text-xs text-gray-500">+ {l.events!.length - 1} later: “{l.events!.at(-1)!.message}”</div>}{l.note && <div className="text-xs text-gray-500">{l.note}</div>}</TD>
                    <TD className="whitespace-nowrap text-xs">{dateLong(l.createdAt)}</TD>
                    <TD className="whitespace-nowrap text-xs">{dateLong(l.lastActivityAt ?? l.createdAt)}</TD>
                    <TD>{matchState(l)}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500">Mandatory fields: name, phone, email, property address or at least the town, and a message. A missing field is shown to the office, never filled in.</p>
    </Card>
  );
}

function ReviewList({ leads }: { leads: Lead[] }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <Card className="p-4" data-tour="marketing-review">
      <CardLabel>Lead review</CardLabel>
      <p className="mt-1 text-xs text-gray-500">The phone matches one contact and the email another. A person decides. There is no merge button.</p>
      <div className="mt-3 space-y-3">
        {leads.length === 0 && <p className="text-xs italic text-gray-500">Nothing to review.</p>}
        {leads.map((l) => {
          const r = l.review!;
          const me = leadContact(db, l.id);
          const a = leadContact(db, r.phoneMatchLeadId);
          const b = leadContact(db, r.emailMatchLeadId);
          return (
            <div key={l.id} className="rounded-lg border border-line p-3 text-xs">
              <div className="flex flex-wrap items-center gap-1.5"><strong>{l.id}</strong> {me.name} · {me.phone} · {me.email} {r.status === "open" ? <Badge tone="amber">Open</Badge> : <Badge tone="green">Resolved</Badge>}</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-md bg-gray-50 px-2.5 py-2"><div className="text-xxs font-bold uppercase tracking-wide text-gray-500">Phone matches</div><div className="font-semibold">{a.name}</div><div className="text-gray-500">{r.phoneMatchLeadId} · {a.phone}</div></div>
                <div className="rounded-md bg-gray-50 px-2.5 py-2"><div className="text-xxs font-bold uppercase tracking-wide text-gray-500">Email matches</div><div className="font-semibold">{b.name}</div><div className="text-gray-500">{r.emailMatchLeadId} · {b.email}</div></div>
              </div>
              {r.status === "open" ? (can(user, "marketing.post") && (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <Field label="Manual resolution" className="flex-1"><Input value={notes[l.id] ?? ""} onChange={(e) => setNotes({ ...notes, [l.id]: e.target.value })} placeholder="e.g. Called: Jordan is Jeremy's son, separate household — kept as a new lead" /></Field>
                  <Button variant="primary" onClick={() => act(resolveLeadReview, l.id, notes[l.id] ?? "").ok && toast.success("Resolved by hand", "No records were merged.")}>Record resolution</Button>
                </div>
              )) : <div className="mt-2 text-gray-600">Resolved by {userName(db, r.resolvedBy)} on {dateLong(r.resolvedAt)}: {r.resolution}</div>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function LiveForm() {
  return (
    <Card className="p-4">
      <CardLabel icon={<Globe />}>Live website form</CardLabel>
      <p className="mt-1 text-xs text-gray-500">Your website posts enquiries to this endpoint. New ones appear here within 30 seconds.</p>
      <dl className="mt-3 space-y-2 text-xs">
        <div><dt className="font-semibold text-gray-600">Endpoint</dt><dd className="break-all font-mono text-gray-800">POST /api/website-form (on this site)</dd></div>
        <div><dt className="font-semibold text-gray-600">Fields</dt><dd className="text-gray-800">siteKey, name, phone or email, town, message; optional ref (your stable event id)</dd></div>
        <div><dt className="font-semibold text-gray-600">Protection</dt><dd className="text-gray-800">Site key, hidden honeypot field, 5 submissions per hour per address</dd></div>
      </dl>
      <a href="/website-form" target="_blank" rel="noreferrer" className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg border border-line bg-white text-sm font-semibold text-ink hover:border-gray-300">Open sample form</a>
    </Card>
  );
}

function Simulator() {
  const user = useCurrentUser();
  const [form, setForm] = useState<WebsiteSubmission>({ ref: ref(), name: "", phone: "", email: "", town: "", message: "" });
  const [last, setLast] = useState<WebsiteSubmission>();
  const send = (sub: WebsiteSubmission) => {
    const r = act(submitWebsiteForm, sub);
    if (!r.ok) return;
    setLast(sub);
    const v = r.value!;
    const text = { possible_duplicate: `New lead ${v.leadId}, marked Possible duplicate (matched by ${v.on ?? ""})`, new: `New lead ${v.leadId}`, review: `Lead ${v.leadId} created and placed on the review list`, duplicate: `Event ${sub.ref} already recorded on ${v.leadId} — no duplicate` }[v.outcome];
    toast.success("Website event received", text);
    setForm({ ref: ref(), name: "", phone: "", email: "", town: "", message: "" });
  };
  const f = (k: keyof WebsiteSubmission, label: string) => <Field label={label}><Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>;
  return (
    <Card className="p-4" data-tour="marketing-website-form">
      <CardLabel icon={<Send />}>Website form (simulated)</CardLabel>
      <p className="mt-1 text-xs text-gray-500">Sends an event the way the website would. Try the scenarios, or retry the last one.</p>
      <div className="mt-3 space-y-1.5">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => send({ ref: ref(), ...p.make() })} className="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-left text-xs hover:border-gray-300">
            <span className="font-medium text-ink">{p.label}</span><span className="shrink-0 text-xs text-gray-500">{p.hint}</span>
          </button>
        ))}
        <Button className="w-full" disabled={!last} onClick={() => last && send(last)}>Retry last event{last ? ` (${last.ref})` : ""}</Button>
      </div>
      <div className="mt-4 space-y-2 border-t border-line pt-3">
        <div className="grid grid-cols-2 gap-2">{f("name", "Name")}{f("phone", "Phone")}</div>
        <div className="grid grid-cols-2 gap-2">{f("email", "Email")}{f("town", "Address or town")}</div>
        <Field label="Message"><Textarea rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
        <Button variant="primary" className="w-full" disabled={!can(user, "marketing.access")} onClick={() => send(form)}>Submit form</Button>
        <p className="text-xs text-gray-500">Event reference {form.ref}</p>
      </div>
    </Card>
  );
}
