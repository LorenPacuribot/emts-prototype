'use client';

/*
  Settings > Team & Access > Sign-in accounts.
  Lists the demo sign-in accounts (the prototype team) and lets the owner or
  office manager set a new password. Only a salted hash is saved
  (features/lib/auth/demo-auth.ts). Anyone can change their own password.
*/
import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Modal } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useCurrentUser, useStore } from '@/features/lib/store';
import {
  AUTH_EVENT, createCredential, loadCredentials, passwordProblem, saveCredential, usernameOf, type DemoCredential,
} from '@/features/lib/auth/demo-auth';

export function SignInAccounts() {
  const users = useStore((s) => s.db.users);
  const me = useCurrentUser();
  const { toast } = useToast();
  const [creds, setCreds] = useState<Record<string, DemoCredential>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const read = () => setCreds(loadCredentials());
    read();
    window.addEventListener(AUTH_EVENT, read);
    return () => window.removeEventListener(AUTH_EVENT, read);
  }, []);

  const admin = me.role === 'owner' || me.role === 'office_manager';
  const target = users.find((u) => u.id === editing);

  async function save() {
    if (!target) return;
    const problem = passwordProblem(pw);
    if (problem) return setError(problem);
    if (pw !== confirm) return setError("The passwords don't match.");
    saveCredential(await createCredential(target.id, pw, me.id));
    toast(`Password updated for ${target.name}.`);
    setEditing(null);
  }

  return (
    <section className="mt-10">
      <h2 className="font-heading text-lg font-bold text-gray-900">Sign-in accounts</h2>
      <p className="mt-1 text-sm text-gray-500">
        Who can sign in to Estimate Master. The username is the first name or the email address. {admin ? '' : 'You can change your own password.'}
      </p>
      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Username</th>
              <th className="hidden px-4 py-2.5 md:table-cell">Role</th>
              <th className="hidden px-4 py-2.5 md:table-cell">Password last set</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => {
              const c = creds[u.id];
              const canEdit = admin || u.id === me.id;
              return (
                <tr key={u.id}>
                  <td className="px-4 py-2.5 font-semibold text-gray-900">{u.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{usernameOf({ firstName: u.name.split(/\s+/)[0] ?? u.name })}</td>
                  <td className="hidden px-4 py-2.5 capitalize text-gray-600 md:table-cell">{u.role.replace(/_/g, ' ')}</td>
                  <td className="hidden px-4 py-2.5 text-gray-500 md:table-cell">{c ? new Date(c.updatedAt).toLocaleDateString() : 'No password'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<KeyRound className="h-3.5 w-3.5" />}
                      disabled={!canEdit}
                      title={canEdit ? undefined : 'Only the owner or office manager can set other people’s passwords.'}
                      onClick={() => { setEditing(u.id); setPw(''); setConfirm(''); setError(''); }}
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
            <Button onClick={save}>Save password</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="New password" required hint="At least 8 characters.">
            <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} invalid={!!error} />
          </Field>
          <Field label="Confirm password" required error={error || undefined}>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={!!error} />
          </Field>
        </div>
      </Modal>
    </section>
  );
}
