"use client";
/** Add / edit colour — the draft fields (manufacturer, name, number required). */
import { useEffect, useState } from "react";
import type { Colour } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import { addColour, updateColour, type ColourDraft } from "@/features/lib/store/actions/color-card";
import { toast } from "@/features/lib/toast";
import { Button, Field, Input, Modal, Select, Switch, Swatch } from "@/features/components/ui";
import { MANUFACTURERS } from "./constants";
import { PalettePicker } from "./palette-picker";

const EMPTY: ColourDraft = { manufacturer: "Sherwin-Williams", name: "", number: "", hex: "#CBD5E1", tintFormula: "", sampleRef: "", customMatch: false };

export function ColourForm({ open, onOpenChange, jobId, colour }: { open: boolean; onOpenChange: (v: boolean) => void; jobId: string; colour?: Colour }) {
  const rowVersion = useDb((db) => db.jobs.find((j) => j.id === jobId)?.cardRowVersion);
  const [draft, setDraft] = useState<ColourDraft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [openedAt, setOpenedAt] = useState<number | undefined>();

  useEffect(() => {
    if (open) {
      setDraft(colour ? { manufacturer: colour.manufacturer, name: colour.name, number: colour.number, hex: colour.hex, tintFormula: colour.tintFormula ?? "", sampleRef: colour.sampleRef ?? "", customMatch: colour.customMatch } : EMPTY);
      setErrors({});
      setOpenedAt(rowVersion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, colour]);

  const set = <K extends keyof ColourDraft>(k: K, v: ColourDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  function save() {
    const e: Record<string, string> = {};
    if (!draft.manufacturer.trim()) e.manufacturer = "Manufacturer is required.";
    if (!draft.name.trim()) e.name = "Colour name is required.";
    if (!draft.number.trim()) e.number = "Colour number is required.";
    setErrors(e);
    if (Object.keys(e).length) return;
    const res = colour ? act(updateColour, colour.id, draft, openedAt) : act(addColour, jobId, draft, openedAt);
    if (res.ok) {
      toast.success(colour ? "Colour updated" : "Colour added", `${draft.name} ${draft.number}`);
      onOpenChange(false);
    } else if (res.field) setErrors({ [res.field]: res.error });
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={colour ? "Edit colour" : "Add colour"}
      description="Manufacturer, colour name and colour number are required to save a draft."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            {colour ? "Save colour" : "Add colour"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {draft.manufacturer && (
          <div className="sm:col-span-2">
            <PalettePicker
              manufacturer={draft.manufacturer}
              selectedNumber={draft.number}
              onPick={(c) => {
                setDraft((d) => ({ ...d, name: c.name, number: c.number, hex: c.hex, customMatch: false }));
                setErrors({});
              }}
            />
          </div>
        )}
        <Field label="Manufacturer" required htmlFor="c-man" error={errors.manufacturer}>
          <Select id="c-man" value={draft.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} invalid={!!errors.manufacturer}>
            <option value="">Select…</option>
            {MANUFACTURERS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Swatch" htmlFor="c-hex" hint="Pick the closest on-screen colour. Not a match guarantee.">
          <div className="flex items-center gap-2">
            <Swatch hex={draft.hex} />
            <Input id="c-hex" type="color" value={draft.hex} onChange={(e) => set("hex", e.target.value)} className="h-10 w-16 p-1" />
            <Input value={draft.hex} onChange={(e) => set("hex", e.target.value)} className="w-28 font-mono" aria-label="Hex value" />
          </div>
        </Field>
        <Field label="Colour name" required htmlFor="c-name" error={errors.name}>
          <Input id="c-name" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Repose Gray" invalid={!!errors.name} />
        </Field>
        <Field label="Colour number" required htmlFor="c-num" error={errors.number}>
          <Input id="c-num" value={draft.number} onChange={(e) => set("number", e.target.value)} placeholder="e.g. SW 7015" invalid={!!errors.number} />
        </Field>
        <Field label="Tint formula" htmlFor="c-tint" hint="Optional free text.">
          <Input id="c-tint" value={draft.tintFormula} onChange={(e) => set("tintFormula", e.target.value)} />
        </Field>
        <Field label="Sample reference" htmlFor="c-ref" hint="Optional free text.">
          <Input id="c-ref" value={draft.sampleRef} onChange={(e) => set("sampleRef", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Switch checked={draft.customMatch} onCheckedChange={(v) => set("customMatch", v)} label={<span>Custom colour match <span className="text-gray-500">— starts in Pending sample until a sample is accepted</span></span>} />
        </div>
      </div>
    </Modal>
  );
}
