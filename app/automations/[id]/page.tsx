'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Screen } from '@/features/components/layout/screen';
import { AutomationEditorPage } from '@/components/automations/AutomationEditor';
import { useParam } from '@/features/lib/navigation';

function Editor() {
  const { id } = useParams<{ id: string }>();
  const tab = useParam('tab');
  return <AutomationEditorPage id={id} tab={tab} />;
}

export default function Page() {
  return (
    <Screen crumbs={[{ label: 'Automations', href: '/automations?tab=all' }, { label: 'Edit automation' }]}>
      <Suspense fallback={null}>
        <Editor />
      </Suspense>
    </Screen>
  );
}
