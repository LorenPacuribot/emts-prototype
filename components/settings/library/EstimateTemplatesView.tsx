'use client';

/*
  Settings > Estimate Templates (list).
  Reusable project structures (areas, line items, paint, terms) used to
  start new estimates quickly. Cards show area and item counts; the kebab
  offers Edit / Duplicate / Set as Default / Delete. "New Template" and
  Edit open the full editor at /settings/estimate-templates/new and /[id].
*/
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Edit2, FileText, Plus, Star, Trash2 } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { RowMenu } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { useCollection } from '@/lib/store';
import type { EstimateTemplate } from '@/lib/types';
import { LibraryCard, LibraryGrid, LibraryToolbar, Pill } from './ui';

export function EstimateTemplatesView() {
  const { items, add, update, remove } = useCollection('estimateTemplates');
  const router = useRouter();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<EstimateTemplate | null>(null);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
  }, [items, search]);

  const duplicate = (t: EstimateTemplate) => {
    const now = new Date().toISOString();
    const { id: _id, ...rest } = t;
    add({ ...structuredClone(rest), name: `${t.name} (Copy)`, isDefault: false, createdAt: now, updatedAt: now });
    toast('Template duplicated');
  };

  const setDefault = (t: EstimateTemplate) => {
    items.forEach((x) => x.isDefault !== (x.id === t.id) && update(x.id, { isDefault: x.id === t.id }));
    toast(`"${t.name}" is now the default template`);
  };

  return (
    <SettingsPage
      title="Estimate Templates"
      subtitle="Manage reusable project structures to speed up estimation."
      actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => router.push('/settings/estimate-templates/new')}>New Template</Button>}
    >
      <LibraryToolbar search={search} onSearch={setSearch} placeholder="Search templates..." />

      {list.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h3 className="font-heading text-lg font-bold text-gray-900">No Templates Found</h3>
          <p className="mt-2 text-gray-500">{search ? 'No templates found matching your search.' : 'Create your first estimate template to get started.'}</p>
          {!search && (
            <Button className="mt-5" icon={<Plus className="h-4 w-4" />} onClick={() => router.push('/settings/estimate-templates/new')}>New Template</Button>
          )}
        </div>
      ) : (
        <LibraryGrid>
          {list.map((t) => (
            <LibraryCard key={t.id} onClick={() => router.push(`/settings/estimate-templates/${t.id}`)}>
              <div className="absolute right-4 top-4" onClick={(e) => e.stopPropagation()}>
                <RowMenu
                  items={[
                    { label: 'Edit', icon: <Edit2 />, onClick: () => router.push(`/settings/estimate-templates/${t.id}`) },
                    { label: 'Duplicate', icon: <Copy />, onClick: () => duplicate(t) },
                    { label: 'Set as Default', icon: <Star />, onClick: () => setDefault(t), disabled: t.isDefault },
                    { label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => setDeleting(t) },
                  ]}
                />
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-2 pr-8 pt-4">
                <h3 className="font-heading text-base font-bold text-gray-900">{t.name || 'Untitled Template'}</h3>
                {t.isDefault && <Pill color="blue">Default</Pill>}
              </div>
              <p className="mb-6 h-10 text-xs text-gray-500 line-clamp-2">{t.description || 'No description provided.'}</p>
              <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <span>{t.areaTemplateIds.length} Areas</span>
                <span>{t.lineItemTemplateIds.length} Items</span>
              </div>
            </LibraryCard>
          ))}
        </LibraryGrid>
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete Template"
        message={`Are you sure you want to delete "${deleting?.name}"? This action cannot be undone.`}
        onConfirm={() => {
          if (deleting) remove(deleting.id);
          toast('Template deleted successfully');
        }}
      />
    </SettingsPage>
  );
}
