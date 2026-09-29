"use client";
/**
 * Component 18.4 — Quantity State and Balance Panel. Implements Cross-Feature
 * Rule 2 exactly and uses the same words:
 *   Outstanding demand = calculated demand − reserved shelf stock − net acknowledged
 *   Net acknowledged   = acknowledged − confirmed cancellations − confirmed returns
 *   Orderable now      = outstanding demand − sent-but-unacknowledged holds
 */
import { Scale } from "lucide-react";
import { useDb } from "@/features/lib/store";
import { lineState, type DemandLine } from "@/features/lib/rules/procurement";
import { Badge, Card, CardLabel, EmptyState, Table, TD, TH, THead, TR } from "@/features/components/ui";

const f = (n: number) => n.toFixed(2);

export function QuantityPanel({ lines }: { lines: DemandLine[] }) {
  const db = useDb((d) => d);
  const orderable = lines.filter((l) => l.blocked.length === 0);
  return (
    <Card className="p-4">
      <CardLabel icon={<Scale />}>Quantity states (gal)</CardLabel>
      <p className="mt-1 text-xs text-gray-500">Sent means ordered. Supplier acknowledgment means purchased. Physical possession means received. Nothing is released on a timer.</p>
      <div className="mt-3">
        {orderable.length === 0 ? <EmptyState title="No orderable lines yet." body="Lines appear here once their specification is approved and orderable." /> : (
          <Table>
            <THead>
              <tr>
                <TH className="w-[200px]">Line</TH>
                <TH className="text-right"><span className="ml-auto block max-w-[90px] whitespace-normal">Paint needed</span></TH>
                <TH className="text-right"><span className="ml-auto block max-w-[90px] whitespace-normal">From shelf stock</span></TH>
                <TH className="text-right"><span className="ml-auto block max-w-[90px] whitespace-normal">Ordered, not confirmed</span></TH>
                <TH className="text-right"><span className="ml-auto block max-w-[110px] whitespace-normal">Confirmed by supplier</span></TH>
                <TH className="text-right"><span className="ml-auto block max-w-[90px] whitespace-normal">Received</span></TH>
                <TH className="text-right"><span className="ml-auto block max-w-[90px] whitespace-normal">Still needed</span></TH>
                <TH className="text-right"><span className="ml-auto block max-w-[90px] whitespace-normal">Can order now</span></TH>
              </tr>
            </THead>
            <tbody>
              {orderable.map((l) => {
                const s = lineState(db, l.jobId, l.specId, l.needGal);
                const held = s.orderableNow === 0 && s.sentUnacknowledged > 0 && s.outstanding > 0;
                return (
                  <TR key={l.specId}>
                    <TD className="max-w-[220px] whitespace-normal">
                      <div className="font-semibold text-ink">{l.colourName}</div>
                      <div className="text-xs text-gray-500">{l.specId} · {s.orders.length} order line{s.orders.length === 1 ? "" : "s"}</div>
                      {held && <Badge tone="blue" className="mt-1 whitespace-normal">Already ordered, awaiting acknowledgment.</Badge>}
                      {s.unfilled > 0 && <Badge tone="amber" className="mt-1 whitespace-normal">Partially filled: {f(s.received)} received · {f(s.unfilled)} unfilled</Badge>}
                      {s.requestedCancellations > 0 && <div className="mt-1 text-xs text-gray-500">{f(s.requestedCancellations)} gal cancellation requested — not confirmed, no change</div>}
                    </TD>
                    <TD className="text-right tabular-nums">{f(s.calculated)}</TD>
                    <TD className="text-right tabular-nums">{f(s.reservedShelf)}</TD>
                    <TD className="text-right tabular-nums">{f(s.sentUnacknowledged)}</TD>
                    <TD className="text-right tabular-nums">{f(s.acknowledged)}{(s.confirmedCancellations > 0 || s.confirmedReturns > 0) && <div className="text-xs text-gray-500">{f(s.netAcknowledged)} after {f(s.confirmedCancellations)} canceled and {f(s.confirmedReturns)} returned</div>}</TD>
                    <TD className="text-right tabular-nums">{f(s.received)}</TD>
                    <TD className="text-right font-semibold tabular-nums text-ink">{f(s.outstanding)}</TD>
                    <TD className={`text-right font-bold tabular-nums ${s.orderableNow > 0 ? "text-brand" : "text-gray-500"}`}>{f(s.orderableNow)}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>
      <details className="mt-2 text-xs text-gray-500">
        <summary className="cursor-pointer font-semibold text-primary-700 hover:underline">How is this calculated?</summary>
        <p className="mt-1">Still needed = paint needed − shelf stock − (confirmed by supplier − confirmed cancellations − confirmed returns). Can order now = still needed − ordered but not confirmed yet (including generated orders not sent yet).</p>
      </details>
    </Card>
  );
}
