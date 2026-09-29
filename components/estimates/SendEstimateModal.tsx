'use client';

/*
  "Send Estimate" modal (live: listings/modals/send-estimate.tsx).
  Step 1 asks whether the client view was reviewed (skipped from the
  preview page). Step 2 is the email: To, Subject, Message, "Also send via SMS".
  Step 3 confirms who will receive it (and says so when the server is in
  sandbox, i.e. has no email keys). onSend does the real send through
  /api/messaging (useSendEstimateEmail); the modal stays open until it ends.
  NEW (features 3, 24): customerPageHref links the secure-link note to the
  customer page, where colours are approved and change orders decided.
*/
import React, { useEffect, useState } from 'react';
import { ArrowLeft, Eye, FlaskConical, Mail, MessageSquare, Send } from 'lucide-react';
import type { Customer, Estimate } from '@/lib/types';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form';
import { NewBadge } from '@/features/components/ui';
import { defaultEstimateMessage, defaultEstimateSubject, isEmailAddress, parseRecipients } from '@/lib/estimate-email';

export function SendEstimateModal({
  open, onOpenChange, estimate, customer, companyName, skipCheck, onPreview, onSend, customerPageHref,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  estimate: Estimate;
  customer?: Customer;
  companyName: string;
  skipCheck?: boolean;
  onPreview?: () => void;
  /** Sends to the listed addresses; may be async (the modal waits, then closes). */
  onSend: (p: { to: string[]; subject: string; message: string; sms: boolean }) => void | Promise<unknown>;
  customerPageHref?: string;
}) {
  const [step, setStep] = useState<'check' | 'compose' | 'confirm'>(skipCheck ? 'compose' : 'check');
  const [sending, setSending] = useState(false);
  // Whether the server's email channel is live or sandbox (GET /api/messaging never returns secrets).
  const [emailLive, setEmailLive] = useState<boolean | undefined>();
  useEffect(() => {
    if (!open) return;
    let stop = false;
    fetch('/api/messaging', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { email?: { live?: boolean } }) => { if (!stop) setEmailLive(!!d.email?.live); })
      .catch(() => { if (!stop) setEmailLive(undefined); });
    return () => { stop = true; };
  }, [open]);
  const [form, setForm] = useState({ to: '', subject: '', message: '', sms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setStep(skipCheck ? 'compose' : 'check');
    setErrors({});
    setForm({
      to: customer?.email ?? '',
      subject: defaultEstimateSubject({ estimate, companyName }),
      message: defaultEstimateMessage({ estimate, companyName, customerFirstName: customer?.firstName }),
      sms: false,
    });
    // Reset only when the modal opens: the estimate changes while sending and must not wipe the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const emails = parseRecipients(form.to);
  const review = () => {
    const e: Record<string, string> = {};
    if (!emails.length) e.to = 'Enter at least one email address';
    else if (emails.some((m) => !isEmailAddress(m))) e.to = 'One or more email addresses are not valid';
    if (!form.subject.trim()) e.subject = 'Subject is required';
    else if (form.subject.trim().length > 200 || /[\r\n]/.test(form.subject)) e.subject = 'Keep the subject to one line under 200 characters';
    if (!form.message.trim()) e.message = 'Message is required';
    setErrors(e);
    if (Object.keys(e).length) return;
    setStep('confirm');
  };

  const send = async () => {
    setSending(true);
    try {
      await onSend({ to: emails, subject: form.subject.trim(), message: form.message, sms: form.sms });
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  };

  const phone = customer?.phone?.trim();

  return (
    <Modal open={open} onOpenChange={(o) => { if (!sending) onOpenChange(o); }} title="Send Estimate" size="lg">
      {step === 'check' ? (
        <div className="flex flex-col items-center rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600"><Eye className="h-6 w-6" /></div>
          <h3 className="mb-2 text-lg font-bold text-gray-900">Have you reviewed the client view?</h3>
          <p className="mb-6 max-w-sm text-sm text-gray-600">
            We strongly recommend checking exactly what the client will see before sending.
          </p>
          <div className="flex w-full flex-col gap-3">
            {onPreview && (
              <Button onClick={onPreview} icon={<Eye className="h-4 w-4" />} className="w-full">Preview Client View</Button>
            )}
            <button type="button" onClick={() => setStep('compose')} className="py-2 text-sm font-medium text-gray-500 hover:text-gray-800">
              Skip and Send
            </button>
          </div>
        </div>
      ) : step === 'confirm' ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="mt-0.5 rounded-lg bg-primary-100 p-1.5 text-primary-700"><Send className="h-4 w-4" /></div>
            <div className="text-sm text-gray-700">
              <p className="font-bold text-gray-900">Send {estimate.estimateNumber} to {emails.length === 1 ? 'this address' : `these ${emails.length} addresses`}?</p>
              <ul className="mt-2 space-y-1">
                {emails.map((m) => <li key={m} className="font-mono text-sm font-semibold text-gray-900">{m}</li>)}
                {form.sms && phone && <li className="text-sm">and a text message to <span className="font-mono font-semibold">{phone}</span></li>}
              </ul>
              <p className="mt-2">
                {emailLive === false
                  ? 'The estimate will be marked Sent, but in sandbox the customer will not receive anything.'
                  : 'The customer will receive this email with the secure link to view, sign and approve the estimate. It is marked Sent once the email service accepts it.'}
              </p>
              {form.sms && !phone && <p className="mt-2 text-amber-700">No phone number on file, so no SMS will be sent.</p>}
            </div>
          </div>
          {emailLive === false && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="note">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p><b>Sandbox — email keys are not set on the server.</b> Nothing will leave the server; the send is only recorded on the estimate. Add the email keys to the server environment to send for real.</p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" icon={<ArrowLeft className="h-4 w-4" />} disabled={sending} onClick={() => setStep('compose')}>Back</Button>
            <Button className="flex-[2]" icon={<Send className="h-4 w-4" />} loading={sending} onClick={send}>
              {sending ? 'Sending…' : emailLive === false ? 'Record Send (Sandbox)' : `Send to ${emails.length === 1 ? emails[0] : `${emails.length} recipients`}`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <Field label="To (separate multiple recipients with commas)" required error={errors.to}>
            <Input value={form.to} invalid={!!errors.to} placeholder="client@email.com, partner@email.com" onChange={(e) => setForm({ ...form, to: e.target.value })} />
          </Field>
          <Field label="Subject" required error={errors.subject}>
            <Input value={form.subject} invalid={!!errors.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </Field>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-600">Message<span className="ml-0.5 text-red-500">*</span></span>
              <Checkbox
                checked={form.sms}
                onChange={(v) => setForm({ ...form, sms: v })}
                label={<span className="flex items-center gap-1.5 text-sm font-medium"><MessageSquare className="h-3.5 w-3.5" />Also send via SMS</span>}
              />
            </div>
            <Textarea rows={8} value={form.message} invalid={!!errors.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="rounded-xl" />
            {errors.message && <p className="mt-1 text-xs text-red-600">{errors.message}</p>}
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="mt-0.5 rounded-lg bg-blue-100 p-1.5 text-blue-600"><Mail className="h-4 w-4" /></div>
            <div>
              <h4 className="text-sm font-bold text-blue-800">Secure Link Included</h4>
              <p className="mt-1 text-xs leading-relaxed text-blue-600">
                The email {form.sms ? 'and SMS ' : ''}will automatically include a secure, unique link for the client to view the interactive estimate, sign digitally, and pay the deposit online.
              </p>
              {customerPageHref && (
                <a href={customerPageHref} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:underline">
                  Open the customer page <NewBadge feature={[3, 24]} />
                </a>
              )}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-[2]" icon={<Send className="h-4 w-4" />} onClick={review}>Review &amp; Send</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
