'use client';

/*
  Connect Facebook Lead Ads (30 Sep call, CRM-C6). Simulated: nothing calls
  Facebook. Once "connected", "Send a test lead" drops a lead through the same
  website inbox rule the form uses, with source Facebook.
*/
import { useState } from 'react';
import { Megaphone, Unplug } from 'lucide-react';
import { useCurrentUser, useSingleton } from '@/lib/store';
import { fullName } from '@/lib/utils';
import { act } from '@/features/lib/store';
import { submitWebsiteForm } from '@/features/lib/store/actions/marketing';
import { Badge, Button, Card, CardTitle, Field, Modal, NewBadge, Select, VersionBadge } from '@/features/components/ui';
import { toast } from '@/features/lib/toast';

const PAGES = ['Paint Pro Dallas', 'Paint Pro Plano'];
const SAMPLE = [
  { name: 'Maya Brooks', phone: '(214) 555-0164', email: 'maya.brooks@example.com', town: 'Richardson' },
  { name: 'Leo Grant', phone: '(972) 555-0119', email: 'leo.grant@example.com', town: 'Garland' },
];

export function FacebookLeadAdsCard() {
  const [bp, setBp] = useSingleton('businessProfile');
  const me = fullName(useCurrentUser());
  const [connecting, setConnecting] = useState(false);
  const [page, setPage] = useState(PAGES[0]!);
  const conn = bp.facebookLeadAds;

  const testLead = () => {
    const s = SAMPLE[Math.floor(Math.random() * SAMPLE.length)]!;
    const r = act(submitWebsiteForm, { ref: `FB-${Date.now().toString(36)}`, ...s, message: 'Facebook lead form: exterior repaint', sourceLabel: 'Facebook' });
    if (r.ok) toast.success('Test lead received from Facebook', `${s.name} — lead ${r.value!.leadId}`);
  };

  return (
    <Card className="p-5">
      <CardTitle icon={<Megaphone />} badge={<><NewBadge /><VersionBadge item="CRM-C6" /></>} right={conn ? <Badge tone="green">Connected</Badge> : <Badge tone="gray">Not connected</Badge>}>
        Facebook Lead Ads
      </CardTitle>
      {conn ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            Leads from <b>{conn.pageName}</b> arrive here with source Facebook. Connected by {conn.by} on {new Date(conn.connectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. Simulated: nothing is sent to Facebook.
          </p>
          <span className="flex gap-2">
            <Button size="sm" variant="primary" onClick={testLead}>Send a test lead</Button>
            <Button size="sm" variant="secondary" onClick={() => { setBp({ facebookLeadAds: undefined }); toast.success('Facebook Lead Ads disconnected'); }}><Unplug className="h-3.5 w-3.5" /> Disconnect</Button>
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">Bring leads from Facebook lead forms straight into the pipeline, tagged Facebook.</p>
          <Button size="sm" variant="primary" onClick={() => setConnecting(true)}>Connect Facebook Lead Ads</Button>
        </div>
      )}
      {connecting && (
        <Modal
          open
          onOpenChange={(v) => !v && setConnecting(false)}
          title="Connect Facebook Lead Ads"
          description="Simulated: in the live app this opens Facebook to sign in."
          size="sm"
          footer={<><Button variant="secondary" onClick={() => setConnecting(false)}>Cancel</Button><Button variant="primary" onClick={() => { setBp({ facebookLeadAds: { pageName: page, connectedAt: new Date().toISOString(), by: me } }); setConnecting(false); toast.success('Facebook Lead Ads connected', page); }}>Connect</Button></>}
        >
          <Field label="Facebook page">
            <Select value={page} onChange={(e) => setPage(e.target.value)}>{PAGES.map((p) => <option key={p} value={p}>{p}</option>)}</Select>
          </Field>
        </Modal>
      )}
    </Card>
  );
}
