"use client";
/**
 * Component 28.3 — Pricing Basis And Productivity Policy.
 * Wages, material prices, markup and tax are always current. Historical
 * productivity only under an owner-approved policy for the property type.
 */
import { BadgeCheck, Calculator, History, ShieldCheck } from "lucide-react";
import type { Property, RepeatEstimate } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { approveProductivityPolicy, historicalJob, repPricing, setProductivityMode } from "@/features/lib/store/actions/future-estimate";
import { CURRENT_BASIS, HISTORICAL_RATE_WARN_MONTHS, NO_POLICY_MESSAGE } from "@/features/lib/rules/future-estimate";
import { can } from "@/features/lib/permissions";
import { dateLong, money, titleCase } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { byId } from "@/features/lib/selectors";
import { Badge, Banner, Button, Card, CardLabel, KV, MicroLabel, Switch } from "@/features/components/ui";

export function PricingPanel({ rep, property, readOnly }: { rep: RepeatEstimate; property: Property; readOnly: boolean }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const pricing = repPricing(db, rep);
  const seePrices = can(user, "materials.seePrices");
  const products = Array.from(new Map(pricing.lines.map((l) => [l.line.product, l.catalog])).entries());
  const discounts = Array.from(new Set(rep.lines.map((l) => l.sourceJobId)))
    .map((id) => historicalJob(db, id))
    .filter((j) => j?.discountPct);
  const staleLines = pricing.lines.filter((l) => l.productivity.stale);

  return (
    <Card className="p-5">
      <CardLabel icon={<Calculator />}>Pricing basis</CardLabel>
      <div className="mt-3 space-y-3">
        <KV
          items={[
            ["Wage rate", <span key="w">${CURRENT_BASIS.wageRate}/hr <span className="block text-[11px] font-normal text-slate-400">{CURRENT_BASIS.wageSource}</span></span>],
            ["Markup", <span key="m">{CURRENT_BASIS.markupPct}% <span className="block text-[11px] font-normal text-slate-400">{CURRENT_BASIS.markupSource}</span></span>],
            ["Tax rate", <span key="t">{CURRENT_BASIS.taxRatePct}% <span className="block text-[11px] font-normal text-slate-400">{CURRENT_BASIS.taxSource}</span></span>],
          ]}
        />
        <div>
          <MicroLabel>Current material prices (paint library)</MicroLabel>
          <ul className="mt-1 space-y-0.5 text-[12px] text-slate-600">
            {products.map(([product, cat]) => (
              <li key={product} className="flex justify-between gap-2">
                <span className="truncate">{product}</span>
                <span className="whitespace-nowrap font-medium text-ink">
                  {!cat ? <span className="text-amber-700">Not in catalog</span> : cat.discontinued ? <span className="text-red-600">Discontinued</span> : seePrices ? `${money(cat.cost.gal ?? (cat.cost.qt ?? 0) * 4)}/gal` : "Current price applied"}
                </span>
              </li>
            ))}
            {products.length === 0 && <li className="italic text-slate-400">No lines yet.</li>}
          </ul>
          {!seePrices && <p className="mt-1 text-[11px] text-slate-400">Cost per gallon is visible to the Owner and Office Manager.</p>}
        </div>

        {discounts.map((j) => (
          <Banner key={j!.id} tone="info" title="Historical discount not carried forward">
            {j!.id} had a {j!.discountPct}% {j!.discountNote?.toLowerCase() ?? "discount"}. This quote is priced at today's rates with no discount.
          </Banner>
        ))}

        <div className="rounded-xl border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                <History className="h-3.5 w-3.5 text-brand" /> Historical productivity
              </div>
              <div className="text-[11.5px] text-slate-500">
                {pricing.policy ? (
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3 text-emerald-600" /> Owner policy for {titleCase(property.type)} approved {dateLong(pricing.policy.approvedAt)} by {byId(db.users, pricing.policy.approvedBy)?.name}
                  </span>
                ) : (
                  NO_POLICY_MESSAGE
                )}
              </div>
            </div>
            <Switch
              checked={rep.useHistoricalProductivity}
              disabled={readOnly}
              onCheckedChange={(v) => {
                const res = act(setProductivityMode, rep.id, v);
                if (res.ok) toast.success(v ? "Historical productivity in use" : "Current rates in use");
              }}
              label={<span className="sr-only">Use historical productivity</span>}
            />
          </div>
          {!pricing.policy && can(user, "repeat.approveProductivity") && !readOnly && (
            <Button
              size="sm"
              variant="primary"
              className="mt-2"
              onClick={() => act(approveProductivityPolicy, property.type).ok && toast.success("Policy approved", `Estimators may now reuse historical productivity for ${titleCase(property.type)} properties.`)}
            >
              <BadgeCheck className="h-3.5 w-3.5" /> Approve policy for {titleCase(property.type)}
            </Button>
          )}
          {rep.useHistoricalProductivity && (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-1">
                <Badge tone="blue">{pricing.historicalCount} line{pricing.historicalCount === 1 ? "" : "s"} on historical rates</Badge>
                {pricing.historicalCount > 0 && <Badge tone={pricing.oldestMonths > HISTORICAL_RATE_WARN_MONTHS ? "amber" : "gray"}>Oldest rate {pricing.oldestMonths} months</Badge>}
              </div>
              {staleLines.length > 0 && (
                <Banner tone="warn" title={`Historical rates are ${pricing.oldestMonths} months old`}>
                  Rates older than {HISTORICAL_RATE_WARN_MONTHS} months may not reflect how the crew works today. Check them, or request current rates instead.
                </Banner>
              )}
              {pricing.fallbacks.length > 0 && (
                <Banner tone="info" title="Current rate applied where history has no rate">
                  <ul className="list-disc pl-4">{pricing.fallbacks.map((f) => <li key={f.line.id}>{f.combination}</li>)}</ul>
                  No rate is reconstructed or guessed.
                </Banner>
              )}
              {!readOnly && (
                <Button size="sm" onClick={() => act(setProductivityMode, rep.id, false).ok && toast.success("Current rates in use")}>
                  Request current rates instead
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-line pt-3">
          <KV
            items={[
              ["Subtotal", money(pricing.totals.subtotal)],
              [`Tax (${CURRENT_BASIS.taxRatePct}%)`, money(pricing.totals.tax)],
              [<strong key="t">Quote total</strong>, <strong key="v">{money(pricing.totals.total)}</strong>],
            ]}
          />
        </div>
      </div>
    </Card>
  );
}
