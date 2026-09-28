"use client";
/**
 * Component 19.2 — Product Mapping, plus pack availability (18.2).
 * Menu: Procurement > Product Mapping
 */
import { useState } from "react";
import { FileUp, ListChecks, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import type { PackSize, ProductMapping } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { deleteMapping, saveMapping, setPackAvailability, type MappingDraft } from "@/features/lib/store/actions/supplier";
import { byId } from "@/features/lib/selectors";
import { dateLong } from "@/features/lib/format";
import { PACK_LABEL } from "@/features/lib/rules/materials";
import { itemCodeFor, isOpenOrder } from "@/features/lib/rules/procurement";
import { userName } from "@/features/lib/store/helpers";
import { toast } from "@/features/lib/toast";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, CardLabel, Checkbox, ConfirmDialog, EmptyState, Field, Input, Modal, RowMenu, Select, Table, TD, TH, THead, TR, Textarea } from "@/features/components/ui";
import { ProcurementFrame } from "./procurement-frame";
import { procurementPerms } from "./shared";
import { useErr } from "./order-modals";

const SIZES: PackSize[] = ["qt", "gal", "5gal"];

export function ProductMappingScreen() {
  return (
    <ProcurementFrame tab="mapping">
      <Mapping />
    </ProcurementFrame>
  );
}

function Mapping() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  const [edit, setEdit] = useState<{ open: boolean; mapping?: ProductMapping; preset?: Partial<MappingDraft> }>({ open: false });
  const [removing, setRemoving] = useState<ProductMapping>();
  const [bulk, setBulk] = useState(false);
  const mappings = db.productMappings ?? [];

  const unmapped = db.catalog.flatMap((c) => c.available.filter((size) => !itemCodeFor(db, { product: c.product, packSize: size })).map((size) => ({ cat: c, size })));
  const unmappedOnOrders = db.purchaseOrders.filter(isOpenOrder).flatMap((p) => p.lines.flatMap((l) => l.packs.filter((pk) => !itemCodeFor(db, { product: l.product, packSize: pk.size, branchId: p.branchId })).map((pk) => ({ po: p, l, size: pk.size }))));

  return (
    <>
      <PageHeader
        title="Product Mapping"
        subtitle="Connect our product names to the store's item codes so an order reads correctly at the counter, and set which pack sizes each product can be ordered in."
        actions={perms.setup && (
          <>
            <Button onClick={() => setBulk(true)}><FileUp className="h-4 w-4" /> Bulk import (CSV)</Button>
            <Button variant="primary" onClick={() => setEdit({ open: true })}><Plus className="h-4 w-4" /> Add mapping</Button>
          </>
        )}
      />
      {!perms.setup && <Banner tone="info" className="mb-4" title="Read-only for your role">The office manager maintains mappings and pack availability.</Banner>}

      <div className="space-y-4">
        <Card className="p-4">
          <CardLabel icon={<ListChecks />}>Pack availability</CardLabel>
          <p className="mt-1 text-[12px] text-slate-500">Only sizes marked available are offered when packing an order. Units are quarts, gallons and five-gallon pails — litres are not supported.</p>
          <div className="mt-3">
            <Table>
              <THead><tr><TH>Product</TH><TH>Manufacturer · line</TH>{SIZES.map((s) => <TH key={s}>{PACK_LABEL[s]}</TH>)}</tr></THead>
              <tbody>
                {db.catalog.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-semibold text-ink">{c.product}{c.available.length === 0 && <div><Badge tone="red">No packs available — blocks ordering</Badge></div>}</TD>
                    <TD>{c.manufacturer} · {c.productLine}</TD>
                    {SIZES.map((s) => (
                      <TD key={s}>
                        <Checkbox
                          checked={c.available.includes(s)}
                          disabled={!perms.editCatalog || c.cost[s] === undefined}
                          onCheckedChange={(v) => act(setPackAvailability, c.id, s, v).ok && toast.success(`${c.product} ${PACK_LABEL[s].toLowerCase()} ${v ? "available" : "unavailable"}`)}
                          label={c.cost[s] === undefined ? <span className="text-[11px] text-slate-400">not sold</span> : undefined}
                        />
                      </TD>
                    ))}
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>

        <Card className="p-4">
          <CardLabel icon={<Tags />}>Store item codes</CardLabel>
          <div className="mt-3">
            {mappings.length === 0 ? <EmptyState icon={<Tags />} title="No mappings yet." body="Manual orders still work with the readable specification." /> : (
              <Table>
                <THead><tr><TH>Product</TH><TH>Pack</TH><TH>Branch</TH><TH>Item code</TH><TH>Colour # / tint formula</TH><TH>Updated</TH><TH /></tr></THead>
                <tbody>
                  {mappings.map((m) => {
                    const cat = byId(db.catalog, m.catalogId);
                    return (
                      <TR key={m.id}>
                        <TD className="font-semibold text-ink">{cat?.product}</TD>
                        <TD>{m.unit}</TD>
                        <TD>{m.branchId ? byId(db.branches, m.branchId)?.name : <span className="text-slate-500">All branches</span>}</TD>
                        <TD className="font-mono text-[12px]">{m.itemCode}</TD>
                        <TD>{m.colourNumber || m.tintFormula ? <>{m.colourNumber}{m.tintFormula && <div className="text-[11px] text-slate-500">{m.tintFormula}</div>}</> : <span className="text-slate-300">—</span>}</TD>
                        <TD>{dateLong(m.updatedAt)}<div className="text-[11px] text-slate-400">{userName(db, m.updatedBy)}</div></TD>
                        <TD>
                          {perms.setup && <RowMenu items={[
                            { label: "Edit mapping", icon: <Pencil />, onSelect: () => setEdit({ open: true, mapping: m }) },
                            { label: "Delete mapping", icon: <Trash2 />, danger: true, onSelect: () => setRemoving(m) },
                          ]} />}
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <CardLabel icon={<ListChecks />}>Review unmapped</CardLabel>
          <p className="mt-1 text-[12px] text-slate-500">An unmapped line blocks electronic submission, but not a manual order — the readable specification is enough at the counter.</p>
          <div className="mt-3 space-y-2">
            {unmapped.length === 0 && unmappedOnOrders.length === 0 && <EmptyState title="Everything available is mapped." />}
            {unmappedOnOrders.map(({ po, l, size }) => (
              <div key={`${po.id}${l.id}${size}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-[12.5px]">
                <Badge tone="amber">No item code — manual order only</Badge>
                <span className="font-semibold text-ink">{l.product}</span> · {PACK_LABEL[size]} · on open order {po.id} line {l.id}
              </div>
            ))}
            {unmapped.map(({ cat, size }) => (
              <div key={`${cat.id}${size}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12.5px]">
                <span className="font-semibold text-ink">{cat.product}</span> · {PACK_LABEL[size]}
                {perms.setup && <Button size="sm" className="ml-auto" onClick={() => setEdit({ open: true, preset: { catalogId: cat.id, packSize: size, supplierId: cat.manufacturer === "Benjamin Moore" ? "SUP-BM" : "SUP-SW" } })}>Map it</Button>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <MappingModal key={edit.mapping?.id ?? `n${edit.open}${edit.preset?.catalogId}${edit.preset?.packSize}`} open={edit.open} mapping={edit.mapping} preset={edit.preset} onClose={() => setEdit({ open: false })} />
      <BulkModal open={bulk} onClose={() => setBulk(false)} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(undefined)}
        title={`Delete mapping ${removing?.itemCode}?`}
        body="Orders already sent keep their printed codes. A mapping used by an open order can't be deleted."
        confirmLabel="Delete mapping"
        onConfirm={() => removing && act(deleteMapping, removing.id).ok && toast.success("Mapping deleted")}
      />
    </>
  );
}

function MappingModal({ open, mapping, preset, onClose }: { open: boolean; mapping?: ProductMapping; preset?: Partial<MappingDraft>; onClose: () => void }) {
  const db = useDb((d) => d);
  const [d, setD] = useState<MappingDraft>({
    supplierId: mapping?.supplierId ?? preset?.supplierId ?? "SUP-SW",
    branchId: mapping?.branchId ?? "",
    catalogId: mapping?.catalogId ?? preset?.catalogId ?? db.catalog[0]?.id ?? "",
    packSize: mapping?.packSize ?? preset?.packSize ?? "gal",
    itemCode: mapping?.itemCode ?? "",
    colourNumber: mapping?.colourNumber ?? "",
    tintFormula: mapping?.tintFormula ?? "",
  });
  const { run, e } = useErr();
  const cat = byId(db.catalog, d.catalogId);
  const save = () => {
    if (run(act(saveMapping, d, mapping?.id))) {
      toast.success(mapping ? "Mapping updated" : "Mapping added");
      onClose();
    }
  };
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={mapping ? "Edit mapping" : "Add mapping"} description="One product and pack size maps to one item code per branch."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save mapping</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier" required>
          <Select value={d.supplierId} onChange={(ev) => setD({ ...d, supplierId: ev.target.value, branchId: "" })}>
            {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Branch">
          <Select value={d.branchId} onChange={(ev) => setD({ ...d, branchId: ev.target.value })}>
            <option value="">All branches</option>
            {db.branches.filter((b) => b.supplierId === d.supplierId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Product" required error={e("catalogId")}>
          <Select value={d.catalogId} onChange={(ev) => setD({ ...d, catalogId: ev.target.value })}>
            {db.catalog.map((c) => <option key={c.id} value={c.id}>{c.product}</option>)}
          </Select>
        </Field>
        <Field label="Unit / pack" required error={e("packSize")}>
          <Select value={d.packSize} onChange={(ev) => setD({ ...d, packSize: ev.target.value as PackSize })} invalid={!!e("packSize")}>
            {SIZES.map((s) => <option key={s} value={s} disabled={cat?.cost[s] === undefined}>{PACK_LABEL[s]}{cat?.cost[s] === undefined ? " (not sold)" : ""}</option>)}
          </Select>
        </Field>
        <Field label="Store item code" required error={e("itemCode")}>
          <Input value={d.itemCode} onChange={(ev) => setD({ ...d, itemCode: ev.target.value })} placeholder="e.g. K33W00151" invalid={!!e("itemCode")} />
        </Field>
        <Field label="Colour number">
          <Input value={d.colourNumber} onChange={(ev) => setD({ ...d, colourNumber: ev.target.value })} placeholder="e.g. SW 7015" />
        </Field>
        <Field label="Tint formula (free text)" className="sm:col-span-2">
          <Input value={d.tintFormula} onChange={(ev) => setD({ ...d, tintFormula: ev.target.value })} placeholder="e.g. B1 3Y18 / L1 1Y4" />
        </Field>
      </div>
    </Modal>
  );
}

function BulkModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb((d) => d);
  const [text, setText] = useState("");
  const [result, setResult] = useState<string[]>([]);
  const importRows = () => {
    const out: string[] = [];
    let okCount = 0;
    for (const [i, raw] of text.split("\n").map((r) => r.trim()).filter(Boolean).entries()) {
      const [product, pack, code] = raw.split(",").map((x) => x.trim());
      const cat = db.catalog.find((c) => c.id === product || c.product.toLowerCase() === product?.toLowerCase());
      const size = (["qt", "gal", "5gal"] as PackSize[]).find((s) => s === pack);
      if (!cat || !size || !code) { out.push(`Row ${i + 1}: needs product, pack (qt, gal or 5gal) and item code.`); continue; }
      const res = act(saveMapping, { supplierId: cat.manufacturer === "Benjamin Moore" ? "SUP-BM" : "SUP-SW", catalogId: cat.id, packSize: size, itemCode: code });
      if (res.ok) okCount += 1;
      else out.push(`Row ${i + 1}: ${res.error}`);
    }
    setResult(out);
    if (okCount) toast.success(`${okCount} mapping${okCount === 1 ? "" : "s"} imported`);
    if (!out.length) onClose();
  };
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title="Bulk import mappings" description="One row per mapping: product, pack, item code."
      footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={importRows}>Import</Button></>}>
      <Textarea className="min-h-40 font-mono text-[12px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={"SuperPaint Exterior, 5gal, A89W00155\nPRD-PM200, 5gal, B30W02655"} />
      {result.length > 0 && <Banner tone="warn" className="mt-3" title="Some rows were skipped">{result.map((r) => <div key={r}>{r}</div>)}</Banner>}
    </Modal>
  );
}
