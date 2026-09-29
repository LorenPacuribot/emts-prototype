"use client";
/**
 * Leads, Estimates and Invoices — simplified replicas of the live list pages,
 * so navigation from the new features lands somewhere real.
 */
import { useState } from "react";
import { ChevronRight, FileText, MapPin, Repeat, Search, Users } from "lucide-react";
import { useDb } from "@/features/lib/store";
import { AppLink } from "@/features/lib/navigation";
import { byId, propertyAddress } from "@/features/lib/selectors";
import { ESTIMATE_STATUS, INVOICE_STATUS } from "@/features/lib/status";
import { date, money, titleCase } from "@/features/lib/format";
import { Screen, PageHeader } from "@/features/components/layout/screen";
import { Badge, Button, Card, EmptyState, IdChip, Input, MicroLabel, PillTabs } from "@/features/components/ui";
import { jobHref } from "@/features/lib/hrefs";

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative xl:w-[336px]">
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <Input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 pl-10" aria-label={placeholder} />
    </div>
  );
}

export function LeadsScreen() {
  const db = useDb((d) => d);
  const [q, setQ] = useState("");
  const leads = [...db.leads]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((l) => (byId(db.customers, l.customerId)?.name ?? "").toLowerCase().includes(q.toLowerCase()));
  return (
    <Screen crumbs={[{ label: "Leads" }]}>
      <PageHeader title="Lead Management" subtitle="Every enquiry, from first contact to sold." />
      <div className="mb-5"><SearchBox value={q} onChange={setQ} placeholder="Search leads..." /></div>
      <div className="space-y-3">
        {leads.length === 0 && <EmptyState title="No leads match" />}
        {leads.map((l) => {
          const c = byId(db.customers, l.customerId);
          const p = byId(db.properties, l.propertyId);
          return (
            <Card key={l.id} className="flex items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-1.5">
                  <IdChip>{l.id}</IdChip>
                  <Badge tone="blue">{titleCase(l.stage)}</Badge>
                  <Badge tone="gray">{titleCase(l.source)}</Badge>
                </div>
                <div className="mt-2 font-display text-base font-bold">{c?.name}</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500"><MapPin className="h-3.5 w-3.5" /> {p ? propertyAddress(p) : "No property yet"}</div>
              </div>
              <div className="hidden sm:block"><MicroLabel>Created</MicroLabel><div className="text-sm font-semibold">{date(l.createdAt)}</div></div>
            </Card>
          );
        })}
      </div>
    </Screen>
  );
}



/** Existing app pages that are not part of this prototype. */
export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <Screen crumbs={[{ label: title }]}>
      <PageHeader title={title} subtitle="This page exists in the live Estimate Master app." />
      <EmptyState
        title="Not part of this prototype"
        body="The prototype covers the fourteen new feature flows. Use the dashboard walkthrough to explore them."
        action={<AppLink href="/dashboard"><Button variant="primary">Open the dashboard</Button></AppLink>}
      />
    </Screen>
  );
}

export const PipelineScreen = () => <PlaceholderScreen title="Pipeline" />;
export const CalendarScreen = () => <PlaceholderScreen title="Calendar" />;
export const TasksScreen = () => <PlaceholderScreen title="Tasks" />;
export const PresentationsScreen = () => <PlaceholderScreen title="Presentations" />;
export const SupportScreen = () => <PlaceholderScreen title="Support" />;
