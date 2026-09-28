'use client';

/*
  Methodology 6.4 (/methodology)

  The live app has this route as a placeholder page ("Learn about the
  painting methodology standards."), so the replica shows the same.
*/
import { BookOpenCheck } from 'lucide-react';
import { PageShell } from '@/components/Navigation';
import { EmptyState } from '@/components/ui/display';

export default function MethodologyPage() {
  return (
    <PageShell title="Methodology 6.4">
      <div className="mx-auto max-w-2xl pt-12">
        <EmptyState icon={<BookOpenCheck />} title="Methodology 6.4" message="Learn about the painting methodology standards. This page is coming soon." />
      </div>
    </PageShell>
  );
}
