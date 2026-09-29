'use client';

/*
  Estimate actions used by the list, builder, preview and client view.

  Why a hook: "send", "approve", "convert to job" and friends touch several
  collections (estimates, leads, jobs, activity). Doing it in one place keeps
  every screen consistent and every change logged in the version history.
*/
import { useCallback } from 'react';
import type { Estimate, Job } from '@/lib/types';
import { estimateTotals } from '@/lib/calculations';
import { useCollection, useCurrentUser, useLogActivity, useNextNumber } from '@/lib/store';
import { fullName, uid } from '@/lib/utils';
import { withVersion } from './estimate-utils';

export function useEstimateActions() {
  const estimates = useCollection('estimates');
  const leads = useCollection('leads');
  const jobs = useCollection('jobs');
  const customers = useCollection('customers');
  const nextNumber = useNextNumber();
  const log = useLogActivity();
  const user = useCurrentUser();
  const me = fullName(user);

  /** Saves the whole estimate and adds a history entry. */
  const save = useCallback(
    (e: Estimate, note = 'Estimate saved', changedBy = me) => {
      const total = estimateTotals(e).total;
      const next = withVersion(e, total, changedBy, note);
      estimates.update(e.id, next);
      return next;
    },
    [estimates, me],
  );

  /** Background save while editing a draft: writes the estimate without a history entry (Save still adds one). */
  const autosave = useCallback(
    (e: Estimate) => {
      const next = { ...e, updatedAt: new Date().toISOString() };
      estimates.update(e.id, next);
      return next;
    },
    [estimates],
  );

  /** Changes the status, sets the matching date fields and logs it. */
  const setStatus = useCallback(
    (e: Estimate, status: Estimate['status'], note: string, extra: Partial<Estimate> = {}, changedBy = me) => {
      const total = estimateTotals(e).total;
      const now = new Date().toISOString();
      const dates: Partial<Estimate> = {};
      if (status === 'Sent') dates.sentAt = now;
      if (status === 'Viewed') dates.viewedAt = now;
      if (status === 'Approved') dates.approvedAt = now;
      const next = withVersion({ ...e, ...dates, ...extra }, total, changedBy, note, status);
      estimates.update(e.id, next);

      // Keep the lead pipeline in step with the estimate.
      const lead = leads.get(e.leadId);
      if (lead) {
        if (status === 'Approved') leads.update(lead.id, { status: 'Sold', contactType: 'CLIENT', updatedAt: now });
        else if (status === 'Sent' && !['Sold', 'Lost'].includes(lead.status)) leads.update(lead.id, { status: 'Pending', updatedAt: now });
      }
      if (status === 'Approved') {
        const c = customers.get(e.customerId);
        if (c && c.type !== 'Client') customers.update(c.id, { type: 'Client' });
      }
      return next;
    },
    [estimates, leads, customers, me],
  );

  const send = useCallback(
    (e: Estimate, to: string) => {
      const next = setStatus(e, e.status === 'Approved' ? e.status : 'Sent', `Sent to ${to}`);
      log(`${e.estimateNumber} sent to ${to}`, 'estimate', e.id);
      return next;
    },
    [setStatus, log],
  );

  const markApproved = useCallback(
    (e: Estimate) => {
      const next = setStatus(e, 'Approved', 'Marked approved by estimator');
      log(`${e.estimateNumber} marked as approved`, 'estimate', e.id);
      return next;
    },
    [setStatus, log],
  );

  const markDeclined = useCallback(
    (e: Estimate, reason?: string) => {
      const next = setStatus(e, 'Rejected', reason ? `Declined: ${reason}` : 'Marked declined', { declineReason: reason });
      log(`${e.estimateNumber} marked as declined`, 'estimate', e.id);
      return next;
    },
    [setStatus, log],
  );

  const duplicate = useCallback(
    (e: Estimate) => {
      const now = new Date().toISOString();
      const number = nextNumber('ESTIMATE');
      const areaMap = new Map(e.areas.map((a) => [a.id, uid('ar')]));
      const copy: Estimate = {
        ...e,
        id: number,
        estimateNumber: number,
        title: `${e.title} (Copy)`,
        status: 'Draft',
        date: now,
        validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        areas: e.areas.map((a) => ({ ...a, id: areaMap.get(a.id)! })),
        lineItems: e.lineItems.map((l) => ({ ...l, id: uid('li'), areaId: areaMap.get(l.areaId) ?? l.areaId })),
        extras: e.extras.map((x) => ({ ...x, id: uid('x') })),
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
        sentAt: undefined,
        viewedAt: undefined,
        approvedAt: undefined,
        signature: null,
        declineReason: undefined,
        jobId: undefined,
        versions: [{ version: 1, date: now, total: estimateTotals(e).total, status: 'Draft', changedBy: me, note: `Duplicated from ${e.estimateNumber}` }],
      };
      estimates.add(copy, { atStart: true });
      log(`${number} created from ${e.estimateNumber}`, 'estimate', copy.id);
      return copy;
    },
    [estimates, nextNumber, log, user.id, me],
  );

  const remove = useCallback(
    (e: Estimate) => {
      estimates.remove(e.id);
      const lead = leads.get(e.leadId);
      if (lead?.estimateId === e.id) leads.update(lead.id, { estimateId: undefined });
      log(`${e.estimateNumber} deleted`, 'estimate', e.id);
    },
    [estimates, leads, log],
  );

  /** Creates a Job from an approved estimate. Returns the new job. */
  const convertToJob = useCallback(
    (e: Estimate) => {
      // Accepting an estimate creates its job on the feature side (lib/bridge): reuse it.
      const linked = jobs.items.find((j) => j.estimateId === e.id);
      if (linked) {
        if (e.jobId !== linked.id) estimates.update(e.id, { jobId: linked.id });
        return linked;
      }
      const t = estimateTotals(e);
      const now = new Date().toISOString();
      const jobNumber = nextNumber('JOB');
      const job: Job = {
        id: jobNumber,
        jobNumber,
        title: e.title,
        customerId: e.customerId,
        estimateId: e.id,
        leadId: e.leadId,
        address: e.address,
        status: 'Unscheduled',
        estimatedHours: t.laborHours,
        value: t.total,
        crew: [],
        breaks: [],
        notes: [],
        history: [{ date: now, text: `Job created from ${e.estimateNumber}` }],
        createdAt: now,
      };
      jobs.add(job, { atStart: true });
      estimates.update(e.id, { jobId: job.id, updatedAt: now });
      log(`${jobNumber} created from ${e.estimateNumber}`, 'job', job.id);
      return job;
    },
    [jobs, estimates, nextNumber, log],
  );

  return { save, autosave, setStatus, send, markApproved, markDeclined, duplicate, remove, convertToJob };
}
