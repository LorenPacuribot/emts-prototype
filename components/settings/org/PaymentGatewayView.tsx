'use client';

/*
  Settings > Payment Gateway. The live app connects an Authorize.Net merchant
  account: API Login ID, Transaction Key, optional Public Client Key and a
  Sandbox / Production switch, plus "Test Connection".

  There is no real gateway here. Saving stores the credentials in the
  `paymentGateway` singleton. "Test Connection" simulates the check: it passes
  when the login ID is at least 6 characters and the key at least 12
  (typical Authorize.Net lengths), and records the result.
*/
import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Info, Wifi } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useSingleton } from '@/lib/store';
import { shortDate } from '@/lib/utils';

const mask = (v?: string) => (v ? `${'•'.repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` : '');

export function PaymentGatewayView() {
  const [gw, setGw] = useSingleton('paymentGateway');
  const { toast } = useToast();
  const configured = !!gw.apiLoginId && !!gw.transactionKey;

  const [form, setForm] = useState({
    apiLoginId: gw.apiLoginId ?? '',
    transactionKey: '',
    publicClientKey: gw.publicClientKey ?? '',
    production: !!gw.production,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [test, setTest] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const save = () => {
    const e: Record<string, string> = {};
    if (!form.apiLoginId.trim()) e.apiLoginId = 'API Login ID is required';
    // On an existing config the key can be left blank to keep the saved one.
    if (!form.transactionKey.trim() && !configured) e.transactionKey = 'Transaction Key is required';
    setErrors(e);
    if (Object.keys(e).length) return;
    setGw({
      apiLoginId: form.apiLoginId.trim(),
      transactionKey: form.transactionKey.trim() || gw.transactionKey,
      publicClientKey: form.publicClientKey.trim(),
      production: form.production,
      connected: false, // credentials changed: needs a new test
    });
    setForm((f) => ({ ...f, transactionKey: '' }));
    setTest(null);
    toast('Payment gateway configuration saved successfully');
  };

  const runTest = () => {
    setTesting(true);
    setTest(null);
    window.setTimeout(() => {
      const ok = (gw.apiLoginId?.length ?? 0) >= 6 && (gw.transactionKey?.length ?? 0) >= 12;
      const res = ok
        ? { success: true, message: 'Connection successful' }
        : { success: false, message: 'User authentication failed due to invalid authentication values.' };
      setTest(res);
      setGw(ok ? { connected: true, connectedAt: new Date().toISOString() } : { connected: false });
      toast(res.message, ok ? 'success' : 'error');
      setTesting(false);
    }, 700);
  };

  const connected = test ? test.success : gw.connected;

  return (
    <SettingsPage title="Payment Gateway" subtitle="Configure your Authorize.Net merchant account to accept customer payments on invoices.">
      <div className="max-w-xl">
        {configured && (
          <div className={`mb-6 flex items-center gap-3 rounded-xl border p-4 ${connected ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            {connected ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-red-600" />}
            <div>
              <span className={`text-sm font-bold ${connected ? 'text-green-700' : 'text-red-700'}`}>
                {test ? (test.success ? 'Connected' : 'Connection Failed') : gw.connected ? 'Connected' : 'Not Verified'}
              </span>
              {test && !test.success && <span className="ml-2 text-xs text-red-500">{test.message}</span>}
              {!test && gw.connected && gw.connectedAt && <span className="ml-2 text-xs text-gray-500">Last verified {shortDate(gw.connectedAt)}</span>}
            </div>
          </div>
        )}

        <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Authorize.Net Credentials</div>
          <Field label="API Login ID" required error={errors.apiLoginId}>
            <Input value={form.apiLoginId} placeholder="Enter API Login ID" invalid={!!errors.apiLoginId} onChange={(e) => set('apiLoginId', e.target.value)} />
          </Field>
          <Field label="Transaction Key" required error={errors.transactionKey} hint={configured ? `Saved key: ${mask(gw.transactionKey)}. Leave blank to keep it.` : undefined}>
            <Input type="password" value={form.transactionKey} placeholder={configured ? mask(gw.transactionKey) : 'Enter Transaction Key'} invalid={!!errors.transactionKey} onChange={(e) => set('transactionKey', e.target.value)} />
          </Field>
          <Field label="Public Client Key" hint="Found in Account → Security Settings → Manage Public Client Key.">
            <Input value={form.publicClientKey} placeholder="For Accept.js card tokenization (required for online payments)" onChange={(e) => set('publicClientKey', e.target.value)} />
          </Field>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-gray-700">Environment</div>
              <div className="text-xs text-gray-500">{form.production ? 'Using Production (live payments)' : 'Using Sandbox (test mode)'}</div>
            </div>
            <Switch checked={form.production} onChange={(v) => set('production', v)} label="Production environment" />
          </div>
          <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-5">
            <Button variant="secondary" disabled={!configured} loading={testing} icon={<Wifi className="h-4 w-4" />} onClick={runTest}>Test Connection</Button>
            <Button onClick={save}>Save Configuration</Button>
          </div>
        </div>

        <div className="mt-5 flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-bold">Where to find your credentials</div>
            <div className="mt-0.5">Log in to your Authorize.Net account → Account → Security Settings → API Credentials &amp; Keys</div>
          </div>
        </div>
      </div>
    </SettingsPage>
  );
}
