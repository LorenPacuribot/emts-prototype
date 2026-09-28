'use client';

/*
  Grid of archived leads shown when "View Archived" is on.
  Each card has a Restore button that puts the lead back in Contacted
  (hidden while an open repaint follow-up drives the lead, NEW 29).
*/
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import type { Lead } from '@/lib/types';
import { Badge } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { LEAD_STATUS_BADGE, timeAgo } from './leadHelpers';
import { useFollowUpLocks } from './leadFeatures';

export function ArchivedView({ leads, onRestore }: { leads: Lead[]; onRestore: (lead: Lead) => void }) {
  const lockOf = useFollowUpLocks();
  if (leads.length === 0) {
    return <div className="py-12 text-center italic text-gray-400">No archived leads found matching search.</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {leads.map((lead) => (
        <div key={lead.id} className="rounded-xl border border-gray-200 bg-white p-6 opacity-90 shadow-sm transition-opacity hover:opacity-100">
          <Link href={`/leads/${lead.id}`} className="block">
            <h3 className="font-bold text-gray-900 hover:text-primary-700">{lead.firstName} {lead.lastName}</h3>
            <div className="text-sm text-gray-500">{lead.email}</div>
          </Link>
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
            <Badge className={LEAD_STATUS_BADGE[lead.status]}>{lead.status}</Badge>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{timeAgo(lead.date)}</span>
              {!lockOf(lead.id) && (
                <Button variant="secondary" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => onRestore(lead)}>
                  Restore
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
