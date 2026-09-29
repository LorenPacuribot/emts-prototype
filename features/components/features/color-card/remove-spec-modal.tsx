"use client";
/** Remove a specification. Blocked while referenced, until reassigned or set unresolved. */
import { useEffect, useState } from "react";
import type { SpecLine } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import { removeSpec } from "@/features/lib/store/actions/color-card";
import { byId } from "@/features/lib/selectors";
import { toast } from "@/features/lib/toast";
import { Banner, Button, Field, Modal, Select } from "@/features/components/ui";

export function RemoveSpecModal({ spec, onClose }: { spec?: SpecLine; onClose: () => void }) {
  const db = useDb((d) => d);
  const [mode, setMode] = useState<"" | "reassign" | "unresolved">("");
  const [target, setTarget] = useState("");
  useEffect(() => {
    setMode("");
    setTarget("");
  }, [spec?.id]);
  if (!spec) return null;
  const referenced = spec.referencedBy.length > 0;
  const others = db.specs.filter((s) => s.jobId === spec.jobId && s.id !== spec.id);
  const colour = byId(db.colours, spec.colourId);

  function confirm() {
    const res = act(
      removeSpec,
      spec!.id,
      !referenced ? undefined : mode === "reassign" ? { kind: "reassign", targetSpecId: target } : mode === "unresolved" ? { kind: "unresolved" } : undefined,
    );
    if (res.ok) {
      toast.success("Specification removed", spec!.id);
      onClose();
    }
  }

  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      size="sm"
      title={`Remove ${spec.id}?`}
      description={`${colour?.name} · ${spec.sheen ?? "—"}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="dark" className="bg-red-600 hover:bg-red-700" disabled={referenced && (!mode || (mode === "reassign" && !target))} onClick={confirm}>
            Remove specification
          </Button>
        </>
      }
    >
      {referenced ? (
        <div className="space-y-4">
          <Banner tone="warn" title="This specification is referenced">
            Used by: {spec.referencedBy.join(", ").replace(/_/g, " ")}. Choose what happens to those references first.
          </Banner>
          <Field label="Resolve references" htmlFor="rm-mode">
            <Select id="rm-mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="">Choose…</option>
              <option value="reassign">Reassign to another specification</option>
              <option value="unresolved">Set to explicit unresolved state</option>
            </Select>
          </Field>
          {mode === "reassign" && (
            <Field label="Reassign to" htmlFor="rm-target">
              <Select id="rm-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose…</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id} · {byId(db.colours, o.colourId)?.name} · {o.sheen}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-600">This removes the line from the card. The action is logged.</p>
      )}
    </Modal>
  );
}
