'use client';

/*
  One place for every change a user can make to a lead, so the board, the
  table and the detail page all behave the same way:
  - changeStatus: refuses a lead locked by an open repaint follow-up (NEW, 29), moves the lead, keeps the LEAD/CONTACT/CLIENT badge and the
    linked customer's type in sync, logs activity and shows a toast. It then sends the stage's automated
    messages (Settings > Automated Messages) once per lead, and a second toast confirms what was sent.
  - archive / restore / remove / addNote / convert.
*/
import { useCallback, useRef } from 'react';
import type { Lead, LeadStatus } from '@/lib/types';
import { useCollection, useLogActivity, useSingleton } from '@/lib/store';
import { deliver, leadVars, planStageSends } from '@/lib/lead-messages';
import { useToast } from '@/components/ui/toast';
import { fullName } from '@/lib/utils';
import { LEAD_LIFECYCLE, appendNote, customerTypeFor } from './leadHelpers';
import { currentFollowUpLock, followUpLockMessage } from './leadFeatures';

export function useLeadActions() {
  const leads = useCollection('leads');
  const customers = useCollection('customers');
  const events = useCollection('events');
  const messages = useCollection('automatedMessages');
  const [bp] = useSingleton('businessProfile');
  const log = useLogActivity();
  const { toast } = useToast();
  // Sends finish after the click; record them on the lead as it is then.
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  /** Sends the stage's automated messages (once per lead) and logs them on the lead. */
  const sendStageMessages = useCallback(
    (lead: Lead, status: LeadStatus) => {
      const { sends, skipped } = planStageSends(lead, status, messages.items, leadVars(lead, bp.companyName || 'our team'));
      if (skipped.length) toast(`Not sent: ${skipped.join(', ')}`, 'info');
      if (!sends.length) return;
      void Promise.all(sends.map((s) => deliver(s, status))).then((results) => {
        const current = leadsRef.current.get(lead.id);
        if (current) leadsRef.current.update(lead.id, { sentMessages: [...(current.sentMessages ?? []), ...results] });
        const ok = results.filter((r) => r.ok);
        const failed = results.filter((r) => !r.ok);
        for (const r of ok) log(`Automated message "${r.name}" sent to ${fullName(lead)} by ${r.channel === 'EMAIL' ? 'email' : 'SMS'}${r.sandbox ? ' (sandbox)' : ''}`, 'lead', lead.id);
        if (ok.length) {
          const names = Array.from(new Set(ok.map((r) => `"${r.name}"`))).join(', ');
          const how = Array.from(new Set(ok.map((r) => (r.channel === 'EMAIL' ? 'email' : 'SMS')))).join(' + ');
          toast(`Automated message ${names} sent by ${how}${ok.every((r) => r.sandbox) ? ' (sandbox: no email/SMS service is connected)' : ''}`);
        }
        if (failed.length) toast(`Automated message not sent: ${failed[0]!.error ?? 'unknown error'}`, 'error');
      });
    },
    [messages.items, bp.companyName, log, toast],
  );

  const changeStatus = useCallback(
    (lead: Lead, status: LeadStatus, opts: { silent?: boolean; message?: string } = {}) => {
      if (lead.status === status) return;
      // NEW (29): a lead driven by an open repaint follow-up can't be moved by hand.
      const fu = currentFollowUpLock(lead.id);
      if (fu) { toast(followUpLockMessage(fu), 'error'); return; }
      const contactType = status === 'Archived' ? lead.contactType : LEAD_LIFECYCLE[status].type;
      leads.update(lead.id, { status, contactType, updatedAt: new Date().toISOString() });
      const customer = customers.get(lead.customerId);
      if (customer) {
        const type = customerTypeFor(status, customer.type);
        if (type !== customer.type) customers.update(customer.id, { type });
      }
      log(`${fullName(lead)} (${lead.leadNumber}) moved to ${status}`, 'lead', lead.id);
      if (!opts.silent) toast(opts.message ?? 'Lead status updated successfully');
      sendStageMessages({ ...lead, status }, status);
    },
    [leads, customers, log, toast, sendStageMessages],
  );

  const archive = useCallback((lead: Lead) => changeStatus(lead, 'Archived', { message: 'Lead archived' }), [changeStatus]);

  /** Restoring puts the lead back in Contacted, like the live app. */
  const restore = useCallback((lead: Lead) => changeStatus(lead, 'Contacted', { message: 'Lead restored successfully' }), [changeStatus]);

  const remove = useCallback(
    (lead: Lead) => {
      leads.remove(lead.id);
      // Remove the calendar appointment made for this lead, if any.
      events.items.filter((e) => e.leadId === lead.id).forEach((e) => events.remove(e.id));
      log(`Lead ${lead.leadNumber} deleted`, 'lead', lead.id);
      toast('Lead deleted successfully');
    },
    [leads, events, log, toast],
  );

  const addNote = useCallback(
    (lead: Lead, text: string) => {
      leads.update(lead.id, { notes: appendNote(lead.notes, text), updatedAt: new Date().toISOString() });
      toast('Note added successfully');
    },
    [leads, toast],
  );

  /** Creates a customer record from the lead when it has none yet. */
  const convert = useCallback(
    (lead: Lead) => {
      if (lead.customerId) return;
      const c = customers.add({
        firstName: lead.firstName, lastName: lead.lastName, companyName: lead.companyName,
        email: lead.email, phone: lead.phone, secondaryPhone: lead.secondaryPhone, secondaryEmail: lead.secondaryEmail,
        street: lead.street, city: lead.city, state: lead.state, zip: lead.zip,
        type: 'Contact', source: lead.leadSource, createdAt: new Date().toISOString(),
      });
      leads.update(lead.id, { customerId: c.id, contactType: 'CONTACT' });
      log(`${fullName(lead)} converted to a customer`, 'lead', lead.id);
      toast('Lead converted to customer successfully');
    },
    [customers, leads, log, toast],
  );

  return { changeStatus, archive, restore, remove, addNote, convert, sendStageMessages };
}
