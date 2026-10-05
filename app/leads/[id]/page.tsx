'use client';

/*
  Lead Details (/leads/[id]) (live: features/(main)/leads/details/templates/index.tsx).
  Header: avatar, name, LEAD/CONTACT/CLIENT badge, location, source, created date,
  appointment chip and actions (Schedule/Reschedule, Convert, estimate link or
  Create New Estimate, and a menu with Edit / Archive / Delete).
  Below: the stage bar, contact info, job location, lead details and notes.
  NEW (29): the Repaint alert source, the Repaint Follow-Up card (with New Estimate
  from History, 28, booked on this same lead), and the follow-up lock: while an
  open follow-up drives the lead, the stage bar and Archive are locked with the reason.
*/
import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Archive, ArrowLeft, Briefcase, Calendar, DollarSign, Edit2, FileText, Mail, MapPin, MoreVertical, Phone,
  Plus, RefreshCw, RotateCcw, Shield, Star, Tag, Trash2, User, UserCheck, Wrench,
} from 'lucide-react';
import type { Lead } from '@/lib/types';
import { PageShell } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { DropdownMenu } from '@/components/ui/menu';
import { EmptyState } from '@/components/ui/display';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { useCollection, useLookups } from '@/lib/store';
import { useToast } from '@/components/ui/toast';
import { cn, fullName, longDate, money, shortDate } from '@/lib/utils';
import { LEAD_LIFECYCLE, formatPhone, time12 } from '@/components/leads/leadHelpers';
import { useLeadActions } from '@/components/leads/useLeadActions';
import { LeadFormModal } from '@/components/leads/LeadFormModal';
import { ScheduleEstimateModal } from '@/components/leads/ScheduleEstimateModal';
import { PipelineStatusBar } from '@/components/leads/PipelineStatusBar';
import { NotesSection } from '@/components/leads/NotesSection';
import { LeadMessagesCard } from '@/components/leads/LeadMessagesCard';
import { JourneyBar, StageHistoryCard } from '@/components/leads/StageHistory';
import { FeatureGate } from '@/features/components/ui';
import { FollowUpLockNote, LeadSourceChip, PossibleDuplicateChip, RepaintFollowUpHost, useFollowUpLocks } from '@/components/leads/leadFeatures';
import { PropertyMapCard, ServiceLocationModal, useAddServiceLocation } from '@/components/contacts/ServiceLocations';
import { JourneyCard } from '@/components/automations/JourneyCard';

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const leads = useCollection('leads');
  const estimates = useCollection('estimates');
  const lookups = useLookups();
  const actions = useLeadActions();
  const { toast } = useToast();
  const lockOf = useFollowUpLocks();

  const [editOpen, setEditOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const lead = leads.get(id);

  if (!lead) {
    return (
      <PageShell title="Lead Details" breadcrumbs={[{ label: 'Leads', href: '/leads' }]} backHref="/leads">
        <BackLink />
        <EmptyState title="Lead not found." message="This lead may have been deleted." action={<Link href="/leads"><Button variant="secondary">Back to Pipeline</Button></Link>} />
      </PageShell>
    );
  }

  // Linked estimate: the one stored on the lead, or any estimate created from it.
  const estimate = lookups.estimate(lead.estimateId) ?? estimates.items.find((e) => e.leadId === lead.id);
  const estimator = lookups.member(lead.appointment?.estimatorId);
  const assigned = lookups.member(lead.assignedTo);
  const customer = lookups.customer(lead.customerId);
  const lifecycle = LEAD_LIFECYCLE[lead.status];
  const isArchived = lead.status === 'Archived';
  const lock = lockOf(lead.id);

  const menuItems = [
    { label: 'Edit Lead', icon: <Edit2 />, onClick: () => setEditOpen(true) },
    ...(lock ? [] : [isArchived
      ? { label: 'Unarchive Lead', icon: <RotateCcw />, onClick: () => actions.restore(lead) }
      : { label: 'Archive Lead', icon: <Archive />, onClick: () => { actions.archive(lead); router.push('/leads'); } }]),
    { label: 'Delete Lead', icon: <Trash2 />, danger: true, separatorBefore: true, onClick: () => setConfirmDelete(true) },
  ];

  return (
    <PageShell title="Lead Details" breadcrumbs={[{ label: 'Leads', href: '/leads' }]} backHref="/leads">
      <BackLink />

      {/* Header card */}
      <div className="mb-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-100 text-3xl font-bold text-blue-600">
              {lead.firstName.charAt(0) || '?'}
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-3">
                <h1 className="font-heading text-3xl font-extrabold leading-tight text-gray-900">{lead.firstName} {lead.lastName}</h1>
                <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide', lifecycle.color)}>{lifecycle.label}</span>
                {isArchived && <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs font-bold uppercase text-gray-500">Archived</span>}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1"><MapPin className="h-4 w-4 text-gray-500" />{lead.city ? `${lead.city}, ${lead.state}` : 'No Location'}</span>
                <LeadSourceChip
                  lead={lead}
                  className="rounded-full uppercase tracking-wider"
                  fallback={<span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xxs font-bold uppercase tracking-wider text-gray-600">{lead.leadSource || 'Website'}</span>}
                />
                <PossibleDuplicateChip lead={lead} />
                <span className="text-gray-500">Created: {shortDate(lead.date)}</span>
                <span className="text-xs font-semibold text-gray-500">{lead.leadNumber}</span>
                {lead.appointment && (
                  <Link href="/calendar" className="flex items-center gap-1.5 rounded-md border border-primary-100 bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100">
                    <Calendar className="h-3.5 w-3.5" />
                    {longDate(lead.appointment.date).replace(/, \d{4}$/, '')}, {time12(lead.appointment.time)}
                    {estimator && ` with ${fullName(estimator)}`}
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-start lg:shrink-0 lg:flex-nowrap lg:self-center">
            {/* A follow-up lead is booked from its Repaint Follow-Up card (New Estimate from History). */}
            {(lead.status === 'Contacted' || lead.status === 'Scheduled') && !lock && (
              <Button variant="secondary" size="lg" className="text-sm" onClick={() => setScheduleOpen(true)} icon={lead.appointment ? <RefreshCw className="h-5 w-5" /> : <Calendar className="h-5 w-5" />}>
                {lead.appointment ? 'Reschedule' : 'Schedule'}
              </Button>
            )}
            {!lead.customerId && (
              <Button size="lg" className="text-sm" onClick={() => actions.convert(lead)} icon={<Briefcase className="h-5 w-5" />}>Convert</Button>
            )}
            {estimate ? (
              <Link href={`/estimates/${estimate.id}`} className="flex items-center gap-2 whitespace-nowrap rounded-xl border border-gray-200 bg-white px-4 py-2.5 font-bold text-gray-700 shadow-sm hover:bg-gray-50">
                <FileText className="h-5 w-5" /> {estimate.estimateNumber}
              </Link>
            ) : (
              lead.status === 'Scheduled' && (
                <Link
                  href={`/estimates/new?leadId=${lead.id}`}
                  onClick={() => { if (!lead.customerId) toast('Convert the lead first so the estimate has a customer.', 'info'); }}
                  className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-primary-600 px-4 py-2.5 font-bold text-white shadow-xl shadow-primary-500/20 hover:bg-primary-700"
                >
                  <Plus className="h-5 w-5" /> Create New Estimate
                </Link>
              )
            )}
            <DropdownMenu
              items={menuItems}
              trigger={
                <button type="button" aria-label="More actions" className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm hover:border-gray-300">
                  <MoreVertical className="h-5 w-5 text-gray-500" />
                </button>
              }
            />
          </div>
        </div>

        {isArchived ? (
          <div className="mt-8 flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            This lead is archived and hidden from the pipeline.
            {!lock && <Button variant="secondary" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => actions.restore(lead)}>Unarchive</Button>}
          </div>
        ) : (
          <PipelineStatusBar
            current={lead.status}
            onChange={(s) => actions.changeStatus(lead, s)}
            lockedBy={lock?.id}
            lockNote={lock && <FollowUpLockNote fu={lock} className="mb-3" />}
          />
        )}
      </div>

      {/* CRM-C7 (Complete): where the lead is in each pipeline. */}
      <FeatureGate item="CRM-C7"><div className="mb-8"><JourneyBar lead={lead} /></div></FeatureGate>

      {/* Main grid */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
        <div className="space-y-8">
          <ContactInfoCard lead={lead} customerHref={customer ? `/contacts/${customer.id}` : undefined} />
          <JobLocationCard lead={lead} />
          <LeadDetailsCard lead={lead} assignedName={assigned ? fullName(assigned) : undefined} />
          <JourneyCard type="LEAD" id={lead.id} />
        </div>
        <div className="min-w-0 space-y-8 lg:col-span-2">
          <RepaintFollowUpHost leadId={lead.id} />
          <LeadMessagesCard lead={lead} onCancel={(id) => actions.cancelScheduled(lead, id)} />
          <FeatureGate item="CRM-M7"><StageHistoryCard lead={lead} /></FeatureGate>
          <NotesSection notes={lead.notes} onAddNote={(t) => actions.addNote(lead, t)} />
        </div>
      </div>

      <LeadFormModal open={editOpen} onOpenChange={setEditOpen} lead={lead} />
      <ScheduleEstimateModal open={scheduleOpen} onOpenChange={setScheduleOpen} lead={lead} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Lead"
        message={`Are you sure you want to delete "${lead.firstName} ${lead.lastName}"? This action cannot be undone.`}
        onConfirm={() => { actions.remove(lead); router.push('/leads'); }}
      />
    </PageShell>
  );
}

function BackLink() {
  return (
    <Link href="/leads" className="mb-6 flex w-fit items-center gap-2 text-sm font-bold text-gray-500 transition-colors hover:text-gray-900">
      <ArrowLeft className="h-4 w-4" /> Back to Pipeline
    </Link>
  );
}

const card = 'rounded-3xl border border-gray-200 bg-white p-6 shadow-sm';
const cardHead = 'mb-6 flex items-center gap-2 text-gray-500';
const cardHeadLabel = 'text-xs font-bold uppercase tracking-widest';

/** One labelled value in a gray tile with a round colored icon. */
function InfoTile({ icon, iconCls, label, value }: { icon: React.ReactNode; iconCls: string; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-4">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full [&>svg]:h-5 [&>svg]:w-5', iconCls)}>{icon}</div>
      <div className="min-w-0">
        <div className="mb-0.5 text-xxs font-bold uppercase tracking-widest text-gray-500">{label}</div>
        <div className="truncate text-base font-bold text-gray-900">{value}</div>
      </div>
    </div>
  );
}

function ContactInfoCard({ lead, customerHref }: { lead: Lead; customerHref?: string }) {
  return (
    <div className={card}>
      <div className={cn(cardHead, 'justify-between')}>
        <span className="flex items-center gap-2"><User className="h-4 w-4" /><span className={cardHeadLabel}>Contact Information</span></span>
        {customerHref && (
          <Link href={customerHref} className="flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700">
            <UserCheck className="h-3.5 w-3.5" /> View Contact
          </Link>
        )}
      </div>
      <div className="space-y-4">
        <InfoTile icon={<Phone />} iconCls="bg-blue-100 text-blue-600" label="Phone" value={lead.phone ? <a href={`tel:${lead.phone}`} className="hover:text-primary-700">{formatPhone(lead.phone)}</a> : '-'} />
        <InfoTile icon={<Mail />} iconCls="bg-purple-100 text-purple-600" label="Email" value={lead.email ? <a href={`mailto:${lead.email}`} className="hover:text-primary-700">{lead.email}</a> : '-'} />
        {lead.secondaryPhone && <InfoTile icon={<Phone />} iconCls="bg-blue-50 text-blue-400" label="Secondary Phone" value={formatPhone(lead.secondaryPhone)} />}
        {lead.secondaryEmail && <InfoTile icon={<Mail />} iconCls="bg-purple-50 text-purple-400" label="Secondary Email" value={lead.secondaryEmail} />}
        {lead.securityCode && <InfoTile icon={<Shield />} iconCls="bg-amber-100 text-amber-600" label="Security Code" value={lead.securityCode} />}
        {lead.companyName && <InfoTile icon={<Briefcase />} iconCls="bg-gray-200 text-gray-600" label="Company" value={lead.companyName} />}
      </div>
    </div>
  );
}

/*
  Job Location: the lead's property on an interactive map with directions.
  "Add Service Location" sets the lead's address when it has none; otherwise
  it attaches another property to the lead's customer (patent 1).
*/
function JobLocationCard({ lead }: { lead: Lead }) {
  const leads = useCollection('leads');
  const customers = useCollection('customers');
  const addLocation = useAddServiceLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const customer = customers.get(lead.customerId);
  const firstProperty = !lead.street;

  const save = (d: { label: string; street: string; unit: string; city: string; state: string; zip: string }) => {
    if (firstProperty || !customer) {
      const address = { street: [d.street, d.unit].filter(Boolean).join(' '), city: d.city, state: d.state, zip: d.zip };
      leads.update(lead.id, { ...address, updatedAt: new Date().toISOString() });
      // A contact with no address takes the lead's property as its primary address.
      if (customer && !customer.street) customers.update(customer.id, address);
      toast('Property attached to the lead');
      return;
    }
    addLocation(customer, d);
  };

  return (
    <div className={card}>
      <div className={cn(cardHead, 'justify-between')}>
        <span className="flex items-center gap-2"><MapPin className="h-4 w-4" /><span className={cardHeadLabel}>Job Location</span></span>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Add Service Location</Button>
      </div>
      <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-5">
        <div className="mb-1 text-lg font-bold text-gray-900">{lead.street || 'No address provided'}</div>
        <div className="text-gray-500">{[lead.city, [lead.state, lead.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</div>
        {lead.street && <PropertyMapCard address={{ street: lead.street, city: lead.city, state: lead.state, zip: lead.zip }} />}
      </div>
      {customer && (customer.serviceLocations?.length ?? 0) > 0 && (
        <div className="mb-4 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Other service locations</div>
          {customer.serviceLocations!.map((l) => (
            <div key={l.id} className="rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm">
              <div className="font-semibold text-gray-800">{[l.street, l.unit].filter(Boolean).join(' ')}</div>
              <div className="text-xs text-gray-500">{l.city}, {l.state} {l.zip}{l.label ? ` · ${l.label}` : ''}</div>
              <PropertyMapCard address={l} known={{ lat: l.lat, lng: l.lng }} compact />
            </div>
          ))}
        </div>
      )}
      <ServiceLocationModal
        open={open}
        onOpenChange={setOpen}
        title={firstProperty || !customer ? 'Add Service Location' : 'Add Another Service Location'}
        onSave={save}
      />
      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <span className="text-sm font-medium text-gray-500">Auto-ID</span>
        <span className="rounded bg-gray-100 px-2 py-1 font-mono text-xs font-bold text-gray-600">{lead.leadNumber}</span>
      </div>
    </div>
  );
}

function LeadDetailsCard({ lead, assignedName }: { lead: Lead; assignedName?: string }) {
  const rows: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [
    { icon: <Tag />, label: 'Lead Source', value: lead.leadSource || '-' },
    { icon: <Wrench />, label: 'Service Type', value: lead.serviceType || '-' },
    { icon: <DollarSign />, label: 'Estimated Value', value: money(lead.estimatedValue || 0) },
    {
      icon: <Star />,
      label: 'Quality Rating',
      value: (
        <span className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={cn('h-4 w-4', (lead.qualityRating ?? 0) >= n ? 'fill-amber-400 text-amber-400' : 'text-gray-300')} />
          ))}
        </span>
      ),
    },
    { icon: <User />, label: 'Assigned Estimator', value: assignedName ?? 'Unassigned' },
  ];
  return (
    <div className={card}>
      <div className={cardHead}><FileText className="h-4 w-4" /><span className={cardHeadLabel}>Lead Details</span></div>
      <div className="divide-y divide-gray-100">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <span className="flex items-center gap-2 text-sm font-medium text-gray-500 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-gray-400">{r.icon}{r.label}</span>
            <span className="text-sm font-bold text-gray-900">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
