'use client';

import { useParams } from 'next/navigation';
import { Screen } from '@/features/components/layout/screen';
import { TemplateEditorPage } from '@/components/automations/AutomationEditor';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <Screen crumbs={[{ label: 'Automations', href: '/automations?tab=templates' }, { label: 'Edit template' }]}>
      <TemplateEditorPage id={id} />
    </Screen>
  );
}
