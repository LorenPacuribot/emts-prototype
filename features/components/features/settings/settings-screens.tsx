"use client";
/**
 * Live settings pages rebuilt for the new features:
 *   /settings                     index (the live app redirects to My Profile)
 *   /settings/general             General Configuration + NEW waste rules and packing objective (18)
 *   /settings/financial-settings  Financial Settings (deposit % drives the deposit invoice)
 *   /settings/surface-rates       Surface Rates + NEW suggestion and version history (30)
 *
 * Replica integration: these screens are NOT routed. The replica's own pages
 * (components/settings/**) embed the NEW parts instead: waste rules + packing
 * objective in GeneralConfigView, the deposit note + prototype save in
 * FinancialSettingsView, RateVersionsSection in SurfaceRatesView and
 * PaintCatalogSection in PaintLibraryView. Kept for reference.
 */
import { useState } from "react";
import { DollarSign, History, Layers, Percent, Ruler, Tag, Wallet } from "lucide-react";
import type { RateRecord } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { AppLink } from "@/features/lib/navigation";
import { can } from "@/features/lib/permissions";
import { setPackingStrategy } from "@/features/lib/store/actions/materials";
import { financialSettings, updateFinancialSettings, updateWasteSettings, wasteSettings } from "@/features/lib/store/actions/settings";
import { rateText, suggestionFor } from "@/features/lib/store/actions/feedback";
import { comboLabel } from "@/features/lib/rules/feedback";
import { BASE_LABOR_RATE } from "@/features/lib/rules/estimate";
import { reportsHref } from "@/features/lib/hrefs";
import { dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { Badge, Banner, Button, Input, Modal, NewBadge, Select, Switch } from "@/features/components/ui";
import { SettingsShell } from "./settings-shell";
import { SETTINGS_GROUPS } from "./settings-config";

const card = "space-y-6 rounded-2xl border-0 bg-white p-6 shadow-lg md:space-y-8 md:p-10";
const h3 = "border-b border-gray-100 pb-4 font-heading text-xl font-bold text-gray-900";

export function SettingsIndexScreen() {
  const built = SETTINGS_GROUPS.flatMap((g) => g.items.filter((i) => i.built));
  return (
    <SettingsShell page="index" subtitle="The live pages the new features change. The rest of the sidebar is the live app, not rebuilt.">
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {built.map((i) => (
          <AppLink key={i.id} href={`/settings/${i.id}`} className="flex h-full flex-col rounded-2xl border-0 bg-white p-6 shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl">
            <i.icon className="h-6 w-6 text-primary-600" />
            <div className="mt-3 flex items-center gap-2 font-heading text-lg font-bold text-gray-900">{i.label}{i.isNew && <NewBadge feature={i.feature} />}</div>
          </AppLink>
        ))}
      </div>
    </SettingsShell>
  );
}

/* ------------------------------------------------------------------ */

export function GeneralConfigScreen() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const w = wasteSettings(db);
  const [pct, setPct] = useState(String(w.defaultWastePercent));
  const strategy = db.procurementSettings?.packingStrategy ?? "least_leftover";
  return (
    <SettingsShell page="general" subtitle="Manage financial defaults, multiplier tiers, and material calculation rules.">
      <div className="grid gap-6 md:gap-8 lg:grid-cols-2">
        <div className={card}>
          <h3 className={h3}><span className="inline-flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary-600" /> Financial Defaults</span></h3>
          {[["Base Labor Rate ($/hr)", BASE_LABOR_RATE, "Applied when no specific rate override exists."], ["Labor Margin (%)", 20, 'Applied when "Labor Rate" pricing is selected.'], ["Operating Expense (%)", 1, "A general operating expense, which is a percentage."]].map(([l, v, h]) => (
            <div key={l as string}><div className="text-sm font-semibold text-gray-700">{l}</div><Input defaultValue={String(v)} className="mt-1" readOnly /><p className="mt-1 text-xs text-gray-500">{h}</p></div>
          ))}
        </div>
        <div className={card}>
          <h3 className={h3}><span className="inline-flex items-center gap-2"><Ruler className="h-5 w-5 text-primary-600" /> Measurement &amp; Waste</span></h3>
          <Switch checked={w.calculateWaste} disabled={!can(user, "settings.masterData")} onCheckedChange={(v) => act(updateWasteSettings, { calculateWaste: v }).ok && toast.success("Waste settings saved")} label="Calculate Waste" />
          {w.calculateWaste && (
            <div>
              <div className="text-sm font-semibold text-gray-700">Waste Percentage</div>
              <Input type="number" value={pct} onChange={(e) => setPct(e.target.value)} onBlur={() => Number(pct) !== w.defaultWastePercent && act(updateWasteSettings, { defaultWastePercent: Number(pct) }).ok && toast.success("Waste settings saved")} className="mt-1 w-32" disabled={!can(user, "settings.masterData")} />
            </div>
          )}
          <div className="rounded-xl border border-green-200 bg-green-50/40 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-900">Waste rules for material orders <NewBadge feature={18} /></div>
            <p className="mb-3 text-xs text-gray-500">Material demand on the work order uses the single highest rule that matches a specification. Allowances are never added together.</p>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-green-100">
                {[["Interior repaint", "5%"], ["Exterior, or any spray application", "10%"], ["Rough surface", "15%"]].map(([a, b]) => <tr key={a}><td className="py-1.5 text-gray-700">{a}</td><td className="py-1.5 text-right font-bold">{b}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50/40 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-900">Container packing objective <NewBadge feature={18} /></div>
            <Select value={strategy} disabled={!can(user, "catalog.edit")} onChange={(e) => act(setPackingStrategy, e.target.value as "least_leftover" | "lowest_price").ok && toast.success("Packing objective changed")} className="w-60">
              <option value="least_leftover">Least leftover</option>
              <option value="lowest_price">Lowest price</option>
            </Select>
          </div>
        </div>
        <div className={card}>
          <h3 className={h3}><span className="inline-flex items-center gap-2"><Tag className="h-5 w-5 text-primary-600" /> Project Discounts</span></h3>
          {[["Repeat Customer", "10% Off"], ["Large Project", "5% Off"], ["Referral Discount", "$100.00 Flat"]].map(([a, b]) => <div key={a} className="flex justify-between text-sm"><span className="text-gray-700">{a}</span><Badge tone="green">{b}</Badge></div>)}
        </div>
        <div className={card}>
          <h3 className={h3}><span className="inline-flex items-center gap-2"><Layers className="h-5 w-5 text-primary-600" /> Difficulty Tiers</span></h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2"><div className="text-xs font-bold uppercase tracking-widest text-gray-500">Height Tiers</div>{[["Standard (8-9ft)", "x1.0"], ["High (10-12ft)", "x1.2"], ["Vaulted / 2-Story", "x1.5"]].map(([a, b]) => <div key={a} className="flex justify-between"><span>{a}</span><Badge tone="blue">{b}</Badge></div>)}</div>
            <div className="space-y-2"><div className="text-xs font-bold uppercase tracking-widest text-gray-500">Access Tiers</div>{[["Empty / Easy", "x1.0"], ["Furnished / Standard", "x1.1"], ["Occupied / Heavy Furniture", "x1.25"]].map(([a, b]) => <div key={a} className="flex justify-between"><span>{a}</span><Badge tone="amber">{b}</Badge></div>)}</div>
          </div>
        </div>
      </div>
    </SettingsShell>
  );
}

/* ------------------------------------------------------------------ */

export function FinancialSettingsScreen() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const f = financialSettings(db);
  const [draft, setDraft] = useState(f);
  const dirty = JSON.stringify(draft) !== JSON.stringify(f);
  const canEdit = can(user, "settings.masterData");
  return (
    <SettingsShell page="financial-settings" subtitle="Configure payment methods, deposits, and terms."
      actions={canEdit && <Button variant="primary" disabled={!dirty} onClick={() => act(updateFinancialSettings, { applyProfitToMiscLineItems: draft.applyProfitToMiscLineItems, miscLineItemProfitMargin: draft.miscLineItemProfitMargin, depositPercent: draft.depositPercent }).ok && toast.success("Settings saved")}>Save Changes</Button>}>
      <div className="grid gap-6 md:gap-8 lg:grid-cols-2">
        <div className={card}>
          <h3 className={h3}><span className="inline-flex items-center gap-2"><Percent className="h-5 w-5 text-primary-600" /> Profit Markup</span></h3>
          <p className="text-sm text-gray-500">Apply a profit margin to miscellaneous line items in estimates.</p>
          <Switch checked={draft.applyProfitToMiscLineItems} disabled={!canEdit} onCheckedChange={(v) => setDraft({ ...draft, applyProfitToMiscLineItems: v })} label="Apply Profit to Misc Line Items" />
          <div><div className="text-sm font-semibold text-gray-700">Misc Line Item Profit Margin (%)</div><Input type="number" step={0.5} value={draft.miscLineItemProfitMargin} disabled={!canEdit || !draft.applyProfitToMiscLineItems} onChange={(e) => setDraft({ ...draft, miscLineItemProfitMargin: Number(e.target.value) })} className="mt-1 w-32" /></div>
          <Banner tone="info">When enabled, all miscellaneous line items will have this margin applied to their unit price.</Banner>
        </div>
        <div className={card}>
          <h3 className={h3}><span className="inline-flex items-center gap-2"><Wallet className="h-5 w-5 text-primary-600" /> Deposit Requirements</span></h3>
          <p className="text-sm text-gray-500">Set the deposit percentage required before a job can proceed.</p>
          <div><div className="text-sm font-semibold text-gray-700">Deposit Percentage (%)</div><Input type="number" value={draft.depositPercent} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, depositPercent: Number(e.target.value) })} className="mt-1 w-32" /><p className="mt-1 text-xs text-gray-500">Percentage of estimate total required as deposit before job creation.</p></div>
          <Banner tone="info">Set to 0 to disable deposit requirement. Work orders will skip the pending deposit status.</Banner>
        </div>
      </div>
    </SettingsShell>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Live Surface Rates: groups of rates with Item Name, Unit and Base Rate
 * (1st Coat). The rows are the production-rate records that feature 30
 * adjusts. NEW (30): each row's current suggestion and its version history;
 * "Apply" happens through the owner's approval in Reports › Estimating Feedback.
 */
export function SurfaceRatesScreen() {
  const db = useDb((d) => d);
  const [versionsFor, setVersionsFor] = useState<RateRecord>();
  const rates = db.rateRecords.filter((r) => r.kind === "productivity");
  const groups = [
    { name: "Interior", rows: rates.filter((r) => r.comboKey.split("|")[1] === "interior") },
    { name: "Exterior", rows: rates.filter((r) => r.comboKey.split("|")[1] === "exterior") },
  ].filter((g) => g.rows.length);
  return (
    <SettingsShell page="surface-rates" subtitle="Define your labor efficiency organized by category.">
      {groups.length === 0 && <div className="rounded-2xl bg-white p-10 text-center shadow-lg"><div className="font-heading text-lg font-bold">No Surface Rates Yet</div><p className="text-sm text-gray-500">Start by adding a group to organize your surface rates.</p></div>}
      <div className="space-y-10">
        {groups.map((g) => (
          <div key={g.name} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg">
            <div className="bg-gray-50/50 px-6 py-5 md:px-8"><h3 className="font-heading text-xl font-bold text-gray-900">{g.name}</h3><div className="text-xs text-gray-500">Standard Repaint</div></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-gray-100">
                  <tr>
                    {["Item Name", "Unit", "Base Rate (1st Coat)"].map((h) => <th key={h} className="px-6 py-4 text-xs font-extrabold uppercase tracking-wider text-gray-500">{h}</th>)}
                    <th className="px-6 py-4 text-xs font-extrabold uppercase tracking-wider text-gray-500"><span className="inline-flex items-center gap-1.5">Suggestion</span></th>
                    <th className="px-6 py-4 text-xs font-extrabold uppercase tracking-wider text-gray-500"><span className="inline-flex items-center gap-1.5">Versions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {g.rows.map((r) => {
                    const s = suggestionFor(db, r);
                    const [surf, , tier, method, cond] = comboLabel(r.comboKey).split(" · ");
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-4 font-semibold text-gray-900">{surf} <span className="font-normal text-gray-500">· {tier} · {method} · {cond}</span></td>
                        <td className="px-6 py-4"><span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-600">SqFt</span></td>
                        <td className="px-6 py-4 font-bold text-gray-900">{rateText(r, r.value)}</td>
                        <td className="px-6 py-4">
                          <AppLink href={`${reportsHref("estimating_feedback")}&rate=${r.id}`} className="inline-flex items-center gap-2">
                            <Badge tone={s.status === "suggested" ? "amber" : s.status === "approved" ? "green" : "gray"}>{s.status.replace(/_/g, " ")}</Badge>
                            {s.status === "suggested" && <span className="text-xs font-semibold text-primary-700">{rateText(r, s.observed)} →</span>}
                          </AppLink>
                        </td>
                        <td className="px-6 py-4"><button onClick={() => setVersionsFor(r)} className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:underline"><History className="h-3.5 w-3.5" /> v{r.versions.at(-1)?.version ?? 1} · {r.versions.length} version{r.versions.length === 1 ? "" : "s"}</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      <Modal open={!!versionsFor} onOpenChange={(v) => !v && setVersionsFor(undefined)} title={`Rate versions · ${versionsFor ? comboLabel(versionsFor.comboKey) : ""}`} description="A rate is never overwritten in place. Every change is a new version that the owner approved.">
        <div className="space-y-2">
          {[...(versionsFor?.versions ?? [])].reverse().map((v) => (
            <div key={v.version} className="rounded-xl border border-gray-200 p-3 text-sm">
              <div className="flex justify-between"><b>v{v.version} · {versionsFor && rateText(versionsFor, v.value)}</b><span className="text-xs text-gray-500">{dateTime(v.at)}</span></div>
              <div className="text-xs text-gray-500">{v.kind} by {db.users.find((u) => u.id === v.by)?.name}{v.previous !== undefined && versionsFor ? ` · was ${rateText(versionsFor, v.previous)}` : ""}</div>
              <div className="mt-1 text-gray-700">{v.reason}</div>
            </div>
          ))}
        </div>
      </Modal>
    </SettingsShell>
  );
}

