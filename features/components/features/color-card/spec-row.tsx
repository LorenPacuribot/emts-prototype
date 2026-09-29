"use client";
/**
 * Feature 3 — one specification line under a colour, and its history.
 * Used by the Paint Color Card on Estimate Details (NEW specification rows).
 */
import { useMemo } from "react";
import { Check, CircleSlash, Copy, History, Layers, Lock, Pencil, Send, Trash2 } from "lucide-react";
import type { CardSnapshot, SpecLine } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import { duplicateSpec, toggleLifespanLock } from "@/features/lib/store/actions/color-card";
import { byId, orderingGaps } from "@/features/lib/selectors";
import { SPEC_STATE } from "@/features/lib/status";
import { dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { Badge, MicroLabel, Modal, RowMenu, Tooltip } from "@/features/components/ui";

export function SpecRow({ spec, readOnly, canLock, onEdit, onSend, onRemove, onHistory }: {
  spec: SpecLine;
  readOnly: boolean;
  canLock: boolean;
  onEdit: () => void;
  onSend: () => void;
  onRemove: () => void;
  onHistory: () => void;
}) {
  const db = useDb((d) => d);
  const state = SPEC_STATE[spec.state];
  const gaps = orderingGaps(spec);
  const orderable = gaps.length === 0;
  const surfaces = spec.surfaceIds.map((id) => byId(db.surfaces, id)?.name).filter(Boolean);

  return (
    <div className="rounded-lg border border-line bg-white p-3" data-tour={`spec-${spec.id}`}>
      <div className="flex items-start gap-3">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4 lg:grid-cols-7">
          <Cell label="Spec">
            <span className="font-bold text-ink">{spec.id}</span>
          </Cell>
          <Cell label="Sheen">{spec.sheen ?? <Missing />}</Cell>
          <Cell label="Coats">{spec.coats ?? <Missing />}</Cell>
          <Cell label="Primer" className="col-span-2 sm:col-span-1 lg:col-span-2">
            {spec.primer ? <span className="line-clamp-2">{spec.primer}</span> : <Missing text="Blank — blocks approval" />}
          </Cell>
          <Cell label="Lifespan">
            <span className="inline-flex items-center gap-1">
              {spec.lifespanYears} yrs
              {spec.lifespanLocked && (
                <Tooltip content="Locked by owner override">
                  <Lock className="h-3 w-3 text-gray-400" />
                </Tooltip>
              )}
            </span>
          </Cell>
          <Cell label="State">
            <Badge tone={state.tone}>{state.label}</Badge>
          </Cell>
          <Cell label="Coat sequence" className="col-span-2 sm:col-span-4 lg:col-span-4">
            {spec.coatSequence.length ? spec.coatSequence.join(" → ") : <Missing />}
          </Cell>
          <Cell label="Surfaces" className="col-span-2 sm:col-span-2 lg:col-span-2">
            {surfaces.length ? surfaces.join(", ") : <Missing text="None assigned" />}
          </Cell>
          <Cell label="Ordering">
            {orderable ? (
              <span className="inline-flex items-center gap-1 font-semibold text-green-700">
                <Check className="h-3.5 w-3.5" /> Orderable
              </span>
            ) : (
              <Tooltip content={`Not orderable — missing ${gaps.join(", ")}`}>
                <span className="inline-flex cursor-help items-center gap-1 whitespace-nowrap font-semibold text-amber-700">
                  <CircleSlash className="h-3.5 w-3.5" /> Not orderable
                </span>
              </Tooltip>
            )}
          </Cell>
        </div>
        {!readOnly && (
          <RowMenu
            items={[
              { label: "Edit", icon: <Pencil />, onSelect: onEdit },
              { label: "Duplicate", icon: <Copy />, onSelect: () => act(duplicateSpec, spec.id).ok && toast.success("Specification duplicated", "Assign surfaces to the copy.") },
              { label: "Assign Surfaces", icon: <Layers />, onSelect: onEdit },
              { label: "Send for approval", icon: <Send />, onSelect: onSend, disabled: spec.state !== "draft", reason: spec.state === "pending_sample" ? "Waiting on custom sample" : `Already ${state.label.toLowerCase()}` },
              { label: "View History", icon: <History />, onSelect: onHistory },
              ...(canLock ? [{ label: spec.lifespanLocked ? "Unlock lifespan" : "Lock lifespan (owner)", icon: <Lock />, onSelect: () => act(toggleLifespanLock, spec.id) }] : []),
              { label: "Remove", icon: <Trash2 />, danger: true, onSelect: onRemove },
            ]}
          />
        )}
      </div>
    </div>
  );
}

function Cell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xxs font-bold uppercase tracking-[0.12em] text-gray-400">{label}</div>
      <div className="mt-0.5 text-gray-700">{children}</div>
    </div>
  );
}

function Missing({ text = "Not set" }: { text?: string }) {
  return <span className="italic text-red-500">{text}</span>;
}

export function SpecHistoryModal({ spec, onClose }: { spec?: SpecLine; onClose: () => void }) {
  const db = useDb((d) => d);
  const colour = spec && byId(db.colours, spec.colourId);
  const entries = useMemo(
    () => (spec ? db.activity.filter((a) => a.message.includes(spec.id) || (colour && a.message.includes(`"${colour.name}"`) && a.message.includes(spec.jobId))) : []),
    [db.activity, spec, colour],
  );
  const snapshots: CardSnapshot[] = spec ? db.cardSnapshots.filter((s) => s.jobId === spec.jobId) : [];
  return (
    <Modal open={!!spec} onOpenChange={(v) => !v && onClose()} title={`History · ${spec?.id ?? ""}`} description={colour?.name}>
      <div className="space-y-4">
        {snapshots.length > 0 && (
          <div>
            <MicroLabel>Earlier versions</MicroLabel>
            {snapshots.map((s) => {
              const old = s.specs.find((x) => x.id === spec?.id);
              return (
                <div key={s.version} className="mt-1 text-xs text-gray-600">
                  v{s.version}: {old ? `${old.sheen ?? "—"}, ${old.coats ?? "—"} coats, ${SPEC_STATE[old.state].label}` : "not on this version"}
                </div>
              );
            })}
          </div>
        )}
        <div>
          <MicroLabel>Activity</MicroLabel>
          {entries.length === 0 && <p className="mt-1 text-xs italic text-gray-400">No recorded changes.</p>}
          {entries.map((a) => (
            <div key={a.id} className="mt-2 border-l-2 border-line pl-3 text-xs">
              <div className="text-xxs font-bold uppercase text-gray-400">{dateTime(a.at)}</div>
              <div className={a.blocked ? "text-red-700" : "text-gray-700"}>{a.message}</div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
