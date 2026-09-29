'use client';

/*
  /estimates/new - full-page version of the "Start New Estimate" flow.
  Other screens can link here with ?leadId=... or ?customerId=... to skip
  the client step (for example "Create Estimate" on a lead).
*/
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/Navigation';
import { Card, ListSkeleton } from '@/components/ui/display';
import { CreateEstimateWizard } from '@/components/estimates/CreateEstimateWizard';

function NewEstimate() {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 font-heading text-3xl font-bold tracking-tight text-gray-900">Start New Estimate</h1>
      <p className="mb-8 text-gray-500">Pick a client, a project type and a template, then fill in the estimate details. The estimate is saved as a draft.</p>
      <Card className="p-6">
        <CreateEstimateWizard
          initialLeadId={params.get('leadId') ?? undefined}
          initialCustomerId={params.get('customerId') ?? undefined}
          initialLocationId={params.get('locationId') ?? undefined}
          onCancel={() => router.push('/estimates')}
          onCreated={(id) => router.replace(`/estimates/${id}`)}
          onSaved={() => router.push('/estimates')}
        />
      </Card>
    </div>
  );
}

export default function NewEstimatePage() {
  return (
    <PageShell title="New Estimate" breadcrumbs={[{ label: 'Estimates', href: '/estimates' }]} backHref="/estimates">
      <Suspense fallback={<ListSkeleton rows={3} />}>
        <NewEstimate />
      </Suspense>
    </PageShell>
  );
}
