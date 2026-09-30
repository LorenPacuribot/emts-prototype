'use client';

/*
  /estimates/[id]/client-view - what the customer sees from the emailed link
  (live: estimates/view/[token]).

  It covers the whole screen (no app sidebar), marks a Sent estimate as
  Viewed, and lets the customer Accept (typed e-signature) or Decline.
  Accepting sets the signature and approvedAt, and moves the linked lead
  to Sold (see useEstimateActions.setStatus).
  NEW (features 3, 24): a link to the customer page of the estimate's
  prototype twin (/estimates/view?token=), where the customer also approves
  colours and decides change orders.
*/
import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, CheckCircle2, FileQuestion, Printer, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form';
import { EmptyState } from '@/components/ui/display';
import { Modal } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useCollection, useLogActivity } from '@/lib/store';
import { estimateTotals } from '@/lib/calculations';
import { fullName, longDate, money } from '@/lib/utils';
import { useLookups } from '@/lib/store';
import { ProposalDocument } from '@/components/estimates/ProposalDocument';
import { PrintPortal } from '@/components/estimates/PrintPortal';
import { useEstimateActions } from '@/components/estimates/useEstimateActions';
import { useProtoEstimate } from '@/components/estimates/FeatureSections';
import { publicEstimateHref } from '@/features/lib/hrefs';
import { NewBadge } from '@/features/components/ui';
import { useIsOn } from '@/features/lib/feature-visibility';
import { PresentationCanvas } from '@/components/presentations/PresentationCanvas';
import { useSession } from '@/components/auth/AuthGate';
import { chosenTemplate } from '@/lib/proposal';
import { appendView, viewLogOf } from '@/lib/estimate-views';

export default function ClientViewPage() {
  return (
    <Suspense fallback={null}>
      <ClientView />
    </Suspense>
  );
}

function ClientView() {
  const { id } = useParams<{ id: string }>();
  const { get } = useCollection('estimates');
  const look = useLookups();
  const actions = useEstimateActions();
  const log = useLogActivity();
  const { toast } = useToast();
  const e = get(id);
  const customer = look.customer(e?.customerId);
  const terms = look.terms(e?.termsId);

  const [acceptOpen, setAcceptOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedOptions, setSelectedOptions] = useState<string[] | null>(null);
  const twin = useProtoEstimate(id).est;
  const customerPageOn = useIsOn({ feature: [3, 24] });
  const { items: presentations } = useCollection('presentations');
  const { update } = useCollection('estimates');
  const params = useSearchParams();
  const { session, ready } = useSession();
  // Staff opening it from the app (Open Customer View) is a preview, not a customer visit.
  const staffPreview = params.get('preview') === '1';
  // Customers need the estimate's secure token (?t=), which rotates on re-approval;
  // the estimate number alone is guessable. Signed-in staff can always open it.
  const allowed = !!session || (!!twin?.publicToken && params.get('t') === twin.publicToken);

  // Every customer open is recorded (first open and return visits, patent 12); the first one also marks it Viewed.
  const marked = useRef(false);
  useEffect(() => {
    if (!e || !ready || !allowed || marked.current || staffPreview) return;
    marked.current = true;
    const at = new Date().toISOString();
    const viewLog = appendView(viewLogOf(e), at);
    update(e.id, { viewLog, viewedAt: e.viewedAt ?? at });
    if (e.status === 'Sent') {
      actions.setStatus({ ...e, viewLog, viewedAt: e.viewedAt ?? at }, 'Viewed', 'Viewed by customer', {}, 'Customer');
      log(`${e.estimateNumber} viewed by ${fullName(customer)}`, 'estimate', e.id);
    } else if (viewLog.length > 1) {
      log(`${e.estimateNumber} opened again by ${fullName(customer)} (view ${viewLog.length})`, 'estimate', e.id);
    }
  }, [e, actions, log, customer, update, staffPreview, ready, allowed]);

  if (!ready) return null;
  if (!e || !allowed) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-100 p-6">
        <EmptyState icon={<FileQuestion />} title="Estimate not found" message="This link is no longer valid. Please contact your contractor." />
      </div>
    );
  }

  const canRespond = !staffPreview && (e.status === 'Sent' || e.status === 'Viewed');
  const proposal = canRespond && selectedOptions ? { ...e, lineItems: e.lineItems.map((l) => l.optional ? { ...l, selected: selectedOptions.includes(l.id) } : l) } : e;
  const total = estimateTotals(proposal).total;
  // The presentation chosen in Client Preview, or the standard proposal.
  const template = chosenTemplate(presentations, e);
  const output = template
    ? <PresentationCanvas presentation={template} estimate={proposal} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl print:rounded-none print:border-0 print:shadow-none" />
    : <ProposalDocument estimate={proposal} />;

  const accept = () => {
    const err: Record<string, string> = {};
    if (name.trim().length < 2) err.name = 'Type your full name to sign';
    if (!agree) err.agree = 'Please agree to the terms to continue';
    setErrors(err);
    if (Object.keys(err).length) return;
    const now = new Date().toISOString();
    actions.setStatus(proposal, 'Approved', `Signed by ${name.trim()}`, { signature: { name: name.trim(), date: now } }, 'Customer');
    log(`${e.estimateNumber} approved and signed by ${name.trim()}`, 'estimate', e.id);
    setAcceptOpen(false);
    toast('Estimate accepted. Thank you!');
  };

  const decline = () => {
    actions.setStatus(e, 'Rejected', reason.trim() ? `Declined by customer: ${reason.trim()}` : 'Declined by customer', { declineReason: reason.trim() || undefined }, 'Customer');
    log(`${e.estimateNumber} declined by ${fullName(customer)}`, 'estimate', e.id);
    setDeclineOpen(false);
    toast('Your response has been sent', 'info');
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-gray-100 print:static print:bg-white">
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          {session ? (
            <Link href={`/estimates/${e.id}`} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to app{staffPreview ? ' (preview: not counted as a customer view)' : ''}
            </Link>
          ) : (
            <span className="text-xs font-semibold text-gray-500">{e.estimateType} Estimate</span>
          )}
          <div className="hidden text-sm font-bold text-gray-700 sm:block">{e.estimateNumber} · {money(total)}</div>
          <div className="flex items-center gap-2">
            {twin?.publicToken && customerPageOn && (
              <Link href={publicEstimateHref(twin.publicToken)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 text-xs font-bold text-green-800 hover:bg-green-100" title="Color approvals and change order decisions">
                Customer page <NewBadge feature={[3, 24]} />
              </Link>
            )}
            <Button size="sm" variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 pb-32">
        {e.status === 'Approved' && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-5 print:hidden">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <div>
              <div className="font-bold text-green-800">Estimate accepted</div>
              <div className="text-sm text-green-700">
                Signed by {e.signature?.name ?? 'customer'} on {longDate(e.approvedAt ?? e.signature?.date)}. We will be in touch to schedule your project.
              </div>
            </div>
          </div>
        )}
        {e.status === 'Rejected' && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 print:hidden">
            <XCircle className="h-6 w-6 text-red-600" />
            <div>
              <div className="font-bold text-red-800">Estimate declined</div>
              <div className="text-sm text-red-700">Thank you for letting us know.{e.declineReason ? ` Reason: ${e.declineReason}` : ''}</div>
            </div>
          </div>
        )}
        {e.status === 'Expired' && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-medium text-amber-800 print:hidden">
            This estimate has expired. Please contact us for an updated quote.
          </div>
        )}
        {canRespond && e.lineItems.some((l) => l.optional) && <section className="mb-6 rounded-xl bg-white p-5 print:hidden">
          <h3 className="mb-3 font-bold">Choose optional work</h3>
          {e.lineItems.filter((l) => l.optional).map((l) => <label key={l.id} className="flex items-center gap-3 py-2">
            <input type="checkbox" checked={proposal.lineItems.find((p) => p.id === l.id)?.selected ?? false} onChange={(ev) => {
              const current = selectedOptions ?? e.lineItems.filter((p) => p.optional && p.selected).map((p) => p.id);
              setSelectedOptions(ev.target.checked ? [...current, l.id] : current.filter((id) => id !== l.id));
            }} /><span>{l.description} — {money(l.total)} before tax and discount</span>
          </label>)}
        </section>}
        <div className="print:hidden">{output}</div>
      </div>
      <PrintPortal>{output}</PrintPortal>

      {canRespond && (
        <div className="fixed inset-x-0 bottom-6 z-20 flex justify-center px-4 print:hidden">
          <div className="flex items-center gap-3 rounded-full border border-gray-200 bg-white p-2 shadow-2xl">
            <button type="button" onClick={() => { setReason(''); setDeclineOpen(true); }} className="flex items-center gap-1.5 rounded-full px-5 py-3 text-sm font-bold text-gray-500 hover:bg-red-50 hover:text-red-600">
              <XCircle className="h-4 w-4" /> Decline
            </button>
            <button
              type="button"
              onClick={() => { setErrors({}); setName(''); setAgree(false); setAcceptOpen(true); }}
              className="flex items-center gap-2 rounded-full bg-primary-600 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-xl shadow-primary-500/30 hover:bg-primary-700"
            >
              <Check className="h-5 w-5" /> Accept
            </button>
          </div>
        </div>
      )}

      <Modal open={acceptOpen} onOpenChange={setAcceptOpen} title="Accept Estimate" size="lg">
        <div className="space-y-6">
          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-primary-100 bg-primary-50/50 p-6 sm:flex-row sm:items-center">
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-500">Total Agreed Price</div>
              <div className="text-4xl font-extrabold tracking-tight text-gray-900">{money(total)}</div>
            </div>
            <div className="rounded-full bg-blue-100 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-blue-700">Pending Acceptance</div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-2 text-sm font-bold text-gray-900">Payment &amp; Deposit Terms:</div>
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
              {e.depositTerms || terms?.content || 'Standard payment terms apply. Please review the estimate details.'}
            </div>
          </div>
          <Field label="Full Name" required error={errors.name}>
            <Input placeholder="e.g. John Smith" value={name} invalid={!!errors.name} onChange={(ev) => setName(ev.target.value)} autoFocus />
          </Field>
          <div>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-600">E-Signature</div>
            <div className="relative flex h-32 items-center justify-center rounded-xl border border-gray-200 bg-white">
              {name.trim() ? (
                <span className="font-[cursive] text-4xl italic text-gray-800">{name}</span>
              ) : (
                <span className="text-sm text-gray-300">Your typed name appears here as your signature</span>
              )}
              <span className="pointer-events-none absolute bottom-2 right-3 text-xs font-bold text-gray-300">Sign Above</span>
            </div>
          </div>
          <div>
            <Checkbox checked={agree} onChange={setAgree} label="I agree to the terms and conditions detailed in this estimate." />
            {errors.agree && <p className="mt-1 text-xs text-red-600">{errors.agree}</p>}
          </div>
          <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-100 pt-4 sm:flex-row">
            <Button variant="secondary" onClick={() => setAcceptOpen(false)}>Cancel</Button>
            <Button size="lg" icon={<Check className="h-5 w-5" />} onClick={accept} className="rounded-full">Accept Estimate</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        title="Decline Estimate"
        description="Let us know why, so we can improve."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeclineOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={decline}>Decline Estimate</Button>
          </>
        }
      >
        <Field label="Reason (optional)">
          <Textarea rows={4} value={reason} placeholder="e.g. We decided to wait until next year" onChange={(ev) => setReason(ev.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
