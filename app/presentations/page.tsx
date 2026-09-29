'use client';

/*
  Presentation Builder list ("Create stunning proposals and portfolios to
  win more clients."). Matches the live grid of cards: cover image with a
  Draft/Published badge, title, kebab menu, scope tag(s) and updated date.
  We have no photos, so the cover is the presentation's gradient with an icon.
*/
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Copy, Edit2, Eye, FileText, Globe, LayoutTemplate, Paintbrush, Plus, Share2, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, SearchInput } from '@/components/ui/display';
import { RowMenu } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import { cn, shortDate, uid } from '@/lib/utils';
import type { Presentation } from '@/lib/types';
import { CreatePresentationModal, ShareModal } from '@/components/presentations/PresentationModals';

export default function PresentationsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { items, add, update, remove } = useCollection('presentations');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState<Presentation | null>(null);
  const [deleting, setDeleting] = useState<Presentation | null>(null);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((p) => !q || p.title.toLowerCase().includes(q) || p.scopes.join(' ').toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [items, search]);

  const duplicate = (p: Presentation) => {
    const now = new Date().toISOString();
    add(
      { ...p, id: undefined, title: `${p.title} (Copy)`, status: 'Draft', views: 0, sharedWith: [], sections: p.sections.map((s) => ({ ...s, id: uid('sec') })), createdAt: now, updatedAt: now },
      { atStart: true },
    );
    toast('Presentation duplicated successfully');
  };

  const toggleStatus = (p: Presentation) => {
    const status = p.status === 'Published' ? 'Draft' : 'Published';
    update(p.id, { status, updatedAt: new Date().toISOString() });
    toast(`Presentation ${status === 'Published' ? 'published' : 'unpublished'} successfully`);
  };

  return (
    // The live page has no top bar here, so we skip PageShell's header.
    <main className="flex-1 overflow-auto px-4 py-8 md:px-6 lg:px-8">
      <PageHeader
        title="Presentation Builder"
        subtitle="Create stunning proposals and portfolios to win more clients."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Create Presentation</Button>}
      />
      <div className="mb-8">
        <SearchInput value={search} onChange={setSearch} placeholder="Search presentations..." className="md:w-full md:max-w-md" />
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate />}
          title="No Presentations Found"
          message={items.length ? 'Try a different search.' : 'Create a new presentation to showcase your work.'}
          className="rounded-3xl border-gray-300 py-16"
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((p) => (
            <div
              key={p.id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/presentations/${p.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && router.push(`/presentations/${p.id}`)}
              className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
            >
              {/* Cover */}
              <div className="relative aspect-video overflow-hidden">
                <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-105" style={{ background: p.cover }} />
                <Paintbrush className="absolute bottom-3 left-4 h-20 w-20 -rotate-12 text-white/15" />
                <LayoutTemplate className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-white/70" />
                <span
                  className={cn(
                    'absolute right-4 top-4 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                    p.status === 'Published' ? 'border-green-100 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-700',
                  )}
                >
                  {p.status}
                </span>
              </div>
              {/* Body */}
              <div className="flex flex-1 flex-col p-5">
                <div className="mb-4 flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-lg font-bold leading-tight text-gray-900 transition-colors group-hover:text-primary-700">{p.title}</h3>
                  <RowMenu
                    items={[
                      { label: 'Edit', icon: <Edit2 />, onClick: () => router.push(`/presentations/${p.id}`) },
                      { label: 'View', icon: <Eye />, onClick: () => router.push(`/presentations/${p.id}/view`) },
                      p.status === 'Published'
                        ? { label: 'Unpublish', icon: <FileText />, onClick: () => toggleStatus(p) }
                        : { label: 'Publish', icon: <Globe />, onClick: () => toggleStatus(p) },
                      { label: 'Duplicate', icon: <Copy />, onClick: () => duplicate(p) },
                      { label: 'Share', icon: <Share2 />, onClick: () => setSharing(p) },
                      { label: 'Delete', icon: <Trash2 />, danger: true, separatorBefore: true, onClick: () => setDeleting(p) },
                    ]}
                  />
                </div>
                <div className="mt-auto space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-xxs font-bold uppercase tracking-wider text-blue-700">
                      {p.scopes.length ? p.scopes.join(', ') : 'No type'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{shortDate(p.updatedAt)}</span>
                    {p.views > 0 && <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{p.views}</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreatePresentationModal open={creating} onOpenChange={setCreating} />
      {sharing && <ShareModal presentation={items.find((x) => x.id === sharing.id) ?? sharing} open onOpenChange={(o) => !o && setSharing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete Presentation"
        message={`Are you sure you want to delete "${deleting?.title}"?`}
        onConfirm={() => {
          if (deleting) remove(deleting.id);
          toast('Presentation deleted successfully');
        }}
      />
    </main>
  );
}
