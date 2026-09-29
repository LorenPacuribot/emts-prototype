'use client';

/*
  /estimates/[id] - the estimate builder.

  The page keeps a local "draft" copy of the estimate so the user can edit
  freely and then Save. Every save (and every status change) writes the
  whole draft back to the store and adds a version to the history.

  Editing rules (same as the live app):
    Draft               -> editable
    Sent/Viewed/Expired -> read-only until "Edit" is clicked
    Approved/Declined   -> read-only (Approved: Amend Estimate, until the
                           work order is In Progress, rule D4)

  NEW feature sections (components/estimates/FeatureSections.tsx) work on
  the estimate's prototype twin: From History (28), Paint Color Card (3)
  with paint mode on the line rows, Change Orders (24) and Paint &
  Materials with the Preliminary List (18).
*/
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Columns3, ExternalLink, FileQuestion, Grid, Palette, Plus } from 'lucide-react';
import { RowMenu } from '@/components/ui/menu';
import type { AreaTemplate, Estimate, EstimateLineItem, SurfaceRate } from '@/lib/types';
import { PageShell } from '@/components/Navigation';
import { EmptyState, ListSkeleton } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useDb, useLookups, useSingleton } from '@/lib/store';
import { estimateTotals, round2 } from '@/lib/calculations';
import { longDate, uid } from '@/lib/utils';
import { EstimateToolbar } from '@/components/estimates/EstimateToolbar';
import { ClientInfo, DocHeader } from '@/components/estimates/EstimateInfo';
import { AreaBlock } from '@/components/estimates/AreaBlock';
import { AddToEstimateModal, SurfacePickerModal } from '@/components/estimates/AddModals';
import { ExtrasBlock, LaborSummary, NotesSection } from '@/components/estimates/BuilderSections';
import { FinalizeSection } from '@/components/estimates/FinalizeSection';
import { SendEstimateModal } from '@/components/estimates/SendEstimateModal';
import { DeliveryBadges } from '@/components/estimates/DeliveryBadges';
import { useSendEstimateEmail } from '@/components/estimates/useSendEstimateEmail';
import { customerLinkFor } from '@/lib/estimate-email';
import { useEstimateActions } from '@/components/estimates/useEstimateActions';
import {
  ApprovedEstimateActions, ChangeOrdersBlock, FromHistoryBlock, LineColourCell, PaintCardSection, PaintMaterialsSection,
  assignLineColour, useLineColours, useProtoEstimate,
} from '@/components/estimates/FeatureSections';
import { act } from '@/features/lib/store';
import { amendEstimate } from '@/features/lib/store/actions/estimates';
import { publicEstimateHref } from '@/features/lib/hrefs';
import { areaFromTemplate, newLine, priceLine, quantityFromDimensions, sendBlocker } from '@/components/estimates/estimate-utils';
import { coverageFor, materialPerUnit } from '@/lib/estimating';
import { TableColumnsModal } from '@/components/estimates/TableColumnsModal';
import { ScopeTotals } from '@/components/estimates/ScopeTotals';

export default function EstimateBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const db = useDb();
  const c = db.collections;
  const look = useLookups();
  const [bp] = useSingleton('businessProfile');
  const actions = useEstimateActions();
  const mailer = useSendEstimateEmail();
  const { toast } = useToast();

  const stored = c.estimates.find((e) => e.id === id);
  const [draft, setDraft] = useState<Estimate | null>(stored ?? null);
  const [dirty, setDirty] = useState(false);
  const [editOverride, setEditOverride] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [surfaceFor, setSurfaceFor] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [areaToDelete, setAreaToDelete] = useState<string | null>(null);

  // NEW features: the prototype twin, paint mode (3) and the change order builder (24).
  const proto = useProtoEstimate(id);
  const lineColours = useLineColours(id);
  const [paintColourId, setPaintColourId] = useState<string>();
  const [creatingCo, setCreatingCo] = useState(false);
  const amending = proto.est?.status === 'AMENDED_DRAFT';
  const painting = !!paintColourId && proto.editable;
  // A colour typed on a line that hasn't reached the colour card yet: saved first, assigned once the line syncs.
  const [pendingColour, setPendingColour] = useState<{ lineId: string; colourId: string } | null>(null);
  const assignRef = useRef<(lineId: string, colourId: string) => void>(undefined);
  useEffect(() => {
    if (pendingColour && lineColours.inScope.has(pendingColour.lineId)) {
      assignRef.current?.(pendingColour.lineId, pendingColour.colourId);
      setPendingColour(null);
    }
  }, [pendingColour, lineColours]);

  // Links like /estimates/X#section-paint-card: scroll once the builder has rendered.
  useEffect(() => {
    if (!mounted || !window.location.hash) return;
    // Feature sections appear once the prototype store has loaded, so wait for the target.
    let tries = 0;
    const t = setInterval(() => {
      const el = document.getElementById(window.location.hash.slice(1));
      if (el || ++tries > 20) {
        clearInterval(t);
        setTimeout(() => el?.scrollIntoView({ block: 'start' }), 300);
      }
    }, 150);
    return () => clearInterval(t);
  }, [mounted]);

  // Pick up store changes (status actions, other tabs) when nothing is being edited.
  useEffect(() => {
    if (stored && !dirty) setDraft(stored);
  }, [stored, dirty]);

  // Drafts save themselves 2s after the last edit (patent 4: rows save as the estimator walks the property).
  // Autosave skips the version history; Save Draft still records a version.
  const { autosave } = actions;
  const [lastSavedAt, setLastSavedAt] = useState<Date>();
  const autosavePending = !!draft && dirty && draft.status === 'Draft' && !!draft.title.trim();
  useEffect(() => {
    if (!autosavePending || !draft) return;
    const t = setTimeout(() => {
      autosave(draft);
      setDirty(false);
      setLastSavedAt(new Date());
    }, 2000);
    return () => clearTimeout(t);
  }, [autosavePending, draft, autosave]);

  const ctx = useMemo(
    () => ({ surfaceRates: c.surfaceRates, tiers: c.difficultyTiers, tableColumns: c.tableColumns, paints: c.paintProducts }),
    [c.surfaceRates, c.difficultyTiers, c.tableColumns, c.paintProducts],
  );
  const [columnsOpen, setColumnsOpen] = useState(false);
  const totals = useMemo(() => (draft ? estimateTotals(draft) : null), [draft]);

  const edit = useCallback((fn: (e: Estimate) => Estimate) => {
    setDraft((d) => (d ? fn(d) : d));
    setDirty(true);
  }, []);

  if (!mounted) {
    return (
      <PageShell title="Estimate" breadcrumbs={[{ label: 'Estimates', href: '/estimates' }]}>
        <ListSkeleton rows={4} />
      </PageShell>
    );
  }

  if (!stored || !draft || !totals) {
    return (
      <PageShell title="Estimate" breadcrumbs={[{ label: 'Estimates', href: '/estimates' }]} backHref="/estimates">
        <EmptyState
          icon={<FileQuestion />}
          title="Estimate not found"
          message="This estimate may have been deleted."
          action={<Link href="/estimates" className="text-sm font-bold text-primary-600 hover:underline">Back to Estimates</Link>}
        />
      </PageShell>
    );
  }

  const canEdit = ['Sent', 'Viewed', 'Expired'].includes(draft.status);
  const readOnly = !(draft.status === 'Draft' || (canEdit && editOverride));
  const customer = look.customer(draft.customerId);
  const lead = look.lead(draft.leadId);
  const estType = c.estimateTypes.find((t) => t.name === draft.estimateType);
  const laborRate = estType?.hourlyRate ?? c.estimateTypes[0]?.hourlyRate ?? 85;
  const defaultPaint = c.paintProducts.find((p) => p.id === look.estimateTemplate(draft.estimateTemplateId)?.defaultPaintProductId)
    ?? c.paintProducts.find((p) => p.id === draft.lineItems[0]?.paintProductId);
  const paintLabel = (pid?: string) => {
    const p = look.paint(pid);
    return p ? `${look.brand(p.brandId)?.name ?? ''} ${p.name}`.trim() : '';
  };

  /* ---------- Line & area editing ---------- */

  const updateLine = (lineId: string, patch: Partial<EstimateLineItem>) =>
    edit((e) => ({
      ...e,
      lineItems: e.lineItems.map((l) => {
        if (l.id !== lineId) return l;
        let next = { ...l, ...patch };
        // Location, sheen and scope state don't change the numbers.
        if (Object.keys(patch).every((key) => ['optional', 'selected', 'location', 'sheen'].includes(key))) return next;
        if ('heightTierId' in patch || 'accessTierId' in patch) next.difficultyMultiplier = 1;
        const sr = c.surfaceRates.find((s) => s.name === next.surfaceType);
        if (patch.surfaceType && sr) {
          next.unit = sr.unit;
          const area = e.areas.find((a) => a.id === l.areaId);
          if (area && !l.quantityManual) next.quantity = quantityFromDimensions(sr, area) || l.quantity;
        }
        const materialInputs: (keyof EstimateLineItem)[] = ['paintProductId', 'coats', 'surfaceType', 'condition', 'unit', 'coatingAreaSqft', 'quantity'];
        if (materialInputs.some((k) => k in patch)) {
          const paint = look.paint(next.paintProductId);
          next.paintName = paint?.name;
          // A new product brings its finish unless a sheen was chosen for this surface.
          if ('paintProductId' in patch && paint && !l.sheen) next.sheen = paint.finish;
          next.unitPrice = materialPerUnit(next, coverageFor(paint, c.surfaceRates.find((s) => s.name === next.surfaceType)));
        }
        next = priceLine(next, { ...ctx, profitMargin: e.profitMargin });
        return next;
      }),
    }));

  const updateDimension = (areaId: string, key: 'length' | 'width' | 'height', value: number) =>
    edit((e) => {
      const areas = e.areas.map((a) => (a.id === areaId ? { ...a, [key]: value } : a));
      const area = areas.find((a) => a.id === areaId)!;
      return {
        ...e,
        areas,
        lineItems: e.lineItems.map((l) => {
          if (l.areaId !== areaId || l.quantityManual) return l;
          const q = quantityFromDimensions(c.surfaceRates.find((s) => s.name === l.surfaceType), area);
          return q > 0 ? priceLine({ ...l, quantity: q }, { ...ctx, profitMargin: e.profitMargin }) : l;
        }),
      };
    });

  const addAreaFromTemplate = (tpl: AreaTemplate) =>
    edit((e) => {
      const r = areaFromTemplate({ tpl, surfaceRates: c.surfaceRates, paint: defaultPaint, laborRate, profitMargin: e.profitMargin, tiers: c.difficultyTiers, heightTierId: e.heightTierId, accessTierId: e.accessTierId, tableColumns: c.tableColumns, paints: c.paintProducts });
      return { ...e, areas: [...e.areas, r.area], lineItems: [...e.lineItems, ...r.lines] };
    });

  const addCustomArea = (name: string) => edit((e) => ({ ...e, areas: [...e.areas, { id: uid('ar'), name }] }));

  const addSurface = (areaId: string, sr: SurfaceRate) =>
    edit((e) => {
      const area = e.areas.find((a) => a.id === areaId)!;
      const line = newLine({ area, sr, paint: defaultPaint, laborRate, profitMargin: e.profitMargin, tiers: c.difficultyTiers, heightTierId: e.heightTierId, accessTierId: e.accessTierId, tableColumns: c.tableColumns, paints: c.paintProducts });
      return { ...e, lineItems: [...e.lineItems, line] };
    });

  const duplicateArea = (areaId: string) =>
    edit((e) => {
      const a = e.areas.find((x) => x.id === areaId)!;
      const copy = { ...a, id: uid('ar'), name: `${a.name} (Copy)` };
      const idx = e.areas.findIndex((x) => x.id === areaId);
      const areas = [...e.areas.slice(0, idx + 1), copy, ...e.areas.slice(idx + 1)];
      const lines = e.lineItems.filter((l) => l.areaId === areaId).map((l) => ({ ...l, id: uid('li'), areaId: copy.id }));
      return { ...e, areas, lineItems: [...e.lineItems, ...lines] };
    });

  const removeArea = (areaId: string) =>
    edit((e) => ({ ...e, areas: e.areas.filter((a) => a.id !== areaId), lineItems: e.lineItems.filter((l) => l.areaId !== areaId) }));

  const setMargin = (m: number) =>
    edit((e) => ({ ...e, profitMargin: m, lineItems: e.lineItems.map((l) => priceLine(l, { ...ctx, profitMargin: m })) }));

  const applyTiers = (heightTierId?: string, accessTierId?: string) =>
    edit((e) => ({
      ...e,
      heightTierId,
      accessTierId,
      lineItems: e.lineItems.map((l) => priceLine({ ...l, heightTierId, accessTierId, difficultyMultiplier: 1 }, { ...ctx, profitMargin: e.profitMargin })),
    }));

  /* ---------- Save & status ---------- */

  const validate = () => {
    if (!draft.title.trim()) {
      toast('Enter a project name before saving', 'error');
      return false;
    }
    return true;
  };

  const openSend = () => {
    if (!validate()) return;
    const blocked = sendBlocker(draft, customer);
    if (blocked) {
      toast(blocked, 'error');
      return;
    }
    setSendOpen(true);
  };

  const save = () => {
    if (!validate()) return false;
    actions.save(draft, draft.status === 'Draft' ? 'Draft saved' : 'Estimate updated');
    setDirty(false);
    setEditOverride(false);
    setLastSavedAt(new Date());
    toast('Estimate saved');
    return true;
  };

  const afterStatus = () => {
    setDirty(false);
    setEditOverride(false);
  };

  /** The secure customer link that goes in the email (same as Client Preview's Copy Link). */
  const linkCtx = () => {
    const token = proto.est?.publicToken;
    return {
      link: customerLinkFor(window.location.origin, draft.id, token),
      linkExpires: token && proto.est?.validUntil ? longDate(proto.est.validUntil) : undefined,
    };
  };

  const convert = () => {
    const job = actions.convertToJob(draft);
    toast(`Job ${job.jobNumber} created`);
    router.push(`/jobs/${job.id}`);
  };

  /* ---------- Colour card on the rows (patent 3, 6) ---------- */

  /** Copies the colour's specification (product, sheen, coats) onto the replica line. */
  const applyCardToLine = (lineId: string, colourId: string) => {
    const cc = lineColours.card.find((x) => x.id === colourId);
    if (!cc) return;
    const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const wanted = norm(cc.product || cc.productLine);
    const brandIds = new Set(c.brands.filter((b) => norm(b.name) === norm(cc.manufacturer)).map((b) => b.id));
    const inBrand = c.paintProducts.filter((p) => !brandIds.size || brandIds.has(p.brandId));
    // Exact name within the brand wins; a partial match is a fallback, longest name first
    // so "SuperPaint Exterior" beats "SuperPaint" for a card that names the exterior line.
    const paint = !wanted
      ? undefined
      : inBrand.find((p) => norm(p.name) === wanted)
        ?? [...inBrand]
          .filter((p) => wanted.includes(norm(p.name)) || norm(p.name).includes(wanted))
          .sort((a, b) => b.name.length - a.name.length)[0];
    const patch: Partial<EstimateLineItem> = {};
    if (cc.sheen) patch.sheen = cc.sheen;
    if (cc.coats) patch.coats = cc.coats;
    if (paint) patch.paintProductId = paint.id;
    if (Object.keys(patch).length) updateLine(lineId, patch);
    if (wanted && !paint) {
      toast(`"${cc.product || cc.productLine}" isn't in the Paint Library. Color, sheen and coats were applied; pick the product on the row.`, 'info');
    }
  };

  const assignColour = (lineId: string, colourId: string) => {
    if (!lineColours.inScope.has(lineId)) {
      // The line reaches the colour card on save; assign right after.
      actions.save(draft, 'Draft saved');
      setDirty(false);
      setPendingColour({ lineId, colourId });
      toast('Saving the estimate to link this line to the color card…', 'info');
      return;
    }
    assignLineColour(draft.id, lineId, colourId, true);
    applyCardToLine(lineId, colourId);
  };
  assignRef.current = assignColour;

  const areaLines = (areaId: string) => draft.lineItems.filter((l) => l.areaId === areaId);
  const locationOptions = Array.from(new Set([
    ...draft.areas.map((a) => a.name), ...draft.lineItems.map((l) => l.location ?? ''),
    ...(draft.estimateType === 'Exterior' ? ['Front Exterior', 'Rear Elevation', 'Left Side', 'Right Side'] : ['Living Rm', 'Kitchen', 'Hallway', 'Master Bedroom']),
  ].filter(Boolean)));

  return (
    <PageShell title={draft.estimateNumber} breadcrumbs={[{ label: 'Estimates', href: '/estimates' }]} backHref="/estimates">
      <div className="mx-auto max-w-7xl">
        <EstimateToolbar
          estimate={draft}
          lead={lead}
          readOnly={readOnly}
          canEdit={canEdit}
          dirty={dirty}
          saving={autosavePending}
          lastSavedAt={lastSavedAt}
          f={{
            actions: (
              <ApprovedEstimateActions
                estimateId={draft.id}
                onCreateChangeOrder={() => {
                  setCreatingCo(true);
                  document.getElementById('section-change-orders')?.scrollIntoView({ behavior: 'smooth' });
                }}
              />
            ),
            chips: (
              <>
                <button
                  type="button"
                  onClick={() => document.getElementById('section-paint-card')?.scrollIntoView({ behavior: 'smooth' })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-100"
                >
                  <Palette className="h-3.5 w-3.5" /> Color Card
                </button>
                {(proto.est?.amendmentNumber ?? 0) > 0 && (
                  <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">Amendment #{proto.est!.amendmentNumber}</span>
                )}
                <DeliveryBadges
                  estimate={draft}
                  retrying={mailer.sending}
                  onRetry={async () => {
                    await mailer.retry(draft, linkCtx());
                    afterStatus();
                  }}
                />
              </>
            ),
            sendDisabledReason: customer?.email?.trim() ? undefined : 'The customer has no email address. Add one on the contact page, then send.',
            menu: proto.est?.publicToken
              ? [{ label: 'Customer Page (NEW)', icon: <ExternalLink />, onClick: () => window.open(publicEstimateHref(proto.est!.publicToken!), '_blank') }]
              : [],
            sendLabel: amending ? 'Send for Re-approval' : undefined,
            hideApprove: amending,
          }}
          a={{
            onTitle: (v) => edit((e) => ({ ...e, title: v })),
            onSave: save,
            onEdit: () => {
              // Awaiting re-approval: "Edit Amendment Again" reopens it in the prototype (rule D4 applies).
              if (proto.est?.status === 'PENDING_REAPPROVAL') {
                if (act(amendEstimate, draft.id).ok) toast('Estimate opened for editing');
                return;
              }
              setEditOverride(true);
            },
            onSend: openSend,
            onApprove: () => {
              if (!validate()) return;
              actions.markApproved(draft);
              afterStatus();
              toast('Estimate approved successfully');
            },
            onDecline: () => {
              setDeclineReason('');
              setDeclineOpen(true);
            },
            onConvert: convert,
            // Unsaved edits go with you into Client Preview.
            onPreview: () => {
              if (dirty && !readOnly && validate()) {
                actions.save(draft, 'Draft saved');
                setDirty(false);
              }
              router.push(`/estimates/${draft.id}/preview`);
            },
            onPrint: () => router.push(`/estimates/${draft.id}/preview?print=1`),
            onClientView: () => router.push(`/estimates/${draft.id}/client-view?preview=1`),
            onHistory: () => router.push(`/estimates/${draft.id}/history`),
            onDuplicate: () => {
              const copy = actions.duplicate(draft);
              toast(`Duplicated as ${copy.estimateNumber}`);
              router.push(`/estimates/${copy.id}`);
            },
            onDelete: () => setDeleteOpen(true),
          }}
        />

        <div className="rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <DocHeader
            estimate={draft}
            bp={bp}
            estimator={look.member(draft.estimatorId ?? draft.createdBy)}
            team={c.team}
            readOnly={readOnly}
            onEstimator={(mid) => edit((e) => ({ ...e, estimatorId: mid }))}
          />
          <div className="px-4 pt-8 md:px-12">
            <ClientInfo estimate={draft} customer={customer} customers={c.customers} readOnly={readOnly} onChange={(p) => edit((e) => ({ ...e, ...p }))} />
          </div>

          <div className="space-y-10 p-4 md:space-y-12 md:p-12">
            <FromHistoryBlock estimateId={draft.id} />
            <PaintCardSection estimateId={draft.id} paintColourId={paintColourId} onPaint={setPaintColourId} onSave={save} readOnly={readOnly} />

            {/* Area & Line Items */}
            <section id="section-scope" className="scroll-mt-24 border-b border-gray-200 pb-10">
              <div className="mb-6 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary-100 bg-primary-50">
                  <Grid className="h-6 w-6 text-primary-600" />
                </div>
                <h3 className="flex-1 font-heading text-2xl font-bold text-gray-900">Area &amp; Line Items</h3>
                <RowMenu
                  className="h-10 w-10"
                  items={[{ label: 'Table Columns', icon: <Columns3 />, onClick: () => setColumnsOpen(true) }]}
                />
              </div>
              <div className="space-y-8">
                {draft.areas.length === 0 && draft.extras.length === 0 && (
                  <EmptyState title="No areas yet" message="Add an area from your Area Templates, or a custom line item, to start pricing this estimate." />
                )}
                {draft.areas.map((a) => (
                  <AreaBlock
                    key={a.id}
                    area={a}
                    lines={areaLines(a.id)}
                    readOnly={readOnly}
                    surfaceRates={c.surfaceRates}
                    paints={c.paintProducts}
                    brands={c.brands}
                    tiers={c.difficultyTiers}
                    columns={c.tableColumns}
                    locations={locationOptions}
                    onOpenColumns={() => setColumnsOpen(true)}
                    onRename={(name) => edit((e) => ({ ...e, areas: e.areas.map((x) => (x.id === a.id ? { ...x, name } : x)) }))}
                    onDimension={(k, v) => updateDimension(a.id, k, v)}
                    onDuplicate={() => duplicateArea(a.id)}
                    onDelete={() => setAreaToDelete(a.id)}
                    onAddLine={() => setSurfaceFor(a.id)}
                    onUpdateLine={updateLine}
                    onDeleteLine={(lid) => edit((e) => ({ ...e, lineItems: e.lineItems.filter((l) => l.id !== lid) }))}
                    colourCell={lineColours.linked ? (l) => (
                      <LineColourCell
                        colour={lineColours.colours.get(l.id)}
                        painting={painting}
                        saved={lineColours.inScope.has(l.id)}
                        editable={!readOnly && proto.editable}
                        card={lineColours.card}
                        onAssign={(colourId) => assignColour(l.id, colourId)}
                      />
                    ) : undefined}
                    painting={painting}
                    onPaintLine={(lid) => {
                      if (!paintColourId) return;
                      assignLineColour(draft.id, lid, paintColourId, lineColours.inScope.has(lid));
                      if (lineColours.inScope.has(lid)) applyCardToLine(lid, paintColourId);
                    }}
                  />
                ))}
                <ExtrasBlock
                  extras={draft.extras}
                  readOnly={readOnly}
                  onUpdate={(xid, patch) => edit((e) => ({ ...e, extras: e.extras.map((x) => (x.id === xid ? { ...x, ...patch } : x)) }))}
                  onDelete={(xid) => edit((e) => ({ ...e, extras: e.extras.filter((x) => x.id !== xid) }))}
                />
                {(draft.lineItems.length > 0 || draft.extras.length > 0) && <ScopeTotals estimate={draft} totals={totals} />}
              </div>
              {!readOnly && (
                <div className="mt-6 border-t border-gray-200 pt-6">
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-4 text-base font-bold text-gray-500 transition-colors hover:border-primary-300 hover:text-primary-600"
                  >
                    Add to Estimate <Plus className="h-5 w-5" />
                  </button>
                </div>
              )}
            </section>

            <ChangeOrdersBlock estimateId={draft.id} creating={creatingCo} setCreating={setCreatingCo} />

            <NotesSection
              notes={draft.notes ?? ''}
              internal={draft.internalNotes ?? ''}
              readOnly={readOnly}
              onChange={(p) => edit((e) => ({ ...e, ...p }))}
            />

            <LaborSummary estimate={draft} paintLabel={paintLabel} />

            <PaintMaterialsSection estimateId={draft.id} />

            <FinalizeSection
              estimate={draft}
              totals={totals}
              readOnly={readOnly}
              tiers={c.difficultyTiers}
              discounts={[...c.projectDiscounts].sort((a, b) => a.sortOrder - b.sortOrder)}
              taxRegions={c.taxRegions}
              terms={c.termsConditions}
              onChange={(p) => edit((e) => ({ ...e, ...p }))}
              onApplyTiers={applyTiers}
              onMargin={setMargin}
            />

            {!readOnly && (
              <div className="flex justify-end gap-3 border-t border-gray-100 pt-6">
                <Button variant="secondary" onClick={save}>Save Draft</Button>
                {draft.status !== 'Approved' && <Button onClick={openSend}>{amending ? 'Send for Re-approval' : 'Send Estimate'}</Button>}
              </div>
            )}
          </div>
        </div>
      </div>

      <AddToEstimateModal
        open={addOpen}
        onOpenChange={setAddOpen}
        areaTemplates={c.areaTemplates}
        estimateTypes={c.estimateTypes}
        currentTypeName={draft.estimateType}
        surfaceRates={c.surfaceRates}
        lineItems={c.lineItemTemplates}
        onAddArea={addAreaFromTemplate}
        onAddCustomArea={addCustomArea}
        onAddExtra={(x) =>
          edit((e) => {
            // Percent items (e.g. Rush Fee 10%) are priced from the current line total.
            const base = e.lineItems.reduce((s, l) => s + l.total, 0);
            const unitPrice = x.percent !== undefined ? round2((base * x.percent) / 100) : x.unitPrice;
            return { ...e, extras: [...e.extras, { id: uid('x'), name: x.name, quantity: x.quantity, unitPrice }] };
          })
        }
      />
      <TableColumnsModal open={columnsOpen} onOpenChange={setColumnsOpen} />
      <SurfacePickerModal
        open={!!surfaceFor}
        onOpenChange={(o) => !o && setSurfaceFor(null)}
        surfaceRates={[...c.surfaceRates].sort((a, b) => a.rateGroup.localeCompare(b.rateGroup) || a.sortOrder - b.sortOrder)}
        onPick={(sr) => surfaceFor && addSurface(surfaceFor, sr)}
      />
      <SendEstimateModal
        open={sendOpen}
        onOpenChange={setSendOpen}
        estimate={draft}
        customer={customer}
        companyName={bp.companyName}
        customerPageHref={proto.est?.publicToken ? publicEstimateHref(proto.est.publicToken) : undefined}
        onPreview={() => {
          if (dirty) actions.save(draft, 'Draft saved');
          setDirty(false);
          router.push(`/estimates/${draft.id}/preview`);
        }}
        onSend={async (p) => {
          await mailer.send(draft, p, linkCtx());
          afterStatus();
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Estimate"
        message="Are you sure you want to delete this estimate? This action cannot be undone."
        onConfirm={() => {
          actions.remove(draft);
          toast('Estimate deleted successfully');
          router.push('/estimates');
        }}
      />
      <ConfirmDialog
        open={!!areaToDelete}
        onOpenChange={(o) => !o && setAreaToDelete(null)}
        title="Delete Area"
        message="Remove this area and all of its line items?"
        confirmLabel="Remove"
        onConfirm={() => areaToDelete && removeArea(areaToDelete)}
      />
      <Modal
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        title="Mark Declined"
        description="Record that the customer declined this estimate."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeclineOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                actions.markDeclined(draft, declineReason.trim() || undefined);
                afterStatus();
                setDeclineOpen(false);
                toast('Estimate marked as declined');
              }}
            >
              Mark Declined
            </Button>
          </>
        }
      >
        <Field label="Reason (optional)">
          <Textarea rows={3} value={declineReason} placeholder="e.g. Went with a cheaper bid" onChange={(e) => setDeclineReason(e.target.value)} />
        </Field>
      </Modal>
    </PageShell>
  );
}
