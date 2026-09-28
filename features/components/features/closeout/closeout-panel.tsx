"use client";
/**
 * NEW (feature 25, component 25.2) — Closeout Confirmation.
 * Host: the work order's "Mark Complete" button (/work-orders/[id]) opens
 * this panel in a drawer. The work order becomes COMPLETED when the job closes.
 *
 * 1. Crew lead confirms, per surface in the approved scope, what was applied.
 * 2. Optional actuals are recorded; missing ones read "Not recorded".
 * 3. The office manager closes the job. Applications join the property record.
 */
import { useState } from "react";
import { AlertTriangle, BadgeCheck, CheckCheck, CircleHelp, ClipboardCheck, ExternalLink, Lock, Pencil, ShieldQuestion } from "lucide-react";
import type { CloseoutRow, Job } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { closeJob, closeoutRowsFor, confirmAllMatching } from "@/features/lib/store/actions/property";
import { can } from "@/features/lib/permissions";
import { AppLink } from "@/features/lib/navigation";
import { byId, surfaceLabel } from "@/features/lib/selectors";
import { dateLong, dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { closeoutBlockers, closeoutRowGaps, CLOSEOUT_FIELD_LABEL } from "@/features/lib/rules/property";
import { Badge, Banner, Button, Card, CardLabel, EmptyState, Field, Input, Modal, RowMenu, Stat, StatStrip, Swatch, Tooltip } from "@/features/components/ui";
import { contactHref } from "@/features/lib/hrefs";
import { fromDateInput, todayInput } from "@/features/components/features/properties/property-shared";
import { CloseoutRowModal, UnknownModal } from "./closeout-modals";

export function CloseoutPanel({ job }: { job: Job }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const rows = closeoutRowsFor(db, job);
  const blockers = closeoutBlockers(job.surfaceIds, rows);
  const closed = job.status === "completed";
  const canConfirm = can(user, "property.confirmApplications") && !closed;
  const canClose = can(user, "property.closeJob");
  const canUnknown = can(user, "property.approveUnknown");
  const confirmed = rows.filter((r) => r.confirmedBy).length;
  const withHours = rows.filter((r) => r.actualHours !== undefined).length;

  const [editing, setEditing] = useState<CloseoutRow>();
  const [unknownFor, setUnknownFor] = useState<CloseoutRow>();
  const [matching, setMatching] = useState(false);
  const [matchDate, setMatchDate] = useState(todayInput());
  const [closing, setClosing] = useState(false);
  const [accepted, setAccepted] = useState("");
  const [attempted, setAttempted] = useState(false);

  const tryClose = () => {
    setAttempted(true);
    if (blockers.length) {
      act(closeJob, job.id); // logs the blocked attempt and names the surfaces
      return;
    }
    setClosing(true);
  };

  return (
    <>
      <p className="mb-4 text-sm text-gray-500">The moment history is created. The crew lead confirms what was actually applied to each surface. Then the Office Manager closes the job, and the work order becomes Completed.</p>
      {!closed && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button disabled={!canConfirm} onClick={() => setMatching(true)}><CheckCheck className="h-4 w-4" /> Confirm all matching</Button>
          <Button variant="primary" disabled={!canClose} onClick={tryClose} title={canClose ? undefined : "Office Manager or Business Owner"} data-tour="close-job">
            <Lock className="h-4 w-4" /> Close job
          </Button>
        </div>
      )}

      <div data-tour="closeout-status">
        {closed ? (
          <Banner
            tone="success"
            className="mb-4"
            title={`Job closed ${dateTime(job.closedAt)} by ${byId(db.users, job.closedBy)?.name}`}
            action={<AppLink href={contactHref(job.customerId, "paint-history", { location: job.propertyId })}><Button size="sm"><ExternalLink className="h-3.5 w-3.5" /> Open paint history</Button></AppLink>}
          >
            {db.applications.filter((a) => a.jobId === job.id).length} applications are now in the paint history for this service location. Later changes are corrections by the Business Owner or Office Manager.
          </Banner>
        ) : blockers.length ? (
          <Banner tone={attempted ? "danger" : "warn"} className="mb-4" title={attempted ? "Closeout blocked" : `${blockers.length} surface${blockers.length === 1 ? "" : "s"} still incomplete`}>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {blockers.map((b) => <li key={b.surfaceId}><strong>{surfaceLabel(db, b.surfaceId)}</strong> — missing {b.missing.join(", ")}</li>)}
            </ul>
            <p className="mt-1">Colour, sheen and completion date are required for every painted surface. Missing hours or gallons never block closeout.</p>
          </Banner>
        ) : (
          <Banner tone="success" className="mb-4" title="Ready to close">Every surface in the approved scope is confirmed by the crew lead. The Office Manager can close the job.</Banner>
        )}
      </div>
      {!can(user, "property.confirmApplications") && !closed && <Banner tone="info" className="mb-4">The crew lead confirms applications. The Office Manager or Business Owner closes the job.</Banner>}

      <StatStrip className="mb-4">
        <Stat label="Surfaces in scope" value={job.surfaceIds.length} hint="from the approved specs" />
        <Stat label="Confirmed" value={`${confirmed} of ${rows.length}`} tone={confirmed === rows.length ? "good" : "brand"} />
        <Stat label="Incomplete" value={blockers.length} tone={blockers.length ? "warn" : "good"} />
        <Stat label="Hours recorded" value={`${withHours} of ${rows.length}`} hint="optional" />
      </StatStrip>

      <Card className="p-5" data-tour="closeout-checklist">
        <CardLabel icon={<ClipboardCheck />}>Closeout checklist</CardLabel>
        <div className="mt-4 space-y-3">
          {rows.length === 0 && <EmptyState icon={<ClipboardCheck />} title="No surfaces in this job's scope" />}
          {rows.map((r) => (
            <RowCard
              key={r.surfaceId}
              row={r}
              closed={closed}
              canConfirm={canConfirm}
              canUnknown={canUnknown && !closed}
              onEdit={() => setEditing(r)}
              onUnknown={() => setUnknownFor(r)}
            />
          ))}
        </div>
      </Card>

      <CloseoutRowModal job={job} row={editing} onClose={() => setEditing(undefined)} />
      <UnknownModal job={job} row={unknownFor} onClose={() => setUnknownFor(undefined)} />

      <Modal
        open={matching}
        onOpenChange={setMatching}
        size="sm"
        title="Confirm all matching"
        description="Confirms every unconfirmed surface whose colour, product, sheen and coats still match the approved specification."
        footer={<><Button onClick={() => setMatching(false)}>Cancel</Button><Button variant="primary" onClick={() => {
          const res = act(confirmAllMatching, job.id, fromDateInput(matchDate) ?? "");
          if (res.ok) {
            toast.success(`${res.value} surface${res.value === 1 ? "" : "s"} confirmed`, "Check the remaining rows one by one.");
            setMatching(false);
          }
        }}>Confirm</Button></>}
      >
        <Field label="Surface completion date" required hint="Used for rows without a date. Feature 27 uses it as the repaint clock's origin.">
          <Input type="date" value={matchDate} max={todayInput()} onChange={(e) => setMatchDate(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={closing}
        onOpenChange={setClosing}
        size="sm"
        title={`Close ${job.id}?`}
        description="Confirmed values become applications in the property record, with the confirming crew lead's name. The job status becomes Completed."
        footer={<><Button onClick={() => setClosing(false)}>Cancel</Button><Button variant="primary" onClick={() => {
          const res = act(closeJob, job.id, fromDateInput(accepted));
          if (res.ok) {
            toast.success("Job closed", `${(res.value as string[]).length} applications added to the property record.`);
            setClosing(false);
          }
        }}><Lock className="h-4 w-4" /> Close job</Button></>}
      >
        <Field label="Customer acceptance date" hint="Only if a sign-off was collected. Leave blank otherwise.">
          <Input type="date" value={accepted} max={todayInput()} onChange={(e) => setAccepted(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}

function RowCard({ row, closed, canConfirm, canUnknown, onEdit, onUnknown }: { row: CloseoutRow; closed: boolean; canConfirm: boolean; canUnknown: boolean; onEdit: () => void; onUnknown: () => void }) {
  const db = useDb((d) => d);
  const gaps = closeoutRowGaps(row);
  const incomplete = gaps.length > 0 || !row.confirmedBy;
  const unk = (f: string) => row.unknowns.find((u) => u.field === f);
  const Val = ({ field, children }: { field: "colour" | "sheen" | "completedAt" | "coats"; children: React.ReactNode }) => {
    const u = field !== "coats" ? unk(field) : undefined;
    if (u) {
      return (
        <Tooltip content={`Unknown approved by ${byId(db.users, u.approvedBy)?.name} for ${u.kind} work. ${u.reason}`}>
          <span className="inline-flex cursor-help items-center gap-1 font-semibold text-amber-700"><ShieldQuestion className="h-3.5 w-3.5" /> Unknown</span>
        </Tooltip>
      );
    }
    if (gaps.includes(field as never)) return <span className="font-semibold text-red-600">Missing</span>;
    return <>{children}</>;
  };
  const NR = ({ v, unit }: { v?: number; unit: string }) => (v === undefined ? <span className="italic text-slate-400">Not recorded</span> : <>{v} {unit}</>);

  return (
    <div className={incomplete && !closed ? "rounded-xl border border-amber-200 bg-amber-50/30 p-4" : "rounded-xl border border-line bg-white p-4"}>
      <div className="flex items-start gap-3">
        <Swatch hex={row.hex} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[14px] font-bold text-ink">{surfaceLabel(db, row.surfaceId)}</span>
            {row.specId && <span className="text-[11px] text-slate-400">{row.specId}</span>}
            {!row.painted ? (
              <Badge tone="gray">Not painted</Badge>
            ) : row.confirmedBy ? (
              <Badge tone="green" icon={<BadgeCheck className="h-3 w-3" />}>Confirmed by {byId(db.users, row.confirmedBy)?.name}</Badge>
            ) : (
              <Badge tone="amber" icon={<AlertTriangle className="h-3 w-3" />}>{gaps.length ? `Missing ${gaps.map((g) => CLOSEOUT_FIELD_LABEL[g]).join(", ")}` : "Awaiting crew confirmation"}</Badge>
            )}
          </div>
          {row.painted ? (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-4 lg:grid-cols-8">
              <Cell label="Colour" className="col-span-2"><Val field="colour">{row.manufacturer} {row.colourName} {row.colourNumber}</Val></Cell>
              <Cell label="Product" className="col-span-2">{row.product || <span className="italic text-slate-400">—</span>}</Cell>
              <Cell label="Sheen"><Val field="sheen">{row.sheen}</Val></Cell>
              <Cell label="Coats"><Val field="coats">{row.coats}</Val></Cell>
              <Cell label="Completed" className="col-span-2"><Val field="completedAt">{dateLong(row.completedAt)}</Val></Cell>
              <Cell label="Hours"><NR v={row.actualHours} unit="hrs" /></Cell>
              <Cell label="Gallons"><NR v={row.actualGallons} unit="gal" /></Cell>
              <Cell label="Photos"><NR v={row.photoCount} unit="" /></Cell>
              <Cell label="Tint formula" className="col-span-2 lg:col-span-5">{row.tintFormula ? row.tintFormula : <span className="italic text-slate-400">Not recorded</span>}</Cell>
            </div>
          ) : (
            <p className="mt-1 text-[12.5px] text-slate-600">Reason: {row.notPaintedReason}</p>
          )}
        </div>
        {!closed && (
          <RowMenu
            items={[
              { label: row.confirmedBy ? "Edit confirmation" : "Confirm surface", icon: <Pencil />, onSelect: onEdit, disabled: !canConfirm, reason: "Crew lead, Office Manager or Owner" },
              { label: "Record Unknown (owner)", icon: <CircleHelp />, onSelect: onUnknown, disabled: !canUnknown, reason: "Business Owner only — legacy or subcontractor work" },
            ]}
          />
        )}
      </div>
      {!closed && canConfirm && !row.confirmedBy && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="primary" onClick={onEdit}><BadgeCheck className="h-3.5 w-3.5" /> Confirm surface</Button>
        </div>
      )}
    </div>
  );
}

function Cell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className="mt-0.5 text-slate-700">{children}</div>
    </div>
  );
}
