"use client";
/**
 * NEW (feature 30), embedded in the replica's Settings › Surface Rates
 * (components/settings/library/SurfaceRatesView.tsx), below the live groups.
 * The production-rate records that Estimating Feedback adjusts: current rate,
 * the current suggestion (links to Reports › Estimating Feedback with &rate=,
 * where the owner approves it) and the version history. A rate is never
 * overwritten in place; approving a suggestion adds a version.
 * Visible to roles with settings.engineCalibration (the page's live permission).
 */
import { useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import type { RateRecord } from "@/features/types";
import { useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { rateText, suggestionFor } from "@/features/lib/store/actions/feedback";
import { comboLabel } from "@/features/lib/rules/feedback";
import { reportsHref } from "@/features/lib/hrefs";
import { dateTime } from "@/features/lib/format";
import { Badge, Modal, NewBadge } from "@/features/components/ui";

const STATUS_TONE = { suggested: "amber", approved: "green", suppressed: "amber", insufficient: "gray", disabled: "gray" } as const;
const STATUS_LABEL = { suggested: "Suggested", approved: "Approved", suppressed: "Rejected and suppressed", insufficient: "Insufficient evidence", disabled: "Disabled" } as const;

export function RateVersionsSection() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [versionsFor, setVersionsFor] = useState<RateRecord>();
  if (!can(user, "settings.engineCalibration")) return null;
  const rates = db.rateRecords.filter((r) => r.kind === "productivity");
  if (!rates.length) return null;

  return (
    <section className="mt-7 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-lg shadow-gray-200/70" data-feature="30">
      <div className="border-b border-gray-100 bg-emerald-50/40 px-6 py-4">
        <h3 className="flex flex-wrap items-center gap-2 font-heading text-base font-bold text-gray-900">
          Rate versions from Estimating Feedback <NewBadge feature={30} />
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Production rates checked against completed jobs. A suggestion is applied only when the owner approves it in{" "}
          <Link href={reportsHref("estimating_feedback")} className="font-semibold text-primary-700 hover:underline">Reports › Estimating Feedback</Link>
          ; every approval adds a new version and the previous one is kept.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[9px] font-bold uppercase tracking-wider text-gray-500">
              <th className="px-6 py-3">Combination</th>
              <th className="px-6 py-3">Current Rate</th>
              <th className="px-6 py-3">Suggestion</th>
              <th className="px-6 py-3 text-right">Versions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rates.map((r) => {
              const s = suggestionFor(db, r);
              const [surface, side, tier, method, condition] = comboLabel(r.comboKey).split(" · ");
              const latest = r.versions.at(-1);
              return (
                <tr key={r.id} className="transition-colors hover:bg-primary-50/20">
                  <td className="px-6 py-4 text-sm">
                    <span className="font-bold text-gray-900">{surface}</span>{" "}
                    <span className="text-gray-500">· {side} · {tier} · {method} · {condition}</span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{rateText(r, r.value)}</td>
                  <td className="px-6 py-4">
                    <Link href={`${reportsHref("estimating_feedback")}&rate=${r.id}`} className="inline-flex flex-wrap items-center gap-2" title="Open in Estimating Feedback">
                      <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                      {s.status === "suggested" && <span className="text-xs font-semibold text-primary-700">{rateText(r, s.observed)} →</span>}
                      {s.status === "approved" && latest?.kind === "approval" && <span className="text-xs text-gray-500">{dateTime(latest.at)}</span>}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button type="button" onClick={() => setVersionsFor(r)} className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:underline">
                      <History className="h-3.5 w-3.5" /> v{latest?.version ?? 1} · {r.versions.length} version{r.versions.length === 1 ? "" : "s"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!versionsFor}
        onOpenChange={(v) => !v && setVersionsFor(undefined)}
        title={`Rate versions · ${versionsFor ? comboLabel(versionsFor.comboKey) : ""}`}
        description="A rate is never overwritten in place. Every change is a new version that the owner approved."
      >
        <div className="space-y-2">
          {[...(versionsFor?.versions ?? [])].reverse().map((v) => (
            <div key={v.version} className="rounded-xl border border-gray-200 p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <b>v{v.version} · {versionsFor && rateText(versionsFor, v.value)}</b>
                <span className="text-xs text-gray-400">{dateTime(v.at)}</span>
              </div>
              <div className="text-xs text-gray-500">
                {v.kind} by {db.users.find((u) => u.id === v.by)?.name ?? "—"}
                {v.previous !== undefined && versionsFor ? ` · was ${rateText(versionsFor, v.previous)}` : ""}
              </div>
              <div className="mt-1 text-gray-700">{v.reason}</div>
            </div>
          ))}
        </div>
      </Modal>
    </section>
  );
}
