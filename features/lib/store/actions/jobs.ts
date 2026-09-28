/**
 * Job actions, as the live /jobs/[id] page runs them.
 *
 *   setJobStage   PATCH /jobs/:id/status   ("Change Status": the manual stages)
 */
import type { Database, Job, User } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { denied, fail, log, ok } from "../helpers";

const MODULE = "Jobs";

/** Live Change Status: Scheduled and In Production are set by the work order, not by hand. */
export function setJobStage(db: Database, actor: User, jobId: string, stage: Job["status"] | "marketing") {
  if (!can(actor, "job.updateStatus")) return denied(db, actor, MODULE, "change a job's status", whoCan("job.updateStatus"));
  const job = byId(db.jobs, jobId);
  if (!job || job.status === "estimating") return fail("Job not found.");
  if (stage === "scheduled" || stage === "in_production") return fail("Scheduled and In Production are set from the work order.");
  if (stage === "completed" && job.status !== "completed") return fail("Close the job from the work order: Mark Complete runs the closeout.");
  if (stage === "marketing") {
    log(db, actor, MODULE, `Job ${jobId} moved to Marketing by ${actor.name}`);
    return ok();
  }
  const before = job.status;
  job.status = stage;
  log(db, actor, MODULE, `Job ${jobId} status changed from ${before} to ${stage} by ${actor.name}`);
  return ok();
}
