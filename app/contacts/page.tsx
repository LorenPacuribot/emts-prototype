'use client';

/*
  Contacts (/contacts). "Manage your client relationships and history."
  Stat cards on top, then search (name, email, phone), a type filter
  (All / Leads / Contacts / Clients / Has Active Projects), a sort menu,
  and one card per contact with status, contact info, value and actions.
  Live source: features/(main)/contacts/listings/templates/grid.tsx
*/
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDownAZ, Building, Calendar, Check, ChevronDown, DollarSign, Edit2, Filter, Mail, MapPin, Phone, Star, Trash2, User, UserPlus,
} from 'lucide-react';
import type { Customer } from '@/lib/types';
import { PageShell } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Pagination, SearchInput, usePagination } from '@/components/ui/display';
import { DropdownMenu, RowMenu } from '@/components/ui/menu';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import { cn, moneyShort, shortDate } from '@/lib/utils';
import { formatPhone } from '@/components/leads/leadHelpers';
import { ContactFormModal } from '@/components/contacts/ContactFormModal';
import { CONTACT_JOB_STATUS, CONTACT_TYPE_COLORS, useContactStats } from '@/components/contacts/contactStats';
import { useDeleteContact } from '@/components/contacts/useDeleteContact';

type TypeFilter = 'AllContacts' | 'Lead' | 'Contact' | 'Client' | 'HasActiveProjects';
type SortKey = 'NameAsc' | 'NameDesc' | 'CompanyAsc' | 'Date';

const FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'AllContacts', label: 'All Contacts' },
  { value: 'Lead', label: 'Leads' },
  { value: 'Contact', label: 'Contacts' },
  { value: 'Client', label: 'Clients' },
  { value: 'HasActiveProjects', label: 'Has Active Projects' },
];
const SORTS: { value: SortKey; label: string; icon: React.ElementType }[] = [
  { value: 'NameAsc', label: 'Name (A-Z)', icon: ArrowDownAZ },
  { value: 'NameDesc', label: 'Name (Z-A)', icon: ArrowDownAZ },
  { value: 'CompanyAsc', label: 'Company Name', icon: Building },
  { value: 'Date', label: 'Date Added', icon: Calendar },
];

export default function ContactsPage() {
  const router = useRouter();
  const { items: customers } = useCollection('customers');
  const stats = useContactStats();
  const deleteContact = useDeleteContact();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [type, setType] = useState<TypeFilter>('AllContacts');
  const [sort, setSort] = useState<SortKey>('NameAsc');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const name = (c: Customer) => `${c.firstName} ${c.lastName}`.toLowerCase();
    return customers
      .filter((c) => {
        if (q && !name(c).includes(q) && !c.email.toLowerCase().includes(q) && !(digits && c.phone.replace(/\D/g, '').includes(digits))) return false;
        if (type === 'HasActiveProjects') return (stats.get(c.id)?.activeJobs ?? 0) > 0;
        if (type !== 'AllContacts') return c.type === type;
        return true;
      })
      .sort((a, b) => {
        switch (sort) {
          case 'NameDesc': return name(b).localeCompare(name(a));
          case 'CompanyAsc': return (a.companyName ?? '~').localeCompare(b.companyName ?? '~') || name(a).localeCompare(name(b));
          case 'Date': return b.createdAt.localeCompare(a.createdAt);
          default: return name(a).localeCompare(name(b));
        }
      });
  }, [customers, search, type, sort, stats]);

  const pg = usePagination(list, 10);

  // Summary cards reflect the current search/filter, like the live summary endpoint.
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const newThisMonth = list.filter((c) => c.createdAt >= monthStart).length;
  const activeProjects = list.reduce((s, c) => s + (stats.get(c.id)?.activeJobs ?? 0), 0);
  const lifetime = list.reduce((s, c) => s + (stats.get(c.id)?.lifetimeValue ?? 0), 0);

  const statCard = 'flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md';
  const statLabel = 'mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 [&>svg]:h-4 [&>svg]:w-4';
  const currentSort = SORTS.find((o) => o.value === sort)!;

  return (
    <PageShell title="Contacts">
      <div className="mb-10">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl">Contacts</h1>
          <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>Add New Contact</Button>
        </div>
        <p className="mt-2 text-lg text-gray-500">Manage your client relationships and history.</p>
      </div>

      <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className={statCard}>
          <div className={statLabel}><User /> Total Clients</div>
          <div className="font-heading text-3xl font-black text-gray-900">{list.length}</div>
        </div>
        <div className={statCard}>
          <div className={statLabel}><UserPlus /> New This Month</div>
          <div className="font-heading text-3xl font-black text-gray-900">{newThisMonth}</div>
        </div>
        <button type="button" onClick={() => setType('HasActiveProjects')} className={cn(statCard, 'group text-left hover:border-primary-300')}>
          <div className={cn(statLabel, 'group-hover:text-primary-600')}><Building /> Active Projects</div>
          <div className="font-heading text-3xl font-black text-gray-900">{activeProjects}</div>
          <div className="mt-1 text-sm font-medium text-gray-500 group-hover:text-primary-500">View in progress</div>
        </button>
        <div className={statCard}>
          <div className={statLabel}><DollarSign /> Lifetime Value</div>
          <div className="font-heading text-3xl font-black text-gray-900">{moneyShort(lifetime)}</div>
          <div className="mt-1 text-sm font-medium text-gray-500">Total revenue generated</div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email, or phone..." className="md:w-96" />
          <div className="flex w-full gap-2 md:w-auto">
            <DropdownMenu
              items={FILTERS.map((f) => ({ label: f.label, icon: type === f.value ? <Check className="text-primary-600" /> : <span />, onClick: () => setType(f.value) }))}
              trigger={
                <button
                  type="button"
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold shadow-sm transition-colors',
                    type !== 'AllContacts' ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
                  )}
                >
                  <Filter className="h-4 w-4" /> {FILTERS.find((f) => f.value === type)!.label} <ChevronDown className="h-3 w-3" />
                </button>
              }
            />
            <DropdownMenu
              items={SORTS.map((o) => ({ label: o.label, icon: <o.icon className={sort === o.value ? 'text-primary-600' : undefined} />, onClick: () => setSort(o.value) }))}
              trigger={
                <button type="button" className="flex min-w-[180px] items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 shadow-sm hover:border-gray-300">
                  <span className="flex items-center gap-2"><currentSort.icon className="h-4 w-4 text-gray-500" />{currentSort.label}</span>
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                </button>
              }
            />
          </div>
        </div>

        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-white py-20">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50"><User className="h-8 w-8 text-gray-500" /></div>
            <h3 className="text-lg font-bold text-gray-900">{customers.length === 0 ? "No contacts yet" : "No contacts found"}</h3>
            <p className="mb-6 text-gray-500">{customers.length === 0 ? "Add a contact, or convert a lead to add its customer here." : "Try adjusting your search or filters."}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pg.pageItems.map((c) => {
              const st = stats.get(c.id);
              const status = st?.jobStatus ?? 'No Active Jobs';
              return (
                <Link
                  key={c.id}
                  href={`/contacts/${c.id}`}
                  className="group block cursor-pointer rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:border-primary-300 hover:shadow-md"
                >
                  <div className="grid grid-cols-1 items-start gap-6 p-5 md:grid-cols-2 lg:flex lg:flex-row lg:items-center">
                    <div className="flex items-center gap-4 lg:min-w-0 lg:flex-[2]">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-xl font-bold text-gray-500 shadow-sm ring-2 ring-gray-100">
                        {c.firstName.charAt(0) || '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <h3 className="truncate text-lg font-bold text-gray-900 transition-colors group-hover:text-primary-700">{c.firstName} {c.lastName}</h3>
                          {(c.rating ?? 0) > 0 && (
                            <span className="flex items-center gap-0.5 rounded-full border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-amber-400">
                              <Star className="h-3 w-3 fill-current" /><span className="text-xs font-bold text-amber-700">{c.rating}</span>
                            </span>
                          )}
                          <span className={cn('rounded-full border px-2 py-0.5 text-xxs font-bold uppercase', CONTACT_TYPE_COLORS[c.type])}>{c.type}</span>
                        </div>
                        <div className="truncate text-sm text-gray-500">
                          {[c.street, c.city, c.state, c.zip].filter(Boolean).join(', ') || 'No address'}
                          {c.companyName && <span className="text-gray-500"> · {c.companyName}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-start lg:flex-none">
                      <div className="mb-1 text-xxs font-bold uppercase tracking-wider text-gray-500">Status</div>
                      <div className={cn('rounded-full border px-3 py-1 text-xs font-bold', CONTACT_JOB_STATUS[status] ?? CONTACT_JOB_STATUS['No Active Jobs'])}>{status}</div>
                    </div>

                    <div className="min-w-0 space-y-1.5 border-gray-100 lg:flex-1 lg:border-l lg:px-6">
                      <div className="flex items-center gap-2 text-sm text-gray-600"><Phone className="h-3.5 w-3.5 shrink-0 text-gray-500" />{formatPhone(c.phone) || '-'}</div>
                      <div className="flex items-center gap-2 truncate text-sm text-gray-600"><Mail className="h-3.5 w-3.5 shrink-0 text-gray-500" /><span className="truncate">{c.email || '-'}</span></div>
                      <div className="flex items-center gap-2 text-sm text-gray-500"><MapPin className="h-3.5 w-3.5 shrink-0 text-gray-500" /><span className="whitespace-nowrap">{st?.propertiesManaged ?? 1} Properties Managed</span></div>
                    </div>

                    <div className="flex w-full flex-row justify-between gap-4 lg:w-auto lg:flex-1 lg:flex-col lg:gap-1">
                      <div>
                        <div className="mb-1 text-xxs font-bold uppercase tracking-wider text-gray-500">Lifetime Value</div>
                        <div className="text-base font-bold text-gray-900">${Math.round(st?.lifetimeValue ?? 0).toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="mb-1 text-xxs font-bold uppercase tracking-wider text-gray-500">Jobs Completed</div>
                        <div className="text-base font-bold text-gray-900">{st?.completedJobs ?? 0}</div>
                      </div>
                    </div>

                    <div className="mr-4 hidden text-right xl:block">
                      <div className="mb-1 text-xxs font-bold uppercase tracking-wider text-gray-500">Last Contact</div>
                      <div className="flex items-center justify-end gap-1 text-xs font-bold text-gray-600"><Calendar className="h-3 w-3" />{st?.lastContactAt ? shortDate(st.lastContactAt) : '-'}</div>
                    </div>

                    <div className="flex items-center justify-between gap-3 md:col-span-2 md:justify-end lg:w-auto" onClick={(e) => e.preventDefault()}>
                      <Button size="sm" variant="secondary" onClick={() => router.push(`/contacts/${c.id}`)}>View Profile</Button>
                      <RowMenu
                        className="p-2.5"
                        items={[
                          { label: 'Edit', icon: <Edit2 />, onClick: () => { setEditing(c); setFormOpen(true); } },
                          { label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => setDeleting(c) },
                        ]}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <Pagination page={pg.page} totalPages={pg.totalPages} onPage={pg.setPage} pageSize={pg.pageSize} onPageSize={pg.setPageSize} shown={pg.pageItems.length} total={pg.total} />
      </div>

      <ContactFormModal open={formOpen} onOpenChange={setFormOpen} customer={editing} onSaved={(c) => !editing && router.push(`/contacts/${c.id}`)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete Contact"
        message={deleting ? `Are you sure you want to delete "${deleting.firstName} ${deleting.lastName}"?` : undefined}
        onConfirm={() => { if (deleting) { deleteContact(deleting); toast('Contact deleted successfully'); } }}
      />
    </PageShell>
  );
}
