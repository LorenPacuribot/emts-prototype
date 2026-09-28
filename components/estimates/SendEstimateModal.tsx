'use client';

/*
  "Send Estimate" modal (live: listings/modals/send-estimate.tsx).
  Step 1 asks whether the client view was reviewed (skipped from the
  preview page). Step 2 is the email: To, Subject, Message, "Also send via SMS".
  There is no real email here: onSend marks the estimate Sent and logs it.
  NEW (features 3, 24): customerPageHref links the secure-link note to the
  customer page, where colours are approved and change orders decided.
*/
import React, { useEffect, useState } from 'react';
import { Eye, Mail, MessageSquare, Send } from 'lucide-react';
import type { Customer, Estimate } from '@/lib/types';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form';
import { NewBadge } from '@/features/components/ui';

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
  onSend: (to: string, sms: boolean) => void;
  customerPageHref?: string;
}) {
  const [step, setStep] = useState<'check' | 'compose'>(skipCheck ? 'compose' : 'check');
  const [form, setForm] = useState({ to: '', subject: '', message: '', sms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setStep(skipCheck ? 'compose' : 'check');
    setErrors({});
    setForm({
      to: customer?.email ?? '',
      subject: `Your estimate ${estimate.estimateNumber} from ${companyName}`,
      message: `Hi ${customer?.firstName ?? 'there'},\n\nThank you for the opportunity to quote your project. Your estimate for "${estimate.title}" is ready to review. Use the secure link below to view the details, sign, and approve.\n\nPlease let us know if you have any questions.\n\n${companyName}`,
      sms: false,
    });
  }, [open, skipCheck, customer, estimate.estimateNumber, estimate.title, companyName]);

  const send = () => {
    const e: Record<string, string> = {};
    const emails = form.to.split(',').map((s) => s.trim()).filter(Boolean);
    if (!emails.length) e.to = 'Enter at least one email address';
    else if (emails.some((m) => !/^\S+@\S+\.\S+$/.test(m))) e.to = 'One or more email addresses are not valid';
    if (!form.subject.trim()) e.subject = 'Subject is required';
    if (!form.message.trim()) e.message = 'Message is required';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSend(emails.join(', '), form.sms);
    onOpenChange(false);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Send Estimate" size="lg">
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
            <Button className="flex-[2]" icon={<Send className="h-4 w-4" />} onClick={send}>Send Estimate</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
