'use client';

/*
  One place for every change a user can make to a lead, so the board, the
  table and the detail page all behave the same way:
  - changeStatus: refuses a lead locked by an open repaint follow-up (NEW, 29), moves the lead, keeps the LEAD/CONTACT/CLIENT badge and the
    linked customer's type in sync, logs activity and shows a toast.
  - archive / restore / remove / addNote / convert.
*/
import { useCallback } from 'react';
import type { Lead, LeadStatus } from '@/lib/types';
import { useCollection, useLogActivity } from '@/lib/store';
import { useToast } from '@/components/ui/toast';
import { fullName } from '@/lib/utils';
import { LEAD_LIFECYCLE, appendNote, customerTypeFor } from './leadHelpers';
import { currentFollowUpLock, followUpLockMessage } from './leadFeatures';

export function useLeadActions() {
  const leads = useCollection('leads');
  const customers = useCollection('customers');
  const events = useCollection('events');
  const log = useLogActivity();
  const { toast } = useToast();

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
    },
    [leads, customers, log, toast],
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

  return { changeStatus, archive, restore, remove, addNote, convert };
}
