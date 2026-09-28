'use client';

/*
  Contact Details (/contacts/[id]) (live: features/(main)/contacts/details/templates/index.tsx).
  Header: name, star rating, phone / email / address, Schedule Estimate,
  Create New Estimate, and a menu with Edit / Delete.
  Left: service locations and customer stats. Right: tabs for Leads,
  Estimates, Invoices, Job History, Conversations and Activity & Notes.
  The open tab is kept in ?tab= like the live app.
  NEW (25, 26, 28): the Paint History tab (?tab=paint-history&location=&view=), paint-record
  and QR state on each service location, and the Job History actions (ContactFeatures.tsx).
*/
import React, { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, Calendar, Edit2, Eye, Mail, MapPin, MoreVertical, Phone, Plus, Star, Trash2, X } from 'lucide-react';
import { PageShell } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { DropdownMenu } from '@/components/ui/menu';
import { EmptyState, ListSkeleton } from '@/components/ui/display';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useCollection, useDb } from '@/lib/store';
import { cn, fullName, shortDate } from '@/lib/utils';
import { appendNote, formatPhone } from '@/components/leads/leadHelpers';
import { NotesSection } from '@/components/leads/NotesSection';
import { ContactFormModal } from '@/components/contacts/ContactFormModal';
import { ContactScheduleModal } from '@/components/contacts/ContactScheduleModal';
import { CONTACT_TYPE_COLORS, statsFor } from '@/components/contacts/contactStats';
import { useDeleteContact } from '@/components/contacts/useDeleteContact';
import { ConversationsTab, EstimatesTab, InvoicesTab, JobHistoryTab, LeadsTab } from '@/components/contacts/ContactTabs';
import { LocationPaintChips, PaintHistoryHost } from '@/components/contacts/ContactFeatures';
import { NewBadge } from '@/features/components/ui';

type TabKey = 'leads' | 'estimates' | 'invoices' | 'jobs' | 'conversations' | 'notes' | 'paint-history';
const TABS: { key: TabKey; label: string; isNew?: boolean }[] = [
  { key: 'leads', label: 'Leads' },
  { key: 'estimates', label: 'Estimates' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'jobs', label: 'Job History' },
  { key: 'conversations', label: 'Conversations' },
  { key: 'notes', label: 'Activity & Notes' },
  { key: 'paint-history', label: 'Paint History', isNew: true },
];

export default function ContactDetailPage() {
  return (
    <PageShell title="Contact Details" breadcrumbs={[{ label: 'Contacts', href: '/contacts' }]} backHref="/contacts">
      <Link href="/contacts" className="mb-6 flex w-fit items-center gap-2 text-sm font-bold text-gray-500 transition-colors hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> Back to Contacts
      </Link>
      <Suspense fallback={<ListSkeleton rows={3} />}>
        <ContactDetail />
      </Suspense>
    </PageShell>
  );
}

function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const db = useDb();
  const customers = useCollection('customers');
  const deleteContact = useDeleteContact();
  const { toast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const tabParam = params.get('tab') as TabKey | null;
  const tab: TabKey = tabParam && TABS.some((t) => t.key === tabParam) ? tabParam : 'leads';
  const setTab = (t: TabKey) => {
    // Only ?tab= carries over; the Paint History filters (&location=, &view=) belong to that tab.
    const next = new URLSearchParams({ tab: t });
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const customer = customers.get(id);
  const c = db.collections;
  const related = useMemo(() => ({
    leads: c.leads.filter((l) => l.customerId === id),
    estimates: c.estimates.filter((e) => e.customerId === id),
    invoices: c.invoices.filter((i) => i.customerId === id),
    jobs: c.jobs.filter((j) => j.customerId === id),
    messages: c.messages.filter((m) => m.customerId === id),
  }), [c, id]);

  if (!customer) {
    return <EmptyState title="Contact not found." message="This contact may have been deleted." action={<Link href="/contacts"><Button variant="secondary">Back to Contacts</Button></Link>} />;
  }

  const stats = statsFor(db, customer);
  const name = fullName(customer) || 'Unknown';
  const rating = customer.rating ?? 0;
  const address = [customer.street, customer.city, `${customer.state} ${customer.zip}`.trim()].filter(Boolean).join(', ') || '-';

  // Service locations: the contact's own address plus any different lead addresses.
  const locations = [
    { key: 'primary', street: customer.street, line2: `${customer.city}, ${customer.state} ${customer.zip}`, label: 'Primary' },
    ...related.leads
      .filter((l) => `${l.street}|${l.zip}`.toLowerCase() !== `${customer.street}|${customer.zip}`.toLowerCase())
      .filter((l, i, arr) => arr.findIndex((x) => `${x.street}|${x.zip}` === `${l.street}|${l.zip}`) === i)
      .map((l) => ({ key: l.id, street: l.street, line2: `${l.city}, ${l.state} ${l.zip}`, label: l.leadNumber })),
  ];

  // Activity for this contact: feed items about their leads, estimates, jobs or invoices.
  const ids = new Set([...related.leads, ...related.estimates, ...related.jobs, ...related.invoices].map((x) => x.id));
  const activity = c.activity.filter((a) => (a.entityId && ids.has(a.entityId)) || a.text.includes(name)).slice(0, 20);

  const setRating = (n: number) => { customers.update(customer.id, { rating: n }); toast('Rating updated'); };
  const jobNumber = (jobId?: string) => c.jobs.find((j) => j.id === jobId)?.jobNumber;

  return (
    <>
      {/* Header card */}
      <div className="relative mb-8 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm md:p-8">
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row">
          <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <h1 className="font-heading text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl md:text-4xl">{name}</h1>
              <div className="group flex items-center gap-0.5 sm:gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setRating(n)} title={`Rate ${n} star${n > 1 ? 's' : ''}`} className="transition-transform hover:scale-110 active:scale-90">
                    <Star className={cn('h-5 w-5 transition-colors sm:h-6 sm:w-6', rating >= n ? 'fill-amber-400 text-amber-400' : 'text-gray-300 hover:text-amber-200')} />
                  </button>
                ))}
                {rating > 0 && (
                  <button type="button" onClick={() => setRating(0)} title="Clear rating" className="ml-1 text-gray-300 transition-opacity hover:text-red-400 lg:opacity-0 lg:group-hover:opacity-100">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase', CONTACT_TYPE_COLORS[customer.type])}>{customer.type}</span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 pl-1 text-sm font-medium text-gray-500 md:text-base">
              <a href={`tel:${customer.phone}`} className="flex items-center gap-2 hover:text-gray-800"><Phone className="h-4 w-4 text-gray-400" /> {formatPhone(customer.phone) || '-'}</a>
              <a href={`mailto:${customer.email}`} className="flex items-center gap-2 hover:text-gray-800"><Mail className="h-4 w-4 text-gray-400" /> {customer.email || '-'}</a>
              <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400" /> {address}</span>
            </div>
            {(customer.companyName || customer.secondaryPhone) && (
              <div className="flex flex-wrap gap-x-6 pl-1 text-sm text-gray-400">
                {customer.companyName && <span>{customer.companyName}</span>}
                {customer.secondaryPhone && <span>Alt: {formatPhone(customer.secondaryPhone)}</span>}
                <span>Source: {customer.source}</span>
                <span>Added {shortDate(customer.createdAt)}</span>
              </div>
            )}
          </div>

          <div className="flex w-full flex-row flex-wrap items-center gap-3 lg:w-auto lg:flex-nowrap">
            <Button variant="secondary" className="flex-1 lg:flex-none" icon={<Calendar className="h-4 w-4" />} onClick={() => setScheduleOpen(true)}>Schedule Estimate</Button>
            <Link
              href={`/estimates/new?customerId=${customer.id}`}
              className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary-600 px-4 py-2.5 lg:flex-none text-sm font-bold text-white shadow-xl shadow-primary-500/20 hover:bg-primary-700"
            >
              <Plus className="h-5 w-5" /> Create New Estimate
            </Link>
            <DropdownMenu
              items={[
                { label: 'Edit Contact', icon: <Edit2 />, onClick: () => setEditOpen(true) },
                { label: 'Delete Contact', icon: <Trash2 />, danger: true, onClick: () => setConfirmDelete(true) },
              ]}
              trigger={
                <button type="button" aria-label="More actions" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm hover:border-gray-300">
                  <MoreVertical className="h-5 w-5 text-gray-400" />
                </button>
              }
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-8">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="font-heading text-lg font-bold text-gray-900">Service Locations</h3>
              <button type="button" title="Edit address" onClick={() => setEditOpen(true)} className="text-primary-600 hover:text-primary-700"><Plus className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              {locations.map((loc) => (
                <div key={loc.key} className="group relative rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400"><MapPin className="h-4 w-4" /></div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-gray-900">{loc.street || '-'}</div>
                      <div className="text-xs text-gray-500">{loc.line2}</div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">{loc.label}</div>
                      <LocationPaintChips customerId={customer.id} street={loc.street} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-6 font-heading text-lg font-bold text-gray-900">Customer Stats</h3>
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <span className="font-medium text-gray-500">Total Jobs</span>
                <span className="font-bold text-gray-900">{stats.totalJobs}</span>
              </div>
              <button type="button" onClick={() => setTab('jobs')} className="group flex w-full items-center justify-between rounded border-b border-gray-100 pb-2 text-left">
                <span className="flex items-center gap-1 font-medium text-gray-500 group-hover:text-primary-700">Active Jobs <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100" /></span>
                <span className={cn('font-bold', stats.activeJobs > 0 ? 'text-amber-600' : 'text-gray-400')}>{stats.activeJobs}</span>
              </button>
              <button type="button" onClick={() => setTab('invoices')} className="group flex w-full items-center justify-between rounded text-left">
                <span className="flex items-center gap-1 font-medium text-gray-500 group-hover:text-primary-700">Total Value <Eye className="h-3 w-3 opacity-0 group-hover:opacity-100" /></span>
                <span className="text-lg font-bold text-gray-900 group-hover:text-primary-700">${Math.round(stats.lifetimeValue).toLocaleString()}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right column: tabs */}
        <div className="min-w-0 lg:col-span-2">
          <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1 lg:flex-wrap">

            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition-colors',
                  tab === t.key ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                )}
              >
                {t.label}
                {t.isNew && <NewBadge feature={[25, 26, 28]} />}
              </button>
            ))}
          </div>

          {tab === 'leads' && <LeadsTab leads={related.leads} />}
          {tab === 'estimates' && <EstimatesTab estimates={related.estimates} />}
          {tab === 'invoices' && <InvoicesTab invoices={related.invoices} jobNumber={jobNumber} />}
          {tab === 'jobs' && <JobHistoryTab jobs={related.jobs} customerId={customer.id} />}
          {tab === 'conversations' && <ConversationsTab messages={related.messages} />}
          {tab === 'paint-history' && <PaintHistoryHost customerId={customer.id} />}
          {tab === 'notes' && (
            <div className="space-y-6">
              <NotesSection
                notes={customer.notes}
                onAddNote={(t) => { customers.update(customer.id, { notes: appendNote(customer.notes, t) }); toast('Note added'); }}
              />
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-6 text-xs font-bold uppercase tracking-widest text-gray-500">Activity Log</div>
                {activity.length === 0 ? (
                  <div className="py-8 text-center text-sm italic text-gray-400">No activity recorded yet.</div>
                ) : (
                  <ul className="space-y-4">
                    {activity.map((a) => (
                      <li key={a.id} className="flex gap-3">
                        <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-400" />
                        <div>
                          <div className="text-sm text-gray-700">{a.text}</div>
                          <div className="text-xs text-gray-400">{new Date(a.date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ContactFormModal open={editOpen} onOpenChange={setEditOpen} customer={customer} />
      <ContactScheduleModal open={scheduleOpen} onOpenChange={setScheduleOpen} customer={customer} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Contact"
        message={`Are you sure you want to delete "${name}"? This action is permanent.`}
        onConfirm={() => { deleteContact(customer); toast('Contact deleted'); router.push('/contacts'); }}
      />
    </>
  );
}
