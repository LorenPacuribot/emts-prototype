'use client';

/*
  Settings > Team & Access > Sign-in accounts.
  Lists who can sign in (the prototype team). The owner or office manager
  can set anyone's password; anyone can change their own after confirming
  the current one. Passwords go to the server (app/api/auth/password),
  which keeps only a scrypt hash; nothing is stored in the browser.
*/
import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Modal } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useCurrentUser, useStore } from '@/features/lib/store';
import { passwordProblem, PASSWORD_ADMIN_ROLES, usernameOf } from '@/features/lib/auth/auth';
import { AUTH_EVENT, getSession, passwordDates, setPassword } from '@/features/lib/auth/client-session';

export function SignInAccounts() {
  const users = useStore((s) => s.db.users);
  const viewing = useCurrentUser();
  const { toast } = useToast();
  const [dates, setDates] = useState<Record<string, { updatedAt: string }>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [current, setCurrent] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; currentPassword?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const read = () => void passwordDates().then(setDates);
    read();
    window.addEventListener(AUTH_EVENT, read);
    return () => window.removeEventListener(AUTH_EVENT, read);
  }, []);

  // Rights come from the person who signed in, not the "Viewing as" role.
  const session = getSession();
  const meId = session?.userId ?? viewing.id;
  const admin = PASSWORD_ADMIN_ROLES.includes(session?.role ?? viewing.role);
  const target = users.find((u) => u.id === editing);
  const needsCurrent = !!target && target.id === meId && !admin;

  async function save() {
    if (!target) return;
    const problem = passwordProblem(pw);
    if (problem) return setErrors({ password: problem });
    if (pw !== confirm) return setErrors({ confirm: "The passwords don't match." });
    if (needsCurrent && !current) return setErrors({ currentPassword: 'Enter your current password.' });
    setSaving(true);
    const r = await setPassword(target.id, pw, needsCurrent ? current : undefined);
    setSaving(false);
    if (!r.ok) {
      const field = r.field === 'password' || r.field === 'currentPassword' ? r.field : 'form';
      return setErrors({ [field]: r.error });
    }
    toast(`Password updated for ${target.name}. They'll use it the next time they sign in.`);
    setEditing(null);
  }

  return (
    <section className="mt-10">
      <h2 className="font-heading text-lg font-bold text-gray-900">Sign-in accounts</h2>
      <p className="mt-1 text-sm text-gray-500">
        Who can sign in to Estimate Master. The username is the first name or the email address. {admin ? '' : 'You can change your own password.'}
      </p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Username</th>
              <th className="hidden px-4 py-2.5 md:table-cell">Role</th>
              <th className="hidden px-4 py-2.5 md:table-cell">Password last set</th>
              <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => {
              const d = dates[u.id];
              const canEdit = admin || u.id === meId;
              return (
                <tr key={u.id}>
                  <td className="px-4 py-2.5 font-semibold text-gray-900">{u.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{usernameOf({ firstName: u.name.split(/\s+/)[0] ?? u.name })}</td>
                  <td className="hidden px-4 py-2.5 capitalize text-gray-600 md:table-cell">{u.role.replace(/_/g, ' ')}</td>
                  <td className="hidden px-4 py-2.5 text-gray-500 md:table-cell">{d ? new Date(d.updatedAt).toLocaleDateString() : 'Not set yet'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<KeyRound className="h-3.5 w-3.5" />}
                      disabled={!canEdit}
                      title={canEdit ? undefined : 'Only the owner or office manager can set other people’s passwords.'}
                      onClick={() => { setEditing(u.id); setPw(''); setConfirm(''); setCurrent(''); setErrors({}); }}
                    >
                      Set password
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Modal
        open={!!target}
        onOpenChange={(v) => !v && setEditing(null)}
        size="sm"
        title={`Set password — ${target?.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save password</Button>
          </>
        }
      >
        <div className="space-y-4">
          {needsCurrent && (
            <Field label="Current password" required error={errors.currentPassword}>
              <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} invalid={!!errors.currentPassword} />
            </Field>
          )}
          <Field label="New password" required hint="At least 8 characters." error={errors.password}>
            <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} invalid={!!errors.password} />
          </Field>
          <Field label="Confirm password" required error={errors.confirm}>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={!!errors.confirm} />
          </Field>
          {errors.form && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{errors.form}</p>}
        </div>
      </Modal>
    </section>
  );
}
