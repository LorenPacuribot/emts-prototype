'use client';

/*
  Settings > Roles & Permissions. Pick a role from the dropdown, then tick the
  permissions it has in the module grid (PERMISSION_GROUPS). "Save" writes the
  role's permission list to the `roles` collection.

  Rules (same as the live app):
  - System roles cannot be renamed or deleted. They can be reset to their
    default permissions. The Owner role always has every permission.
  - Custom roles can be created, renamed and deleted. A role still assigned
    to team members cannot be deleted.
  - "Show System Roles" hides or shows system roles in the dropdown.
*/
import React, { useMemo, useState } from 'react';
import { Lock, Pencil, Plus, RotateCcw, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Switch, Textarea } from '@/components/ui/form';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import { PERMISSION_GROUPS } from '@/lib/sampleData';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/types';

export function RolesPermissionsView() {
  const { items: roles, update, remove } = useCollection('roles');
  const { items: team } = useCollection('team');
  const { toast } = useToast();
  const [showSystem, setShowSystem] = useState(true);
  const visible = useMemo(() => roles.filter((r) => showSystem || r.roleType === 'CUSTOM'), [roles, showSystem]);
  const [selectedId, setSelectedId] = useState<string>(visible[0]?.id ?? '');
  const selected = visible.find((r) => r.id === selectedId) ?? visible[0];
  const [form, setForm] = useState<{ mode: 'add' | 'edit'; role?: Role } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const assigned = selected ? team.filter((t) => t.roleId === selected.id).length : 0;

  return (
    <SettingsPage
      wide
      title="Roles & Permissions"
      subtitle="Manage roles and configure access permissions for your team."
      actions={<Button icon={<Plus className="h-5 w-5" />} onClick={() => setForm({ mode: 'add' })}>Add Custom Role</Button>}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {visible.length > 0 && (
            <div className="w-72">
              <Select
                value={selected?.id}
                onChange={setSelectedId}
                placeholder="Select a role..."
                options={visible.map((r) => ({ value: r.id, label: `${r.name}${r.roleType === 'SYSTEM' ? ' (System)' : ''}` }))}
              />
            </div>
          )}
          {selected?.roleType === 'SYSTEM' && selected.name !== 'Owner' && (
            <button type="button" title="Reset to default permissions" onClick={() => setConfirmReset(true)} className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-50">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          {selected?.roleType === 'CUSTOM' && (
            <>
              <button type="button" title="Edit role name" onClick={() => setForm({ mode: 'edit', role: selected })} className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-50">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" title="Delete role" onClick={() => setConfirmDelete(true)} className="rounded-lg border border-red-100 bg-red-50 p-1.5 text-red-500 hover:bg-red-100">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
          Show System Roles
          <Switch checked={showSystem} onChange={setShowSystem} label="Show system roles" />
        </label>
      </div>

      {!selected ? (
        <div className="rounded-3xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50 text-gray-400"><ShieldAlert className="h-8 w-8" /></div>
          <h3 className="font-heading text-xl font-bold text-gray-900">No Roles Found</h3>
          <p className="mt-2 text-gray-500">Create custom roles to manage team access permissions.</p>
        </div>
      ) : (
        <>
          {selected.description && <p className="mb-5 text-xs text-gray-500">{selected.description}</p>}
          <PermissionGrid
            key={selected.id + selected.permissions.join()}
            role={selected}
            onSave={(permissions) => {
              update(selected.id, { permissions });
              toast('Permissions updated successfully');
            }}
          />
        </>
      )}

      {form && <RoleFormModal mode={form.mode} role={form.role} onClose={() => setForm(null)} onCreated={(id) => setSelectedId(id)} />}
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset Permissions"
        confirmLabel="Reset"
        message={selected ? `Reset "${selected.name}" to its default permissions? This will overwrite any custom changes.` : ''}
        onConfirm={() => {
          if (!selected?.defaultPermissions) return;
          update(selected.id, { permissions: selected.defaultPermissions });
          toast('Permissions reset to defaults');
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Role"
        confirmLabel={assigned ? 'OK' : 'Delete'}
        variant={assigned ? 'primary' : 'danger'}
        message={
          !selected ? '' : assigned
            ? `"${selected.name}" is assigned to ${assigned} team member${assigned === 1 ? '' : 's'}. Change their role in Team & Access before deleting it.`
            : `Are you sure you want to delete "${selected.name}"? This action cannot be undone.`
        }
        onConfirm={() => {
          if (!selected || assigned) return;
          remove(selected.id);
          setSelectedId(visible.find((r) => r.id !== selected.id)?.id ?? '');
          toast('Role deleted successfully');
        }}
      />
    </SettingsPage>
  );
}

/** Module x permission checkbox grid with per-module "All" and a Save button. */
function PermissionGrid({ role, onSave }: { role: Role; onSave: (p: string[]) => void }) {
  const locked = role.name === 'Owner';
  const [perms, setPerms] = useState<Set<string>>(() => new Set(role.permissions));
  const dirty = perms.size !== role.permissions.length || role.permissions.some((p) => !perms.has(p));

  const toggle = (key: string, on: boolean) =>
    setPerms((s) => {
      const n = new Set(s);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });
  const toggleAll = (keys: string[], on: boolean) =>
    setPerms((s) => {
      const n = new Set(s);
      keys.forEach((k) => (on ? n.add(k) : n.delete(k)));
      return n;
    });

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-heading text-base font-bold text-gray-900">Permissions</h3>
          {role.roleType === 'SYSTEM' && (
            <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-medium text-gray-500"><Lock className="h-2.5 w-2.5" /> System Role</span>
          )}
        </div>
        <Button size="sm" disabled={!dirty || locked} icon={<Save className="h-3.5 w-3.5" />} onClick={() => onSave(Array.from(perms))}>Save</Button>
      </div>
      {locked && <p className="border-b border-gray-100 bg-amber-50 px-5 py-2 text-xs text-amber-700">The Owner role always has full access and cannot be changed.</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-500">
              <th className="w-44 px-5 py-2.5">Module</th>
              <th className="px-3 py-2.5">Permissions</th>
              <th className="w-14 px-5 py-2.5 text-right">All</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {PERMISSION_GROUPS.map((g) => {
              const keys = g.keys.map((k) => k.key);
              const count = keys.filter((k) => perms.has(k)).length;
              return (
                <tr key={g.module}>
                  <td className="px-5 py-3 align-top">
                    <span className="font-bold text-gray-900">{g.module}</span>
                    <span className="ml-1.5 text-[10px] text-gray-400">{count}/{keys.length}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
                      {g.keys.map((k) => (
                        <span key={k.key} className={cn('text-[11px] [&_label]:text-[11px]', perms.has(k.key) && '[&_label]:font-semibold [&_label]:text-gray-900')}>
                          <Checkbox checked={perms.has(k.key)} disabled={locked} onChange={(v) => toggle(k.key, v)} label={k.label} />
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right align-top">
                    <Checkbox checked={count === keys.length} disabled={locked} onChange={(v) => toggleAll(keys, v)} label={<span className="sr-only">All {g.module}</span>} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const RESERVED = ['owner', 'admin', 'manager', 'estimator', 'project manager', 'crew lead', 'crew member', 'painter', 'apprentice', 'foreman'];

function RoleFormModal({ mode, role, onClose, onCreated }: { mode: 'add' | 'edit'; role?: Role; onClose: () => void; onCreated: (id: string) => void }) {
  const { items, add, update } = useCollection('roles');
  const { toast } = useToast();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [error, setError] = useState('');

  const save = () => {
    const n = name.trim();
    if (!n) return setError('Role name is required');
    if (n.length > 50) return setError('Role name cannot exceed 50 characters');
    if (RESERVED.includes(n.toLowerCase())) return toast('Cannot create role with a reserved system name', 'error');
    if (items.some((r) => r.name.toLowerCase() === n.toLowerCase() && r.id !== role?.id)) return toast('A role with this name already exists', 'error');
    if (mode === 'edit' && role) {
      update(role.id, { name: n, description: description.trim() });
      toast('Role updated successfully');
    } else {
      const created = add({ name: n, description: description.trim(), roleType: 'CUSTOM', permissions: [] });
      onCreated(created.id);
      toast('Role created successfully');
    }
    onClose();
  };

  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={mode === 'add' ? 'Create Custom Role' : 'Edit Role'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>{mode === 'add' ? 'Create Role' : 'Save Changes'}</Button></>}
    >
      <div className="space-y-4">
        <Field label="Role Name" required error={error}>
          <Input value={name} placeholder="e.g. Project Manager" invalid={!!error} onChange={(e) => { setName(e.target.value); setError(''); }} />
        </Field>
        <Field label="Description">
          <Textarea rows={3} value={description} placeholder="Brief description of this role's purpose..." onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {mode === 'add' && <p className="text-xs text-gray-500">New roles start with no permissions. Tick the ones you need after creating it.</p>}
      </div>
    </Modal>
  );
}
