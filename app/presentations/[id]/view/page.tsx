'use client';

/*
  Presentation viewer: what the customer sees from a shared link.
  - Scroll mode shows the whole page; Slides mode shows one section at a
    time with Previous/Next buttons, arrow keys and a progress bar.
  - Opening the viewer counts one view (presentation.views + 1).
  - Share opens the Share modal (copy link, add emails).
  It covers the app sidebar so it looks like a public page.
*/
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, GalleryHorizontal, Rows3, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCollection } from '@/lib/store';
import { cn } from '@/lib/utils';
import { PresentationCanvas } from '@/components/presentations/PresentationCanvas';
import { ShareModal } from '@/components/presentations/PresentationModals';
import { primaryColorOf } from '@/components/presentations/presentation-utils';

export default function PresentationViewPage() {
  const { id } = useParams<{ id: string }>();
  const { get, update } = useCollection('presentations');
  const p = get(id);
  const [mode, setMode] = useState<'scroll' | 'slides'>('scroll');
  const [slide, setSlide] = useState(0);
  const [sharing, setSharing] = useState(false);
  const counted = useRef(false);

  // Count one view per visit (guarded so React strict mode doesn't double count).
  useEffect(() => {
    if (!p || counted.current) return;
    counted.current = true;
    update(p.id, { views: p.views + 1 });
  }, [p, update]);

  const slides = p?.sections.filter((s) => s.enabled) ?? [];
  const total = slides.length;
  const next = useCallback(() => setSlide((i) => Math.min(i + 1, Math.max(total - 1, 0))), [total]);
  const prev = useCallback(() => setSlide((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    if (mode !== 'slides') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') next();
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, next, prev]);

  if (!p) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-500">This presentation is not available.</p>
          <Link href="/presentations" className="mt-4 inline-block text-sm font-bold text-primary-600">Back to Presentations</Link>
        </div>
      </div>
    );
  }

  const color = primaryColorOf(p);
  const current = slides[Math.min(slide, total - 1)];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-gray-100">
      {/* Viewer bar */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/presentations/${p.id}`} className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back to builder</span>
          </Link>
          <span className="truncate font-heading text-sm font-bold text-gray-900">{p.title}</span>
          {p.status === 'Draft' && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xxs font-bold uppercase tracking-wider text-blue-700">Draft</span>}
          <span className="hidden items-center gap-1 text-xs text-gray-400 md:flex"><Eye className="h-3.5 w-3.5" />{p.views}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-1">
            <button onClick={() => setMode('scroll')} className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold', mode === 'scroll' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500')}>
              <Rows3 className="h-3.5 w-3.5" /> Scroll
            </button>
            <button onClick={() => { setMode('slides'); setSlide(0); }} className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold', mode === 'slides' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500')}>
              <GalleryHorizontal className="h-3.5 w-3.5" /> Slides
            </button>
          </div>
          <Button size="sm" icon={<Share2 className="h-3.5 w-3.5" />} onClick={() => setSharing(true)}>Share</Button>
        </div>
      </div>

      {mode === 'scroll' ? (
        <div className="flex-1 overflow-y-auto">
          <PresentationCanvas presentation={p} className="min-h-full" />
        </div>
      ) : total === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">This presentation has no visible sections.</div>
      ) : (
        <>
          <div className="h-1 w-full bg-gray-200">
            <div className="h-full transition-all" style={{ width: `${((slide + 1) / total) * 100}%`, backgroundColor: color }} />
          </div>
          <div className="flex flex-1 items-center justify-center overflow-hidden p-4 md:p-8">
            <div className="max-h-full w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
              {current && <PresentationCanvas presentation={p} onlySectionId={current.id} />}
            </div>
          </div>
          <div className="flex h-16 shrink-0 items-center justify-center gap-4 border-t border-gray-200 bg-white">
            <Button variant="secondary" size="sm" icon={<ChevronLeft className="h-4 w-4" />} onClick={prev} disabled={slide === 0}>Previous</Button>
            <span className="min-w-20 text-center text-sm font-bold text-gray-600">{slide + 1} / {total}</span>
            <Button size="sm" onClick={next} disabled={slide >= total - 1}>Next <ChevronRight className="h-4 w-4" /></Button>
          </div>
        </>
      )}

      <ShareModal presentation={p} open={sharing} onOpenChange={setSharing} />
    </div>
  );
}
