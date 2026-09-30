"use client";
/**
 * Feature 34 — Content Calendar.
 * Menu: Marketing > Content Calendar
 *
 * One chip per post on its local date, with platform chips and state.
 * Nothing late publishes on its own: the scheduler run only records a post
 * as missed once it is more than 30 minutes late.
 */
import { useState } from "react";
import { ChevronLeft, ChevronRight, PenSquare, Timer } from "lucide-react";
import type { MarketingPost } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import { AppLink, useNav } from "@/features/lib/navigation";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { cn } from "@/features/lib/cn";
import { lateness, localLabel, localParts } from "@/features/lib/rules/marketing";
import { runScheduler } from "@/features/lib/store/actions/marketing";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Button, Card, CardLabel } from "@/features/components/ui";
import { MarketingFrame } from "./marketing-frame";
import { AccountHealth, PlatformChip, POST_STATE, PostStateBadge } from "./shared";

export function ContentCalendarScreen() {
  return (
    <MarketingFrame tab="calendar">
      <Calendar />
    </MarketingFrame>
  );
}

/** The post's calendar day: its schedule, else its first publication, else its creation. */
export function postDay(p: MarketingPost) {
  const at = p.schedule?.utc ?? p.publications.find((x) => x.at)?.at ?? p.createdAt;
  return localParts(at).date;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Calendar() {
  const db = useDb((d) => d);
  const { push } = useNav();
  const today = localParts(now()).date;
  const [month, setMonth] = useState(today.slice(0, 7));
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const posts = db.marketingPosts.filter((p) => p.state !== "cancelled");
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const waiting = db.marketingPosts.filter((p) => p.state === "scheduled" && p.schedule && lateness(p.schedule.utc, now()).state !== "not_due");
  const attention = [
    ...waiting.map((p) => ({ p, why: `${lateness(p.schedule!.utc, now()).minutes} minutes past ${localLabel(p.schedule!.utc)} — waiting for the office manager. It won't publish on its own.` })),
    ...db.marketingPosts.filter((p) => p.state === "missed").map((p) => ({ p, why: `Missed ${p.schedule ? localLabel(p.schedule.utc) : ""}. Reschedule it.` })),
    ...db.marketingPosts.filter((p) => p.state === "partially_failed").map((p) => ({ p, why: p.publications.some((x) => x.status === "uncertain") ? "Publication outcome unclear. Check the platform before retrying." : "One platform failed. Retry is limited to that platform." })),
    ...db.marketingPosts.filter((p) => p.takedown && !p.takedown.doneAt).map((p) => ({ p, why: `Takedown review: ${p.takedown!.reason}` })),
    ...db.marketingPosts.filter((p) => p.state === "awaiting_approval").map((p) => ({ p, why: "Waiting for the business owner's approval." })),
  ];
  const scheduledThisMonth = posts.filter((p) => postDay(p).startsWith(month)).length;

  return (
    <>
      <PageHeader
        title="Content Calendar"
        subtitle="Every post by local date, from draft to published." details="Drafted, approved, scheduled, published, missed and failed posts. The target is two posts a week, about ten a month."
        actions={
          <>
            <Button onClick={() => { const r = act(runScheduler); if (r.ok) toast.success("Scheduler run", `${r.value?.missed} newly missed, ${r.value?.waiting} late and waiting for you. Nothing published automatically.`); }}><Timer className="h-4 w-4" /> Run scheduler</Button>
            <AppLink href="/marketing/compose"><Button variant="primary"><PenSquare className="h-4 w-4" /> New Post</Button></AppLink>
          </>
        }
      />
      <AccountHealth />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] [&>*]:min-w-0">
        <Card className="p-4" data-tour="marketing-calendar">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <div className="min-w-[150px] text-center font-display text-base font-bold">{first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</div>
              <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <span className="text-xs text-gray-500">{scheduledThisMonth} posts this month · local time, America/Chicago</span>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[680px] grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line">
              {WEEKDAYS.map((w) => <div key={w} className="bg-gray-50 px-2 py-1.5 text-xxs font-bold uppercase tracking-wide text-gray-500">{w}</div>)}
              {cells.map((day, i) => (
                <div key={i} className={cn("min-h-[92px] bg-white p-1.5", !day && "bg-gray-50/60")}>
                  {day && (
                    <>
                      <div className={cn("mb-1 text-xs font-semibold", day === today ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white" : "text-gray-500")}>{Number(day.slice(8))}</div>
                      <div className="space-y-1">
                        {posts.filter((p) => postDay(p) === day).map((p) => (
                          <button key={p.id} type="button" onClick={() => push(`/marketing/compose?id=${p.id}`)} className="block w-full rounded-md border border-line bg-white px-1.5 py-1 text-left hover:border-gray-300">
                            <div className="flex items-center gap-1"><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", POST_STATE[p.state].dot)} aria-hidden /><span className="truncate text-xs font-semibold text-ink">{p.title}</span></div>
                            <div className="mt-0.5 flex items-center gap-0.5">{p.platforms.map((pl) => <PlatformChip key={pl} platform={pl} status={p.publications.find((x) => x.platform === pl)?.status} />)}<span className="ml-1 min-w-0 truncate text-xxs text-gray-500">{POST_STATE[p.state].label}</span></div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
            {(["draft", "awaiting_approval", "approved", "scheduled", "published", "missed", "partially_failed"] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", POST_STATE[s].dot)} />{POST_STATE[s].label}</span>
            ))}
          </div>
        </Card>

        <Card className="p-4" data-tour="marketing-attention">
          <CardLabel>Needs a person</CardLabel>
          <p className="mt-1 text-xs text-gray-500">A post that turns up unexpectedly is worse than one that turns up late and deliberately.</p>
          <div className="mt-3 space-y-2">
            {attention.length === 0 && <p className="text-xs italic text-gray-500">Nothing waiting.</p>}
            {attention.map(({ p, why }, i) => (
              <AppLink key={`${p.id}-${i}`} href={`/marketing/compose?id=${p.id}`} className="block rounded-lg border border-line px-3 py-2 text-xs hover:border-gray-300">
                <div className="flex flex-wrap items-center gap-1.5"><strong>{p.id}</strong><PostStateBadge state={p.state} />{p.takedown && !p.takedown.doneAt && <Badge tone="red">Takedown</Badge>}</div>
                <div className="mt-0.5 font-medium text-ink">{p.title}</div>
                <div className="text-gray-500">{why}</div>
              </AppLink>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
