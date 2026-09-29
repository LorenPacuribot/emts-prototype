'use client';

/*
  "Send to Customer" (patent 11): sends the estimate email through
  /api/messaging (sandbox until the server has email keys), records every
  message on the estimate (Estimate.deliveries), logs it, and marks the
  estimate Sent only when something went out (lib/estimate-email.ts).
  Used by Client Preview and the estimate builder.
*/
import { useCallback, useRef, useState } from 'react';
import type { Estimate, EstimateDelivery } from '@/lib/types';
import { useCollection, useLogActivity, useLookups, useSingleton } from '@/lib/store';
import { useToast } from '@/components/ui/toast';
import { uid } from '@/lib/utils';
import {
  buildEstimateEmail, buildEstimateSms, deliveryLogText, deliveryToast, latestDeliveries, postEstimateMessage, statusAfterSend,
} from '@/lib/estimate-email';
import { useEstimateActions } from './useEstimateActions';

export interface SendEstimatePayload {
  to: string[];
  subject?: string;
  message?: string;
  sms?: boolean;
}

export interface CustomerLink {
  /** Absolute link to the customer's page (customerLinkFor). */
  link: string;
  /** Formatted date the secure link stops working. */
  linkExpires?: string;
}

export function useSendEstimateEmail() {
  const estimates = useCollection('estimates');
  const actions = useEstimateActions();
  const log = useLogActivity();
  const look = useLookups();
  const [bp] = useSingleton('businessProfile');
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  // The subject/message last typed per estimate, so Retry resends the same words.
  const lastWords = useRef<Record<string, Pick<SendEstimatePayload, 'subject' | 'message'>>>({});

  const send = useCallback(
    async (e: Estimate, p: SendEstimatePayload, ctx: CustomerLink): Promise<Estimate> => {
      setSending(true);
      if (p.subject || p.message) lastWords.current[e.id] = { subject: p.subject, message: p.message };
      try {
        const customer = look.customer(e.customerId);
        const input = { estimate: e, customerFirstName: customer?.firstName, companyName: bp.companyName, link: ctx.link, linkExpires: ctx.linkExpires };
        const mail = buildEstimateEmail(input, { subject: p.subject, message: p.message });
        const tag = `estimate:${e.id}`.replace(/[^\w.:-]/g, '').slice(0, 64);
        const sendId = uid('snd');
        const records: EstimateDelivery[] = [];
        for (const to of p.to) {
          const outcome = await postEstimateMessage({ channel: 'email', to, subject: mail.subject, body: mail.body, tag });
          records.push({ id: uid('dlv'), sendId, at: new Date().toISOString(), to, channel: 'email', subject: mail.subject, ...outcome });
        }
        const phone = customer?.phone?.trim();
        if (p.sms && phone) {
          const outcome = await postEstimateMessage({ channel: 'sms', to: phone, body: buildEstimateSms(input), tag });
          records.push({ id: uid('dlv'), sendId, at: new Date().toISOString(), to: phone, channel: 'sms', ...outcome });
        }

        const deliveries = [...(e.deliveries ?? []), ...records];
        const after = statusAfterSend(e.status, records);
        const sentTo = records.filter((r) => r.status !== 'failed').map((r) => r.to).join(', ');
        const next = after
          ? actions.setStatus(e, after, `Sent to ${sentTo}${records.some((r) => r.status === 'sandbox') ? ' (sandbox: not really sent)' : ''}`, { deliveries })
          : { ...e, deliveries, updatedAt: new Date().toISOString() };
        if (!after) estimates.update(e.id, next);
        for (const r of records) log(deliveryLogText(e.estimateNumber, r), 'estimate', e.id);
        const t = deliveryToast(records, { before: e.status, after });
        toast(t.message, t.variant);
        return next;
      } finally {
        setSending(false);
      }
    },
    [look, bp.companyName, actions, estimates, log, toast],
  );

  /** Sends again to the recipients whose message failed in the latest send. */
  const retry = useCallback(
    (e: Estimate, ctx: CustomerLink) => {
      const last = lastWords.current[e.id];
      const failed = latestDeliveries(e).filter((d) => d.status === 'failed');
      const to = failed.filter((d) => d.channel === 'email').map((d) => d.to);
      const sms = failed.some((d) => d.channel === 'sms');
      if (!to.length && !sms) return Promise.resolve(e);
      return send(e, { to, sms, subject: last?.subject ?? failed.find((d) => d.subject)?.subject, message: last?.message }, ctx);
    },
    [send],
  );

  return { send, retry, sending };
}
