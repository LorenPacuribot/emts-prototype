"use client";
/**
 * Start a touch-up reorder (Component 28.4, steps 1–3). Colour, product and
 * sheen prefill from the chosen property history record.
 */
import { useRef, useState } from "react";
import { ExternalLink, PaintBucket } from "lucide-react";
import type { Property } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import { createReorder, historyGroups, pendingReorderFor } from "@/features/lib/store/actions/future-estimate";
import { reorderQuantity, TOUCH_UP_MAX_GAL } from "@/features/lib/rules/future-estimate";
import { formatPacks } from "@/features/lib/rules/materials";
import { AppLink } from "@/features/lib/navigation";
import { byId, catalogFor } from "@/features/lib/selectors";
import { dateLong } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { Banner, Button, Field, Input, KV, Modal, PillTabs, Select, Swatch, Textarea } from "@/features/components/ui";
import { reorderHref } from "./shared";

export const QTY_PRESETS = [
  { label: "1 quart", gal: 0.25 },
  { label: "2 quarts", gal: 0.5 },
  { label: "1 gallon", gal: 1 },
  { label: "2 gallons", gal: 2 },
];

export function ReorderForm({ property, open, onOpenChange, initialApp, requestId, onCreated }: {
  property: Property;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialApp?: string;
  requestId?: string;
  onCreated: (id: string) => void;
}) {
  const db = useDb((d) => d);
  const groups = historyGroups(db, property);
  const apps = groups.flatMap((g) => g.items.filter((i) => !i.removed).map((i) => ({ ...i, group: g })));
  const request = requestId ? byId(db.touchUpRequests, requestId) : undefined;
  const [appId, setAppId] = useState(initialApp ?? "");
  const [purpose, setPurpose] = useState<"touch_up" | "non_touch_up">("touch_up");
  const [qty, setQty] = useState("0.25");
  const [note, setNote] = useState(request?.note ?? "");
  const [err, setErr] = useState<{ field?: string; msg: string }>();
  const busy = useRef(false);

  const chosen = apps.find((a) => a.app.id === appId);
  const cat = chosen ? catalogFor(db, chosen.app.product) : undefined;
  const q = cat ? reorderQuantity({ requestedGal: Number(qty), purpose, available: cat.available }) : undefined;
  const dup = chosen ? pendingReorderFor(db, property.id, chosen.app.id) : undefined;

  const submit = () => {
    // A repeated click lands here while the first is still running: ignore it.
    if (busy.current) return;
    busy.current = true;
    const res = act(createReorder, property.id, { applicationId: appId, touchUpRequestId: requestId, purpose, requestedGal: Number(qty), note });
    busy.current = false;
    if (!res.ok) return setErr({ field: res.field, msg: res.error });
    toast.success(`${res.value} started`, request ? `${request.id} marked converted.` : "Confirm payment, then approve.");
    onOpenChange(false);
    onCreated(res.value as string);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Start touch-up reorder"
      description={request ? `From touch-up request ${request.id} · ${request.requesterName}` : "Property-linked paint sale, up to two gallons, no estimate needed."}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!!dup || !appId}>
            <PaintBucket className="h-4 w-4" /> Create reorder
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {request && (
          <Banner tone="info" title={`Customer request ${request.id}`}>
            “{request.note}” — {request.requesterName}, {request.contact}, {dateLong(request.createdAt)}
          </Banner>
        )}
        <Field label="Colour record from property history" required htmlFor="tur-app" error={err?.field === "applicationId" ? err.msg : undefined}>
          <Select id="tur-app" value={appId} onChange={(e) => { setAppId(e.target.value); setErr(undefined); }} invalid={err?.field === "applicationId"}>
            <option value="">Choose a surface and colour…</option>
            {apps.map(({ app, surface, area, group }) => (
              <option key={app.id} value={app.id}>
                {area?.name} · {surface?.name} — {app.colourName} {app.colourNumber}, {app.sheen} ({group.jobId ?? "customer-reported"})
              </option>
            ))}
          </Select>
        </Field>
        {chosen && (
          <div className="flex items-start gap-3 rounded-xl border border-line p-3">
            <Swatch hex={chosen.app.hex} />
            <KV
              className="flex-1"
              items={[
                ["Colour", `${chosen.app.colourName} ${chosen.app.colourNumber}`],
                ["Product", chosen.app.product],
                ["Sheen", chosen.app.sheen],
                ["Pack sizes", cat ? cat.available.join(", ") : "Not in paint library"],
                ["Source", `${chosen.app.jobId ?? "Customer-reported"} · ${chosen.app.id}`],
              ]}
            />
          </div>
        )}
        {dup && (
          <Banner tone="warn" title={`Reorder ${dup.id} is already pending for this colour`} action={<AppLink href={reorderHref(property.id, dup.id)} onClick={() => onOpenChange(false)} className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold underline">Open {dup.id} <ExternalLink className="h-3 w-3" /></AppLink>}>
            Open it instead of creating a duplicate purchase.
          </Banner>
        )}
        <PillTabs
          value={purpose}
          onChange={setPurpose}
          options={[
            { value: "touch_up", label: "Touch-up (1 qt minimum)" },
            { value: "non_touch_up", label: "Other small order (1 gal minimum)" },
          ]}
        />
        <Field label="Quantity (gallons)" required htmlFor="tur-qty" error={err?.field === "requestedGal" ? err.msg : q && !q.ok ? q.error : undefined} hint={`Maximum ${TOUCH_UP_MAX_GAL} gallons. 1 quart = 0.25 gal.`}>
          <div className="flex flex-wrap items-center gap-2">
            <Input id="tur-qty" type="number" min={0} step={0.25} className="w-28" value={qty} onChange={(e) => { setQty(e.target.value); setErr(undefined); }} invalid={!!(q && !q.ok) || err?.field === "requestedGal"} />
            {QTY_PRESETS.map((p) => (
              <Button key={p.label} size="sm" variant={Number(qty) === p.gal ? "dark" : "secondary"} onClick={() => setQty(String(p.gal))}>{p.label}</Button>
            ))}
          </div>
        </Field>
        {q?.ok && (
          <Banner tone={q.note ? "warn" : "success"} title={`Order: ${formatPacks(q.packs)} (${q.orderGal} gal)`}>
            {q.note ?? "Matches the request exactly."}
          </Banner>
        )}
        <Field label="Note" htmlFor="tur-note">
          <Textarea id="tur-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What the paint is for" />
        </Field>
        {err && !err.field && <Banner tone="danger">{err.msg}</Banner>}
      </div>
    </Modal>
  );
}
