'use client';

/*
  NEW feature sections on the estimate builder (features 3, 18, 24, 28).

  The replica builder owns the page; these wrappers embed the feature
  prototype's panels, working against the estimate's prototype twin (same
  id) and its internal project record (est.jobId), which holds the colour
  card, specs and change orders. Everything here reads the prototype store
  and writes only through prototype actions; the bridge carries status and
  scope across.

  A twin can be briefly missing (a record just made on a replica screen is
  mirrored on the next sync tick), so every wrapper renders nothing then.
*/
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { FilePlus2, Package, PaintBucket, Palette, PencilLine, Printer } from 'lucide-react';
import type { Estimate as PEstimate, Job as PJob } from '@/features/types';
import { act, useCurrentUser, useDb } from '@/features/lib/store';
import { useParam } from '@/features/lib/navigation';
import { amendEstimate, assignSurfaceColour } from '@/features/lib/store/actions/estimates';
import { amendBlockedReason, changeOrderAllowed, isEditable } from '@/features/lib/rules/estimate-lifecycle';
import { specForSurface } from '@/features/lib/rules/estimate';
import { jobDemand, specDemand } from '@/features/lib/rules/procurement';
import { formatPacks } from '@/features/lib/rules/materials';
import { byId } from '@/features/lib/selectors';
import { can } from '@/features/lib/permissions';
import { money } from '@/features/lib/format';
import { toast } from '@/features/lib/toast';
import { Button as FButton, EmptyState, EstimateSection, NewBadge, SectionHeader, Swatch, Tooltip } from '@/features/components/ui';
import { PaintColors } from '@/features/components/features/estimates/details/paint-colors';
import { ChangeOrdersSection } from '@/features/components/features/change-orders/change-orders-section';
import { FromHistorySection } from '@/features/components/features/future-estimate/from-history-section';
import { PreliminaryListModal } from '@/features/components/features/materials/side-panels';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { cn } from '@/lib/utils';

/** The estimate's prototype twin, its project record and work order. */
export function useProtoEstimate(id: string) {
  const db = useDb((d) => d);
  const est = byId(db.estimates, id);
  const job = est?.jobId ? byId(db.jobs, est.jobId) : undefined;
  const wo = job ? db.workOrders.find((w) => w.jobId === job.id) : undefined;
  return { db, est, job, wo, editable: !!est && !!job && isEditable(est.status) };
}

/* ---------- Paint Color Card (feature 3) ---------- */

export function PaintCardSection({ estimateId, paintColourId, onPaint, onSave, readOnly }: { estimateId: string; paintColourId?: string; onPaint: (id?: string) => void; onSave?: () => boolean | void; readOnly?: boolean }) {
  const { job, editable } = useProtoEstimate(estimateId);
  const [starting, setStarting] = useState(false);
  // Before the first save there is no project record yet: show the card empty (patent 3), ready to start.
  if (!job) {
    return (
      <EstimateSection id="section-paint-card">
        <SectionHeader icon={<Palette />} title="Paint Color Card" right={<NewBadge feature={3} />} />
        <EmptyState
          icon={<Palette />}
          title="No colors on this estimate yet"
          body={readOnly ? undefined : 'Adding your first color saves the draft, then the color card opens here.'}
          action={!readOnly && onSave && (
            <FButton variant="primary" disabled={starting} onClick={() => { setStarting(true); if (onSave() === false) setStarting(false); }}>
              {starting ? 'Opening color card…' : 'Add your first color'}
            </FButton>
          )}
        />
      </EstimateSection>
    );
  }
  return (
    <Suspense fallback={null}>
      <PaintColors job={job} editable={editable} paintColourId={paintColourId} onPaint={onPaint} />
    </Suspense>
  );
}

/** Colour, colour number and gallons per line item (line id == prototype surface id). */
export interface LineColour { hex: string; name: string; number: number; gal: number }

/** A colour on the card with its number and first specification (product, sheen, coats). */
export interface CardColour { id: string; number: number; name: string; manufacturer: string; hex: string; product?: string; productLine?: string; sheen?: string; coats?: number }

export function useLineColours(estimateId: string) {
  const { db, job } = useProtoEstimate(estimateId);
  return useMemo(() => {
    const colours = new Map<string, LineColour>();
    if (!job) return { colours, inScope: new Set<string>(), linked: false, card: [] as CardColour[] };
    const gal = new Map<string, number>();
    const specs = db.specs.filter((s) => s.jobId === job.id && s.state !== 'superseded');
    for (const spec of specs) {
      const line = specDemand(db, spec);
      for (const p of line.parts) gal.set(p.surfaceId, (gal.get(p.surfaceId) ?? 0) + p.baseNeedGal * (1 + line.waste));
    }
    const ordered = db.colours.filter((c) => c.jobId === job.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const sid of job.surfaceIds) {
      const spec = specForSurface(db, job.id, sid);
      const c = spec && ordered.find((x) => x.id === spec.colourId);
      if (c) colours.set(sid, { hex: c.hex, name: c.name, number: ordered.indexOf(c) + 1, gal: gal.get(sid) ?? 0 });
    }
    const card: CardColour[] = ordered.map((c, i) => {
      const s = specs.find((x) => x.colourId === c.id);
      return { id: c.id, number: i + 1, name: c.name, manufacturer: c.manufacturer, hex: c.hex, product: s?.product, productLine: s?.productLine, sheen: s?.sheen, coats: s?.coats };
    });
    return { colours, inScope: new Set(job.surfaceIds), linked: true, card };
  }, [db, job]);
}

/**
 * COLOR cell on a replica line row: the assigned colour, or "Click to paint"
 * in paint mode. Typing a colour number from the card assigns that colour
 * (patent 6: manufacturer, colour, product and sheen come from the card).
 */
export function LineColourCell({ colour, painting, saved, editable, card, onAssign }: {
  colour?: LineColour;
  painting: boolean;
  saved: boolean;
  editable?: boolean;
  card?: CardColour[];
  onAssign?: (colourId: string) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  if (painting && !saved) return <span className="text-xs italic text-amber-600" title="Save the estimate; a line needs an amount to reach the color card">Save first</span>;
  const commit = () => {
    const n = Number(text.replace('#', '').trim());
    if (!text.trim()) return;
    const hit = card?.find((c) => c.number === n);
    if (!hit) {
      setError(card?.length ? `Card has colours 1–${card.length}` : 'Add a colour to the card first');
      return;
    }
    setError('');
    setText('');
    onAssign?.(hit.id);
  };
  return (
    <div className="flex flex-col items-center gap-0.5" onClick={(e) => editable && !painting && e.stopPropagation()}>
      {colour ? (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-xs font-semibold text-gray-700" title={colour.name}>
          <Swatch hex={colour.hex} size="sm" /> #{colour.number}
        </span>
      ) : painting ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700"><PaintBucket className="h-3.5 w-3.5" /> Click to paint</span>
      ) : !editable ? (
        <span className="text-xs italic text-gray-500">None</span>
      ) : null}
      {editable && !painting && (
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); setError(''); }}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          placeholder={colour ? 'Change #' : 'Color #'}
          inputMode="numeric"
          aria-label="Color number from the color card"
          title={card?.length ? card.map((c) => `#${c.number} ${c.name}`).join('\n') : 'Add colors to the Paint Color Card first'}
          className="h-7 w-20 rounded-md border border-gray-200 bg-white px-1.5 text-center text-xs focus:border-primary-400 focus:outline-none"
        />
      )}
      {error && <span className="text-xs font-semibold text-red-600">{error}</span>}
      {colour && colour.gal > 0 && <span className="text-xs font-semibold text-blue-600">{colour.gal.toFixed(2)} gal</span>}
    </div>
  );
}

/** Paint mode: clicking a line assigns the selected colour to that surface. */
export function assignLineColour(estimateId: string, lineId: string, colourId: string, saved: boolean) {
  if (!saved) {
    toast.info('Save the estimate first', 'Line items reach the color card once the estimate is saved with an amount on the line.');
    return;
  }
  if (act(assignSurfaceColour, estimateId, lineId, colourId).ok) toast.success('Color assigned');
}

/* ---------- Change Orders (feature 24) ---------- */

/** Toolbar actions for an approved estimate: Amend (rule D4) and + Create Change Order. */
export function ApprovedEstimateActions({ estimateId, onCreateChangeOrder }: { estimateId: string; onCreateChangeOrder: () => void }) {
  const { est, job, wo } = useProtoEstimate(estimateId);
  const user = useCurrentUser();
  const [confirm, setConfirm] = useState(false);
  if (!est) return null;
  const amendBlock = amendBlockedReason(est, wo?.status);
  const showAmend = est.status === 'ACCEPTED' && can(user, 'estimate.amend');
  const showCo = !!job && changeOrderAllowed(est) && can(user, 'co.build');
  return (
    <>
      {showAmend && (
        <span className="inline-flex max-w-[18rem] flex-col gap-1">
          <Tooltip content={amendBlock ?? 'Open this accepted estimate for editing'}>
            <span data-tour="amend-button" className="inline-flex">
              <Button variant="secondary" disabled={!!amendBlock} onClick={() => setConfirm(true)} icon={<PencilLine className="h-4 w-4" />} aria-describedby={amendBlock ? 'amend-blocked-reason' : undefined}>
                Amend Estimate
              </Button>
            </span>
          </Tooltip>
          {amendBlock && <span id="amend-blocked-reason" className="text-xs leading-snug text-gray-500">{amendBlock}</span>}
        </span>
      )}
      {showCo && (
        <Button variant="secondary" onClick={onCreateChangeOrder} icon={<FilePlus2 className="h-4 w-4" />} data-tour="create-change-order">
          Create Change Order <NewBadge feature={24} className="ml-1" />
        </Button>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Amend Estimate"
        message="Open this accepted estimate for editing? The customer will not be notified until you click 'Send for Re-approval'."
        confirmLabel="Open for Editing"
        variant="primary"
        onConfirm={() => {
          if (act(amendEstimate, est.id).ok) toast.success('Estimate opened for editing', 'Customer will not be notified until you click "Send for Re-approval".');
        }}
      />
    </>
  );
}

/** Change Orders section; `?newco=1` opens the builder, `?co=<id>` opens one change order. */
export function ChangeOrdersBlock({ estimateId, creating, setCreating }: { estimateId: string; creating: boolean; setCreating: (v: boolean) => void }) {
  const { est, job } = useProtoEstimate(estimateId);
  if (!est || !job) return null;
  return (
    <Suspense fallback={null}>
      <NewCoParam est={est} onOpen={() => setCreating(true)} />
      <ChangeOrdersSection job={job} estimateId={est.id} creating={creating} setCreating={setCreating} />
    </Suspense>
  );
}

function NewCoParam({ est, onOpen }: { est: PEstimate; onOpen: () => void }) {
  const newco = useParam('newco') === '1';
  const accepted = est.status === 'ACCEPTED';
  const done = useRef(false);
  // Opened from the work order kebab: start the new change order once.
  useEffect(() => {
    if (!newco || !accepted || done.current) return;
    done.current = true;
    onOpen();
    setTimeout(() => document.getElementById('section-change-orders')?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, [newco, accepted, onOpen]);
  return null;
}

/* ---------- From History (feature 28) ---------- */

export function FromHistoryBlock({ estimateId }: { estimateId: string }) {
  const { db, est } = useProtoEstimate(estimateId);
  const rep = est?.repeatEstimateId ? byId(db.repeatEstimates, est.repeatEstimateId) : undefined;
  if (!est || !rep) return null;
  return (
    <Suspense fallback={null}>
      <FromHistorySection estimate={est} rep={rep} />
    </Suspense>
  );
}

/* ---------- Paint & Materials with the Preliminary List (feature 18) ---------- */

export function PaintMaterialsSection({ estimateId }: { estimateId: string }) {
  const { est, job } = useProtoEstimate(estimateId);
  if (!est || !job) return null;
  return <MaterialsSummary estimate={est} job={job} />;
}

function MaterialsSummary({ estimate, job }: { estimate: PEstimate; job: PJob }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [prelim, setPrelim] = useState(false);
  const all = useMemo(() => jobDemand(db, job.id), [db, job.id]);
  const lines = all.filter((l) => l.spec.product);
  const showPrices = can(user, 'estimate.viewFinancials');
  return (
    <EstimateSection id="section-materials">
      <SectionHeader
        icon={<Package />}
        title="Paint & Materials"
        subtitle="Includes waste & container optimization"
        right={estimate.status === 'DRAFT' && (
          <FButton size="sm" onClick={() => setPrelim(true)} data-tour="preliminary-list">
            <Printer className="h-3.5 w-3.5" /> Preliminary List <NewBadge feature={18} />
          </FButton>
        )}
      />
      <div className="text-xs font-bold uppercase tracking-widest text-gray-500">Paint Products (Calculated)</div>
      {lines.length === 0 ? (
        <p className="mt-3 text-sm italic text-gray-500">Add a color with a product, then assign surfaces.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Product', 'Color', 'Est. Gal', 'Containers', ...(showPrices ? ['Cost'] : [])].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((l) => (
                <tr key={l.specId}>
                  <td className="px-4 py-3 font-semibold text-gray-900">{l.spec.product}</td>
                  <td className="px-4 py-3 text-gray-600">{l.colourName} {l.colourNumber} · {l.spec.sheen ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold text-blue-600">{l.needGal.toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatPacks(l.packs.packs) || '—'}</td>
                  {showPrices && <td className="px-4 py-3 text-gray-700">{money(l.needGal * (l.catalog?.cost.gal ?? 0))}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PreliminaryListModal open={prelim} job={job} lines={all} onClose={() => setPrelim(false)} />
    </EstimateSection>
  );
}

/** Small NEW-badged link chip used where the replica needs to point at a feature page. */
export function NewLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cn('inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-800 hover:bg-green-100', className)}>
      {children}
    </a>
  );
}
