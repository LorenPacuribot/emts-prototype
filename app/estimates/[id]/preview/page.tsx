'use client';

/*
  /estimates/[id]/preview - Client Preview (patent 11).

  Generates the customer presentation from the estimate:
  - Presentation: a Presentation Builder template linked to this estimate's
    template or type (chosen when there are several), or the standard proposal.
  - Gear icon: show or hide content blocks (property, scope, specs, optional
    items, pricing, ...) or the template's own sections.
  - ⋯ on each line: hide the line, or hide parts of it (colour, product, price...).
  - Send to Customer (email; marks the estimate Sent), Copy Link (the
    customer's page) and Download PDF (print to PDF).
  Choices are saved on the estimate (Estimate.presentation), so the
  customer's page and the PDF show exactly this.
  /preview?print=1 opens the print dialog right away.
*/
import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Download, FileQuestion, Link2, Presentation as PresentationIcon, Send, Settings2, X } from 'lucide-react';
import type { EstimatePresentationSettings } from '@/lib/types';
import { PageShell } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { EmptyState, ListSkeleton } from '@/components/ui/display';
import { NativeSelect } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useCollection, useLookups, useSingleton } from '@/lib/store';
import { cn } from '@/lib/utils';
import { PROPOSAL_SECTIONS, chosenTemplate, matchingTemplates, sectionShown, settingsOf, toggleSection } from '@/lib/proposal';
import { ProposalDocument } from '@/components/estimates/ProposalDocument';
import { PrintPortal } from '@/components/estimates/PrintPortal';
import { SendEstimateModal } from '@/components/estimates/SendEstimateModal';
import { EstimateStatusBadge } from '@/components/estimates/StatusBadge';
import { useEstimateActions } from '@/components/estimates/useEstimateActions';
import { sendBlocker } from '@/components/estimates/estimate-utils';
import { PresentationCanvas } from '@/components/presentations/PresentationCanvas';
import { SECTION_META } from '@/components/presentations/presentation-utils';
import { useProtoEstimate } from '@/components/estimates/FeatureSections';
import { publicEstimateHref } from '@/features/lib/hrefs';
import { longDate } from '@/lib/utils';

function Preview() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { get, update } = useCollection('estimates');
  const { items: presentations } = useCollection('presentations');
  const look = useLookups();
  const [bp] = useSingleton('businessProfile');
  const actions = useEstimateActions();
  const { toast } = useToast();
  const [sendOpen, setSendOpen] = useState(false);
  const [gearOpen, setGearOpen] = useState(false);
  const e = get(id);
  // The customer link carries the estimate's access token, which is rotated on re-approval (patent 24).
  const proto = useProtoEstimate(id);
  const autoPrint = params.get('print') === '1';

  useEffect(() => {
    if (!autoPrint || !e) return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [autoPrint, e]);

  if (!e) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title="Estimate not found"
        message="This estimate may have been deleted."
        action={<Link href="/estimates" className="text-sm font-bold text-primary-600 hover:underline">Back to Estimates</Link>}
      />
    );
  }

  const settings = settingsOf(e);
  const templates = matchingTemplates(presentations, e);
  const template = chosenTemplate(presentations, e);
  const save = (s: EstimatePresentationSettings) => update(e.id, { presentation: s });
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const token = proto.est?.publicToken;
  const customerLink = `${origin}${token ? publicEstimateHref(token) : `/estimates/${e.id}/client-view`}`;
  const linkExpires = token ? proto.est?.validUntil : undefined;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(customerLink);
      toast(linkExpires ? `Secure link copied. It works until ${longDate(linkExpires)}.` : 'Customer link copied');
    } catch {
      window.prompt('Copy the customer link:', customerLink);
    }
  };

  const downloadPdf = () => {
    const before = document.title;
    // The browser's "Save as PDF" uses the page title as the file name.
    document.title = `${e.estimateNumber} ${e.title}`.trim();
    window.print();
    setTimeout(() => (document.title = before), 1000);
  };

  const pickTemplate = (value: string) => {
    if (value === 'proposal') save({ ...settings, useProposal: true, templateId: undefined });
    else save({ ...settings, useProposal: false, templateId: value });
    toast(value === 'proposal' ? 'Using the standard proposal' : 'Presentation generated from the template');
  };

  // Gear panel entries: proposal blocks, or the template's sections.
  const gearItems = template
    ? template.sections.filter((s) => s.enabled).map((s) => ({ key: s.id, label: s.title || SECTION_META[s.type].label, hint: SECTION_META[s.type].label }))
    : PROPOSAL_SECTIONS.map((s) => ({ key: s.key, label: s.label, hint: s.hint }));
  const hiddenCount = gearItems.filter((g) => !sectionShown(settings, g.key)).length;
  const hiddenLines = (settings.hiddenLines?.length ?? 0) + Object.keys(settings.hiddenLineParts ?? {}).length;

  const output = (editing: boolean) =>
    template ? (
      <PresentationCanvas presentation={template} estimate={e} onEstimateSettings={editing ? save : undefined} className="overflow-hidden rounded-2xl border border-gray-200 shadow-2xl print:rounded-none print:border-0 print:shadow-none" />
    ) : (
      <ProposalDocument estimate={e} onSettings={editing ? save : undefined} />
    );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => router.push(`/estimates/${e.id}`)}>Back to Edit</Button>
          <EstimateStatusBadge status={e.status} size="md" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" icon={<Link2 className="h-4 w-4" />} onClick={copyLink}>Copy Link</Button>
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={downloadPdf}>Download PDF</Button>
          <Button
            icon={<Send className="h-4 w-4" />}
            onClick={() => {
              const blocked = sendBlocker(e, look.customer(e.customerId));
              if (blocked) toast(blocked, 'error');
              else setSendOpen(true);
            }}
          >
            Send to Customer
          </Button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm print:hidden">
        <span className="flex items-center gap-2 text-sm font-bold text-gray-700"><PresentationIcon className="h-4 w-4 text-primary-600" /> Presentation</span>
        <NativeSelect value={template?.id ?? 'proposal'} onChange={(ev) => pickTemplate(ev.target.value)} aria-label="Presentation template" className="w-auto min-w-[240px]">
          <option value="proposal">Standard proposal</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </NativeSelect>
        {templates.length > 1 && !template && <span className="text-xs text-amber-700">{templates.length} templates match this estimate: choose one.</span>}
        {templates.length === 0 && (
          <span className="text-xs text-gray-500">
            No Presentation Builder template is linked to this estimate&apos;s template or type. <Link href="/presentations" className="font-semibold text-primary-600 hover:underline">Create one</Link>
          </span>
        )}
        <div className="flex-1" />
        {(hiddenCount > 0 || hiddenLines > 0) && (
          <span className="text-xs text-gray-500">{hiddenCount ? `${hiddenCount} section${hiddenCount === 1 ? '' : 's'} hidden` : ''}{hiddenCount && hiddenLines ? ' · ' : ''}{hiddenLines ? `${hiddenLines} line${hiddenLines === 1 ? '' : 's'} customised` : ''}</span>
        )}
        <Button variant={gearOpen ? 'dark' : 'secondary'} size="icon" onClick={() => setGearOpen((v) => !v)} aria-label="Show or hide content" title="Show or hide content">
          <Settings2 className="h-5 w-5" />
        </Button>
      </div>

      <div className={cn('grid gap-6 print:block', gearOpen && 'lg:grid-cols-[minmax(0,1fr)_300px]')}>
        <div className="min-w-0 print:hidden">
          <p className="mb-3 text-xs text-gray-500">Use the <b>⋯</b> on a line to hide it, or to show only some of its details. The customer sees exactly this page.</p>
          {output(true)}
        </div>
        {gearOpen && (
          <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:sticky lg:top-24 print:hidden" aria-label="Show or hide content">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-heading text-base font-bold text-gray-900">Show / hide</h3>
              <button type="button" onClick={() => setGearOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <ul className="space-y-1">
              {gearItems.map((g) => {
                const shown = sectionShown(settings, g.key);
                return (
                  <li key={g.key}>
                    <button
                      type="button"
                      onClick={() => save(toggleSection(settings, g.key))}
                      aria-pressed={shown}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', shown ? 'border-primary-500 bg-primary-500 text-white' : 'border-gray-300')}>{shown && <Check className="h-3.5 w-3.5" />}</span>
                      <span className="min-w-0">
                        <span className={cn('block font-semibold', shown ? 'text-gray-900' : 'text-gray-400')}>{g.label}</span>
                        {g.hint && g.hint !== g.label && <span className="block text-[11px] text-gray-400">{g.hint}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {(hiddenCount > 0 || hiddenLines > 0) && (
              <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => save({ templateId: settings.templateId, useProposal: settings.useProposal })}>Show everything again</Button>
            )}
          </aside>
        )}
      </div>

      <PrintPortal>{output(false)}</PrintPortal>

      <SendEstimateModal
        open={sendOpen}
        onOpenChange={setSendOpen}
        estimate={e}
        customer={look.customer(e.customerId)}
        companyName={bp.companyName}
        customerPageHref={customerLink}
        skipCheck
        onSend={(to) => {
          actions.send(e, to);
          toast(`Estimate sent to ${to}`);
        }}
      />
    </div>
  );
}

export default function EstimatePreviewPage() {
  return (
    <PageShell title="Client Preview" breadcrumbs={[{ label: 'Estimates', href: '/estimates' }]} backHref="/estimates">
      <Suspense fallback={<ListSkeleton rows={3} />}>
        <Preview />
      </Suspense>
    </PageShell>
  );
}
