'use client';

import type { Job } from '@/lib/types';
import { ShiftSchedulePanel } from '@/components/scheduling/ShiftSchedulePanel';

export function ScheduleJobModal({ job, open, onOpenChange, initialStart }: { job: Job; open: boolean; onOpenChange: (v: boolean) => void; initialStart?: string }) {
  return open ? <ShiftSchedulePanel key={`${job.id}-${initialStart ?? ''}`} job={job} initialStart={initialStart} onClose={() => onOpenChange(false)} /> : null;
}
