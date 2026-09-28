'use client';

/*
  Deletes a contact. Their leads stay in the pipeline but are unlinked,
  so no screen points at a missing customer.
*/
import { useCallback } from 'react';
import type { Customer } from '@/lib/types';
import { useCollection, useLogActivity } from '@/lib/store';
import { fullName } from '@/lib/utils';

export function useDeleteContact() {
  const customers = useCollection('customers');
  const leads = useCollection('leads');
  const log = useLogActivity();
  return useCallback(
    (c: Customer) => {
      leads.items.filter((l) => l.customerId === c.id).forEach((l) => leads.update(l.id, { customerId: undefined }));
      customers.remove(c.id);
      log(`Contact ${fullName(c)} deleted`);
    },
    [customers, leads, log],
  );
}
