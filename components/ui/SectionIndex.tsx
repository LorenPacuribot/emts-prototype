'use client';

/*
  Sticky section index for long pages (C5, N4). Chips scroll to a section;
  the chip for the section in view is highlighted. Sections are never hidden,
  so tour targets and tests still find them. Items whose element is missing
  (for example a work order with no prototype twin) are left out.
*/
import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function SectionIndex({ items, label = 'On this page' }: { items: { id: string; label: string }[]; label?: string }) {
  const [present, setPresent] = useState<string[]>([]);
  const [active, setActive] = useState<string>();
  const key = items.map((i) => i.id).join('|');

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    setPresent(els.map((e) => e.id));
    if (!els.length) return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = items.find((i) => seen.get(i.id));
        if (first) setActive(first.id);
      },
      { rootMargin: '-120px 0px -55% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const shown = items.filter((i) => present.includes(i.id));
  if (shown.length < 2) return null;
  return (
    <nav aria-label={label} className="no-print sticky top-0 z-20 -mx-4 border-b border-gray-200 bg-gray-50/95 px-4 py-2 backdrop-blur md:mx-0 md:rounded-2xl md:border md:bg-white/95 md:shadow-sm">
      <ul className="flex gap-2 overflow-x-auto custom-scrollbar">
        {shown.map((i) => (
          <li key={i.id} className="shrink-0">
            <a
              href={`#${i.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(i.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setActive(i.id);
              }}
              aria-current={active === i.id ? 'location' : undefined}
              className={cn(
                'inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60',
                active === i.id ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
