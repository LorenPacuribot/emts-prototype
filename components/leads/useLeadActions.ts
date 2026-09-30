'use client';

/*
  One place for every change a user can make to a lead, so the board, the
  table and the detail page all behave the same way:
  - changeStatus: refuses a lead locked by an open repaint follow-up (NEW, 29), moves the lead, keeps the LEAD/CONTACT/CLIENT badge and the
    linked customer's type in sync, logs activity and shows a toast. It then sends the stage's automated
    messages (Settings > Automated Messages) once per lead, and a second toast confirms what was sent.
    Messages with a delay are scheduled on the lead instead; moving the lead to another stage cancels them.
  - cancelScheduled: cancels one waiting message by hand.
  - archive / restore / remove / addNote / convert.
  - 30 Sep call (CRM): every stage change is added to the lead's stage history
    with who moved it (CRM-M7); moveToStage puts a lead on a Sales stage that
    stands for no lifecycle status; moveInPipeline moves it on an added
    pipeline (CRM-C2). In the Complete version a stage email that is not
    approved waits in the approval queue instead of sending (CRM-C3).
*/
import { useCallback, useRef } from 'react';
import type { Lead, LeadStatus, PipelineStage, PreparedMessage } from '@/lib/types';
import { useCollection, useCurrentUser, useLogActivity, useSingleton } from '@/lib/store';
import { move } from '@/lib/crm';
import { pipelineColumns, salesColumnFor } from '@/features/lib/rules/lead-pipeline';
import { useIsOn } from '@/features/lib/feature-visibility';
import { cancelForStageChange, deliver, leadVars, planStageSends, splitByDelay } from '@/lib/lead-messages';
import { useToast } from '@/components/ui/toast';
import { fullName, uid } from '@/lib/utils';
import { LEAD_LIFECYCLE, appendNote, customerTypeFor } from './leadHelpers';
import { currentFollowUpLock, followUpLockMessage } from './leadFeatures';

export function useLeadActions() {
  const leads = useCollection('leads');
  const customers = useCollection('customers');
  const events = useCollection('events');
  const messages = useCollection('automatedMessages');
  const stages = useCollection('pipelineStages');
  const prepared = useCollection('preparedMessages');
  const me = fullName(useCurrentUser());
  const complete = useIsOn({ featureKey: 'crm', part: 'complete' });
  const [bp] = useSingleton('businessProfile');
  const log = useLogActivity();
  const { toast } = useToast();
  // Sends finish after the click; record them on the lead as it is then.
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  /** Sends the stage's automated messages (once per lead) and logs them on the lead. */
  const sendStageMessages = useCallback(
    (lead: Lead, status: LeadStatus) => {
      const plan = planStageSends(lead, status, messages.items, leadVars(lead, bp.companyName || 'our team'));
      if (plan.skipped.length) toast(`Not sent: ${plan.skipped.join(', ')}`, 'info');
      const at = new Date().toISOString();
      // CRM-C3 (Complete): a stage email nobody approved waits in the approval queue.
      const held = complete ? plan.sends.filter((s) => !s.message.approval) : [];
      if (held.length) {
        const queued: PreparedMessage[] = held.map((s) => ({
          id: uid('pm'), sourceKind: 'template', sourceId: s.message.id, sourceName: s.message.name, eventKey: `lead_stage:${lead.id}:${status}`, trigger: 'lead_stage',
          customerName: fullName(lead), leadId: lead.id, channel: s.channel === 'EMAIL' ? 'email' : 'sms', to: s.to, subject: s.subject, body: s.body, createdAt: at, status: 'waiting',
        }));
        prepared.setAll([...queued, ...prepared.items]);
        toast(`${held.length} stage ${held.length === 1 ? 'message is' : 'messages are'} waiting for approval (Marketing › Automations)`, 'info');
      }
      const { now: sends, later } = splitByDelay(plan.sends.filter((s) => !held.includes(s)), status, at, () => `sm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
      if (later.length) {
        // The caller passes the lead as it is after this change (a status change may have cancelled some).
        leadsRef.current.update(lead.id, { scheduledMessages: [...(lead.scheduledMessages ?? []), ...later] });
        const first = later.reduce((a, b) => (a.sendAt <= b.sendAt ? a : b));
        const names = Array.from(new Set(later.map((m) => `"${m.name}"`))).join(', ');
        log(`Automated message ${names} scheduled for ${fullName(lead)}, sending ${new Date(first.sendAt).toLocaleString()}`, 'lead', lead.id);
        toast(`Automated message ${names} scheduled for ${new Date(first.sendAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}. Cancel it on the lead if needed.`, 'info');
      }
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
    [messages.items, bp.companyName, log, toast, complete, prepared],
  );

  const changeStatus = useCallback(
    (lead: Lead, status: LeadStatus, opts: { silent?: boolean; message?: string } = {}) => {
      if (lead.status === status) return;
      // NEW (29): a lead driven by an open repaint follow-up can't be moved by hand.
      const fu = currentFollowUpLock(lead.id);
      if (fu) { toast(followUpLockMessage(fu), 'error'); return; }
      const contactType = status === 'Archived' ? lead.contactType : LEAD_LIFECYCLE[status].type;
      const at = new Date().toISOString();
      const scheduledMessages = cancelForStageChange(lead.scheduledMessages, status, at);
      const cancelled = (scheduledMessages ?? []).filter((m) => m.cancelledAt === at).length;
      // CRM-M7: record the stage it lands on, and who moved it.
      const col = salesColumnFor({ status, stageId: undefined, stageStatus: undefined }, pipelineColumns(stages.items, 'sales'));
      const stageHistory = col ? [...(lead.stageHistory ?? []), move('sales', col, me, at)] : lead.stageHistory;
      leads.update(lead.id, { status, contactType, updatedAt: at, stageId: undefined, stageStatus: undefined, stageHistory, ...(cancelled ? { scheduledMessages } : {}) });
      if (cancelled) log(`${cancelled} scheduled message${cancelled === 1 ? '' : 's'} cancelled for ${fullName(lead)}: lead moved to ${status}`, 'lead', lead.id);
      const customer = customers.get(lead.customerId);
      if (customer) {
        const type = customerTypeFor(status, customer.type);
        if (type !== customer.type) customers.update(customer.id, { type });
      }
      log(`${fullName(lead)} (${lead.leadNumber}) moved to ${status}`, 'lead', lead.id);
      if (!opts.silent) toast(opts.message ?? 'Lead status updated successfully');
      sendStageMessages({ ...lead, status, scheduledMessages }, status);
    },
    [leads, customers, log, toast, sendStageMessages, stages.items, me],
  );

  /** CRM-M2: onto a Sales stage that stands for no lifecycle status (the lead keeps its status). */
  const moveToStage = useCallback(
    (lead: Lead, stage: PipelineStage) => {
      const at = new Date().toISOString();
      leads.update(lead.id, { stageId: stage.id, stageStatus: lead.status, updatedAt: at, stageHistory: [...(lead.stageHistory ?? []), move('sales', stage, me, at)] });
      log(`${fullName(lead)} (${lead.leadNumber}) moved to ${stage.displayName}`, 'lead', lead.id);
      toast(`Moved to ${stage.displayName}`);
    },
    [leads, log, toast, me],
  );

  /** CRM-C2: a stage on an added pipeline. */
  const moveInPipeline = useCallback(
    (lead: Lead, pipelineId: string, stage: PipelineStage) => {
      const at = new Date().toISOString();
      leads.update(lead.id, { pipelineStages: { ...lead.pipelineStages, [pipelineId]: stage.id }, stageHistory: [...(lead.stageHistory ?? []), move(pipelineId, stage, me, at)] });
      toast(`Moved to ${stage.displayName}`);
    },
    [leads, toast, me],
  );

  const cancelScheduled = useCallback(
    (lead: Lead, id: string) => {
      const m = lead.scheduledMessages?.find((x) => x.id === id);
      if (!m || m.cancelledAt) return;
      leads.update(lead.id, { scheduledMessages: lead.scheduledMessages!.map((x) => (x.id === id ? { ...x, cancelledAt: new Date().toISOString(), cancelReason: 'Cancelled by hand' } : x)) });
      log(`Scheduled message "${m.name}" (${m.channel === 'EMAIL' ? 'email' : 'SMS'}) cancelled for ${fullName(lead)}`, 'lead', lead.id);
      toast('Scheduled message canceled');
    },
    [leads, log, toast],
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

  return { changeStatus, moveToStage, moveInPipeline, archive, restore, remove, addNote, convert, sendStageMessages, cancelScheduled };
}
