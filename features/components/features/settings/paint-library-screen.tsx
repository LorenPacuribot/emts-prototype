"use client";
/**
 * NEW, embedded in the replica's Settings › Paint Library
 * (components/settings/library/PaintLibraryView.tsx), below the live cards.
 * The product catalogue the new features read: the colour card (3) picks its
 * product here, material demand (18) uses the proven field rate over the
 * manufacturer spread rate and the rough-surface rate, container packing (18)
 * only uses the pack sizes marked available at their cost, and repaint
 * lifespans (27) add a year for premium products. Discontinued products and
 * their successors come from feature 28.
 * Only the Owner and Office Manager edit the shared catalogue (catalog.edit);
 * costs are shown to roles with materials.seePrices.
 */
import { useState } from "react";
import { Package, Plus, Settings2, Star } from "lucide-react";
import type { Database, PackSize, ProductCatalogItem, User as AppUser } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can, whoCan } from "@/features/lib/permissions";
import { denied, fail, log, ok } from "@/features/lib/store/helpers";
import { money } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { Badge, Button, Checkbox, ConfirmDialog, Field, Input, Modal, NewBadge, RowMenu, Select } from "@/features/components/ui";
import { cn } from "@/features/lib/cn";

type Draft = Omit<ProductCatalogItem, "id">;
const EMPTY: Draft = { manufacturer: "Sherwin-Williams", productLine: "", product: "", spreadRate: 350, tier: "standard", cost: {}, available: ["gal"] };
const PACKS: PackSize[] = ["qt", "gal", "5gal"];
const PACK_LABEL: Record<PackSize, string> = { qt: "Quart", gal: "Gallon", "5gal": "5-Gallon" };

function saveProduct(db: Database, actor: AppUser, id: string | undefined, d: Draft) {
  if (!can(actor, "catalog.edit")) return denied(db, actor, "Paint Library", "edit the shared catalogue", whoCan("catalog.edit"));
  if (!d.product.trim()) return fail("Product name is required.", "product");
  if (!d.productLine.trim()) return fail("Product line is required.", "productLine");
  if (!(d.spreadRate > 0)) return fail("Spread rate must be above zero.", "spreadRate");
  if (d.available.length === 0) return fail("Mark at least one pack size available.", "available");
  if (id) Object.assign(db.catalog.find((c) => c.id === id)!, d);
  else db.catalog.push({ ...d, id: `PRD-${Date.now().toString(36).toUpperCase()}` });
  log(db, actor, "Paint Library", `Product "${d.product}" ${id ? "updated" : "added"} by ${actor.name}`);
  return ok();
}
function deleteProduct(db: Database, actor: AppUser, id: string) {
  if (!can(actor, "catalog.edit")) return denied(db, actor, "Paint Library", "edit the shared catalogue", whoCan("catalog.edit"));
  const p = db.catalog.find((c) => c.id === id);
  if (!p) return fail("Not found.");
  if (db.specs.some((s) => s.product === p.product)) return fail("This product is used on a colour card. It can't be deleted; obsolete codes are preserved.");
  db.catalog = db.catalog.filter((c) => c.id !== id);
  log(db, actor, "Paint Library", `Product "${p.product}" deleted by ${actor.name}`);
  return ok();
}

export function PaintCatalogSection() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [edit, setEdit] = useState<{ open: boolean; id?: string; draft: Draft }>({ open: false, draft: EMPTY });
  const [err, setErr] = useState<{ field?: string; msg: string }>();
  const [del, setDel] = useState<ProductCatalogItem>();
  const editable = can(user, "catalog.edit");
  const prices = can(user, "materials.seePrices");
  const list = [...db.catalog].sort((a, b) => a.product.localeCompare(b.product));

  const setD = (patch: Partial<Draft>) => setEdit((e) => ({ ...e, draft: { ...e.draft, ...patch } }));
  function save() {
    const r = act(saveProduct, edit.id, edit.draft);
    if (r.ok) {
      toast.success(edit.id ? "Product updated" : "Product added", edit.draft.product);
      setEdit({ open: false, draft: EMPTY });
    } else setErr({ field: r.field, msg: r.error });
  }

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-green-200 bg-white shadow-lg shadow-gray-200/70">
      <div className="flex flex-col gap-3 border-b border-gray-100 bg-green-50/40 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 font-heading text-base font-bold text-gray-900">
            Colour card &amp; paint order catalogue <NewBadge feature={[3, 18]} />
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Products the colour card and paint orders use. Material demand uses the proven field rate when recorded; containers are packed only from the sizes marked available.
            {!editable && " Only the Business Owner and Office Manager edit the shared catalogue."}
          </p>
        </div>
        {editable && (
          <Button variant="primary" size="sm" onClick={() => { setErr(undefined); setEdit({ open: true, draft: EMPTY }); }}>
            <Plus className="h-4 w-4" /> Add Product
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xxs font-bold uppercase tracking-wider text-gray-500">
              <th className="px-6 py-3">Product</th>
              <th className="px-4 py-3">Coverage (sqft/gal)</th>
              <th className="px-4 py-3">Pack sizes</th>
              {prices && <th className="px-4 py-3">Cost</th>}
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.map((c) => {
              const successor = db.catalog.find((x) => x.successorOf === c.id);
              return (
                <tr key={c.id} className={cn("align-top transition-colors hover:bg-primary-50/20", c.discontinued && "bg-gray-50/60")}>
                  <td className="px-6 py-3">
                    <div className="text-xxs font-bold uppercase tracking-widest text-gray-500">{c.manufacturer} · {c.productLine}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-gray-900">
                      {c.product}
                      <Star className={cn("h-3.5 w-3.5 shrink-0", c.tier === "premium" ? "fill-amber-300 text-amber-400" : "text-gray-300")} aria-label={c.tier === "premium" ? "Premium" : "Standard"} />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={c.tier === "premium" ? "blue" : "gray"}>{c.tier === "premium" ? "Premium (+1 yr lifespan)" : "Standard"}</Badge>
                      {c.discontinued && <Badge tone="amber">Discontinued{successor ? ` · successor ${successor.product}` : ""}</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <div>Spread {c.spreadRate}</div>
                    {c.fieldRate && <div className="font-semibold text-green-700">Field {c.fieldRate}</div>}
                    {c.conditionRates?.rough && <div className="text-xs text-gray-500">Rough {c.conditionRates.rough}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {PACKS.map((p) => (
                        <span key={p} className={cn("rounded-md border px-1.5 py-0.5 text-xs font-bold", c.available.includes(p) ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-gray-50 text-gray-300 line-through")}>
                          {PACK_LABEL[p]}
                        </span>
                      ))}
                    </div>
                  </td>
                  {prices && (
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {PACKS.filter((p) => c.cost[p] !== undefined).map((p) => <div key={p} className="whitespace-nowrap">{money(c.cost[p]!)} / {p}</div>)}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    {editable && (
                      <RowMenu items={[
                        { label: "Edit", icon: <Settings2 />, onSelect: () => { setErr(undefined); const { id, ...rest } = c; setEdit({ open: true, id, draft: rest }); } },
                        { label: "Delete", icon: <Package />, danger: true, onSelect: () => setDel(c) },
                      ]} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={edit.open} onOpenChange={(v) => setEdit((e) => ({ ...e, open: v }))} title={edit.id ? "Edit catalogue product" : "Add catalogue product"} footer={<><Button onClick={() => setEdit((e) => ({ ...e, open: false }))}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Manufacturer" required htmlFor="pl-m"><Select id="pl-m" value={edit.draft.manufacturer} onChange={(e) => setD({ manufacturer: e.target.value })}>{["Sherwin-Williams", "Benjamin Moore", "Behr", "PPG"].map((m) => <option key={m}>{m}</option>)}</Select></Field>
          <Field label="Product line" required htmlFor="pl-l" error={err?.field === "productLine" ? err.msg : undefined}><Input id="pl-l" value={edit.draft.productLine} onChange={(e) => setD({ productLine: e.target.value })} /></Field>
          <Field label="Product" required htmlFor="pl-p" className="sm:col-span-2" error={err?.field === "product" ? err.msg : undefined}><Input id="pl-p" value={edit.draft.product} onChange={(e) => setD({ product: e.target.value })} /></Field>
          <Field label="Spread rate (sq ft/gal)" required htmlFor="pl-s" error={err?.field === "spreadRate" ? err.msg : undefined}><Input id="pl-s" type="number" value={edit.draft.spreadRate} onChange={(e) => setD({ spreadRate: Number(e.target.value) })} /></Field>
          <Field label="Proven field rate" htmlFor="pl-f" hint="Beats the manufacturer rate in calculations."><Input id="pl-f" type="number" value={edit.draft.fieldRate ?? ""} onChange={(e) => setD({ fieldRate: e.target.value ? Number(e.target.value) : undefined })} /></Field>
          <Field label="Tier" htmlFor="pl-t"><Select id="pl-t" value={edit.draft.tier} onChange={(e) => setD({ tier: e.target.value as Draft["tier"] })}><option value="standard">Standard</option><option value="premium">Premium (+1 yr lifespan)</option></Select></Field>
          <Field label="Available pack sizes" required error={err?.field === "available" ? err.msg : undefined}>
            <div className="flex flex-wrap gap-4 pt-2">
              {PACKS.map((p) => (
                <Checkbox key={p} checked={edit.draft.available.includes(p)} onCheckedChange={(v) => setD({ available: v ? [...edit.draft.available, p] : edit.draft.available.filter((x) => x !== p) })} label={PACK_LABEL[p]} />
              ))}
            </div>
          </Field>
          {prices && PACKS.map((p) => (
            <Field key={p} label={`Cost per ${PACK_LABEL[p].toLowerCase()}`} htmlFor={`pl-c-${p}`}>
              <Input id={`pl-c-${p}`} type="number" step="0.01" value={edit.draft.cost[p] ?? ""} onChange={(e) => setD({ cost: { ...edit.draft.cost, [p]: e.target.value ? Number(e.target.value) : undefined } })} />
            </Field>
          ))}
        </div>
      </Modal>
      <ConfirmDialog open={!!del} onOpenChange={(v) => !v && setDel(undefined)} title={`Delete ${del?.product}?`} body="Products used on a colour card can't be deleted." confirmLabel="Delete" onConfirm={() => del && act(deleteProduct, del.id).ok && toast.success("Product deleted")} />
    </section>
  );
}
