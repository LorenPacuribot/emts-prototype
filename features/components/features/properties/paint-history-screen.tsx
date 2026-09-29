"use client";
/**
 * Feature 25 — Historical Property Paint Record.
 * Menu: Properties > {Property} > Paint History
 *
 * Wireframe: property header; ownership period selector; surface tree;
 * application timeline (newest first); gaps panel; corrections panel;
 * evidence panel. Export PDF / CSV and a customer-variant preview.
 */
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle, BadgeCheck, Building, Camera, ChevronDown, Download, ExternalLink, FileText, FlaskConical, History, Home, Layers, Lock, MapPin, MessageSquareWarning,
  Pencil, Plus, Printer, QrCode, Undo2, UserPlus, Wrench,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { Application, Property, Surface } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { sendCorrectionNotice } from "@/features/lib/store/actions/property";
import { can } from "@/features/lib/permissions";
import { AppLink } from "@/features/lib/navigation";
import { byId, currentOwnership, surfaceLabel } from "@/features/lib/selectors";
import { date, dateLong, titleCase } from "@/features/lib/format";
import { downloadCsv } from "@/features/lib/export";
import { toast } from "@/features/lib/toast";
import { actualLabel, inPeriod, newestFirst } from "@/features/lib/rules/property";
import { calcRepaintDate } from "@/features/lib/rules/lifespan";
import { jobSurfaceHours } from "@/features/lib/rules/estimate";
import { PanelHeader as PageHeader } from "@/features/components/features/contacts/details/panel-header";
import { Badge, Banner, Button, Card, CardLabel, EmptyState, IdChip, KV, MicroLabel, RowMenu, Select, Stat, StatStrip, Swatch, Tooltip } from "@/features/components/ui";
import { propertyHref } from "@/features/lib/hrefs";
import { SurfaceTree } from "./surface-tree";
import { AddSurfaceModal, AddressModal, CorrectionModal, RemoveSurfaceModal, ReportedWorkModal, TouchUpModal } from "./history-modals";
import { PropertyRecordModal, type RecordVariant } from "./record-print";
import { Cell, colourText, isFirstPeriod, NotRecorded, periodLabel, VerificationBadge } from "./property-shared";


function pdsLink(product: string) {
  return `https://www.sherwin-williams.com/en-us/product-data-sheets?q=${encodeURIComponent(product)}`;
}

export function PaintHistoryPanel({ property }: { property: Property }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const canCorrect = can(user, "property.correct");
  const canStructure = can(user, "property.editStructure");
  const canLog = can(user, "property.logReportedWork");
  const seeCosts = can(user, "property.seeCosts");

  const current = currentOwnership(property);
  const owner = byId(db.customers, current?.customerId);
  const [periodId, setPeriodId] = useState<string>("all");
  const areas = db.areas.filter((a) => a.propertyId === property.id);
  const surfaces = db.surfaces.filter((s) => s.propertyId === property.id);
  const allApps = db.applications.filter((a) => a.propertyId === property.id);
  const period = property.ownership.find((o) => o.id === periodId);
  const apps = period ? allApps.filter((a) => inPeriod(a, period, isFirstPeriod(property, period.id))) : allApps;
  const corrections = db.corrections.filter((c) => allApps.some((a) => a.id === c.applicationId));

  const firstWithApps = surfaces.find((s) => apps.some((a) => a.surfaceId === s.id))?.id ?? surfaces[0]?.id;
  const [selected, setSelected] = useState<string | undefined>(firstWithApps);
  const surface = byId(surfaces, selected) ?? byId(surfaces, firstWithApps);
  const timeline = surface ? newestFirst(apps.filter((a) => a.surfaceId === surface.id)) : [];
  const confirmed = timeline.filter((a) => a.verification === "confirmed");
  const unverified = timeline.filter((a) => a.verification === "unverified");

  const [correcting, setCorrecting] = useState<Application>();
  const [touchUp, setTouchUp] = useState<Application>();
  const [reported, setReported] = useState(false);
  const [removing, setRemoving] = useState<Surface>();
  const [adding, setAdding] = useState(false);
  const [address, setAddress] = useState(false);
  const [print, setPrint] = useState<{ open: boolean; variant: RecordVariant }>({ open: false, variant: "staff" });
  const correctionsRef = useRef<HTMLDivElement>(null);

  const multi = areas.some((a) => a.building || a.unit);
  const units = new Set(areas.map((a) => a.unit).filter(Boolean));
  const buildings = new Set(areas.map((a) => a.building).filter(Boolean));
  const lastPainted = newestFirst(allApps)[0]?.completedAt;
  const pendingNotices = corrections.filter((c) => c.noticeRequired && !c.noticeSent).length;

  const gaps = useMemo(() => {
    const out: { app: Application; field: string; state: "Unknown" | "Not recorded"; approvedBy?: string; reason?: string }[] = [];
    for (const a of allApps) {
      const exc = (f: string) => a.unknowns?.find((u) => u.field === f);
      if (a.colourName === "Unknown") out.push({ app: a, field: "Colour", state: "Unknown", approvedBy: exc("colour")?.approvedBy, reason: exc("colour")?.reason });
      if (a.sheen === "Unknown") out.push({ app: a, field: "Sheen", state: "Unknown", approvedBy: exc("sheen")?.approvedBy, reason: exc("sheen")?.reason });
      if (a.product === "Unknown") out.push({ app: a, field: "Product", state: "Unknown" });
      if (!a.completedAt) out.push({ app: a, field: "Completion date", state: exc("completedAt") ? "Unknown" : "Not recorded", approvedBy: exc("completedAt")?.approvedBy, reason: exc("completedAt")?.reason });
    }
    return out;
  }, [allApps]);
  const actualsMissing = allApps.filter((a) => a.verification === "confirmed" && a.actualHours === undefined).length;

  function exportCsv() {
    const head = ["Application", "Property", "Building", "Unit", "Room/elevation", "Surface", "Surface status", "Manufacturer", "Colour name", "Colour number", "Product", "Sheen", "Coats", "Completed", "Verification", "Source", "Job", "Confirmed by", "Touch-ups", "Photos", "Tint formula"];
    if (seeCosts) head.push("Actual hours", "Actual gallons");
    const rows = newestFirst(apps).map((a) => {
      const s = byId(db.surfaces, a.surfaceId);
      const ar = byId(db.areas, s?.areaId);
      const r: (string | number | undefined)[] = [a.id, property.id, ar?.building, ar?.unit, ar?.name, s?.name, s?.removedAt ? `Removed ${date(s.removedAt)}` : "Current", a.manufacturer, a.colourName, a.colourNumber, a.product, a.sheen, a.coats, a.completedAt ? date(a.completedAt) : "Not recorded", a.verification === "confirmed" ? "Confirmed" : "Unverified", a.source, a.jobId, byId(db.users, a.confirmedBy)?.name, a.touchUps.length, a.photoCount, a.tintFormula ?? "Not recorded"];
      if (seeCosts) r.push(actualLabel(a.actualHours, "").trim(), actualLabel(a.actualGallons, "").trim());
      return r;
    });
    downloadCsv(`${property.id}-applications.csv`, [head, ...rows]);
    toast.success("CSV exported", `${rows.length} application${rows.length === 1 ? "" : "s"}${seeCosts ? "" : ". Staff-only hours and gallons are not included for your role"}.`);
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <div className="flex items-center gap-2">
            <MicroLabel>Ownership period</MicroLabel>
            <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="h-8 w-auto py-0 text-xs" aria-label="Ownership period">
              <option value="all">All periods (staff view)</option>
              {[...property.ownership].reverse().map((o) => (
                <option key={o.id} value={o.id}>{periodLabel(db, o)}</option>
              ))}
            </Select>
          </div>
        }
        title="Paint History"
        subtitle="What was confirmed, and what is missing, labelled as missing."
        actions={
          <>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button><Printer className="h-4 w-4" /> Export PDF <ChevronDown className="h-3.5 w-3.5" /></Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-48 rounded-xl border border-line bg-white p-1 shadow-xl">
                  {(["staff", "customer"] as const).map((v) => (
                    <DropdownMenu.Item key={v} onSelect={() => setPrint({ open: true, variant: v })} className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100">
                      {v === "staff" ? "Staff record" : "Customer variant"}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <Button onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>
            <Button onClick={() => correctionsRef.current?.scrollIntoView({ behavior: "smooth" })}>
              <History className="h-4 w-4" /> Corrections
              {pendingNotices > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">{pendingNotices}</span>}
            </Button>
            <AppLink href={propertyHref(property.id, "qr-links")}>
              <Button variant="primary"><QrCode className="h-4 w-4" /> QR Links</Button>
            </AppLink>
            <RowMenu
              label="More property actions"
              items={[
                { label: "Preview customer variant", icon: <FileText />, onSelect: () => setPrint({ open: true, variant: "customer" }) },
                { label: "Log customer-reported work", icon: <UserPlus />, onSelect: () => setReported(true), disabled: !canLog, reason: "Estimators, Office Manager or Owner" },
                { label: "Add surface", icon: <Plus />, onSelect: () => setAdding(true), disabled: !canStructure, reason: "Office Manager or Owner" },
                { label: "Correct address", icon: <MapPin />, onSelect: () => setAddress(true), disabled: !canStructure, reason: "Office Manager or Owner" },
              ]}
            />
          </>
        }
      />

      {property.mergedInto && (
        <Banner tone="info" className="mb-4" title={`Merged into ${property.mergedInto}`} action={<AppLink href={propertyHref(property.mergedInto)}><Button size="sm">Open {property.mergedInto}</Button></AppLink>}>
          This identifier is preserved for traceability. Its history now lives on {property.mergedInto}.
        </Banner>
      )}
      {property.mergeCandidateOf && !property.mergedInto && (
        <Banner tone="warn" className="mb-4" title="Possible duplicate — office review required" action={<AppLink href={propertyHref(property.id, "ownership")}><Button size="sm">Review</Button></AppLink>}>
          This looks like the same address as {property.mergeCandidateOf}. A merge needs the Business Owner&apos;s individual approval.
        </Banner>
      )}

      <Card className="mb-4 p-5" data-tour="property-header">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Tooltip content="Stable identifier. It never changes when the address is edited.">
                <span><IdChip icon={<Lock className="h-2.5 w-2.5" />}>{property.id}</IdChip></span>
              </Tooltip>
              <Badge tone="gray" icon={property.type === "single_family" ? <Home className="h-3 w-3" /> : <Building className="h-3 w-3" />}>{titleCase(property.type)}</Badge>
              <Badge tone={multi ? "purple" : "gray"}>{multi ? `Multi-unit · ${buildings.size || 1} building, ${units.size} unit${units.size === 1 ? "" : "s"}` : "Single building"}</Badge>
              {property.mergedFrom?.length ? <Badge tone="indigo">Includes {property.mergedFrom.join(", ")}</Badge> : null}
            </div>
            <div className="mt-2 font-display text-xl font-bold text-ink">{property.address}</div>
            <div className="text-sm text-gray-500">{property.city}, {property.state} {property.zip}</div>
            {property.addressHistory?.length ? (
              <div className="mt-1 text-xs text-gray-400">Earlier address: {property.addressHistory.map((h) => `“${h.address}” (until ${date(h.changedAt)})`).join(", ")}</div>
            ) : null}
          </div>
          <KV
            className="lg:w-[360px]"
            items={[
              ["Current owner", owner?.name ?? "—"],
              ["Ownership start", dateLong(current?.start)],
              ["Ownership periods", property.ownership.length],
              ["Last painted", lastPainted ? dateLong(lastPainted) : "—"],
            ]}
          />
        </div>
      </Card>

      <StatStrip className="mb-4">
        <Stat label="Surfaces" value={surfaces.filter((s) => !s.removedAt).length} hint={`${surfaces.filter((s) => s.removedAt).length} removed`} />
        <Stat label="Applications" value={apps.length} hint={periodId === "all" ? "all periods" : "in this period"} />
        <Stat label="Unverified" value={apps.filter((a) => a.verification === "unverified").length} tone={apps.some((a) => a.verification === "unverified") ? "warn" : "default"} hint="customer-reported" />
        <Stat label="Gaps" value={gaps.length} tone={gaps.length ? "warn" : "good"} hint="Unknown / Not recorded" />
        <Stat label="Notices to send" value={pendingNotices} tone={pendingNotices ? "danger" : "good"} />
      </StatStrip>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
        <Card className="p-4 xl:sticky xl:top-[76px] xl:self-start" data-tour="surface-tree">
          <CardLabel icon={<Layers />} className="mb-3" right={canStructure && <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add</Button>}>
            Surfaces
          </CardLabel>
          <SurfaceTree areas={areas} surfaces={surfaces} apps={apps} selected={surface?.id} onSelect={setSelected} canEdit={canStructure} onRemove={setRemoving} />
        </Card>

        <div className="min-w-0 space-y-4">
          <Card className="p-5" data-tour="app-timeline">
            <CardLabel
              icon={<History />}
              right={surface && canLog && !surface.removedAt && <Button size="sm" onClick={() => setReported(true)}><UserPlus className="h-3.5 w-3.5" /> Log reported work</Button>}
            >
              Application timeline
            </CardLabel>
            {!surface ? (
              <EmptyState className="mt-4" icon={<Layers />} title="Choose a surface" body="Open a surface in the tree to see its applications, newest first." />
            ) : (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={surface.removedAt ? "font-display text-base font-bold text-gray-400 line-through" : "font-display text-base font-bold text-ink"}>{surfaceLabel(db, surface.id)}</span>
                  <IdChip>{surface.id}</IdChip>
                  {surface.removedAt && <Badge tone="red">Removed {dateLong(surface.removedAt)}</Badge>}
                  {surface.replacesSurfaceId && (
                    <button onClick={() => setSelected(surface.replacesSurfaceId)} className="text-xs font-semibold text-brand hover:underline">Replaces {surface.replacesSurfaceId} — view its history</button>
                  )}
                  {surfaces.find((s) => s.replacesSurfaceId === surface.id) && (
                    <button onClick={() => setSelected(surfaces.find((s) => s.replacesSurfaceId === surface.id)!.id)} className="text-xs font-semibold text-brand hover:underline">
                      Replaced by {surfaces.find((s) => s.replacesSurfaceId === surface.id)!.id}
                    </button>
                  )}
                </div>
                {surface.removedAt && <p className="mt-1 text-xs text-gray-500">{surface.removedReason}. Applications are never deleted and stay openable below.</p>}

                <div className="mt-4 space-y-3">
                  {confirmed.length === 0 && unverified.length === 0 && (
                    <EmptyState icon={<History />} title="No applications recorded for this surface" body={period ? "Nothing in the selected ownership period. Try All periods." : "Applications are created when a job is closed out."} />
                  )}
                  {confirmed.map((a, i) => (
                    <ApplicationCard key={a.id} app={a} latest={i === 0} seeCosts={seeCosts} canCorrect={canCorrect} canLog={canLog} onCorrect={() => setCorrecting(a)} onTouchUp={() => setTouchUp(a)} />
                  ))}
                </div>

                {unverified.length > 0 && (
                  <div className="mt-5 rounded-xl border border-dashed border-amber-300 bg-amber-50/40 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" /> Customer-reported work — not crew-confirmed, not under warranty
                    </div>
                    <div className="space-y-3">
                      {unverified.map((a) => (
                        <ApplicationCard key={a.id} app={a} seeCosts={seeCosts} canCorrect={canCorrect} canLog={canLog} onCorrect={() => setCorrecting(a)} onTouchUp={() => setTouchUp(a)} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5" data-tour="gaps">
              <CardLabel icon={<MessageSquareWarning />}>Gaps</CardLabel>
              <p className="mt-1 text-xs text-gray-500">Values recorded as Unknown or Not recorded. Nothing here is estimated.</p>
              <div className="mt-3 space-y-2">
                {gaps.length === 0 && <EmptyState title="No gaps" body="Every application has colour, sheen, product and a completion date." />}
                {gaps.map((g, i) => (
                  <button key={i} onClick={() => setSelected(g.app.surfaceId)} className="flex w-full items-start gap-3 rounded-lg border border-line px-3 py-2 text-left text-xs hover:bg-gray-50">
                    <Badge tone={g.state === "Unknown" ? "amber" : "gray"}>{g.state}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-ink">{g.field} · {surfaceLabel(db, g.app.surfaceId)}</div>
                      <div className="text-gray-500">
                        {g.app.id}
                        {g.approvedBy ? ` · Exception approved by ${byId(db.users, g.approvedBy)?.name}` : g.state === "Unknown" ? " · No owner exception on file" : ""}
                        {g.reason ? ` — ${g.reason}` : ""}
                        {g.app.source ? ` · Source: ${g.app.source}` : ""}
                      </div>
                    </div>
                  </button>
                ))}
                {seeCosts && actualsMissing > 0 && (
                  <p className="pt-1 text-xs text-gray-500">
                    Production hours: <span className="italic">Not recorded</span> on {actualsMissing} confirmed application{actualsMissing === 1 ? "" : "s"}. Optional actuals never block closeout.
                  </p>
                )}
              </div>
            </Card>

            <div ref={correctionsRef} className="scroll-mt-20">
              <Card className="h-full p-5">
                <CardLabel icon={<Pencil />}>Corrections</CardLabel>
                <p className="mt-1 text-xs text-gray-500">Post-close corrections by the Business Owner or Office Manager.</p>
                <div className="mt-3 space-y-2">
                  {corrections.length === 0 && <EmptyState title="No corrections" body="Use Correct on an application to fix a recorded value." />}
                  {corrections.map((c) => {
                    const a = byId(db.applications, c.applicationId);
                    return (
                      <div key={c.id} className="rounded-lg border border-line px-3 py-2.5 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-ink">{c.field}</span>
                          <IdChip>{c.applicationId}</IdChip>
                          <span className="text-xs text-gray-400">{a ? surfaceLabel(db, a.surfaceId) : ""}</span>
                        </div>
                        <div className="mt-1 text-gray-600">
                          <span className="line-through decoration-gray-400">{c.oldValue}</span> → <span className="font-semibold text-ink">{c.newValue}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {byId(db.users, c.by)?.name} · {dateLong(c.at)} · {c.reason}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          {c.noticeRequired === false || (!c.noticeRequired && !c.noticeSent) ? (
                            <Badge tone="gray">No notice needed</Badge>
                          ) : c.noticeSent ? (
                            <Badge tone="green" className="whitespace-normal" icon={<BadgeCheck className="h-3 w-3" />}>Customer notice sent{c.noticeSentAt ? ` ${date(c.noticeSentAt)}` : ""}</Badge>
                          ) : (
                            <>
                              <Badge tone="amber">Customer notice not yet sent</Badge>
                              {canCorrect && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => {
                                    const res = act(sendCorrectionNotice, c.id);
                                    if (res.ok) toast.success("Correction notice sent", `Sent to ${res.value} by ${user.name}.`);
                                  }}
                                >
                                  Send notice
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <CorrectionModal app={correcting} onClose={() => setCorrecting(undefined)} />
      <TouchUpModal app={touchUp} onClose={() => setTouchUp(undefined)} />
      <ReportedWorkModal open={reported} onClose={() => setReported(false)} property={property} defaultSurfaceId={surface?.removedAt ? undefined : surface?.id} />
      <RemoveSurfaceModal surface={removing} onClose={() => setRemoving(undefined)} />
      <AddSurfaceModal open={adding} onClose={() => setAdding(false)} property={property} onAdded={setSelected} />
      <AddressModal open={address} onClose={() => setAddress(false)} property={property} />
      <PropertyRecordModal key={print.variant + String(print.open)} open={print.open} onClose={() => setPrint((p) => ({ ...p, open: false }))} property={property} initial={print.variant} />
    </>
  );
}

function ApplicationCard({ app, latest, seeCosts, canCorrect, canLog, onCorrect, onTouchUp }: {
  app: Application;
  latest?: boolean;
  seeCosts: boolean;
  canCorrect: boolean;
  canLog: boolean;
  onCorrect: () => void;
  onTouchUp: () => void;
}) {
  const db = useDb((d) => d);
  const corrections = db.corrections.filter((c) => c.applicationId === app.id);
  const corrected = (field: string) => corrections.find((c) => c.field === field);
  const Mark = ({ field }: { field: string }) => {
    const c = corrected(field);
    if (!c) return null;
    return (
      <Tooltip content={`Corrected ${date(c.at)} — was “${c.oldValue}”. ${c.reason}`}>
        <Undo2 className="ml-1 inline h-3 w-3 cursor-help text-amber-600" aria-label="Corrected" />
      </Tooltip>
    );
  };
  const exc = (f: string) => app.unknowns?.find((u) => u.field === f);
  const unknownTip = (f: string) => {
    const e = exc(f);
    return e ? `Unknown approved by ${byId(db.users, e.approvedBy)?.name} (${e.kind}). ${e.reason}` : undefined;
  };
  const job = app.jobId && byId(db.jobs, app.jobId);
  // Expected life and repaint date, by the same rule the repaint alerts use (patent 25, 27).
  const surface = byId(db.surfaces, app.surfaceId);
  const area = surface && byId(db.areas, surface.areaId);
  const repaint = area ? calcRepaintDate(app, area, db.lifespanLibrary, surface) : undefined;
  const estHours = job && surface ? jobSurfaceHours(db, job.id, surface) : undefined;

  return (
    <div className={latest ? "rounded-xl border border-blue-100 bg-brand-soft/30 p-4" : "rounded-xl border border-line bg-white p-4"}>
      <div className="flex items-start gap-3">
        <Swatch hex={app.hex} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {unknownTip("colour") ? (
              <Tooltip content={unknownTip("colour")}><span className="cursor-help font-display text-base font-bold text-ink underline decoration-dotted">{colourText(app)}</span></Tooltip>
            ) : (
              <span className="font-display text-base font-bold text-ink">{colourText(app)}</span>
            )}
            <Mark field="Colour" />
            <VerificationBadge app={app} />
            {latest && <Badge tone="blue">Latest</Badge>}
            <IdChip>{app.id}</IdChip>
          </div>
          <div className="text-xs text-gray-500">
            {app.manufacturer}
            {app.source && ` · Source: ${app.source}`}
            {job ? <> · <AppLink className="font-semibold text-brand hover:underline" href={`/jobs/${encodeURIComponent(job.id)}`}>{job.id}</AppLink></> : app.jobId ? ` · ${app.jobId}` : ""}
          </div>
        </div>
        <RowMenu
          items={[
            { label: "Correct field", icon: <Pencil />, onSelect: onCorrect, disabled: !canCorrect, reason: "Business Owner or Office Manager" },
            { label: "Log touch-up", icon: <Wrench />, onSelect: onTouchUp, disabled: !canLog, reason: "Estimators, Office Manager or Owner" },
          ]}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
        <Cell label="Product">{app.product === "Unknown" ? <NotRecorded text="Unknown" /> : app.product}<Mark field="Product" /></Cell>
        <Cell label="Sheen">{app.sheen === "Unknown" ? <NotRecorded text="Unknown" /> : app.sheen}<Mark field="Sheen" /></Cell>
        <Cell label="Coats">{app.coats}<Mark field="Coats" /></Cell>
        <Cell label="Surface completed">{app.completedAt ? dateLong(app.completedAt) : <NotRecorded />}<Mark field="Completion date" /></Cell>
        <Cell label="Confirmed by">{app.confirmedBy ? byId(db.users, app.confirmedBy)?.name : <NotRecorded text={app.verification === "unverified" ? "Not crew-confirmed" : "Not recorded"} />}</Cell>
        <Cell label="Customer accepted">{app.customerAcceptedAt ? dateLong(app.customerAcceptedAt) : <NotRecorded />}</Cell>
        <Cell label="Preparation">{app.prepQuality === "good" ? "Good" : app.prepQuality === "poor" ? "Poor" : <NotRecorded />}</Cell>
        <Cell label="Expected life">
          {repaint?.years !== undefined ? (
            <Tooltip content={repaint.basis.join(" · ")}><span className="cursor-help underline decoration-dotted">{repaint.years} yrs</span></Tooltip>
          ) : <NotRecorded />}
        </Cell>
        <Cell label="Repaint due">{repaint?.dueDate ? dateLong(repaint.dueDate) : <NotRecorded text={repaint?.unresolved ? "Not calculated" : "Not recorded"} />}</Cell>
      </div>

      {app.touchUps.length > 0 && (
        <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
          <MicroLabel>Touch-ups on this application</MicroLabel>
          {app.touchUps.map((t, i) => (
            <div key={i} className="mt-1 text-xs text-gray-600">{dateLong(t.date)} — {t.note}{t.by ? ` (${byId(db.users, t.by)?.name})` : ""}</div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-xs">
        <span className="flex items-center gap-1.5 text-gray-600"><Camera className="h-3.5 w-3.5 text-gray-400" /> {app.photoCount} photo{app.photoCount === 1 ? "" : "s"}<Mark field="Photographs" /></span>
        <span className="flex items-center gap-1.5 text-gray-600"><FlaskConical className="h-3.5 w-3.5 text-gray-400" /> Tint {app.tintFormula ?? <NotRecorded />}</span>
        {app.product !== "Unknown" && app.verification === "confirmed" && (
          <a href={pdsLink(app.product)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-semibold text-brand hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> Product data sheet <Badge tone="dark" className="ml-1">Staff-only</Badge>
          </a>
        )}
        {seeCosts && (
          <span className="flex items-center gap-2 text-gray-600">
            <Badge tone="gray" icon={<Lock className="h-3 w-3" />}>Staff-only</Badge>
            {estHours !== undefined && <>Est. hours {Math.round(estHours * 10) / 10} · </>}
            Actual hours {app.actualHours === undefined ? <NotRecorded /> : app.actualHours} · Gallons {app.actualGallons === undefined ? <NotRecorded /> : app.actualGallons}
            {surface?.areaSqft ? ` · ${surface.areaSqft} sq ft` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
