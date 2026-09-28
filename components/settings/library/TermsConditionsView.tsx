'use client';

/*
  Settings > Terms & Conditions.
  Legal and payment term templates. One can be the default: new
  estimates start with it. Estimate templates pick a terms template in
  their Finalize section. Deleting terms clears them from any estimate
  template that used them.
*/
import { useEffect, useMemo, useState } from 'react';
import { Plus, Star } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Label } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useCollection } from '@/lib/store';
import type { TermsCondition } from '@/lib/types';
import { CardKebab, FieldError, FormActions, LibraryCard, LibraryGrid, LibraryToolbar, NoMatches, Pill, useLibraryCrud } from './ui';
import { RichContent, RichTextEditor } from './RichText';

export function TermsConditionsView() {
  const { items, add, update, remove } = useCollection('termsConditions');
  const templates = useCollection('estimateTemplates');
  const { toast } = useToast();
  const crud = useLibraryCrud<TermsCondition>();
  const [search, setSearch] = useState('');

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((t) => t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q));
  }, [items, search]);

  /** Only one default at a time. */
  const makeDefault = (id: string) => items.forEach((t) => (t.isDefault !== (t.id === id) ? update(t.id, { isDefault: t.id === id }) : undefined));

  return (
    <SettingsPage
      title="Terms & Conditions"
      subtitle="Manage legal and payment term templates."
      actions={<Button icon={<Plus className="h-4 w-4" />} onClick={crud.openAdd}>Add Terms</Button>}
    >
      <LibraryToolbar search={search} onSearch={setSearch} placeholder="Search terms..." />
      <LibraryGrid cols={2}>
        {list.map((t) => (
          <LibraryCard key={t.id}>
            <div className="absolute right-4 top-4">
              <CardKebab
                onEdit={() => crud.openEdit(t)}
                onDelete={() => crud.askDelete(t)}
                extra={t.isDefault ? [] : [{ label: 'Set as Default', icon: <Star />, onClick: () => { makeDefault(t.id); toast(`"${t.name}" is now the default`); } }]}
              />
            </div>
            <div className="mb-3 flex items-center gap-2 pr-10 pt-1">
              <h3 className="font-heading text-base font-bold text-gray-900">{t.name}</h3>
              {t.isDefault && <Pill>Default</Pill>}
            </div>
            <div className="border-t border-gray-100 pt-3">
              <RichContent text={t.content} className="max-h-32 overflow-hidden text-xs leading-relaxed text-gray-700 [mask-image:linear-gradient(to_bottom,black_75%,transparent)]" />
            </div>
          </LibraryCard>
        ))}
        {list.length === 0 && <NoMatches>{search ? 'No terms found matching your search.' : 'No terms yet. Click "Add Terms" to create one.'}</NoMatches>}
      </LibraryGrid>

      <TermModal
        open={crud.open}
        onOpenChange={crud.setOpen}
        term={crud.editing}
        onSave={(data) => {
          const now = new Date().toISOString();
          let id = crud.editing?.id;
          if (crud.editing) {
            update(crud.editing.id, { name: data.name, content: data.content, updatedAt: now });
            toast('Terms updated successfully');
          } else {
            id = add({ name: data.name, content: data.content, isDefault: items.length === 0, createdAt: now, updatedAt: now }).id;
            toast('Terms created successfully');
          }
          if (data.isDefault && id) makeDefault(id);
          crud.close();
        }}
      />
      <ConfirmDialog
        open={!!crud.deleting}
        onOpenChange={(o) => !o && crud.clearDelete()}
        title="Delete Terms"
        message={`Are you sure you want to delete "${crud.deleting?.name}"?${crud.deleting?.isDefault ? ' This is your default terms template.' : ''}`}
        onConfirm={() => {
          const d = crud.deleting;
          if (!d) return;
          remove(d.id);
          templates.items.filter((t) => t.termsId === d.id).forEach((t) => templates.update(t.id, { termsId: undefined }));
          toast('Terms deleted successfully');
        }}
      />
    </SettingsPage>
  );
}

function TermModal({
  open, onOpenChange, term, onSave,
}: { open: boolean; onOpenChange: (o: boolean) => void; term: TermsCondition | null; onSave: (d: { name: string; content: string; isDefault: boolean }) => void }) {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(term?.name ?? '');
    setContent(term?.content ?? '');
    setIsDefault(term?.isDefault ?? false);
    setErrors({});
  }, [open, term]);

  const submit = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Template name is required';
    if (!content.trim()) e.content = 'Content is required';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave({ name: name.trim(), content: content.trim(), isDefault });
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={term ? 'Edit Term' : 'Add New Term'} size="lg">
      <div className="space-y-5">
        <Field label="Template Name" required error={errors.name}>
          <Input value={name} invalid={!!errors.name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Standard Residential" />
        </Field>
        <div>
          <Label required>Content</Label>
          <RichTextEditor value={content} onChange={setContent} placeholder="Enter terms and conditions..." invalid={!!errors.content} />
          <FieldError>{errors.content}</FieldError>
        </div>
        <FormActions
          onCancel={() => onOpenChange(false)}
          submitLabel={term ? 'Save Changes' : 'Add Term'}
          onSubmit={submit}
          left={<Checkbox checked={isDefault} onChange={setIsDefault} label="Set as default" />}
        />
      </div>
    </Modal>
  );
}
