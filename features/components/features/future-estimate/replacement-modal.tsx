"use client";
/**
 * Discontinued product replacement. The estimator proposes; the office
 * approves like-for-like; the owner approves all others. A brand, line,
 * colour or sheen change needs a priced change order (Cross-Feature Rule 1).
 */
import { useState } from "react";
import type { RepeatEstimate, RepeatEstimateLine } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import { previewReplacement, proposeReplacement } from "@/features/lib/store/actions/future-estimate";
import { catalogFor } from "@/features/lib/selectors";
import { toast } from "@/features/lib/toast";
import { Banner, Button, Checkbox, Field, Input, Modal, Select } from "@/features/components/ui";

const SHEENS = ["Flat", "Matte", "Eggshell", "Satin", "Semi-Gloss", "Gloss"];

export function ReplacementModal({ rep, line, onClose }: { rep: RepeatEstimate; line?: RepeatEstimateLine; onClose: () => void }) {
  return line ? <Inner key={line.id} rep={rep} line={line} onClose={onClose} /> : null;
}

function Inner({ rep, line, onClose }: { rep: RepeatEstimate; line: RepeatEstimateLine; onClose: () => void }) {
  const db = useDb((d) => d);
  const current = catalogFor(db, line.product);
  const successor = db.catalog.find((c) => c.successorOf && c.successorOf === current?.id);
  const [catalogId, setCatalogId] = useState(successor?.id ?? "");
  const [colourNumber, setColourNumber] = useState(line.colourNumber ?? "");
  const [sheen, setSheen] = useState(line.sheen);
  const [isSuccessor, setIsSuccessor] = useState(!!successor);
  const [err, setErr] = useState<{ field?: string; msg: string }>();
  const draft = { catalogId, colourNumber, sheen, isDirectSuccessor: isSuccessor };
  const preview = catalogId ? previewReplacement(db, line, draft) : undefined;

  const submit = () => {
    const res = act(proposeReplacement, rep.id, line.id, draft);
    if (!res.ok) return setErr({ field: res.field, msg: res.error });
    toast.success("Replacement proposed", preview?.approver === "office" ? "Office manager approves this like-for-like change." : "The Business Owner approves this change.");
    onClose();
  };
  const e = (f: string) => (err?.field === f ? err.msg : undefined);

  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Propose replacement product"
      description={`${line.product} · ${line.colourLabel} · ${line.sheen}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>Propose</Button>
        </>
      }
    >
      <div className="space-y-4">
        {current?.discontinued && <Banner tone="warn" title={`${line.product} is discontinued`}>Choose a replacement. Nothing is substituted automatically.</Banner>}
        <Field label="Replacement product" required htmlFor="rp-product" error={e("catalogId")}>
          <Select id="rp-product" value={catalogId} invalid={!!e("catalogId")} onChange={(ev) => { setCatalogId(ev.target.value); setIsSuccessor(db.catalog.find((c) => c.id === ev.target.value)?.successorOf === current?.id && !!current); }}>
            <option value="">Choose…</option>
            {db.catalog.filter((c) => !c.discontinued && c.product !== line.product).map((c) => (
              <option key={c.id} value={c.id}>{c.manufacturer} · {c.productLine} · {c.product}{c.successorOf === current?.id ? " (published successor)" : ""}</option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Colour number" required htmlFor="rp-colour" error={e("colourNumber")}>
            <Input id="rp-colour" value={colourNumber} invalid={!!e("colourNumber")} onChange={(ev) => setColourNumber(ev.target.value)} />
          </Field>
          <Field label="Sheen" required htmlFor="rp-sheen" error={e("sheen")}>
            <Select id="rp-sheen" value={sheen} onChange={(ev) => setSheen(ev.target.value)}>
              {SHEENS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
        </div>
        <div>
          <Checkbox checked={isSuccessor} onCheckedChange={setIsSuccessor} label="Manufacturer-published direct successor" />
          {e("isDirectSuccessor") && <p className="mt-1 text-xs font-medium text-red-600">{e("isDirectSuccessor")}</p>}
        </div>
        {line.tintFormula && (
          <Banner tone="info" title="Custom tint formula carried for store review">
            {line.tintFormula}. It is never auto-substituted into the new product; the store reviews it.
          </Banner>
        )}
        {preview && (
          <Banner tone={preview.document === "ChangeOrder" ? "danger" : "success"} title={`Rule 1: ${preview.approver === "office" ? "Office manager approves" : "Business Owner approves"} · Document: ${preview.document === "ChangeOrder" ? "Priced change order" : "None"}`}>
            {"reason" in preview.decision ? preview.decision.reason : ""}
            {preview.document === "ChangeOrder" && " The customer must sign a priced change order before anything is ordered, even though this began as a repeat quote or reorder."}
          </Banner>
        )}
        {err && !err.field && <Banner tone="danger">{err.msg}</Banner>}
      </div>
    </Modal>
  );
}
