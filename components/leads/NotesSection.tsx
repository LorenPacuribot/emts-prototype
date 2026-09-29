'use client';

/*
  "Add New Note" box and "Notes History" timeline. Notes are stored as one
  string with "[YYYY-MM-DD HH:mm] text" entries (same as the live app).
  Used on the lead detail page and the contact "Activity & Notes" tab.
*/
import React, { useState } from 'react';
import { Edit2, FileText, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import { parseNotes } from './leadHelpers';

export function NotesSection({ notes, onAddNote, className }: { notes?: string; onAddNote: (text: string) => void; className?: string }) {
  const [text, setText] = useState('');
  const parsed = parseNotes(notes);
  const add = () => {
    if (!text.trim()) return;
    onAddNote(text.trim());
    setText('');
  };
  const cardCls = 'rounded-3xl border border-gray-200 bg-white p-6 shadow-sm';
  const headCls = 'flex items-center gap-2 text-gray-500 [&>svg]:h-4 [&>svg]:w-4';

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div className={cardCls}>
        <div className={cn(headCls, 'mb-4')}>
          <Edit2 />
          <span className="text-xs font-bold uppercase tracking-widest">Add New Note</span>
        </div>
        <Textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(); }}
          placeholder="Type a new note here..."
        />
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={add} disabled={!text.trim()} icon={<Send className="h-4 w-4" />}>Add Note</Button>
        </div>
      </div>

      <div className={cn(cardCls, 'flex-1')}>
        <div className={cn(headCls, 'mb-6')}>
          <FileText />
          <span className="text-xs font-bold uppercase tracking-widest">Notes History</span>
        </div>
        <div className="max-h-[500px] overflow-y-auto pr-2">
          {parsed.length === 0 ? (
            <div className="py-12 text-center text-sm italic text-gray-500">No notes logged yet.</div>
          ) : (
            parsed.map((n, i) => (
              <div key={n.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gray-400" />
                  {i < parsed.length - 1 && <div className="w-px flex-1 bg-gray-200" />}
                </div>
                <div className="flex-1 pb-5">
                  <div className="mb-1.5 text-xs text-gray-500">{n.timestamp || 'Earlier note'}</div>
                  <div className="whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-700">{n.content}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
