'use client';

/*
  /estimates/[id]/preview - the printable, customer-facing proposal.
  Actions: Back to Edit, Print / PDF (window.print), Email to Customer
  (marks the estimate Sent) and Open Client View.
  /preview?print=1 opens the print dialog right away (used by "Print / PDF"
  in the builder).
*/
import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, FileQuestion, Mail, Printer } from 'lucide-react';
import { PageShell } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { EmptyState, ListSkeleton } from '@/components/ui/display';
import { useToast } from '@/components/ui/toast';
import { useCollection, useLookups, useSingleton } from '@/lib/store';
import { ProposalDocument } from '@/components/estimates/ProposalDocument';
import { PrintPortal } from '@/components/estimates/PrintPortal';
import { SendEstimateModal } from '@/components/estimates/SendEstimateModal';
import { EstimateStatusBadge } from '@/components/estimates/StatusBadge';
import { useEstimateActions } from '@/components/estimates/useEstimateActions';

function Preview() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { get } = useCollection('estimates');
  const look = useLookups();
  const [bp] = useSingleton('businessProfile');
  const actions = useEstimateActions();
  const { toast } = useToast();
  const [sendOpen, setSendOpen] = useState(false);
  const e = get(id);
  const autoPrint = params.get('print') === '1';

  useEffect(() => {
    if (!autoPrint || !e) return;
    const t = setTimeout(() => window.print(), 500);
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

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => router.push(`/estimates/${e.id}`)}>Back to Edit</Button>
          <EstimateStatusBadge status={e.status} size="md" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" icon={<ExternalLink className="h-4 w-4" />} onClick={() => router.push(`/estimates/${e.id}/client-view`)}>Open Client View</Button>
          <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print / PDF</Button>
          <Button icon={<Mail className="h-4 w-4" />} onClick={() => setSendOpen(true)}>Email to Customer</Button>
        </div>
      </div>

      <ProposalDocument estimate={e} className="print:hidden" />
      <PrintPortal>
        <ProposalDocument estimate={e} />
      </PrintPortal>

      <SendEstimateModal
        open={sendOpen}
        onOpenChange={setSendOpen}
        estimate={e}
        customer={look.customer(e.customerId)}
        companyName={bp.companyName}
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
