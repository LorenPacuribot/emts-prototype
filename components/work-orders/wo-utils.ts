/*
  Work order display status.

  Our stored status is Open / In Progress / Completed. The live app shows
  Pending Deposit / Unscheduled / Scheduled / In Progress / Completed. An
  "Open" work order is shown as Scheduled when its job has dates, otherwise
  Unscheduled. A work order with a feature-prototype twin shows the twin's
  live status instead (that is where Pending Deposit comes from).
*/
import type { Job, WorkOrder } from '@/lib/types';

export type WODisplayStatus = 'Pending Deposit' | 'Unscheduled' | 'Scheduled' | 'In Progress' | 'Completed';

export const WO_FILTERS: ('All Active' | WODisplayStatus)[] = ['All Active', 'Pending Deposit', 'Unscheduled', 'Scheduled', 'In Progress', 'Completed'];

export const WO_STATUS_STYLE: Record<WODisplayStatus, string> = {
  'Pending Deposit': 'bg-amber-50 text-amber-700 border-amber-200',
  Unscheduled: 'bg-gray-100 text-gray-700 border-gray-200',
  Scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  'In Progress': 'bg-purple-50 text-purple-700 border-purple-200',
  Completed: 'bg-green-50 text-green-700 border-green-200',
};

const PROTO_STATUS: Record<string, WODisplayStatus> = {
  PENDING_DEPOSIT: 'Pending Deposit', UNSCHEDULED: 'Unscheduled', SCHEDULED: 'Scheduled', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed',
};

/** `protoStatus` is the feature-prototype twin's status (lib/bridge), when there is one: it wins. */
export function woDisplayStatus(wo: WorkOrder, job?: Job, protoStatus?: string): WODisplayStatus {
  if (protoStatus && PROTO_STATUS[protoStatus]) return PROTO_STATUS[protoStatus];
  if (wo.status === 'Completed') return 'Completed';
  if (wo.status === 'In Progress') return 'In Progress';
  return job?.startDate ? 'Scheduled' : 'Unscheduled';
}
