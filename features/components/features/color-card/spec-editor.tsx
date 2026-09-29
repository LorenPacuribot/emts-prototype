"use client";
/**
 * Component 3.2 — Specification Editor.
 * Application detail, surface assignment, lifespan and ordering detail.
 * When the spec is approved on a signed job, Cross-Feature Rule 1 decides
 * whether the change can be saved or needs a change order.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, FileDiff, Lock, Plus, X } from "lucide-react";
import type { SpecLine } from "@/features/types";
import { act, getDb, useCurrentUser, useDb } from "@/features/lib/store";
import { approvalGaps, createChangeOrderFromSpec, previewChange, saveSpec, type SpecDraft } from "@/features/lib/store/actions/color-card";
import { byId, jobSurfaces, orderingGaps } from "@/features/lib/selectors";
import { toast } from "@/features/lib/toast";
import { useNav } from "@/features/lib/navigation";
import { labelRoomType, specLifespanDefault } from "@/features/lib/rules/lifespan";
import { Banner, Button, Checkbox, Field, Input, Modal, Select, Swatch, Tooltip } from "@/features/components/ui";
import { jobHref } from "@/features/lib/hrefs";
import { COAT_STEPS, PRIMERS, SHEENS, TINT_BASES } from "./constants";

export function SpecEditor({ open, onOpenChange, jobId, colourId, spec }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobId: string;
  colourId: string;
  spec?: SpecLine;
}) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const nav = useNav();
  const job = byId(db.jobs, jobId)!;
  const colour = byId(db.colours, colourId);
  const surfaces = jobSurfaces(db, job);

  const defaultLifespan = (d: SpecDraft) => specLifespanDefault(db, d.surfaceIds, { manufacturer: colour?.manufacturer, productLine: d.productLine, product: d.product });

  const blank = (): SpecDraft => ({ sheen: undefined, coats: 2, primer: "", coatSequence: ["Finish coat 1", "Finish coat 2"], surfaceIds: [], lifespanYears: 7, productLine: "", product: "", tintBase: "" });
  const [draft, setDraft] = useState<SpecDraft>(blank());
  const [lifespanTouched, setLifespanTouched] = useState(false);
  const [openedVersion, setOpenedVersion] = useState<number>();
  const [error, setError] = useState<{ field?: string; message: string }>();

  useEffect(() => {
    if (!open) return;
    setError(undefined);
    setLifespanTouched(false);
    setOpenedVersion(getDb().jobs.find((j) => j.id === jobId)?.cardRowVersion);
    setDraft(
      spec
        ? { sheen: spec.sheen, coats: spec.coats, primer: spec.primer ?? "", coatSequence: [...spec.coatSequence], surfaceIds: [...spec.surfaceIds], lifespanYears: spec.lifespanYears, productLine: spec.productLine ?? "", product: spec.product ?? "", tintBase: spec.tintBase ?? "" }
        : blank(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, spec?.id]);

  const set = <K extends keyof SpecDraft>(k: K, v: SpecDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setError(undefined);
  };

  // Lifespan follows the library default for new specs until the user edits it.
  useEffect(() => {
    if (!spec && !lifespanTouched && (draft.surfaceIds.length || draft.product || draft.productLine)) set("lifespanYears", defaultLifespan(draft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.surfaceIds.join(","), draft.productLine, draft.product]);

  const lines = useMemo(() => Array.from(new Set(db.catalog.filter((c) => c.manufacturer === colour?.manufacturer).map((c) => c.productLine))), [db.catalog, colour?.manufacturer]);
  const products = db.catalog.filter((c) => c.productLine === draft.productLine);
  const decision = spec ? previewChange(db, spec, draft) : undefined;
  const lifespanLocked = !!spec?.lifespanLocked && user.role !== "owner";
  const lifespanChanged = !!spec && draft.lifespanYears !== spec.lifespanYears;
  const gaps = approvalGaps(draft);
  const orderGaps = orderingGaps({ ...(spec ?? ({} as SpecLine)), ...draft, state: "approved" } as SpecLine).filter((g) => g !== "approval");

  // "Changing a draft shows which surfaces and calculations are affected before saving."
  const affected = spec
    ? Array.from(new Set([...spec.surfaceIds, ...draft.surfaceIds])).filter((id) => spec.surfaceIds.includes(id) !== draft.surfaceIds.includes(id) || draft.sheen !== spec.sheen || draft.coats !== spec.coats)
    : [];

  function save(another = false) {
    const res = act(saveSpec, { jobId, colourId, specId: spec?.id, draft, expectedVersion: openedVersion });
    if (!res.ok) {
      setError({ field: res.field, message: res.error });
      return;
    }
    toast.success(spec ? "Specification saved" : "Specification added", colour?.name);
    if (another) {
      setDraft(blank());
      setOpenedVersion(getDb().jobs.find((j) => j.id === jobId)?.cardRowVersion);
    } else onOpenChange(false);
  }

  function createCO() {
    if (!spec || !decision) return;
    const res = act(createChangeOrderFromSpec, spec.id, draft, decision.kind === "change_order" ? decision.reason : "");
    if (res.ok) {
      toast.success("Change order drafted", `${res.value} — price it and send it for signature.`);
      onOpenChange(false);
      nav.push(jobHref(jobId, "change-orders"));
    }
  }

  const byArea = surfaces.reduce<Record<string, typeof surfaces>>((acc, s) => {
    (acc[s.areaId] ??= []).push(s);
    return acc;
  }, {});

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={spec ? `Edit specification ${spec.id}` : "Add specification"}
      description={
        colour && (
          <span className="inline-flex items-center gap-2">
            <Swatch hex={colour.hex} size="sm" /> {colour.name} · {colour.number} · {colour.manufacturer}
          </span>
        )
      }
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          {!spec && <Button onClick={() => save(true)}>Save and add another</Button>}
          {decision?.kind === "change_order" ? (
            <Button variant="primary" onClick={createCO}>
              <FileDiff className="h-4 w-4" /> Create change order
            </Button>
          ) : (
            <Button variant="primary" onClick={() => save(false)}>
              Save
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        {error && <Banner tone="danger" title="Can't save yet">{error.message}</Banner>}

        {decision && decision.kind !== "no_change" && (
          <Banner
            tone={decision.kind === "change_order" ? "warn" : "info"}
            title={
              {
                change_order: "Needs a priced change order signed by the customer",
                office_approval: "The office manager can approve this alone",
                colour_reapproval: "Needs a color re-approval from the customer",
                draft_edit: "Change it by amending the estimate",
                no_change: "",
              }[decision.kind]
            }
          >
            {decision.reason} Verbal approval never qualifies.
          </Banner>
        )}

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Application detail · required before approval</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Sheen" required htmlFor="sp-sheen" error={error?.field === "sheen" ? error.message : undefined}>
              <Select id="sp-sheen" value={draft.sheen ?? ""} onChange={(e) => set("sheen", (e.target.value || undefined) as SpecDraft["sheen"])}>
                <option value="">Select sheen…</option>
                {SHEENS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Coats" required htmlFor="sp-coats" error={error?.field === "coats" ? error.message : undefined}>
              <div className="flex items-center gap-1">
                <Button size="icon" aria-label="Fewer coats" onClick={() => set("coats", Math.max(1, (draft.coats ?? 1) - 1))}>
                  −
                </Button>
                <Input id="sp-coats" type="number" min={1} step={1} value={draft.coats ?? ""} onChange={(e) => set("coats", e.target.value === "" ? undefined : Number(e.target.value))} className="w-16 text-center" />
                <Button size="icon" aria-label="More coats" onClick={() => set("coats", (draft.coats ?? 0) + 1)}>
                  +
                </Button>
              </div>
            </Field>
            <Field label="Primer" required htmlFor="sp-primer" error={error?.field === "primer" ? error.message : undefined} hint={!draft.primer ? "Blank blocks approval." : undefined}>
              <Select id="sp-primer" value={draft.primer} onChange={(e) => set("primer", e.target.value)} invalid={error?.field === "primer"}>
                <option value="">Select primer…</option>
                {PRIMERS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Coat sequence" required className="mt-4" error={error?.field === "coatSequence" ? error.message : undefined}>
            <ol className="space-y-1.5">
              {draft.coatSequence.map((step, i) => (
                <li key={`${step}-${i}`} className="flex items-center gap-2 rounded-lg border border-line bg-gray-50 px-3 py-1.5 text-xs">
                  <span className="w-5 text-xs font-bold text-gray-500">{i + 1}.</span>
                  <span className="flex-1 font-medium">{step}</span>
                  <button aria-label="Move up" disabled={i === 0} onClick={() => set("coatSequence", swap(draft.coatSequence, i, i - 1))} className="text-gray-500 hover:text-ink disabled:opacity-30">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button aria-label="Move down" disabled={i === draft.coatSequence.length - 1} onClick={() => set("coatSequence", swap(draft.coatSequence, i, i + 1))} className="text-gray-500 hover:text-ink disabled:opacity-30">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button aria-label={`Remove ${step}`} onClick={() => set("coatSequence", draft.coatSequence.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ol>
            <Select
              value=""
              onChange={(e) => e.target.value && set("coatSequence", [...draft.coatSequence, e.target.value])}
              className="mt-2 w-full sm:w-64"
              aria-label="Add a step"
            >
              <option value="">+ Add step…</option>
              {COAT_STEPS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Assign surfaces · required before approval</h3>
          {error?.field === "surfaceIds" && <p className="mb-2 text-xs text-red-600">{error.message}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(byArea).map(([areaId, list]) => {
              const area = byId(db.areas, areaId);
              return (
                <div key={areaId} className="rounded-xl border border-line p-3">
                  <div className="mb-2 text-xs font-bold text-ink">
                    {area?.name} <span className="font-normal text-gray-500">· {labelRoomType(area?.roomType ?? "")}</span>
                  </div>
                  <div className="space-y-1.5">
                    {list.map((s) => {
                      const other = db.specs.find((sp) => sp.id !== spec?.id && sp.jobId === jobId && sp.surfaceIds.includes(s.id));
                      return (
                        <div key={s.id}>
                          <Checkbox
                            checked={draft.surfaceIds.includes(s.id)}
                            onCheckedChange={(v) => set("surfaceIds", v ? [...draft.surfaceIds, s.id] : draft.surfaceIds.filter((x) => x !== s.id))}
                            label={
                              <span>
                                {s.name} <span className="text-gray-500">({s.areaSqft} sq ft)</span>
                                {other && <span className="ml-1 text-xs text-amber-600">also on {other.id}</span>}
                              </span>
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {affected.length > 0 && (
            <Banner tone="info" className="mt-3" title="Affected by this change">
              {affected.map((id) => byId(db.surfaces, id)?.name).join(", ")} — material demand for these surfaces will be recalculated. Other specification lines are not changed.
            </Banner>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Lifespan (years)"
            htmlFor="sp-life"
            error={error?.field === "lifespan" ? error.message : undefined}
            hint={lifespanLocked ? undefined : spec ? "Estimators change this only on a draft, with a reason." : "Defaults from the lifespan library (product, product line, surface type, then room). Carried to closeout and used for the repaint date."}
          >
            {lifespanLocked ? (
              <Tooltip content="Locked by owner override">
                <div className="flex h-10 items-center gap-2 rounded-lg border border-line bg-gray-50 px-3 text-sm text-gray-500">
                  <Lock className="h-3.5 w-3.5" /> {draft.lifespanYears} yrs
                </div>
              </Tooltip>
            ) : (
              <Input
                id="sp-life"
                type="number"
                min={1}
                value={draft.lifespanYears}
                onChange={(e) => {
                  setLifespanTouched(true);
                  set("lifespanYears", Number(e.target.value));
                }}
              />
            )}
          </Field>
          {lifespanChanged && user.role !== "owner" && (
            <Field label="Reason for lifespan change" required htmlFor="sp-life-r" className="sm:col-span-2" error={error?.field === "lifespanReason" ? error.message : undefined}>
              <Input id="sp-life-r" value={draft.lifespanReason ?? ""} onChange={(e) => set("lifespanReason", e.target.value)} />
            </Field>
          )}
        </section>

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Ordering detail · required before ordering, not before approval</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Product line" htmlFor="sp-line">
              <Select id="sp-line" value={draft.productLine} onChange={(e) => setDraft((d) => ({ ...d, productLine: e.target.value, product: "" }))}>
                <option value="">Not chosen</option>
                {lines.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Specific product" htmlFor="sp-prod">
              <Select id="sp-prod" value={draft.product} onChange={(e) => set("product", e.target.value)} disabled={!draft.productLine}>
                <option value="">Not chosen</option>
                {products.map((p) => (
                  <option key={p.id}>{p.product}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tint base" htmlFor="sp-base">
              <Select id="sp-base" value={draft.tintBase} onChange={(e) => set("tintBase", e.target.value)}>
                <option value="">Not chosen</option>
                {TINT_BASES.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </Select>
            </Field>
          </div>
        </section>

        <div className="grid gap-3 rounded-xl bg-gray-50 p-4 text-xs sm:grid-cols-2">
          <div>
            <div className="font-bold text-ink">Approval readiness</div>
            {gaps.length === 0 ? <div className="text-green-700">Ready to send for approval.</div> : gaps.map((g) => <div key={g.field} className="text-amber-700">• {g.message}</div>)}
          </div>
          <div>
            <div className="font-bold text-ink">Ordering readiness</div>
            {orderGaps.length === 0 ? <div className="text-green-700">All ordering fields filled. Orderable once approved.</div> : <div className="text-amber-700">Missing: {orderGaps.join(", ")}.</div>}
          </div>
        </div>
        {!spec && (
          <p className="flex items-center gap-1 text-xs text-gray-500">
            <Plus className="h-3 w-3" /> Each specification is a separate line. Adding one never overwrites another under the same color.
          </p>
        )}
      </div>
    </Modal>
  );
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
