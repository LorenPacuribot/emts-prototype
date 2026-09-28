"use client";
/**
 * Paint Color Card section on Estimate Details
 * (live: estimates/details/components/paint-colors.tsx).
 *
 * Existing: the colour table (Color #, Color Details, Brand, Product, Sheen,
 * Assigned Surfaces, Est. Gal, Actions), "Paint with this color" mode, and
 * "+ Add New Color".
 * NEW (feature 3): Approval column, specification lines under each colour,
 * sample rounds, approval and evidence, card versions, print and export,
 * affected-commitment banners and the Rule 1 notice on a signed scope.
 */
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Download, Droplet, Edit2, GitBranch, Layers, PaintBucket, Palette, Plus, Printer, Send, PhoneCall, Users2, X } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { Colour, Job, SpecLine } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { confirmStoreCall, createNewVersion, removeColour, simulateConcurrentSave } from "@/features/lib/store/actions/color-card";
import { specDemand } from "@/features/lib/rules/procurement";
import { orderingGaps, surfaceLabel } from "@/features/lib/selectors";
import { SPEC_STATE } from "@/features/lib/status";
import { can } from "@/features/lib/permissions";
import { downloadCsv } from "@/features/lib/export";
import { dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { Badge, Banner, Button, ConfirmDialog, EstimateSection, NewBadge, RowMenu, SectionHeader, Select, Swatch, Tooltip } from "@/features/components/ui";
import { SpecEditor } from "@/features/components/features/color-card/spec-editor";
import { SamplePanel } from "@/features/components/features/color-card/sample-panel";
import { ApprovalPanel, SendApprovalModal } from "@/features/components/features/color-card/approval-panel";
import { PrintCardModal, type CardLayout } from "@/features/components/features/color-card/print-card";
import { RemoveSpecModal } from "@/features/components/features/color-card/remove-spec-modal";
import { SpecHistoryModal, SpecRow } from "@/features/components/features/color-card/spec-row";
import { ManageColorModal } from "./manage-color";

export function PaintColors({ job, editable, paintColourId, onPaint }: {
  job: Job;
  /** The estimate is Draft or Editing Amendment (live `readOnly === false`). */
  editable: boolean;
  paintColourId?: string;
  onPaint: (colourId?: string) => void;
}) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const snapshots = db.cardSnapshots.filter((s) => s.jobId === job.id);
  const [viewVersion, setViewVersion] = useState(job.cardVersion);
  const snapshot = viewVersion !== job.cardVersion ? snapshots.find((s) => s.version === viewVersion) : undefined;
  // The card itself can be edited on an approved estimate too (feature 3):
  // Rule 1 decides whether a change needs the office or a change order.
  const canCard = can(user, "colourCard.edit") && !snapshot && job.status !== "completed";
  const colours = [...(snapshot ? snapshot.colours : db.colours.filter((c) => c.jobId === job.id))].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const specs = snapshot ? snapshot.specs : db.specs.filter((s) => s.jobId === job.id && s.state !== "superseded");
  const flags = db.commitmentFlags.filter((f) => f.jobId === job.id && !f.storeCallConfirmedAt);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [manage, setManage] = useState<{ open: boolean; colour?: Colour }>({ open: false });
  const [specEditor, setSpecEditor] = useState<{ open: boolean; colourId?: string; spec?: SpecLine }>({ open: false });
  const [sendFor, setSendFor] = useState<{ open: boolean; specId?: string }>({ open: false });
  const [print, setPrint] = useState<{ open: boolean; layout: CardLayout }>({ open: false, layout: "crew" });
  const [removing, setRemoving] = useState<SpecLine>();
  const [removingColour, setRemovingColour] = useState<Colour>();
  const [historyFor, setHistoryFor] = useState<SpecLine>();
  const [confirmVersion, setConfirmVersion] = useState(false);

  const rows = colours.map((c, i) => {
    const colourSpecs = specs.filter((s) => s.colourId === c.id);
    const surfaces = Array.from(new Set(colourSpecs.flatMap((s) => s.surfaceIds)));
    const gallons = snapshot ? 0 : colourSpecs.reduce((a, s) => a + specDemand(db, s).needGal, 0);
    return { colour: c, number: i + 1, specs: colourSpecs, surfaces, gallons, states: Array.from(new Set(colourSpecs.map((s) => s.state))) };
  });
  const approved = specs.filter((s) => s.state === "approved").length;
  const paintColour = colours.find((c) => c.id === paintColourId);

  function exportCsv() {
    downloadCsv(`${job.id}-colour-card-v${viewVersion}.csv`, [
      ["Color #", "Spec ID", "Colour", "Code", "Brand", "Product", "Sheen", "Coats", "Primer", "Surfaces", "Lifespan (yrs)", "Tint base", "State"],
      ...rows.flatMap((r) =>
        r.specs.map((s) => [r.number, s.id, r.colour.name, r.colour.number, r.colour.manufacturer, s.product, s.sheen, s.coats, s.primer, s.surfaceIds.map((id) => surfaceLabel(db, id)).join("; "), s.lifespanYears, s.tintBase, SPEC_STATE[s.state].label]),
      ),
    ]);
    toast.success("CSV exported", "Specification list downloaded.");
  }

  return (
    <EstimateSection id="section-paint-card">
      <SectionHeader
        icon={<Palette />}
        title="Paint Color Card"
        right={
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/40 px-2 py-1.5" data-tour="colour-card-tools">
            <NewBadge feature={3} />
            <Select value={viewVersion} onChange={(e) => setViewVersion(Number(e.target.value))} className="h-8 w-auto py-0 text-xs" aria-label="Card version">
              <option value={job.cardVersion}>Card v{job.cardVersion} (current)</option>
              {[...snapshots].reverse().map((s) => (
                <option key={s.version} value={s.version}>
                  v{s.version} · {dateTime(s.createdAt)}
                </option>
              ))}
            </Select>
            <Tooltip content={`${approved} of ${specs.length} specifications approved`}>
              <span className="text-xs font-bold text-gray-600">{approved}/{specs.length} approved</span>
            </Tooltip>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button size="sm">
                  <Printer className="h-3.5 w-3.5" /> Print <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                  {(["crew", "customer"] as const).map((l) => (
                    <DropdownMenu.Item key={l} onSelect={() => setPrint({ open: true, layout: l })} className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100">
                      {l === "crew" ? "Crew card" : "Customer card"}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <Button size="sm" onClick={exportCsv} aria-label="Export CSV">
              <Download className="h-3.5 w-3.5" />
            </Button>
            {canCard && (
              <>
                <Button size="sm" variant="primary" onClick={() => setSendFor({ open: true })} data-tour="send-approval">
                  <Send className="h-3.5 w-3.5" /> Send For Approval
                </Button>
                <RowMenu
                  label="More card actions"
                  items={[
                    { label: "Add specification", icon: <Layers />, onSelect: () => (colours.length ? setSpecEditor({ open: true, colourId: colours[0].id }) : toast.info("Add a colour first")) },
                    { label: "Create new card version", icon: <GitBranch />, onSelect: () => setConfirmVersion(true) },
                    { label: "Simulate another user's save (demo)", icon: <Users2 />, onSelect: () => { act(simulateConcurrentSave, job.id); toast.info("Another user saved this card", "Open an editor that was already open and save to see the version check."); } },
                  ]}
                />
              </>
            )}
          </div>
        }
      />

      {snapshot && (
        <Banner tone="info" className="mb-4" title={`Viewing card version ${snapshot.version} (read-only)`} action={<Button size="sm" onClick={() => setViewVersion(job.cardVersion)}>Back to current</Button>}>
          This is the card as it stood before version {snapshot.version + 1} was created.
        </Banner>
      )}
      {job.contractSigned && !snapshot && (
        <Banner tone="info" className="mb-4" title={<span className="inline-flex items-center gap-2">Signed scope <NewBadge feature={[3, 24]} /></span>}>
          The customer signed this card. An office-only change (same brand, line and colour, no price change) is saved by the Office Manager. Anything else needs a change order (Cross-Feature Rule 1).
        </Banner>
      )}
      {flags.map((f) => (
        <Banner key={f.id} tone="warn" className="mb-4" title={<span className="inline-flex items-center gap-2">Affected commitments <NewBadge feature={3} /></span>}
          action={<Button size="sm" onClick={() => act(confirmStoreCall, f.id).ok && toast.success("Store call confirmed")}><PhoneCall className="h-3.5 w-3.5" /> Confirm store call</Button>}>
          {f.message}
        </Banner>
      ))}

      {paintColour && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <div className="flex items-center gap-3">
            <PaintBucket className="h-4 w-4" />
            <div>
              <div className="font-bold">Paint mode activated for Color #{rows.find((r) => r.colour.id === paintColour.id)?.number} - {paintColour.name}</div>
              <div className="text-xs">Click on any surface row below to assign this color</div>
            </div>
          </div>
          <Button size="sm" onClick={() => onPaint(undefined)}>
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-gray-200 md:block">
        <table className="w-full min-w-[1180px] text-left">
          <thead className="border-b border-gray-100 bg-white">
            <tr>
              {["Color #", "Color Details", "Brand", "Product", "Sheen", "Assigned Surfaces", "Est. Gal"].map((h) => (
                <th key={h} className="px-4 py-4 text-xs font-extrabold uppercase tracking-wider text-gray-500 lg:px-6">{h}</th>
              ))}
              <th className="px-4 py-4 text-xs font-extrabold uppercase tracking-wider text-gray-500 lg:px-6">
                <span className="inline-flex items-center gap-1.5">Approval <NewBadge feature={3} /></span>
              </th>
              {canCard && <th className="px-4 py-4 text-right text-xs font-extrabold uppercase tracking-wider text-gray-500 lg:px-6">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-10 text-center text-sm text-gray-500">No paint colors added yet.</td>
              </tr>
            )}
            {rows.map((r) => {
              const open = expanded[r.colour.id] ?? false;
              const first = r.specs[0];
              return (
                <Fragment key={r.colour.id}>
                  <tr className={paintColourId === r.colour.id ? "bg-green-50/60" : "hover:bg-gray-50/50"}>
                    <td className="px-4 py-4 lg:px-6">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setExpanded({ ...expanded, [r.colour.id]: !open })} className="rounded p-0.5 text-gray-400 hover:bg-gray-100" aria-expanded={open} aria-label={open ? "Hide specifications" : "Show specifications"}>
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 font-mono text-sm font-bold text-gray-700">{r.number}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 lg:px-6">
                      <div className="flex items-center gap-3">
                        <Swatch hex={r.colour.hex} size="sm" className="h-6 w-6" />
                        <div>
                          <div className="whitespace-nowrap text-sm font-bold text-gray-900">{r.colour.name}</div>
                          <div className="text-xs text-gray-500">{r.colour.number}{r.colour.customMatch && <span className="ml-1.5 font-semibold text-amber-700">· Custom match</span>}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700 lg:px-6">{r.colour.manufacturer || "None"}</td>
                    <td className="px-4 py-4 text-sm text-gray-700 lg:px-6">
                      {r.specs.length > 1 ? <span className="font-semibold">{r.specs.length} specifications</span> : first?.product ?? <span className="text-gray-400">Select Product</span>}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700 lg:px-6">{r.specs.length > 1 ? "Varies" : first?.sheen ?? "-"}</td>
                    <td className="px-4 py-4 lg:px-6">
                      <SurfaceChips ids={r.surfaces} />
                    </td>
                    <td className="px-4 py-4 lg:px-6">
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-600">
                        <Droplet className="h-3 w-3" /> {r.gallons.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-4 lg:px-6">
                      <div className="flex flex-wrap gap-1">
                        {r.states.length === 0 && <span className="text-xs italic text-gray-400">No specification</span>}
                        {r.states.map((s) => (
                          <Badge key={s} tone={SPEC_STATE[s].tone}>{SPEC_STATE[s].label}</Badge>
                        ))}
                      </div>
                    </td>
                    {canCard && (
                      <td className="px-4 py-4 text-right lg:px-6">
                        <div className="inline-flex items-center gap-1">
                          {editable && (
                            <Tooltip content="Paint with this color">
                              <button onClick={() => onPaint(paintColourId === r.colour.id ? undefined : r.colour.id)} className="rounded-lg p-2 text-green-600 hover:bg-green-50" aria-label={`Paint with ${r.colour.name}`}>
                                <PaintBucket className="h-4 w-4" />
                              </button>
                            </Tooltip>
                          )}
                          <Tooltip content="Edit Color Details">
                            <button onClick={() => setManage({ open: true, colour: r.colour })} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label={`Edit ${r.colour.name}`}>
                              <Edit2 className="h-4 w-4" />
                            </button>
                          </Tooltip>
                        </div>
                      </td>
                    )}
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={9} className="bg-gray-50/60 px-4 pb-4 pt-2 lg:px-6">
                        <SpecList colour={r.colour} specs={r.specs} readOnly={!canCard} onAdd={() => setSpecEditor({ open: true, colourId: r.colour.id })}
                          onEdit={(spec) => setSpecEditor({ open: true, colourId: r.colour.id, spec })} onSend={(spec) => setSendFor({ open: true, specId: spec.id })}
                          onRemove={setRemoving} onHistory={setHistoryFor} canLock={can(user, "colourCard.lockLifespan")} showSample={!snapshot} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rows.length === 0 && <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">No paint colors added yet.</div>}
        {rows.map((r) => (
          <div key={r.colour.id} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 font-mono text-sm font-bold">{r.number}</span>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Job Color</div>
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-900"><Swatch hex={r.colour.hex} size="sm" /> {r.colour.name}</div>
                  <div className="text-xs text-gray-500">{r.colour.manufacturer} · {r.specs[0]?.product ?? "Select Product"}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Est. Gallons</div>
                <div className="text-sm font-bold text-blue-600">{r.gallons.toFixed(1)}</div>
              </div>
            </div>
            <div className="mt-3"><SurfaceChips ids={r.surfaces} /></div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <NewBadge feature={3} />
              {r.states.map((s) => <Badge key={s} tone={SPEC_STATE[s].tone}>{SPEC_STATE[s].label}</Badge>)}
            </div>
            {canCard && (
              <div className="mt-3 flex gap-2">
                {editable && <Button size="sm" onClick={() => onPaint(r.colour.id)}><PaintBucket className="h-3.5 w-3.5" /> Paint</Button>}
                <Button size="sm" onClick={() => setManage({ open: true, colour: r.colour })}><Edit2 className="h-3.5 w-3.5" /> Edit</Button>
                <Button size="sm" onClick={() => setExpanded({ ...expanded, [r.colour.id]: !expanded[r.colour.id] })}><Layers className="h-3.5 w-3.5" /> Specs</Button>
              </div>
            )}
            {expanded[r.colour.id] && (
              <div className="mt-3">
                <SpecList colour={r.colour} specs={r.specs} readOnly={!canCard} onAdd={() => setSpecEditor({ open: true, colourId: r.colour.id })}
                  onEdit={(spec) => setSpecEditor({ open: true, colourId: r.colour.id, spec })} onSend={(spec) => setSendFor({ open: true, specId: spec.id })}
                  onRemove={setRemoving} onHistory={setHistoryFor} canLock={can(user, "colourCard.lockLifespan")} showSample={!snapshot} />
              </div>
            )}
          </div>
        ))}
      </div>

      {canCard && (
        <button onClick={() => setManage({ open: true })} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 py-4 text-sm font-bold text-primary-600 hover:border-primary-300 hover:bg-primary-50/40">
          <Plus className="h-4 w-4" /> Add New Color
        </button>
      )}

      <div className="mt-6" data-tour="approval-panel">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400">
          Colour approval <NewBadge feature={3} />
        </div>
        <ApprovalPanel jobId={job.id} />
      </div>

      <ManageColorModal open={manage.open} onOpenChange={(v) => setManage((m) => ({ ...m, open: v }))} job={job} colour={manage.colour}
        colorNumber={manage.colour ? rows.find((r) => r.colour.id === manage.colour!.id)?.number ?? 1 : rows.length + 1}
        onRemove={manage.colour ? () => { setRemovingColour(manage.colour); setManage({ open: false }); } : undefined} />
      {specEditor.colourId && (
        <SpecEditor open={specEditor.open} onOpenChange={(v) => setSpecEditor((s) => ({ ...s, open: v }))} jobId={job.id} colourId={specEditor.colourId} spec={specEditor.spec} />
      )}
      <SendApprovalModal open={sendFor.open} onOpenChange={(v) => setSendFor({ open: v })} jobId={job.id} preselect={sendFor.specId} />
      <PrintCardModal key={print.layout} open={print.open} onOpenChange={(v) => setPrint((p) => ({ ...p, open: v }))} jobId={job.id} initial={print.layout} />
      <RemoveSpecModal spec={removing} onClose={() => setRemoving(undefined)} />
      <SpecHistoryModal spec={historyFor} onClose={() => setHistoryFor(undefined)} />
      <ConfirmDialog
        open={!!removingColour}
        onOpenChange={(v) => !v && setRemovingColour(undefined)}
        title={`Delete ${removingColour?.name}?`}
        body={specs.some((s) => s.colourId === removingColour?.id) ? "Remove this colour's specification lines first (open the colour row)." : "The colour has no specifications. Removing it is logged."}
        confirmLabel="Delete color"
        onConfirm={() => removingColour && act(removeColour, removingColour.id).ok && toast.success("Color deleted")}
      />
      <ConfirmDialog
        open={confirmVersion}
        onOpenChange={setConfirmVersion}
        tone="primary"
        title={`Create card version ${job.cardVersion + 1}?`}
        body="The current card is saved as read-only history. Approved and sent specifications return to draft: a new version never inherits the customer's signature."
        confirmLabel="Create version"
        onConfirm={() => {
          const res = act(createNewVersion, job.id);
          if (res.ok) {
            setViewVersion(res.value as number);
            toast.success(`Version ${res.value} created`, "Send it for approval when ready.");
          }
        }}
      />
    </EstimateSection>
  );
}

function SurfaceChips({ ids }: { ids: string[] }) {
  const db = useDb((d) => d);
  if (ids.length === 0) return <span className="text-xs italic text-gray-400">No surfaces</span>;
  return (
    <div className="flex min-w-[260px] max-w-sm flex-wrap gap-1">
      {ids.slice(0, 3).map((id) => (
        <span key={id} className="whitespace-nowrap rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-700">
          {surfaceLabel(db, id).replace(" · ", " - ")}
        </span>
      ))}
      {ids.length > 3 && <span className="px-1 text-[11px] font-semibold text-gray-500">+{ids.length - 3} more</span>}
    </div>
  );
}

function SpecList({ colour, specs, readOnly, canLock, showSample, onAdd, onEdit, onSend, onRemove, onHistory }: {
  colour: Colour;
  specs: SpecLine[];
  readOnly: boolean;
  canLock: boolean;
  showSample: boolean;
  onAdd: () => void;
  onEdit: (s: SpecLine) => void;
  onSend: (s: SpecLine) => void;
  onRemove: (s: SpecLine) => void;
  onHistory: (s: SpecLine) => void;
}) {
  const blocked = specs.filter((s) => orderingGaps(s).length > 0).length;
  return (
    <div className="space-y-2 rounded-xl border border-emerald-200 bg-white p-3" data-tour="spec-lines">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
          Specifications <NewBadge feature={3} />
          {blocked > 0 && <span className="normal-case tracking-normal text-amber-700">{blocked} not orderable</span>}
        </div>
        {!readOnly && (
          <Button size="sm" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" /> Add specification
          </Button>
        )}
      </div>
      {specs.length === 0 && <p className="text-xs italic text-gray-400">No specifications yet. A colour with no specification can&apos;t be approved.</p>}
      {specs.map((spec) => (
        <SpecRow key={spec.id} spec={spec} readOnly={readOnly} canLock={canLock} onEdit={() => onEdit(spec)} onSend={() => onSend(spec)} onRemove={() => onRemove(spec)} onHistory={() => onHistory(spec)} />
      ))}
      {colour.customMatch && showSample && (
        <div data-tour="sample-panel">
          <SamplePanel colour={colour} />
        </div>
      )}
    </div>
  );
}

