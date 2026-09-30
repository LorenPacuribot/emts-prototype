/*
  All mock data in one place. The store (lib/store.tsx) loads this on first
  visit. Edit the files in lib/data/ to change the demo data.

  Core records (customers, leads, estimates, jobs, work orders, invoices)
  come from the feature prototype's demo story (features/data/seed.ts):
  lib/bridge projects them into these collections when the store loads, so
  every record carries the new features. The replica's own sample records
  for those collections are kept in lib/data/core.ts for reference only.
*/
import type { Database } from './types';
import * as core from './data/core';
import * as lib from './data/settings-library';
import * as cfg from './data/settings-config';
import * as org from './data/settings-org';

export const CURRENT_USER_ID = 'u_kevin';

/** Replica sample customers that are the same people as prototype customers. */
const SAME_CUSTOMER: Record<string, string> = { c1: 'C-SAM', c2: 'C-KORAH', c3: 'C-STEVEN', c4: 'C-JEREMY' };
const remapCustomer = (id?: string) => (id ? SAME_CUSTOMER[id] : undefined);

export function createInitialDatabase(): Database {
  // structuredClone so edits in the app never mutate these module constants
  return structuredClone({
    collections: {
      team: core.team,
      customers: [],
      leads: [],
      estimates: [],
      jobs: [],
      workOrders: [],
      invoices: [],
      // Links to the replica's old sample records are dropped or remapped.
      presentations: core.presentations.map((x) => ({ ...x, estimateId: undefined, customerId: remapCustomer(x.customerId) })),
      events: core.events.filter((e) => !e.leadId && !e.jobId).map((e) => ({ ...e, customerId: remapCustomer(e.customerId) })),
      tasks: core.tasks,
      activity: [],
      messages: core.messages.map((m) => ({ ...m, customerId: remapCustomer(m.customerId) })),
      // Filled from the schedule when the store loads (lib/schedule-notify.ts).
      scheduleNotifySnapshots: [],
      scheduleMessages: [],
      roles: org.roles,
      difficultyTiers: cfg.difficultyTiers,
      projectDiscounts: cfg.projectDiscounts,
      taxRegions: cfg.taxRegions,
      tableColumns: cfg.tableColumns,
      pipelineStages: cfg.pipelineStages,
      pipelines: cfg.pipelines,
      // Filled from sold estimates when the store loads (lib/crm.ts).
      productionCards: [],
      trackedLinks: cfg.trackedLinks,
      automationRules: cfg.automationRules,
      preparedMessages: [],
      automationEvents: [],
      automatedMessages: cfg.automatedMessages,
      smsTemplates: cfg.smsTemplates,
      documentNumbering: cfg.documentNumbering,
      estimateTypes: lib.estimateTypes,
      estimateTemplates: lib.estimateTemplates,
      packageTemplates: lib.packageTemplates,
      areaTemplates: lib.areaTemplates,
      surfaceRates: lib.surfaceRates,
      rateGroups: lib.rateGroups,
      brands: lib.brands,
      paintProducts: lib.paintProducts,
      materials: lib.materials,
      lineItemTemplates: lib.lineItemTemplates,
      termsConditions: lib.termsConditions,
    },
    singletons: {
      currentUserId: CURRENT_USER_ID,
      userProfile: org.userProfile,
      businessProfile: org.businessProfile,
      subscription: org.subscription,
      paymentGateway: org.paymentGateway,
      generalConfig: cfg.generalConfig,
      goalsProfit: cfg.goalsProfit,
      financialSettings: cfg.financialSettings,
      laborConfig: cfg.laborConfig,
    },
  });
}

export { PERMISSION_GROUPS } from './data/settings-org';
