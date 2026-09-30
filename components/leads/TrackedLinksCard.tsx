'use client';

/*
  Tracked links (30 Sep call, CRM-M5), in the website lead area of /leads.
  Each link opens the website form as /website-form?src={source}&l={linkId},
  so the lead's source is set from the tag (lib/website-form.ts leadSourceFor).
  Copy the link, show its QR code, pause it (the form then says it is not
  accepting requests), or add a new one.
*/
import { useState } from 'react';
import { Copy, Link2, Pause, Play, Plus, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useCollection, useCurrentUser } from '@/lib/store';
import { fullName, uid } from '@/lib/utils';
import { trackedLinkPath } from '@/lib/website-form';
import type { TrackedLink } from '@/lib/types';
import { Badge, Button, Card, CardTitle, Field, Input, Modal, NewBadge, Table, TD, TH, THead, TR, VersionBadge } from '@/features/components/ui';
import { toast } from '@/features/lib/toast';

const SOURCES = ['Facebook', 'Instagram', 'Google', 'Nextdoor', 'Yard Sign', 'Truck Wrap', 'Mailer', 'Referral'];
const DAY = 86_400_000;

export function TrackedLinksCard() {
  const links = useCollection('trackedLinks');
  const { items: leads } = useCollection('leads');
  const me = fullName(useCurrentUser());
  const [adding, setAdding] = useState(false);
  const [qr, setQr] = useState<TrackedLink>();
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const since = Date.now() - 30 * DAY;
  const recent = (id: string) => leads.filter((l) => l.trackedLinkId === id && Date.parse(l.createdAt) >= since).length;

  const copy = async (l: TrackedLink) => {
    try {
      await navigator.clipboard.writeText(origin + trackedLinkPath(l));
      toast.success('Link copied', l.name);
    } catch {
      toast.error('Could not copy', 'Select the link and copy it by hand.');
    }
  };
  const togglePause = (l: TrackedLink) => {
    const status = l.status === 'active' ? 'paused' : 'active';
    links.update(l.id, { status });
    toast.success(status === 'paused' ? `${l.name} paused` : `${l.name} is taking requests again`, status === 'paused' ? 'The form now says it is not accepting requests.' : undefined);
  };

  return (
    <Card className="p-5">
      <CardTitle icon={<Link2 />} badge={<><VersionBadge item="CRM-M5" /></>} right={<Button variant="primary" size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add link</Button>}>
        Tracked links
      </CardTitle>
      <p className="-mt-3 mb-4 text-sm text-gray-500">Share these instead of the plain form. Each lead is tagged with the link&apos;s source.</p>
      <Table>
        <THead>
          <TR>
            <TH>Name</TH><TH>Source</TH><TH>Link</TH><TH className="text-right">Leads (30 days)</TH><TH>Status</TH><TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <tbody>
          {links.items.map((l) => (
            <TR key={l.id}>
              <TD className="font-semibold text-ink">{l.name}</TD>
              <TD><Badge tone="blue">{l.source}</Badge></TD>
              <TD className="max-w-[260px] truncate font-mono text-xs text-gray-500" title={origin + trackedLinkPath(l)}>{trackedLinkPath(l)}</TD>
              <TD className="text-right tabular-nums">{recent(l.id)}</TD>
              <TD><Badge tone={l.status === 'active' ? 'green' : 'gray'}>{l.status === 'active' ? 'Active' : 'Paused'}</Badge></TD>
              <TD className="text-right">
                <span className="inline-flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => void copy(l)} aria-label={`Copy ${l.name}`}><Copy className="h-3.5 w-3.5" /> Copy</Button>
                  <Button size="sm" variant="secondary" onClick={() => setQr(l)} aria-label={`QR code for ${l.name}`}><QrCode className="h-3.5 w-3.5" /> QR code</Button>
                  <Button size="sm" variant="secondary" onClick={() => togglePause(l)}>
                    {l.status === 'active' ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Resume</>}
                  </Button>
                </span>
              </TD>
            </TR>
          ))}
          {!links.items.length && (
            <TR><TD colSpan={6} className="py-8 text-center italic text-gray-500">No tracked links yet.</TD></TR>
          )}
        </tbody>
      </Table>

      {adding && (
        <AddLinkModal
          onClose={() => setAdding(false)}
          onAdd={(name, source) => {
            links.add({ id: uid('tl'), name, source, status: 'active', createdAt: new Date().toISOString(), createdBy: me });
            setAdding(false);
            toast.success('Tracked link added', `${name} tags leads as ${source}.`);
          }}
        />
      )}
      {qr && (
        <Modal open onOpenChange={(v) => !v && setQr(undefined)} title={qr.name} description={`Leads from this code are tagged ${qr.source}.`} size="sm">
          <div className="flex flex-col items-center gap-3 py-2">
            <QRCodeSVG value={origin + trackedLinkPath(qr)} size={200} />
            <code className="break-all text-center text-xs text-gray-500">{origin + trackedLinkPath(qr)}</code>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function AddLinkModal({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string, source: string) => void }) {
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const ok = name.trim() && source.trim();
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Add tracked link"
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ok} onClick={() => onAdd(name.trim(), source.trim())}>Add link</Button></>}
    >
      <div className="space-y-4">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Facebook page button" autoFocus /></Field>
        <Field label="Source" hint="Leads from this link get this source.">
          <Input value={source} onChange={(e) => setSource(e.target.value)} list="tracked-link-sources" placeholder="Facebook" />
        </Field>
        <datalist id="tracked-link-sources">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
      </div>
    </Modal>
  );
}
