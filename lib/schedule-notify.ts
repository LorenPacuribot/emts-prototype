/*
  Crew schedule notifications, replica side (JS-M2).

  The first time the store loads (and on Reset demo data), every crew member
  is taken as told about the schedule as it is, so no job shows "Changes not
  sent" until someone changes it. The rule itself is in
  features/lib/rules/schedule-notify.ts.
*/
import { baselineSnapshots } from '@/features/lib/rules/schedule-notify';
import type { Database } from './types';

export function withNotifyBaseline(db: Database, at = new Date().toISOString()): Database {
  return { ...db, collections: { ...db.collections, scheduleNotifySnapshots: baselineSnapshots(db.collections.jobs, at) } };
}
