'use client';

/*
  Help & Support (/support)

  Purpose: self-help for users. A search box filters the Knowledge Base
  articles and Video Tutorials; the right column has the Contact Support
  form (shows a success state and toast, no email is actually sent), the
  direct phone and email lines, and a "Reset demo data" button for this
  replica. Layout matches the live Help & Support screen.
*/
import React, { useMemo, useState } from 'react';
import { BookOpen, MonitorPlay, Search } from 'lucide-react';
import { PageShell } from '@/components/Navigation';
import { cn } from '@/lib/utils';
import { FAQS, VIDEOS } from '@/components/support/content';
import { ContactSupport, KnowledgeBase, VideoTutorials } from '@/components/support/SupportParts';

type Tab = 'kb' | 'video';

export default function SupportPage() {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('kb');
  const q = search.trim().toLowerCase();

  const faqs = useMemo(
    () => (q ? FAQS.map((c) => ({ ...c, items: c.items.filter((i) => i.toLowerCase().includes(q)) })).filter((c) => c.items.length) : FAQS),
    [q],
  );
  const videos = useMemo(() => (q ? VIDEOS.filter((v) => v.title.toLowerCase().includes(q) || v.category.toLowerCase().includes(q)) : VIDEOS), [q]);

  const tabBtn = (key: Tab, label: string, Icon: React.ElementType) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={cn(
        '-mb-[5px] flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
        tab === key ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-800',
      )}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <PageShell title="Help & Support" contentClassName="px-4 py-8 pb-32 sm:px-6 lg:px-8">
      {/* Search hero */}
      <div className="mx-auto mb-10 max-w-3xl pt-4 text-center">
        <h1 className="mb-6 font-heading text-4xl font-black tracking-tight text-gray-900 md:text-5xl">How can we help you?</h1>
        <div className="relative mx-auto max-w-2xl">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles, guides, or troubleshooting..."
            aria-label="Search help"
            className="h-12 w-full rounded-lg border border-gray-300 bg-white pl-11 pr-4 text-base font-medium shadow-xl shadow-gray-200/40 placeholder:text-gray-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-8">
          <div className="mb-6 flex gap-4 border-b border-gray-200 pb-1">
            {tabBtn('kb', 'Knowledge Base', BookOpen)}
            {tabBtn('video', 'Video Tutorials', MonitorPlay)}
          </div>
          <div className="min-h-[400px]">
            {tab === 'kb' ? <KnowledgeBase faqs={faqs} /> : <VideoTutorials videos={videos} searching={!!q} />}
          </div>
        </div>
        <div className="lg:col-span-4">
          <ContactSupport />
        </div>
      </div>
    </PageShell>
  );
}
