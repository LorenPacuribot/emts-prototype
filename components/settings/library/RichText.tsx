'use client';

/*
  Lightweight rich text for Terms & Conditions and Package Templates.

  The live app uses a full WYSIWYG editor. Our data stores plain text with
  light markdown, so this editor is a textarea with a toolbar that wraps
  or prefixes the selected text:
    **bold**   _italic_   ~~strike~~   "- " bullets   "1. " numbers   "> " quote
  RichContent renders that markdown back as formatted text (no HTML
  injection: everything is built from React nodes).
*/
import React, { useRef } from 'react';
import { Bold, Italic, List, ListOrdered, Quote, Redo2, Strikethrough, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function RichTextEditor({
  value, onChange, placeholder, invalid, rows = 8,
}: { value: string; onChange: (v: string) => void; placeholder?: string; invalid?: boolean; rows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  /** Replace the current selection using execCommand so the browser undo stack keeps working. */
  const replaceSelection = (make: (sel: string, start: number, end: number) => { text: string; selectFrom?: number; selectTo?: number }) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const res = make(value.slice(s, e), s, e);
    el.focus();
    el.setSelectionRange(s, e);
    const ok = typeof document !== 'undefined' && document.execCommand?.('insertText', false, res.text);
    if (!ok) onChange(value.slice(0, s) + res.text + value.slice(e));
    requestAnimationFrame(() => {
      if (res.selectFrom !== undefined) el.setSelectionRange(res.selectFrom, res.selectTo ?? res.selectFrom);
    });
  };

  const wrap = (mark: string) =>
    replaceSelection((sel, s) => {
      const inner = sel || 'text';
      return { text: `${mark}${inner}${mark}`, selectFrom: s + mark.length, selectTo: s + mark.length + inner.length };
    });

  const prefixLines = (kind: 'bullet' | 'number' | 'quote') => {
    const el = ref.current;
    if (!el) return;
    // Expand the selection to whole lines first.
    const start = value.lastIndexOf('\n', el.selectionStart - 1) + 1;
    let end = value.indexOf('\n', el.selectionEnd);
    if (end === -1) end = value.length;
    el.setSelectionRange(start, end);
    replaceSelection((sel) => ({
      text: sel
        .split('\n')
        .map((line, i) => (kind === 'bullet' ? `- ${line}` : kind === 'number' ? `${i + 1}. ${line}` : `> ${line}`))
        .join('\n'),
    }));
  };

  const cmd = (c: 'undo' | 'redo') => {
    ref.current?.focus();
    document.execCommand?.(c);
  };

  const tools: { icon: React.ReactNode; label: string; run: () => void; gap?: boolean }[] = [
    { icon: <Undo2 />, label: 'Undo', run: () => cmd('undo') },
    { icon: <Redo2 />, label: 'Redo', run: () => cmd('redo') },
    { icon: <Bold />, label: 'Bold', run: () => wrap('**'), gap: true },
    { icon: <Italic />, label: 'Italic', run: () => wrap('_') },
    { icon: <Strikethrough />, label: 'Strikethrough', run: () => wrap('~~') },
    { icon: <Quote />, label: 'Quote', run: () => prefixLines('quote'), gap: true },
    { icon: <ListOrdered />, label: 'Numbered list', run: () => prefixLines('number'), gap: true },
    { icon: <List />, label: 'Bulleted list', run: () => prefixLines('bullet') },
  ];

  return (
    <div className={cn('overflow-hidden rounded-lg border bg-white focus-within:ring-2 focus-within:ring-primary-400/40', invalid ? 'border-red-400' : 'border-gray-300')}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 px-2 py-1.5">
        {tools.map((t) => (
          <button
            key={t.label}
            type="button"
            title={t.label}
            aria-label={t.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={t.run}
            className={cn('rounded p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 [&>svg]:h-3.5 [&>svg]:w-3.5', t.gap && 'ml-3')}
          >
            {t.icon}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="block w-full resize-y px-3 py-2 text-sm text-gray-900 placeholder:italic placeholder:text-gray-400 focus:outline-none"
      />
    </div>
  );
}

/** Inline formatting: **bold**, _italic_, ~~strike~~ */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|~~[^~]+~~)/g).filter(Boolean);
  return parts.map((p, i) => {
    const k = `${keyBase}-${i}`;
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={k}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('~~') && p.endsWith('~~')) return <s key={k}>{p.slice(2, -2)}</s>;
    if (p.startsWith('_') && p.endsWith('_') && p.length > 2) return <em key={k}>{p.slice(1, -1)}</em>;
    return <React.Fragment key={k}>{p}</React.Fragment>;
  });
}

/** Renders stored light markdown. `clamp` limits the preview on cards. */
export function RichContent({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={`l${blocks.length}`} className={cn('my-1 pl-5', list.ordered ? 'list-decimal' : 'list-disc')}>
        {list.items.map((it, i) => <li key={i}>{inline(it, `li${blocks.length}-${i}`)}</li>)}
      </Tag>,
    );
    list = null;
  };
  lines.forEach((line, i) => {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const num = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (bullet || num) {
      const ordered = !!num;
      if (list && list.ordered !== ordered) flush();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet ?? num)![1]!);
      return;
    }
    flush();
    if (line.startsWith('> ')) blocks.push(<blockquote key={i} className="border-l-2 border-gray-300 pl-3 italic text-gray-500">{inline(line.slice(2), `q${i}`)}</blockquote>);
    else if (line.trim() === '') blocks.push(<div key={i} className="h-2" />);
    else blocks.push(<p key={i}>{inline(line, `p${i}`)}</p>);
  });
  flush();
  return <div className={cn('space-y-0.5', className)}>{blocks}</div>;
}
