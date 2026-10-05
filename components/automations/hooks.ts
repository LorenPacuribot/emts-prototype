'use client';

/*
  Hooks the Automations screens share: the message library (one library
  with Settings › Automated Messages and SMS Templates), the name lookup
  for plain sentences, the engine environment and the permission checks.
*/
import { useCallback, useMemo } from 'react';
import { useCollection, useDb, useSingleton } from '@/lib/store';
import { useCurrentUser, useDb as useFeatureDb } from '@/features/lib/store';
import { can } from '@/features/lib/permissions';
import { nowDate } from '@/features/lib/clock';
import type { CustomerMessage, MessageCategory } from '@/lib/automations/types';
import type { EngineEnv } from '@/lib/automations/executors';
import type { NameLookup } from '@/lib/automations/summary';
import { libraryFrom, isCustomerEmail, sampleById, toAutomatedMessage, toSmsTemplate, type SampleMessage } from '@/lib/automations/messages';
import { messageUsedIn, recordMessageSaved, replaceMessage, useAuto } from '@/lib/automations/store';
import { buildRegistry } from '@/lib/automations/registry';

export function usePerms() {
  const user = useCurrentUser();
  return useMemo(() => ({
    user,
    view: can(user, 'automation.view'),
    manage: can(user, 'automation.manage'),
    del: can(user, 'automation.delete'),
    deploy: can(user, 'automation.deploy'),
    review: can(user, 'automation.review'),
  }), [user]);
}

/** Estimate templates with their scope name (Interior, Exterior…). */
export function useEstimateTemplates() {
  const db = useDb();
  return useMemo(() => db.collections.estimateTemplates.map((t) => ({
    id: t.id, name: t.name, estimateType: db.collections.estimateTypes.find((e) => e.id === t.estimateTypeId)?.name,
  })), [db.collections.estimateTemplates, db.collections.estimateTypes]);
}

export function useLibrary(): CustomerMessage[] {
  const db = useDb();
  const versions = useAuto((s) => s.messageVersions);
  const automations = useAuto((s) => s.automations);
  return useMemo(() => {
    const usedIn = (id: string) => automations.filter((a) => !a.isDeleted && a.steps.some((st) => st.config.messageId === id)).map((a) => a.id);
    return libraryFrom(db.collections.automatedMessages, db.collections.smsTemplates, versions, usedIn);
  }, [db.collections.automatedMessages, db.collections.smsTemplates, versions, automations]);
}

export function useNames(): NameLookup {
  const users = useFeatureDb((d) => d.users);
  const library = useLibrary();
  const templates = useEstimateTemplates();
  return useMemo(() => ({
    user: (id?: string) => users.find((u) => u.id === id)?.name,
    message: (id?: string) => library.find((m) => m.id === id)?.name ?? (id ? sampleById(id)?.name : undefined),
    estimateTemplate: (id?: string) => templates.find((t) => t.id === id)?.name,
  }), [users, library, templates]);
}

export function useOrg() {
  const [bp] = useSingleton('businessProfile');
  return { orgName: bp.companyName || 'Estimate Master', reviewLink: bp.reviewLink, timezone: bp.timezone };
}

export function useEngineEnv(): () => EngineEnv {
  const messages = useLibrary();
  const templates = useEstimateTemplates();
  const { orgName, reviewLink } = useOrg();
  return useCallback(() => ({ now: nowDate(), messages, orgName, reviewLink, estimateTemplates: templates }), [messages, templates, orgName, reviewLink]);
}

export function useRegistry() {
  const library = useLibrary();
  return useMemo(() => buildRegistry(library.map((m) => ({ id: m.id, name: m.name, channel: m.channel }))), [library]);
}

export interface MessageInput {
  name: string;
  channel: 'EMAIL' | 'SMS';
  subject?: string;
  body: string;
  category?: MessageCategory;
}

/** Create, update and delete library messages. They live in the replica's settings collections. */
export function useMessageActions() {
  const emails = useCollection('automatedMessages');
  const texts = useCollection('smsTemplates');

  const create = useCallback((m: MessageInput): string => {
    const id = `msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    if (m.channel === 'EMAIL') emails.add(toAutomatedMessage(id, m));
    else texts.add(toSmsTemplate(id, m));
    recordMessageSaved(id, { name: m.name, subject: m.subject, body: m.body });
    return id;
  }, [emails, texts]);

  const update = useCallback((id: string, m: MessageInput): { needsApproval: string[] } => {
    const email = emails.get(id);
    const text = texts.get(id);
    const previous = email ? { name: email.name, subject: email.subject, body: email.body } : text ? { name: text.name, body: text.body } : undefined;
    if (email) emails.update(id, { name: m.name, subject: m.subject, body: m.body, automationCategory: m.category ?? email.automationCategory });
    else if (text) texts.update(id, { name: m.name, body: m.body, automationCategory: m.category ?? text.automationCategory });
    return recordMessageSaved(id, { name: m.name, subject: m.subject, body: m.body }, previous);
  }, [emails, texts]);

  const remove = useCallback((id: string, replaceWith?: string) => {
    if (replaceWith) replaceMessage(id, replaceWith);
    if (emails.get(id)) emails.remove(id);
    else texts.remove(id);
  }, [emails, texts]);

  /** Copy samples into the library (once per sample) and return sample id → library id. */
  const copySamples = useCallback((sampleIds: string[], existing: CustomerMessage[]): Record<string, string> => {
    const map: Record<string, string> = {};
    for (const sid of sampleIds) {
      const sample = sampleById(sid);
      if (!sample) continue;
      const found = existing.find((m) => m.name === sample.name && m.channel === sample.channel);
      map[sid] = found?.id ?? create(fromSample(sample));
    }
    return map;
  }, [create]);

  return { create, update, remove, copySamples, isUsed: (id: string, s: Parameters<typeof messageUsedIn>[0]) => messageUsedIn(s, id) };
}

export const fromSample = (s: SampleMessage): MessageInput => ({ name: s.name, channel: s.channel, subject: s.subject, body: s.body, category: s.category });

export { isCustomerEmail };
