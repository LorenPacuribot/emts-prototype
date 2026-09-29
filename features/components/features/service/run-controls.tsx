"use client";
/** Nightly run controls and the failed-run banner, used on the queue and the run log. */
import { useState } from "react";
import { Moon, OctagonAlert } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { resolveRunFailure, runNightly } from "@/features/lib/store/actions/service";
import { can } from "@/features/lib/permissions";
import { dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { Banner, Button, DemoButton, ConfirmDialog, RowMenu } from "@/features/components/ui";

export function RunControls() {
  const user = useCurrentUser();
  const [confirmFail, setConfirmFail] = useState(false);
  if (!can(user, "alerts.queue")) return null;
  const run = () => {
    const res = act(runNightly, false);
    if (res.ok) {
      const v = res.value!;
      toast.success(`Nightly run ${v.id} complete`, `${v.created} alert${v.created === 1 ? "" : "s"} created, ${v.skipped} skipped${v.caughtUp.length ? `, caught up ${v.caughtUp.join(", ")}` : ""}. No customer was contacted.`);
    }
  };
  return (
    <div className="flex items-center gap-1">
      <DemoButton onClick={run}>
        <Moon className="h-4 w-4" /> Run now (as at 2 a.m.)
      </DemoButton>
      <RowMenu label="More run actions" items={[{ label: "Simulate failed run", icon: <OctagonAlert />, onSelect: () => setConfirmFail(true) }]} />
      <ConfirmDialog
        open={confirmFail}
        onOpenChange={setConfirmFail}
        tone="primary"
        title="Simulate a failed nightly run?"
        body="A failed run is written to the run log and a red banner shows on the queue. Run now afterwards to see the catch-up create the missed alerts once, with no duplicates."
        confirmLabel="Simulate failure"
        onConfirm={() => {
          if (act(runNightly, true).ok) toast.info("Nightly run failed (simulated)", "The failure banner stays until the office marks it resolved.");
        }}
      />
    </div>
  );
}

/** "Last nightly run failed at {time}. Catch-up scheduled." — visible until the office resolves it. */
export function RunFailureBanner({ className }: { className?: string }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const failed = db.runLog.filter((r) => r.failed && !r.resolvedAt);
  if (!failed.length) return null;
  const last = failed[0];
  const caughtBy = db.runLog.find((r) => r.catchUpOf?.includes(last.id));
  return (
    <Banner
      tone="danger"
      className={className}
      title={`Last nightly run failed at ${dateTime(last.ranAt)}. ${caughtBy ? `Caught up by ${caughtBy.id}.` : "Catch-up scheduled."}`}
      action={
        can(user, "alerts.queue") ? (
          <Button size="sm" onClick={() => act(resolveRunFailure, last.id).ok && toast.success("Failure marked resolved", `${last.id} is resolved.`)}>
            Mark resolved
          </Button>
        ) : undefined
      }
    >
      {last.id}: {last.note}
    </Banner>
  );
}
