'use client';

/*
  Customer Paint Passport (patent 26): on the contact's Job History tab.
  Add jobs → Generate Passport Link → Send → the customer opens it without
  contacting the contractor. Existing passports can be copied, sent again,
  previewed or revoked.
*/
import React, { useState } from 'react';
import { BookOpenCheck, Copy, ExternalLink, Mail, MessageSquare, Plus } from 'lucide-react';
import { act, useCurrentUser, useDb } from '@/features/lib/store';
import { createPassport, passportJobs, passportsFor, revokePassport, sendPassport } from '@/features/lib/store/actions/passport';
import { can } from '@/features/lib/permissions';
import { absoluteUrl } from '@/features/lib/navigation';
import { dateLong, dateTime } from '@/features/lib/format';
import { toast } from '@/features/lib/toast';
import { cn } from '@/lib/utils';
import { Badge, Banner, Button, Checkbox, ConfirmDialog, Modal, NewBadge } from '@/features/components/ui';

const passportUrl = (ref: string) => absoluteUrl(`/paint-record/view/?token=${encodeURIComponent(ref)}`);

export function PaintPassportButton({ customerId }: { customerId: string }) {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  if (!can(user, 'qr.generate')) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50"
      >
        <BookOpenCheck className="h-4 w-4" /> Customer Paint Passport <NewBadge feature={26} />
      </button>
      {open && <PassportModal customerId={customerId} onClose={() => setOpen(false)} />}
    </>
  );
}

function PassportModal({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const jobs = passportJobs(db, customerId);
  const passports = passportsFor(db, customerId);
  const [adding, setAdding] = useState(passports.length === 0);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [revoking, setRevoking] = useState<string>();

  const copy = async (ref: string) => {
    try {
      await navigator.clipboard.writeText(passportUrl(ref));
      toast.success('Passport link copied');
    } catch {
      window.prompt('Copy the passport link:', passportUrl(ref));
    }
  };
  const send = (id: string, channel: 'email' | 'text') => {
    const r = act(sendPassport, id, channel);
    if (r.ok) toast.success('Passport sent', `To ${r.value}`);
  };
  const generate = () => {
    const r = act(createPassport, customerId, selected);
    if (!r.ok) return setError(r.error);
    setError(undefined);
    setSelected([]);
    setAdding(false);
    toast.success('Passport link generated', 'Copy it, send it, or preview what the customer sees.');
  };

  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      size="lg"
      title="Customer Paint Passport"
      description="One link to the paint used on the jobs you choose. The customer can look up colors, products and surfaces without calling you."
      footer={adding
        ? <><Button onClick={() => (passports.length ? setAdding(false) : onClose())}>Cancel</Button><Button variant="primary" disabled={!selected.length} onClick={generate}>Generate Passport Link</Button></>
        : <><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => setAdding(true)} disabled={!jobs.length}><Plus className="h-4 w-4" /> New passport</Button></>}
    >
      {adding ? (
        jobs.length === 0 ? (
          <p className="text-sm text-gray-500">No completed jobs with recorded paint at a property this customer owns yet. A job appears here once its closeout is saved.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-900">Add jobs to the passport</p>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {jobs.map((j) => {
                const on = selected.includes(j.id);
                return (
                  <label key={j.id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3', on ? 'border-primary-500 bg-primary-50/40' : 'border-gray-200')}>
                    <Checkbox checked={on} onCheckedChange={(v) => setSelected((s) => (v ? [...s, j.id] : s.filter((x) => x !== j.id)))} label={<span className="sr-only">Add {j.id}</span>} />
                    <span className="min-w-0 text-sm">
                      <b className="text-gray-900">{j.id}</b> · {j.name}
                      <span className="block text-xs text-gray-500">{j.address} · {j.surfaces} surface{j.surfaces === 1 ? '' : 's'}{j.completedAt ? ` · completed ${dateLong(j.completedAt)}` : ''}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {selected.length > 0 && <button type="button" className="text-xs font-semibold text-primary-600 hover:underline" onClick={() => setSelected([])}>Clear selection</button>}
            {error && <Banner tone="danger">{error}</Banner>}
          </div>
        )
      ) : (
        <div className="space-y-3">
          {passports.map((p) => (
            <div key={p.id} className={cn('rounded-xl border p-3', p.revokedAt ? 'border-gray-200 bg-gray-50' : 'border-gray-200')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <b className="text-gray-900">{p.id}</b> · {p.jobIds.join(', ')}
                  <div className="text-xs text-gray-500">
                    Created {dateLong(p.createdAt)} · opened {p.openCount} time{p.openCount === 1 ? '' : 's'}
                    {p.lastSentAt && ` · last sent ${dateTime(p.lastSentAt)} to ${p.lastSentTo}`}
                  </div>
                </div>
                {p.revokedAt ? <Badge tone="gray">Revoked {dateLong(p.revokedAt)}</Badge> : <Badge tone="green">Active</Badge>}
              </div>
              {!p.revokedAt && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => copy(p.ref)}><Copy className="h-3.5 w-3.5" /> Copy link</Button>
                  <Button size="sm" onClick={() => send(p.id, 'email')}><Mail className="h-3.5 w-3.5" /> Send by email</Button>
                  <Button size="sm" onClick={() => send(p.id, 'text')}><MessageSquare className="h-3.5 w-3.5" /> Send by text</Button>
                  <a href={passportUrl(p.ref)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    <ExternalLink className="h-3.5 w-3.5" /> Preview as customer
                  </a>
                  {can(user, 'qr.revoke') && <Button size="sm" variant="danger" onClick={() => setRevoking(p.id)}>Revoke</Button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(v) => !v && setRevoking(undefined)}
        title="Revoke this passport?"
        body="The link stops working at once and shows the customer a 'Record has moved' page with your phone number. This can't be undone; generate a new passport if needed."
        confirmLabel="Revoke passport"
        onConfirm={() => { if (revoking && act(revokePassport, revoking).ok) toast.success('Passport revoked'); setRevoking(undefined); }}
      />
    </Modal>
  );
}
