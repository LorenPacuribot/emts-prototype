'use client';

/*
  Contact detail, 30 Sep call (Complete version).
  - QuickBooksUpdatedNote (QB-C2): "Updated from QuickBooks on {date}" beside
    a field QuickBooks changed and sent back.
  - QuickBooksContactCard (QB-C4): the linked QuickBooks customer: balance,
    status, last updated and "Open in QuickBooks" (simulated).
  Both read the contact's QuickBooks customer from the prototype store.
*/
import { useMemo } from 'react';
import { ExternalLink, Landmark } from 'lucide-react';
import { matchContacts } from '@/features/lib/rules/qbo-contacts';
import { useDb as useFeatureDb } from '@/features/lib/store';
import { dateLong, money } from '@/features/lib/format';
import { toast } from '@/features/lib/toast';
import { Badge, Button, NewBadge, VersionBadge } from '@/features/components/ui';

/** The linked QuickBooks customer, or the exact match before Match your contacts is finished. */
function useQboCustomer(customerId: string) {
  const qbo = useFeatureDb((d) => d.qboCustomers);
  const customers = useFeatureDb((d) => d.customers);
  return useMemo(() => {
    const list = qbo ?? [];
    return list.find((q) => q.customerId === customerId) ?? matchContacts(customers.filter((c) => !c.leadOnly), list).matched.find((m) => m.customerId === customerId)?.qbo;
  }, [qbo, customers, customerId]);
}

export function QuickBooksUpdatedNote({ customerId, field }: { customerId: string; field: 'name' | 'email' | 'phone' | 'address' }) {
  const q = useQboCustomer(customerId);
  const hit = q?.updatedFromQbo?.filter((u) => u.field === field).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (!hit) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
      Updated from QuickBooks on {dateLong(hit.at)} <VersionBadge item="QB-C2" />
    </span>
  );
}

/** Simulated: the live app opens the customer in QuickBooks Online. */
export const openInQuickBooks = (ref: string) => toast.info('Opens QuickBooks Online', `${ref} (simulated in the prototype).`);

export function QuickBooksContactCard({ customerId }: { customerId: string }) {
  const q = useQboCustomer(customerId);
  const connected = useFeatureDb((d) => d.financeSettings.qbo.connected);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-gray-500">
        <Landmark className="h-4 w-4" />
        <span className="text-xs font-bold uppercase tracking-widest">QuickBooks</span>
        <NewBadge /><VersionBadge item="QB-C4" />
      </div>
      {q ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-baseline justify-between"><span className="text-gray-500">Balance</span><b className="tabular-nums text-gray-900">{money(q.balance)}</b></div>
          <div className="flex items-center justify-between"><span className="text-gray-500">Status</span><Badge tone={q.active ? 'green' : 'gray'}>{q.active ? 'Active' : 'Inactive'}</Badge></div>
          <div className="flex items-baseline justify-between"><span className="text-gray-500">Last updated</span><span className="text-gray-900">{dateLong(q.lastUpdatedAt)}</span></div>
          <Button size="sm" variant="secondary" className="w-full justify-center" onClick={() => openInQuickBooks(q.id)}>
            <ExternalLink className="h-3.5 w-3.5" /> Open in QuickBooks
          </Button>
        </div>
      ) : (
        <p className="text-sm text-gray-500">{connected ? 'Not in QuickBooks yet. It is created with the next exchange.' : 'QuickBooks is not connected.'}</p>
      )}
    </div>
  );
}
