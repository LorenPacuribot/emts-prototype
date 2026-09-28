'use client';

/* Settings > Estimate Templates > Edit Template editor (id from the URL). The editor lives in components/settings/library/TemplateEditor.tsx. */
import { useParams } from 'next/navigation';
import { TemplateEditor } from '@/components/settings/library/TemplateEditor';

export default function Page() {
  const params = useParams<{ id: string }>();
  return <TemplateEditor id={params?.id} />;
}
