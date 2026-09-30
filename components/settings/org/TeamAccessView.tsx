'use client';

/*
  Settings > Team & Access. Grid of team member cards with search, an
  "Add Member" modal, and the same modal in edit mode ("Edit" in the card menu)
  or opened on its "Schedule Availability" tab ("Manage Schedule").
  Members live in the `team` collection; roles come from the `roles` collection.
*/
import React, { useMemo, useState } from 'react';
import { Calendar, Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Badge, SearchInput } from '@/components/ui/display';
import { RowMenu } from '@/components/ui/menu';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useCollection, useCurrentUser } from '@/lib/store';
import { fullName, initials, inkOn } from '@/lib/utils';
import type { TeamMember } from '@/lib/types';
import { formatPhone } from '@/components/settings/config/ui';
import { MemberFormModal } from './MemberFormModal';
import { SignInAccounts } from './SignInAccounts';

export function TeamAccessView() {
  const { items: team, remove } = useCollection('team');
  const { items: roles } = useCollection('roles');
  const me = useCurrentUser();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; member?: TeamMember; tab: 'profile' | 'schedule' } | null>(null);
  const [toDelete, setToDelete] = useState<TeamMember | null>(null);

  const members = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...team].sort((a, b) => fullName(a).localeCompare(fullName(b)));
    if (!q) return list;
    return list.filter((m) => [fullName(m), m.email, m.phone, m.role].some((v) => (v || '').toLowerCase().includes(q)));
  }, [team, query]);

  const roleName = (m: TeamMember) => roles.find((r) => r.id === m.roleId)?.name ?? m.role;

  const doDelete = (m: TeamMember) => {
    remove(m.id);
    toast(`${fullName(m)} has been removed from the team.`);
  };

  return (
    <SettingsPage
      wide
      title="Team & Access"
      subtitle="Manage employees, roles, and access permissions."
      actions={<Button icon={<Plus className="h-5 w-5" />} onClick={() => setModal({ mode: 'add', tab: 'profile' })}>Add Member</Button>}
    >
      <div className="mb-6">
        <SearchInput value={query} onChange={setQuery} placeholder="Search team members..." className="md:w-[22rem]" />
      </div>

      {members.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50 text-gray-500">
            <Plus className="h-8 w-8" />
          </div>
          <h3 className="font-heading text-xl font-bold text-gray-900">No Team Members Found</h3>
          <p className="mt-2 text-gray-500">{query ? 'No team members found matching your search.' : 'Add employees to assign them to jobs and estimates.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <div key={m.id} className="relative rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-primary-300 hover:shadow-md">
              <div className="absolute right-3 top-3">
                <RowMenu
                  items={[
                    { label: 'Edit', icon: <Pencil />, onClick: () => setModal({ mode: 'edit', member: m, tab: 'profile' }) },
                    { label: 'Delete', icon: <Trash2 />, danger: true, disabled: m.id === me.id, onClick: () => setToDelete(m) },
                  ]}
                />
              </div>
              <div className="mb-4 flex flex-col items-center">
                <div
                  className="mb-3 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full text-xl font-bold text-white"
                  style={{ backgroundColor: m.photoUrl ? undefined : m.color, color: m.photoUrl ? undefined : inkOn(m.color) }}
                >
                  {m.photoUrl ? <img src={m.photoUrl} alt={fullName(m)} className="h-full w-full object-cover" /> : initials(fullName(m))}
                </div>
                <h3 className="text-center font-heading text-base font-bold leading-tight text-gray-900">{fullName(m)}</h3>
                <div className="mt-1 flex items-center gap-2">
                  <Badge className="border-blue-200 bg-blue-50 text-blue-700">{roleName(m)}</Badge>
                  {m.status === 'Inactive' && <Badge className="border-gray-200 bg-gray-100 text-gray-600">Disabled</Badge>}
                  {m.status === 'Invited' && <Badge className="border-yellow-200 bg-yellow-50 text-yellow-700">Invited</Badge>}
                </div>
              </div>
              <div className="mb-4 border-t border-gray-100" />
              <div className="space-y-2 text-xs text-gray-600">
                <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{m.email}</span></div>
                <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0" /><span>{m.phone ? formatPhone(m.phone) : '-'}</span></div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="mt-4 w-full bg-gray-50"
                icon={<Calendar className="h-3.5 w-3.5" />}
                onClick={() => setModal({ mode: 'edit', member: m, tab: 'schedule' })}
              >
                Manage Schedule
              </Button>
            </div>
          ))}
        </div>
      )}

      <SignInAccounts />

      {modal && (
        <MemberFormModal
          open
          mode={modal.mode}
          member={modal.member}
          defaultTab={modal.tab}
          onOpenChange={(v) => !v && setModal(null)}
          onDelete={
            modal.member && modal.member.id !== me.id
              ? () => {
                  const m = modal.member!;
                  setModal(null);
                  setToDelete(m);
                }
              : undefined
          }
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Remove Team Member"
        message={toDelete ? `Are you sure you want to remove "${fullName(toDelete)}"? This action cannot be undone.` : ''}
        confirmLabel="Remove"
        onConfirm={() => toDelete && doDelete(toDelete)}
      />
    </SettingsPage>
  );
}
