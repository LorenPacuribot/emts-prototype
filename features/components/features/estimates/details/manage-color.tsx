"use client";
/**
 * Live "Add Paint Color" / "Edit Paint Color" modal
 * (estimates/details/modals/manage-color.tsx), extended for feature 3.
 *
 * Existing: COLOR IDENTITY (Color Number, Color Name) and PRODUCT
 * SPECIFICATION (Brand, Product Line, Finish / Sheen), ASSIGNED SURFACES.
 * NEW: colour code and swatch, custom match, and the ordering fields the
 * card needs before approval (coats, primer, tint base). They fill the
 * colour's first specification line.
 */
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Colour, Job, Sheen } from "@/features/types";
import { act, getDb, useDb } from "@/features/lib/store";
import { addColour, saveSpec, updateColour, type SpecDraft } from "@/features/lib/store/actions/color-card";
import { surfaceLabel } from "@/features/lib/selectors";
import { toast } from "@/features/lib/toast";
import { Banner, Button, Checkbox, Field, Input, LiveLabel, Modal, NewBadge, Select, Swatch } from "@/features/components/ui";
import { MANUFACTURERS, PRIMERS, SHEENS, TINT_BASES } from "@/features/components/features/color-card/constants";
import { PalettePicker } from "@/features/components/features/color-card/palette-picker";
import { specLifespanDefault } from "@/features/lib/rules/lifespan";
import { useDb as useReplicaDb } from "@/lib/store";

interface Form {
  name: string;
  number: string;
  hex: string;
  manufacturer: string;
  product: string;
  productLine: string;
  sheen: Sheen | "";
  coats: number;
  primer: string;
  tintBase: string;
  customMatch: boolean;
  sampleRef: string;
  /** Expected useful life of this coating, in years (repaint interval, patent 3 and 27). Blank = library default. */
  lifeYears: string;
}

export function ManageColorModal({ open, onOpenChange, job, colour, colorNumber, onRemove }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  job: Job;
  colour?: Colour;
  colorNumber: number;
  onRemove?: () => void;
}) {
  const db = useDb((d) => d);
  // Settings > Brands and Settings > Paint Library live in the replica store.
  const replica = useReplicaDb().collections;
  const spec = colour && db.specs.find((s) => s.colourId === colour.id && s.state !== "superseded");
  const blank: Form = { name: "", number: "", hex: "#D1CBC1", manufacturer: "Sherwin-Williams", product: "", productLine: "", sheen: "", coats: 2, primer: "", tintBase: "", customMatch: false, sampleRef: "", lifeYears: "" };
  const [f, setF] = useState<Form>(blank);
  const [error, setError] = useState<{ field?: string; message: string }>();

  useEffect(() => {
    if (!open) return;
    setError(undefined);
    setF(
      colour
        ? {
            name: colour.name, number: colour.number, hex: colour.hex, manufacturer: colour.manufacturer, product: spec?.product ?? "", productLine: spec?.productLine ?? "", sheen: spec?.sheen ?? "",
            coats: spec?.coats ?? 2, primer: spec?.primer ?? "", tintBase: spec?.tintBase ?? "", customMatch: colour.customMatch, sampleRef: colour.sampleRef ?? "",
            lifeYears: spec?.lifespanYears ? String(spec.lifespanYears) : "",
          }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, colour?.id]);

  const brands = useMemo(
    () => Array.from(new Set([...[...replica.brands].sort((a, b) => a.sortOrder - b.sortOrder).map((b) => b.name), ...MANUFACTURERS, ...(f.manufacturer ? [f.manufacturer] : [])])),
    [replica.brands, f.manufacturer],
  );
  const products = useMemo(() => db.catalog.filter((c) => c.manufacturer === f.manufacturer), [db.catalog, f.manufacturer]);
  // Paint Library products of this brand, then catalogue products not already listed.
  const libraryProducts = useMemo(() => {
    const brandIds = new Set(replica.brands.filter((b) => b.name.toLowerCase() === f.manufacturer.toLowerCase()).map((b) => b.id));
    return replica.paintProducts.filter((p) => brandIds.has(p.brandId) && p.isActive);
  }, [replica.brands, replica.paintProducts, f.manufacturer]);
  const productOptions = useMemo(
    () => Array.from(new Set([...libraryProducts.map((p) => p.name), ...products.map((p) => p.product)])),
    [libraryProducts, products],
  );
  const lines = useMemo(() => Array.from(new Set(products.map((p) => p.productLine).filter(Boolean))), [products]);
  const product = products.find((p) => p.product === f.product);
  const libraryProduct = libraryProducts.find((p) => p.name === f.product);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const pickProduct = (name: string) => {
    const cat = products.find((p) => p.product === name);
    const lib = libraryProducts.find((p) => p.name === name);
    setF((x) => ({
      ...x,
      product: name,
      productLine: cat?.productLine ?? x.productLine,
      sheen: x.sheen || ((lib?.finish as Sheen | undefined) ?? ""),
    }));
  };
  const defaultLife = specLifespanDefault(db, spec?.surfaceIds ?? [], { manufacturer: f.manufacturer, productLine: f.productLine || product?.productLine, product: f.product });

  function save() {
    if (!f.name.trim()) return setError({ field: "name", message: "Color name is required" });
    if (!f.number.trim()) return setError({ field: "number", message: "Color code is required" });
    const life = f.lifeYears.trim() ? Number(f.lifeYears) : undefined;
    if (life !== undefined && !(Number.isFinite(life) && life > 0 && life <= 50)) return setError({ field: "life", message: "Enter an expected life between 1 and 50 years" });
    const colourDraft = { manufacturer: f.manufacturer, name: f.name.trim(), number: f.number.trim(), hex: f.hex, customMatch: f.customMatch, sampleRef: f.sampleRef || undefined };
    let colourId = colour?.id;
    if (colour) {
      const r = act(updateColour, colour.id, colourDraft);
      if (!r.ok) return setError({ field: r.field, message: r.error });
    } else {
      const r = act(addColour, job.id, colourDraft);
      if (!r.ok) return setError({ field: r.field, message: r.error });
      colourId = r.value as string;
    }
    // The product fields live on the colour's first specification line.
    const fresh = getDb();
    const current = fresh.specs.find((s) => s.colourId === colourId && s.state !== "superseded");
    const wantsSpec = f.product || f.sheen || f.productLine || life || current;
    if (wantsSpec && colourId) {
      const productLine = f.productLine || product?.productLine || current?.productLine || "";
      const draft: SpecDraft = {
        sheen: f.sheen || undefined,
        coats: f.coats,
        primer: f.primer,
        coatSequence: current?.coatSequence?.length ? current.coatSequence : Array.from({ length: f.coats }, (_, i) => `Finish coat ${i + 1}`),
        surfaceIds: current?.surfaceIds ?? [],
        lifespanYears: life ?? current?.lifespanYears ?? specLifespanDefault(fresh, job.surfaceIds, { manufacturer: f.manufacturer, productLine, product: f.product }),
        ...(current && life !== undefined && life !== current.lifespanYears ? { lifespanReason: "Expected life set in the Paint Color dialog" } : {}),
        productLine,
        product: f.product,
        tintBase: f.tintBase,
      };
      const r = act(saveSpec, { jobId: job.id, colourId, specId: current?.id, draft });
      if (!r.ok) return setError({ message: r.error, field: r.field });
    }
    toast.success(colour ? "Color updated" : "Color added", colour ? undefined : "Use the paint bucket to assign it to surfaces.");
    onOpenChange(false);
  }

  const assigned = spec ? spec.surfaceIds : [];

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={colour ? "Edit Paint Color" : "Add Paint Color"}
      footer={
        <>
          {colour && onRemove && (
            <Button variant="danger" size="icon" className="mr-auto h-10 w-10" onClick={onRemove} aria-label="Delete color">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            {colour ? "Save Changes" : "Create Color"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {error && !error.field && <Banner tone="danger">{error.message}</Banner>}
        <div>
          <LiveLabel className="mb-3">Color Identity</LiveLabel>
          <div className="mb-4">
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-gray-600">
              Pick from the manufacturer palette <NewBadge feature={3} />
            </div>
            <PalettePicker
              manufacturer={f.manufacturer}
              onManufacturerChange={(m) => setF((x) => ({ ...x, manufacturer: m, product: "" }))}
              selectedNumber={f.number}
              onPick={(c) => {
                setF((x) => ({ ...x, name: c.name, number: c.number, hex: c.hex, customMatch: false }));
                setError(undefined);
              }}
            />
            <p className="mt-1 text-xs text-gray-500">Or type the name and code below for a custom match or an off-palette color.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
            <Field label="Color Number" required>
              <Input value={`#${colorNumber}`} readOnly className="bg-gray-50 font-mono" />
            </Field>
            <Field label="Color Name" required error={error?.field === "name" ? error.message : undefined}>
              <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Alabaster" invalid={error?.field === "name"} />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label={<span className="inline-flex items-center gap-2">Color Code</span>} required error={error?.field === "number" ? error.message : undefined} hint="Manufacturer number, e.g. SW 7008">
              <Input value={f.number} onChange={(e) => set("number", e.target.value)} placeholder="SW 7008" invalid={error?.field === "number"} />
            </Field>
            <Field label={<span className="inline-flex items-center gap-2">Swatch</span>}>
              <div className="flex items-center gap-2">
                <Swatch hex={f.hex} />
                <input type="color" value={f.hex} onChange={(e) => set("hex", e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-gray-200" aria-label="Swatch color" />
              </div>
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Checkbox checked={f.customMatch} onCheckedChange={(v) => set("customMatch", v)} label="Custom color match (needs a sample round)" />
            <NewBadge feature={3} />
          </div>
          {f.customMatch && (
            <Field label="Sample reference" className="mt-3">
              <Input value={f.sampleRef} onChange={(e) => set("sampleRef", e.target.value)} placeholder="e.g. Customer's 1998 door chip" />
            </Field>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <LiveLabel>Product Specification</LiveLabel>
            {(product?.cost.gal ?? libraryProduct?.pricePerGallon) !== undefined && (
              <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-bold text-green-700">${(product?.cost.gal ?? libraryProduct!.pricePerGallon).toFixed(2)}/gal</span>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Manufacturer" hint="From Settings › Brands">
              <Select value={f.manufacturer} onChange={(e) => setF((x) => ({ ...x, manufacturer: e.target.value, product: "", productLine: "" }))}>
                {brands.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label="Product" hint={libraryProducts.length ? "Pick from Settings › Paint Library, or type a new one" : "Type the product, or add it to Settings › Paint Library"}>
              <Input list="colour-products" value={f.product} onChange={(e) => pickProduct(e.target.value)} placeholder="e.g. SuperPaint Interior" disabled={!f.manufacturer} />
              <datalist id="colour-products">
                {productOptions.map((p) => <option key={p} value={p} />)}
              </datalist>
            </Field>
            <Field label="Product Line">
              <Input list="colour-lines" value={f.productLine} onChange={(e) => set("productLine", e.target.value)} placeholder={lines[0] ?? "e.g. Duration"} />
              <datalist id="colour-lines">
                {lines.map((l) => <option key={l} value={l} />)}
              </datalist>
            </Field>
            <Field label="Finish / Sheen">
              <Select value={f.sheen} onChange={(e) => set("sheen", e.target.value as Sheen)}>
                <option value="">Select Sheen...</option>
                {SHEENS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field
              label="Expected life (years)"
              error={error?.field === "life" ? error.message : undefined}
              hint={`Repaint interval for this coating. Blank uses the library default (${defaultLife} yrs).`}
            >
              <Input type="number" min={1} max={50} value={f.lifeYears} placeholder={String(defaultLife)} onChange={(e) => set("lifeYears", e.target.value)} invalid={error?.field === "life"} />
            </Field>
          </div>
        </div>

        <div className="rounded-xl border border-green-200 bg-green-50/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <LiveLabel className="text-green-800">Ordering &amp; approval detail</LiveLabel>
            <NewBadge feature={3} />
          </div>
          <p className="mb-3 text-xs text-gray-500">A specification can't be approved with a blank primer, and can't be ordered without its tint base.</p>
          <div className="grid gap-4 sm:grid-cols-[100px_1fr_1fr]">
            <Field label="Coats">
              <Input type="number" min={1} value={f.coats} onChange={(e) => set("coats", Math.max(1, Number(e.target.value)))} />
            </Field>
            <Field label="Primer">
              <Select value={f.primer} onChange={(e) => set("primer", e.target.value)}>
                <option value="">Not set (blocks approval)</option>
                {PRIMERS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tint base">
              <Select value={f.tintBase} onChange={(e) => set("tintBase", e.target.value)}>
                <option value="">Not set</option>
                {TINT_BASES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        {colour && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <LiveLabel>Assigned Surfaces</LiveLabel>
              <span className="rounded-full bg-gray-100 px-2 text-xs font-bold text-gray-600">{assigned.length}</span>
            </div>
            {assigned.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
                No surfaces assigned yet.
                <div className="text-xs text-gray-500">Use the Paint Bucket tool in the estimate to assign this color.</div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {assigned.map((id) => (
                  <span key={id} className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
                    {surfaceLabel(db, id).replace(" · ", " - ")}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
