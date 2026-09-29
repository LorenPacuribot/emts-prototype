'use client';

/*
  Presentation Builder (live: features/(main)/presentations/builder).
  Top toolbar: editable name, Draft/Published badge (click to toggle),
  desktop/mobile preview switch, Back, Preview/Editor, Share, View, Save & Exit.
  Left: BuilderSidebar (blocks, sections, branding, settings, header/footer).
  Right: live canvas with inline editing and a toolbar on each section.

  Edits are kept in a local draft and written to the store on Save.
  Leaving with unsaved changes asks for confirmation.
*/
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowDown, ArrowLeft, ArrowUp, Edit2, Eye, EyeOff, ExternalLink, Monitor, Save, Share2, Smartphone, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/display';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { Presentation, PresentationSection, PresentationSectionType } from '@/lib/types';
import { BuilderSidebar } from '@/components/presentations/BuilderSidebar';
import { PresentationCanvas } from '@/components/presentations/PresentationCanvas';
import { ShareModal } from '@/components/presentations/PresentationModals';
import { newSection } from '@/components/presentations/presentation-utils';

export default function PresentationBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { get, update } = useCollection('presentations');
  const saved = get(id);

  const [draft, setDraft] = useState<Presentation | null>(saved ?? null);
  const [dirty, setDirty] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [editMode, setEditMode] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [sharing, setSharing] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);

  // Load once when the record is available (e.g. after a refresh).
  useEffect(() => {
    if (saved && !draft) setDraft(saved);
  }, [saved, draft]);

  const change = useCallback((patch: Partial<Presentation>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  }, []);

  const updateSection = useCallback((sid: string, patch: Partial<PresentationSection>) => {
    setDraft((d) => (d ? { ...d, sections: d.sections.map((s) => (s.id === sid ? { ...s, ...patch } : s)) } : d));
    setDirty(true);
  }, []);

  const moveSection = useCallback((sid: string, dir: -1 | 1) => {
    setDraft((d) => {
      if (!d) return d;
      const i = d.sections.findIndex((s) => s.id === sid);
      const j = i + dir;
      // The cover (index 0) stays first.
      if (i <= 0 || j <= 0 || j >= d.sections.length) return d;
      const next = [...d.sections];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return { ...d, sections: next };
    });
    setDirty(true);
  }, []);

  const removeSection = useCallback((sid: string) => {
    setDraft((d) => (d ? { ...d, sections: d.sections.filter((s) => s.id !== sid) } : d));
    setDirty(true);
  }, []);

  const addSection = useCallback((type: PresentationSectionType, variant: 1 | 2 | 3) => {
    const s = newSection(type, variant);
    setDraft((d) => (d ? { ...d, sections: [...d.sections, s] } : d));
    setDirty(true);
    setSelectedId(s.id);
    setTimeout(() => document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }, []);

  const save = (exit: boolean) => {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast('Presentation name is required', 'error');
      return;
    }
    // Views, sharing and status are saved separately (Share modal / badge), so don't overwrite them.
    const { views: _v, sharedWith: _s, status: _st, ...content } = draft;
    void _v; void _s; void _st;
    update(draft.id, { ...content, title: draft.title.trim(), updatedAt: new Date().toISOString() });
    setDirty(false);
    toast('Presentation saved successfully');
    if (exit) router.push('/presentations');
  };

  const toggleStatus = () => {
    if (!draft) return;
    const status = draft.status === 'Published' ? 'Draft' : 'Published';
    setDraft({ ...draft, status });
    update(draft.id, { status, updatedAt: new Date().toISOString() });
    toast(`Presentation ${status === 'Published' ? 'published' : 'unpublished'} successfully`);
  };

  const go = (href: string) => (dirty ? setLeaveTo(href) : router.push(href));

  const toolbarFor = useMemo(
    () => (s: PresentationSection, i: number) => {
      if (!draft) return null;
      const btn = 'rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-lg transition-all hover:text-primary-600';
      const last = i === draft.sections.length - 1;
      return (
        <div className="absolute right-4 top-4 z-40 flex gap-2 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          <button className={cn(btn, 'px-3 text-xxs font-black uppercase tracking-widest')} onClick={() => updateSection(s.id, { variant: (((s.variant ?? 1) % 3) + 1) as 1 | 2 | 3 })} title="Change style">
            Style {s.variant ?? 1}
          </button>
          <button className={btn} onClick={() => updateSection(s.id, { enabled: !s.enabled })} title={s.enabled ? 'Hide section' : 'Show section'}>
            {s.enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          {s.type !== 'cover' && i > 1 && <button className={cn(btn, 'text-red-500 hover:text-red-600')} onClick={() => moveSection(s.id, -1)} title="Move up" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>}
          {s.type !== 'cover' && !last && <button className={cn(btn, 'text-red-500 hover:text-red-600')} onClick={() => moveSection(s.id, 1)} title="Move down" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>}
          {s.type !== 'cover' && s.type !== 'estimate' && (
            <button aria-label="Delete section" className={cn(btn, 'text-red-600 hover:bg-red-50 hover:text-red-600')} onClick={() => removeSection(s.id)} title="Delete section"><Trash2 className="h-4 w-4" /></button>
          )}
        </div>
      );
    },
    [draft, updateSection, moveSection, removeSection],
  );

  if (!saved || !draft) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        {saved === undefined ? (
          <div className="text-center">
            <p className="text-lg font-medium text-gray-500">Presentation not found.</p>
            <Link href="/presentations" className="mt-4 inline-block text-sm font-bold text-primary-600">Back to Presentations</Link>
          </div>
        ) : (
          <Skeleton className="h-96 w-full max-w-5xl" />
        )}
      </main>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white">
      {/* Global toolbar */}
      <div className="relative z-50 flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] md:px-6">
        <div className="group flex min-w-0 items-center gap-3">
          <input
            value={draft.title}
            onChange={(e) => change({ title: e.target.value })}
            placeholder="Presentation Name"
            className="w-40 truncate border-b border-transparent bg-transparent py-1 text-lg font-extrabold tracking-tight text-gray-900 outline-none hover:border-gray-300 focus:border-primary-500 sm:w-64 lg:w-80"
            aria-label="Presentation name"
          />
          <Edit2 className="pointer-events-none h-3.5 w-3.5 shrink-0 text-gray-300 opacity-0 group-hover:opacity-100" />
          <button
            onClick={toggleStatus}
            title={draft.status === 'Published' ? 'Click to unpublish' : 'Click to publish'}
            className={cn('shrink-0 rounded-full px-2 py-0.5 text-xxs font-bold uppercase tracking-wider transition-all hover:scale-105', draft.status === 'Published' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700')}
          >
            {draft.status}
          </button>
          {dirty && <span className="hidden text-xs font-medium text-amber-600 xl:inline">Unsaved changes</span>}
        </div>

        <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center rounded-lg border border-gray-200 bg-gray-100 p-1 xl:flex">
          {(['desktop', 'mobile'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              title={d === 'desktop' ? 'Desktop View' : 'Mobile View'}
              className={cn('rounded-md p-1.5 px-3', device === d ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-600')}
            >
              {d === 'desktop' ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          <button onClick={() => go('/presentations')} className="mr-1 flex items-center gap-2 px-2 py-2 text-sm font-bold text-gray-500 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back</span>
          </button>
          <Button variant="secondary" size="sm" icon={editMode ? <Eye className="h-3.5 w-3.5" /> : <Edit2 className="h-3.5 w-3.5" />} onClick={() => setEditMode(!editMode)}>
            {editMode ? 'Preview' : 'Editor'}
          </Button>
          <Button variant="secondary" size="sm" icon={<Share2 className="h-3.5 w-3.5" />} onClick={() => setSharing(true)} className="hidden md:inline-flex">Share</Button>
          <Button variant="secondary" size="icon-sm" onClick={() => go(`/presentations/${draft.id}/view`)} title="Open viewer" aria-label="Open viewer" className="hidden md:inline-flex">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" icon={<Save className="h-3.5 w-3.5" />} onClick={() => save(true)}>Save &amp; Exit</Button>
        </div>
      </div>

      {/* Main */}
      <div className="relative z-0 flex min-h-0 flex-1 flex-col-reverse overflow-hidden lg:flex-row">
        {editMode && (
          <BuilderSidebar
            p={draft}
            change={change}
            addSection={addSection}
            updateSection={updateSection}
            moveSection={moveSection}
            removeSection={removeSection}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-50">
          <div className="flex flex-1 flex-col items-center overflow-y-auto px-4 md:px-8">
            <div
              className={cn(
                'relative mb-12 mt-4 bg-white shadow-2xl transition-all duration-500 md:mt-8',
                device === 'mobile' ? 'h-[720px] w-[375px] overflow-y-auto rounded-[3rem] ring-[12px] ring-gray-900 ring-offset-4' : 'min-h-[800px] w-full max-w-7xl overflow-hidden rounded-xl',
              )}
            >
              <PresentationCanvas
                presentation={draft}
                edit={editMode}
                onSectionChange={updateSection}
                toolbarFor={toolbarFor}
                selectedId={selectedId}
                onSelect={editMode ? setSelectedId : undefined}
                className="min-h-full"
              />
            </div>
          </div>
        </div>
      </div>

      <ShareModal presentation={get(id) ?? draft} open={sharing} onOpenChange={setSharing} />
      <ConfirmDialog
        open={!!leaveTo}
        onOpenChange={(o) => !o && setLeaveTo(null)}
        title="Discard unsaved changes?"
        message="You have changes that are not saved. Leave without saving?"
        confirmLabel="Leave"
        onConfirm={() => leaveTo && router.push(leaveTo)}
      />
    </div>
  );
}
