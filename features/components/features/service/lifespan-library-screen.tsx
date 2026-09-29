"use client";
/**
 * Feature 27 — Lifespan Library (27.1) and schedule records (27.2).
 * Menu: Service > Lifespan Library
 *
 * Defaults per room / surface type and the adjustment rules, held as a
 * versioned set. Only the business owner edits. A change publishes a new
 * version and affects future applications only. The owner may explicitly
 * select historical records to recalculate; there is no bulk reset.
 */
import { useMemo, useState } from "react";
import { BookOpen, Calculator, Check, GitBranch, Lock, Pencil, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import type { LifespanLibrary, ProductLifespanDefault, RepaintSchedule } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { decideExtension, publishLibrary, recalculateSelected, type LibraryDraft } from "@/features/lib/store/actions/service";
import { calculateSchedule, effectiveDue } from "@/features/lib/rules/alerts";
import { labelRoomType, labelSurfaceType } from "@/features/lib/rules/lifespan";
import { byId, propertyAddress, surfaceLabel } from "@/features/lib/selectors";
import { can } from "@/features/lib/permissions";
import { date, dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { PageHeader } from "@/features/components/layout/screen";
import {
  Badge, Banner, Button, Card, CardLabel, Checkbox, EmptyState, Field, IdChip, Input, Modal, Select, Table, TD, TH, THead, TR, Textarea,
} from "@/features/components/ui";
import { ServiceFrame } from "./service-frame";
import { ExtensionModal } from "./alert-modals";
import { usText } from "@/features/lib/display-text";

export function LifespanLibraryScreen() {
  return (
    <ServiceFrame tab="library">
      <Library />
    </ServiceFrame>
  );
}

function Library() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const lib = db.lifespanLibrary;
  const owner = can(user, "alerts.editLibrary");
  const [edit, setEdit] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [recalc, setRecalc] = useState(false);
  const [extFor, setExtFor] = useState<RepaintSchedule>();
  const schedules = useMemo(() => [...(db.repaintSchedules ?? [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [db.repaintSchedules]);
  const pending = schedules.filter((s) => s.extension?.status === "pending");
  const history = [...(db.lifespanHistory ?? [])].reverse();

  return (
    <>
      <PageHeader
        title="Lifespan Library"
        subtitle="How long paint lasts, from our field experience. Used to estimate service timing — never shown to customers as a warranty."
        actions={owner ? <Button variant="primary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Edit defaults</Button> : undefined}
      />
      <Banner tone="success" className="mb-4" title={`Rule version ${lib.version} published ${date(lib.updatedAt)} by ${byId(db.users, lib.updatedBy)?.name}`}>
        {lib.note ?? "Current rule set."} Every calculated date stores the version that produced it.
      </Banner>
      {!owner && (
        <Banner tone="info" className="mb-4" title="Read-only">
          Only the business owner changes library defaults and adjustment values, and only the owner selects historical records to recalculate.
        </Banner>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <CardLabel icon={<BookOpen />}>Default intervals</CardLabel>
          <Table className="mt-3">
            <THead><tr><TH>Room or surface type</TH><TH>Interval</TH></tr></THead>
            <tbody>
              {lib.defaults.map((d) => (
                <TR key={d.roomType}><TD>{labelRoomType(d.roomType)}</TD><TD className="font-semibold text-ink">{d.years} years</TD></TR>
              ))}
              {(lib.surfaceDefaults ?? []).map((d) => (
                <TR key={d.surfaceType}><TD>{labelSurfaceType(d.surfaceType)}s (any room) <Badge tone="gray" className="ml-1">surface type wins</Badge></TD><TD className="font-semibold text-ink">{d.years} years</TD></TR>
              ))}
              {(lib.productDefaults ?? []).map((d) => (
                <TR key={`${d.manufacturer}|${d.productLine}|${d.product ?? ""}|${d.surfaceType ?? ""}`}>
                  <TD>
                    {d.product ?? `${d.productLine} line (any product)`}{d.surfaceType ? ` on ${labelSurfaceType(d.surfaceType).toLowerCase()}` : ""} <span className="text-xs text-gray-500">· {d.manufacturer}</span>
                    <Badge tone="blue" className="ml-1">{d.surfaceType ? "product + surface wins" : d.product ? "product wins" : "product line wins"}</Badge>
                  </TD>
                  <TD className="font-semibold text-ink">{d.years} years</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card className="p-4">
          <CardLabel icon={<Calculator />}>Adjustment rules (applied in this order, each once)</CardLabel>
          <ol className="mt-3 space-y-2 text-xs">
            <Rule n={1} text="Start with the color card lifespan; else product, product line, surface type, then room" value="—" />
            <Rule n={2} text="South or west exterior exposure (counts once, even if both)" value={`−${lib.southWestDeduction} yr`} />
            <Rule n={3} text="Premium product tier" value={`+${lib.premiumBonus} yr`} />
            <Rule n={4} text="Poor preparation or failing coating (counts once)" value={`−${lib.poorPrepDeduction} yrs`} />
          </ol>
          <p className="mt-3 text-xs text-gray-500">Coats and color are never factors. Day of month is kept where possible, else the last day of the month. Advance notice: 9 months commercial (wins), 6 exterior, 3 interior.</p>
        </Card>
      </div>

      {pending.length > 0 && (
        <Card className="mt-4 p-4">
          <CardLabel icon={<Sparkles />} right={<Badge tone="amber">{pending.length} pending</Badge>}>Inspection extensions awaiting the owner</CardLabel>
          <div className="mt-3 space-y-2">
            {pending.map((s) => (
              <div key={s.id} className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 sm:flex-row sm:items-center">
                <div className="flex-1 text-xs">
                  <div className="font-semibold text-ink">{surfaceLabel(db, s.surfaceId)} · {propertyAddress(byId(db.properties, s.propertyId))}</div>
                  <div className="text-gray-600">
                    {date(s.dueDate)} → <strong>{date(s.extension!.proposedDate)}</strong> · proposed by {byId(db.users, s.extension!.proposedBy)?.name} · photo {s.extension!.photoId} taken {date(s.extension!.photoDate)} — {s.extension!.reason}
                  </div>
                </div>
                {can(user, "alerts.approveExtension") ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="success" onClick={() => act(decideExtension, s.id, true).ok && toast.success("Extension approved")}><Check className="h-3.5 w-3.5" /> Approve</Button>
                    <Button size="sm" onClick={() => act(decideExtension, s.id, false, "Rejected from the library review").ok && toast.success("Extension rejected")}><X className="h-3.5 w-3.5" /> Reject</Button>
                  </div>
                ) : (
                  <Badge tone="amber">Awaiting owner</Badge>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mt-4 p-4">
        <CardLabel
          icon={<RefreshCw />}
          right={can(user, "alerts.recalculate") ? (
            <Button size="sm" variant="primary" disabled={!sel.length} onClick={() => setRecalc(true)}>
              <RefreshCw className="h-3.5 w-3.5" /> Recalculate selected ({sel.length})
            </Button>
          ) : undefined}
        >
          Stored expected dates
        </CardLabel>
        <p className="mt-1 text-xs text-gray-500">Library changes never move these. {can(user, "alerts.recalculate") ? "Tick the records to recalculate under the current version — there is no select-all." : ""}</p>
        {schedules.length === 0 ? (
          <EmptyState className="mt-3" icon={<Calculator />} title="No stored dates yet" body="Dates are stored at closeout and by the nightly run." />
        ) : (
          <Table className="mt-3">
            <THead>
              <tr>
                {can(user, "alerts.recalculate") && <TH className="w-8" />}
                <TH>Surface</TH><TH>Property</TH><TH>Completed</TH><TH>Expected</TH><TH>Interval</TH><TH>Rule</TH><TH>Basis</TH><TH />
              </tr>
            </THead>
            <tbody>
              {schedules.map((s) => {
                const stale = s.ruleVersion !== lib.version;
                return (
                  <TR key={s.id}>
                    {can(user, "alerts.recalculate") && (
                      <TD><Checkbox checked={sel.includes(s.id)} onCheckedChange={(v) => setSel((x) => (v ? [...x, s.id] : x.filter((y) => y !== s.id)))} /></TD>
                    )}
                    <TD><div className="font-semibold text-ink">{surfaceLabel(db, s.surfaceId)}</div><div className="text-xs text-gray-500">{s.surfaceId}</div></TD>
                    <TD className="text-xs">{byId(db.properties, s.propertyId)?.address}</TD>
                    <TD>{date(s.completedAt)}</TD>
                    <TD className="font-semibold text-ink">
                      {date(effectiveDue(s))}
                      {s.extension?.status === "approved" && <div className="text-xs font-normal text-green-700">extended from {date(s.dueDate)}</div>}
                      {s.extension?.status === "pending" && <div className="text-xs font-normal text-amber-700">extension pending</div>}
                      {!!s.recalculated?.length && <div className="text-xs font-normal text-gray-500">was {date(s.recalculated[s.recalculated.length - 1].oldDue)}</div>}
                    </TD>
                    <TD>{s.years} yrs</TD>
                    <TD><Badge tone={stale ? "gray" : "blue"}>v{s.ruleVersion}</Badge></TD>
                    <TD className="max-w-[320px] whitespace-normal text-xs text-gray-500">{usText(s.basis.join(" · "))}</TD>
                    <TD>
                      {can(user, "alerts.proposeExtension") && !s.extension?.status?.match(/pending|approved/) && (
                        <Button size="sm" variant="ghost" onClick={() => setExtFor(s)}><Sparkles className="h-3.5 w-3.5" /> Extend</Button>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <CardLabel icon={<GitBranch />}>Rule version history</CardLabel>
          <ul className="mt-3 space-y-2 text-xs">
            <li className="rounded-lg border border-blue-100 bg-brand-soft/40 px-3 py-2"><strong>v{lib.version}</strong> (current) · {date(lib.updatedAt)} · {lib.note}</li>
            {history.map((h) => (
              <li key={h.version} className="rounded-lg border border-line px-3 py-2 text-gray-600">
                <strong className="text-ink">v{h.version}</strong> · {date(h.updatedAt)} · {byId(db.users, h.updatedBy)?.name} · {h.note ?? "—"}
                <div className="text-xs text-gray-500">{h.defaults.map((d) => `${labelRoomType(d.roomType)} ${d.years}`).join(" · ")}</div>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <CardLabel icon={<RefreshCw />}>Historical recalculations</CardLabel>
          {(db.recalculations ?? []).length === 0 ? (
            <p className="mt-3 text-xs italic text-gray-500">None yet. Old dates are always kept when the owner recalculates.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {(db.recalculations ?? []).map((r) => (
                <li key={r.id} className="rounded-lg border border-line p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2"><IdChip>{r.id}</IdChip> {dateTime(r.at)} · {byId(db.users, r.by)?.name} · {r.items.length} records → v{r.toVersion}</div>
                  <div className="mt-1 text-gray-600">Reason: {r.reason}</div>
                  <ul className="mt-1 text-xs text-gray-500">
                    {r.items.map((i) => <li key={i.scheduleId}>{i.surfaceId}: {date(i.oldDue)} (v{i.oldVersion}) → {date(i.newDue)}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {edit && <EditLibraryModal lib={lib} onClose={() => setEdit(false)} />}
      <RecalcModal open={recalc} ids={sel} onClose={() => setRecalc(false)} onDone={() => setSel([])} />
      <ExtensionModal schedule={extFor} onClose={() => setExtFor(undefined)} />
    </>
  );
}

function Rule({ n, text, value }: { n: number; text: string; value: string }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">{n}</span>
      <span className="flex-1">{text}</span>
      <span className="font-bold text-ink">{value}</span>
    </li>
  );
}

function EditLibraryModal({ lib, onClose }: { lib: LifespanLibrary; onClose: () => void }) {
  const [draft, setDraft] = useState<LibraryDraft>({
    defaults: lib.defaults.map((d) => ({ ...d })),
    surfaceDefaults: (lib.surfaceDefaults ?? []).map((d) => ({ ...d })),
    productDefaults: (lib.productDefaults ?? []).map((d) => ({ ...d })),
    southWestDeduction: lib.southWestDeduction,
    premiumBonus: lib.premiumBonus,
    poorPrepDeduction: lib.poorPrepDeduction,
  });
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<{ field?: string; message: string }>();
  const submit = () => {
    const res = act(publishLibrary, draft, reason);
    if (!res.ok) return setErr({ field: res.field, message: res.error });
    toast.success(`Rule version ${res.value} published`, "Applies to future applications only. No stored date moved.");
    onClose();
  };
  const num = (v: string) => (v === "" ? NaN : Number(v));
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="lg" title="Edit library defaults"
      description="Saving publishes a new rule version. Existing expected dates do not move."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}><Lock className="h-4 w-4" /> Publish version {lib.version + 1}</Button></>}>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {draft.defaults.map((d, i) => (
            <Field key={d.roomType} label={`${labelRoomType(d.roomType)} (years)`} error={err?.field === `years-${d.roomType}` ? err.message : undefined}>
              <Input type="number" min={1} step={0.5} value={Number.isNaN(d.years) ? "" : d.years} invalid={err?.field === `years-${d.roomType}`}
                onChange={(e) => setDraft((x) => ({ ...x, defaults: x.defaults.map((y, j) => (j === i ? { ...y, years: num(e.target.value) } : y)) }))} />
            </Field>
          ))}
          {draft.surfaceDefaults.map((d, i) => (
            <Field key={d.surfaceType} label={`${labelSurfaceType(d.surfaceType)}s — any room (years)`} error={err?.field === `years-${d.surfaceType}` ? err.message : undefined}>
              <Input type="number" min={1} step={0.5} value={Number.isNaN(d.years) ? "" : d.years}
                onChange={(e) => setDraft((x) => ({ ...x, surfaceDefaults: x.surfaceDefaults.map((y, j) => (j === i ? { ...y, years: num(e.target.value) } : y)) }))} />
            </Field>
          ))}
        </div>
        <ProductDefaultsEditor
          rows={draft.productDefaults}
          errField={err?.field}
          errMessage={err?.message}
          onChange={(productDefaults) => setDraft((x) => ({ ...x, productDefaults }))}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {([["southWestDeduction", "South/west deduction"], ["premiumBonus", "Premium bonus"], ["poorPrepDeduction", "Poor prep deduction"]] as const).map(([k, label]) => (
            <Field key={k} label={`${label} (years)`} error={err?.field === k ? err.message : undefined}>
              <Input type="number" min={0} step={0.5} value={Number.isNaN(draft[k]) ? "" : draft[k]} onChange={(e) => setDraft((x) => ({ ...x, [k]: num(e.target.value) }))} />
            </Field>
          ))}
        </div>
        <Field label="Reason" required error={err?.field === "reason" ? err.message : undefined}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} invalid={err?.field === "reason"} placeholder="e.g. Bathrooms failing early in our 2021–2024 jobs" />
        </Field>
        {err && !err.field && <Banner tone="danger">{err.message}</Banner>}
      </div>
    </Modal>
  );
}

const SURFACE_TYPES = ["walls", "ceiling", "trim", "door", "body", "siding", "cabinets"] as const;

/** Product and product-line defaults: most specific wins over surface and room. */
function ProductDefaultsEditor({ rows, errField, errMessage, onChange }: {
  rows: LibraryDraft["productDefaults"];
  errField?: string;
  errMessage?: string;
  onChange: (rows: LibraryDraft["productDefaults"]) => void;
}) {
  const catalog = useDb((d) => d.catalog);
  const key = (d: ProductLifespanDefault) => `${d.manufacturer}|${d.productLine}|${d.product ?? ""}|${d.surfaceType ?? ""}`;
  const options = useMemo(() => {
    const lines = Array.from(new Map(catalog.map((c) => [`${c.manufacturer}|${c.productLine}|`, { manufacturer: c.manufacturer, productLine: c.productLine }])).values());
    return [
      ...lines.map((l) => ({ value: `${l.manufacturer}|${l.productLine}|`, label: `${l.productLine} line (any product) · ${l.manufacturer}` })),
      ...catalog.map((c) => ({ value: `${c.manufacturer}|${c.productLine}|${c.product}`, label: `${c.product} · ${c.manufacturer}` })),
    ];
  }, [catalog]);
  const [pick, setPick] = useState("");
  const [surface, setSurface] = useState("");
  const duplicate = !!pick && rows.some((r) => key(r) === `${pick}|${surface}`);
  const num = (v: string) => (v === "" ? NaN : Number(v));
  const add = () => {
    if (!pick) return;
    if (duplicate) return;
    const [manufacturer, productLine, product] = pick.split("|");
    onChange([...rows, { manufacturer, productLine, product: product || undefined, surfaceType: (surface || undefined) as ProductLifespanDefault["surfaceType"], years: 7 }]);
    setPick("");
    setSurface("");
  };
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-gray-600">Product and product-line defaults <span className="font-normal text-gray-500">— win over surface and room defaults; a product on one surface type wins over all</span></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((d, i) => (
          <Field key={key(d)} label={`${d.product ?? `${d.productLine} line`}${d.surfaceType ? ` on ${labelSurfaceType(d.surfaceType).toLowerCase()}` : ""} (years)`} error={errField === `years-${key(d)}` ? errMessage : undefined}>
            <div className="flex gap-2">
              <Input type="number" min={1} step={0.5} value={Number.isNaN(d.years) ? "" : d.years} invalid={errField === `years-${key(d)}`}
                onChange={(e) => onChange(rows.map((y, j) => (j === i ? { ...y, years: num(e.target.value) } : y)))} />
              <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0" aria-label={`Remove ${d.product ?? d.productLine}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </Field>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Add product default" className="min-w-0 flex-1">
          <option value="">Add a product or product line…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        <Select value={surface} onChange={(e) => setSurface(e.target.value)} aria-label="On surface type" className="w-40">
          <option value="">On any surface</option>
          {SURFACE_TYPES.map((t) => <option key={t} value={t}>On {labelSurfaceType(t).toLowerCase()}</option>)}
        </Select>
        <Button onClick={add} disabled={!pick || duplicate}><Plus className="h-4 w-4" /> Add</Button>
      </div>
      {duplicate && <p className="mt-1 text-xs text-amber-700">That product and surface is already listed. Change its years above.</p>}
    </div>
  );
}

function RecalcModal({ open, ids, onClose, onDone }: { open: boolean; ids: string[]; onClose: () => void; onDone: () => void }) {
  const db = useDb((d) => d);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string>();
  const rows = ids.map((id) => {
    const s = byId(db.repaintSchedules ?? [], id)!;
    const surface = byId(db.surfaces, s?.surfaceId);
    const area = byId(db.areas, surface?.areaId);
    const app = byId(db.applications, s?.applicationId);
    const calc = surface && area && app ? calculateSchedule(surface, area, app, db.lifespanLibrary) : undefined;
    return { s, next: calc?.dueDate };
  }).filter((r) => r.s);
  const submit = () => {
    const res = act(recalculateSelected, ids, reason);
    if (!res.ok) return setErr(res.error);
    toast.success(`Recalculated ${rows.length} record${rows.length === 1 ? "" : "s"}`, `Old dates kept in ${res.value}.`);
    setReason("");
    onDone();
    onClose();
  };
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={`Recalculate ${ids.length} selected record${ids.length === 1 ? "" : "s"}`}
      description={`Under rule version ${db.lifespanLibrary.version}. Only these records change. Old date, new date, the selection, you and your reason are all kept.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Recalculate</Button></>}>
      <div className="space-y-4">
        <Table>
          <THead><tr><TH>Surface</TH><TH>Current</TH><TH>New</TH></tr></THead>
          <tbody>
            {rows.map(({ s, next }) => (
              <TR key={s.id}>
                <TD>{surfaceLabel(db, s.surfaceId)}</TD>
                <TD>{date(s.dueDate)} (v{s.ruleVersion})</TD>
                <TD className={next !== s.dueDate ? "font-semibold text-brand" : ""}>{date(next)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
        <Field label="Reason" required error={err}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} invalid={!!err} placeholder="e.g. Apply the new bathroom interval to these two early failures" />
        </Field>
      </div>
    </Modal>
  );
}
