'use client';

/*
  Help & Support building blocks: the Knowledge Base accordion, Video
  Tutorials grid with a mock player modal, the Contact Support form and the
  "Reset demo data" card. Layout and copy follow the live support feature.
*/
import React, { useState } from 'react';
import { BookOpen, CheckCircle2, ChevronDown, Mail, Maximize, MessageSquare, Phone, Play, RotateCcw, Send, Video as VideoIcon } from 'lucide-react';
import { Modal, ConfirmDialog } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useDataActions } from '@/lib/store';
import { SUPPORT_EMAIL, SUPPORT_PHONE, faqAnswer, type Video } from './content';

/* ---------- Knowledge Base ---------- */

export function KnowledgeBase({ faqs }: { faqs: { category: string; items: string[] }[] }) {
  if (faqs.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-12 text-center italic text-gray-500">
        <BookOpen className="mx-auto mb-3 h-12 w-12 text-gray-300" />
        No articles match your search.
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-6">
      {faqs.map((cat) => (
        <div key={cat.category} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:border-primary-200">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
            <h4 className="text-lg font-bold text-gray-900">{cat.category}</h4>
          </div>
          <div className="divide-y divide-gray-50">
            {cat.items.map((item) => (
              <details key={item} className="group/item cursor-pointer px-6 py-4 transition-colors open:bg-gray-50/50 hover:bg-gray-50">
                <summary className="flex list-none items-start justify-between gap-4 rounded-md font-medium text-gray-700 outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60 group-hover/item:text-gray-900 [&::-webkit-details-marker]:hidden">
                  <span className="text-sm leading-relaxed">{item}</span>
                  <ChevronDown className="mt-0.5 h-5 w-5 shrink-0 text-gray-500 transition-transform duration-200 group-open/item:rotate-180" />
                </summary>
                <div className="mt-3 text-sm leading-relaxed text-gray-500">{faqAnswer(item)}</div>
              </details>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ---------- Video Tutorials ---------- */

export function VideoTutorials({ videos, searching }: { videos: Video[]; searching: boolean }) {
  const [playing, setPlaying] = useState<Video | null>(null);
  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-900">Video Tutorials</h3>
        {searching && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">{videos.length} found</span>}
      </div>
      {videos.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {videos.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setPlaying(v)}
              className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-left transition-all hover:border-primary-200 hover:shadow-xl"
            >
              <div className="relative aspect-video overflow-hidden">
                <div className="h-full w-full transition-transform duration-700 group-hover:scale-105" style={{ backgroundImage: v.thumb }} />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/40">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 pl-1 shadow-lg transition-transform group-hover:scale-110">
                    <Play className="h-5 w-5 fill-current text-gray-900" />
                  </div>
                </div>
                <div className="absolute bottom-3 right-3 rounded bg-black/70 px-2 py-0.5 text-xs font-bold text-white">{v.duration}</div>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="mb-1 text-xxs font-black uppercase tracking-wider text-primary-600">{v.category}</div>
                <h3 className="font-bold text-gray-900 group-hover:text-primary-700">{v.title}</h3>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-12 text-center italic text-gray-500">
          <VideoIcon className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          No video tutorials match your search.
        </div>
      )}

      <Modal open={!!playing} onOpenChange={(o) => !o && setPlaying(null)} title={playing?.title ?? 'Video Tutorial'} size="xl">
        {playing && (
          <div className="space-y-4">
            {/* Mock player: videos are not bundled with the replica */}
            <div className="group relative aspect-video overflow-hidden rounded-xl bg-black">
              <div className="absolute inset-0 opacity-60" style={{ backgroundImage: playing.thumb }} />
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                  <Play className="ml-1 h-7 w-7 fill-white text-white" />
                </div>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-4 p-4 text-white">
                <div className="h-4 w-4 rounded-full bg-white" />
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"><div className="h-full w-1/3 bg-primary-500" /></div>
                <span className="text-xs font-medium">0:00 / {playing.duration}</span>
                <Maximize className="h-5 w-5" />
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <h4 className="mb-2 font-bold text-gray-900">About this tutorial</h4>
              <p className="text-sm leading-relaxed text-gray-600">{playing.about}</p>
              <p className="mt-2 text-xs italic text-gray-500">Video playback is not available in this demo.</p>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

/* ---------- Contact Support ---------- */

export function ContactSupport() {
  const { toast } = useToast();
  const [form, setForm] = useState({ subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const canSend = form.subject.trim() && form.message.trim() && !sending;

  const send = () => {
    if (!canSend) return;
    setSending(true);
    // No backend: pretend the request took a moment, then confirm
    window.setTimeout(() => {
      setSending(false);
      setSent(true);
      toast('Support request sent successfully');
    }, 500);
  };

  return (
    <div className="sticky top-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
      <div className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary-100 bg-primary-50 text-primary-600">
          <MessageSquare className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Contact Support</h2>
          <p className="text-xs text-gray-500">We typically reply in 24h</p>
        </div>
      </div>

      {sent ? (
        <div className="rounded-xl border border-green-100 bg-green-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 shadow-sm">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h3 className="mb-2 text-lg font-bold text-green-900">Message Sent!</h3>
          <p className="text-sm text-green-700">Our team has received your request and will get back to you shortly.</p>
          <Button
            variant="secondary"
            className="mt-6 w-full"
            onClick={() => {
              setSent(false);
              setForm({ subject: '', message: '' });
            }}
          >
            Send Another
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label htmlFor="supportSubject" required>Subject</Label>
            <Input id="supportSubject" placeholder="How can we help?" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="supportMessage" required>Message</Label>
            <Textarea id="supportMessage" rows={6} className="min-h-[180px]" placeholder="Describe your issue or question in detail..." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </div>
          <Button onClick={send} disabled={!canSend} loading={sending} className="w-full shadow-lg shadow-primary-500/20" icon={<Send className="h-4 w-4" />}>
            Send Request
          </Button>
        </div>
      )}

      <div className="mt-8 border-t border-gray-100 pt-6">
        <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-500">Direct Lines</h4>
        <div className="space-y-3">
          <a href="tel:5551234567" className="group flex items-center gap-3 rounded-xl border border-transparent p-3 transition-colors hover:border-gray-200 hover:bg-gray-50">
            <Phone className="h-4 w-4 text-gray-500 group-hover:text-primary-600" />
            <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900">{SUPPORT_PHONE}</span>
          </a>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="group flex items-center gap-3 rounded-xl border border-transparent p-3 transition-colors hover:border-gray-200 hover:bg-gray-50">
            <Mail className="h-4 w-4 text-gray-500 group-hover:text-primary-600" />
            <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900">{SUPPORT_EMAIL}</span>
          </a>
        </div>
      </div>

      <ResetDemoData />
    </div>
  );
}

/* ---------- Reset demo data (replica only) ---------- */

function ResetDemoData() {
  const { reset } = useDataActions();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-6 border-t border-gray-100 pt-6">
      <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Demo Data</h4>
      <p className="mb-3 text-xs text-gray-500">Restore the original sample leads, estimates, jobs, invoices and settings. Your changes will be lost.</p>
      <Button variant="danger-outline" size="sm" className="w-full" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setOpen(true)}>
        Reset demo data
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Reset demo data?"
        message="This replaces everything you have added or changed with the original sample data. This action cannot be undone."
        confirmLabel="Reset"
        onConfirm={() => {
          reset();
          try {
            window.localStorage.removeItem('emts-dashboard-hidden-cards-v1');
          } catch {
            /* ignore */
          }
          toast('Demo data restored');
        }}
      />
    </div>
  );
}
