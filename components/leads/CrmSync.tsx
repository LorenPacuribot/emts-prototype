'use client';

/*
  Keeps the CRM boards in step with the rest of the app (30 Sep call, CRM).
  Mounted once, for signed-in pages (FeatureShell).

  - CRM-M3: a lead reaching Sold, or its estimate being approved, gets
    exactly one Production card on the first Production stage. A card removed
    when the lead left Sold comes back if the lead is sold again.
  - CRM-M7: a stage change made by the lead lifecycle (estimate sent,
    accepted…) is added to the lead's stage history as "Automatic".
  - CRM-C3 to C5 (CRM Complete in New Features): new events run the automation rules and
    templates. Approved ones send (sandbox); the rest wait for approval.
    In Minimal, events are only marked as handled.
*/
import { useEffect } from 'react';
import { useCollection, useDb, useSingleton } from '@/lib/store';
import { newProductionCards, unrecordedSalesMove, move } from '@/lib/crm';
import { runAutomations } from '@/lib/automation';
import { pipelineColumns } from '@/features/lib/rules/lead-pipeline';
import { toast } from '@/features/lib/toast';
import { useIsOn } from '@/features/lib/feature-visibility';
import { uid } from '@/lib/utils';

export function CrmSync() {
  const db = useDb();
  const leads = useCollection('leads');
  const cards = useCollection('productionCards');
  const events = useCollection('automationEvents');
  const prepared = useCollection('preparedMessages');
  const [bp] = useSingleton('businessProfile');
  const complete = useIsOn({ featureKey: 'crm', part: 'complete' });
  // Cards are still kept (hiding is display only); the toast follows CRM in New Features.
  const crmOn = useIsOn({ featureKey: 'crm' });

  // CRM-M3: Production cards.
  useEffect(() => {
    const at = new Date().toISOString();
    const c = db.collections;
    const made = newProductionCards(db, at);
    let list = c.productionCards;
    let changed = false;
    // Link cards to their job once it exists; bring back a removed card when the lead is sold again.
    const first = pipelineColumns(c.pipelineStages, 'production')[0];
    list = list.map((card) => {
      const est = c.estimates.find((e) => e.id === card.estimateId);
      const jobId = card.jobId ?? est?.jobId;
      const lead = c.leads.find((l) => l.id === card.leadId);
      const soldAgain = card.removedAt && lead?.status === 'Sold' && (lead.stageHistory ?? []).some((m) => m.stageId === 'ps_sold' && m.at > card.removedAt!);
      if (jobId === card.jobId && !soldAgain) return card;
      changed = true;
      return {
        ...card, jobId,
        ...(soldAgain && first ? { removedAt: undefined, stageId: first.id, history: [...card.history, move('production', first, 'Automatic', at)] } : {}),
      };
    });
    if (!made.length && !changed) return;
    cards.setAll([...list, ...made]);
    const stageName = first?.displayName ?? 'Production';
    if (crmOn) for (const card of made) toast.success(`${card.customerName || card.title} moved to Sold. Added to Production › ${stageName}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.collections.leads, db.collections.estimates, db.collections.jobs]);

  // CRM-M7: lifecycle moves in the stage history.
  useEffect(() => {
    const at = new Date().toISOString();
    const updates = db.collections.leads.flatMap((l) => {
      const m = unrecordedSalesMove(l, db.collections.pipelineStages, 'Automatic', at);
      return m ? [{ ...l, stageHistory: [...(l.stageHistory ?? []), m] }] : [];
    });
    if (!updates.length) return;
    const byId = new Map(updates.map((l) => [l.id, l]));
    leads.setAll(db.collections.leads.map((l) => byId.get(l.id) ?? l));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.collections.leads, db.collections.pipelineStages]);

  // CRM-C3 to C5: the automation engine.
  useEffect(() => {
    const at = new Date().toISOString();
    const r = runAutomations(db, { at, orgName: bp.companyName || 'our team', newId: () => uid('pm') });
    if (!r.events.length) return;
    events.setAll([...db.collections.automationEvents, ...r.events]);
    if (!complete || !r.messages.length) return;
    prepared.setAll([...r.messages, ...db.collections.preparedMessages]);
    const waiting = r.messages.filter((m) => m.status === 'waiting').length;
    const sent = r.messages.length - waiting;
    if (waiting) toast.info(`${waiting} ${waiting === 1 ? 'message is' : 'messages are'} waiting for approval`, 'Marketing › Automations › Waiting for approval.');
    if (sent) toast.success(`${sent} automated ${sent === 1 ? 'message' : 'messages'} sent`, 'The rule is approved. Sandbox: recorded, not delivered.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.collections.estimates, db.collections.jobs, db.collections.leads, complete]);

  return null;
}
