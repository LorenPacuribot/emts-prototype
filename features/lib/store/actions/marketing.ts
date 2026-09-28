/**
 * Feature 34 — Social Media And Marketing Management.
 *
 * Draft → consent check → owner approval where identifiable → schedule in
 * local wall-clock time → publish per platform. Nothing publishes late on its
 * own, a retry never republishes a platform that succeeded, and withdrawn
 * media leaves every future post at once. Website form events create or match
 * leads exactly once. There is no ad management and no spend.
 */
import type { ActionResult, Database, LeadSource, MarketingPost, MediaAsset, PostState, PostTemplate, SocialAccount, SocialPlatform, User } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId } from "@/features/lib/selectors";
import { addDays } from "@/features/lib/rules/dates";
import {
  addressDetail, approvalCurrent, approvalReasons, consentCheck, findStreetAddress, lateness, localLabel, localParts, matchLead, materialEdit, missingLeadFields, resolveLocal,
  usable, validateUpload, type ApprovalReason,
} from "@/features/lib/rules/marketing";
import { denied, fail, log, nextId, nextNumber, ok, userName } from "../helpers";

const MODULE = "Marketing";

export const TEMPLATE_LABEL: Record<PostTemplate, string> = {
  before_after: "Before and after", finished_job: "Finished job", crew_spotlight: "Crew spotlight", seasonal: "Seasonal reminder",
};
export const PLATFORM_LABEL: Record<SocialPlatform, string> = { facebook: "Facebook", instagram: "Instagram" };
const DST_LOG = { none: "None", moved_to_first_valid: "MovedToFirstValidTime", first_occurrence: "FirstOccurrenceUsed" } as const;

export function postAssets(db: Database, post: Pick<MarketingPost, "assetIds">): MediaAsset[] {
  return post.assetIds.map((id) => byId(db.mediaAssets, id)).filter((a): a is MediaAsset => !!a);
}

export interface PostChecks {
  consent: ReturnType<typeof consentCheck>;
  street: string | null;
  addressAssets: MediaAsset[];
  checklistDone: boolean;
  reasons: ApprovalReason[];
  needsApproval: boolean;
  approved: boolean;
  /** Everything stopping the post from being scheduled, in words. */
  blockers: string[];
  /** Platforms whose account can't publish right now. */
  accountIssues: string[];
}

export function postChecks(db: Database, post: MarketingPost): PostChecks {
  const assets = postAssets(db, post);
  const consent = consentCheck(assets);
  const street = findStreetAddress(post.copy);
  const addressAssets = assets.filter(addressDetail);
  const checklistDone = Object.values(post.checklist).every(Boolean);
  const reasons = approvalReasons(post, assets);
  const approved = approvalCurrent(post);
  const blockers = [
    ...consent.failures,
    ...(street ? [`The copy contains a street address ("${street}"). Only the neighbourhood may be shown.`] : []),
    ...addressAssets.map((a) => `${a.id}: visible address detail (${a.identifyingNote}). Use a publication crop.`),
    ...(checklistDone ? [] : ["Complete the pre-publication checklist."]),
    ...(reasons.length && !approved ? ["Owner approval is outstanding."] : []),
    ...(post.platforms.length ? [] : ["Choose at least one platform."]),
  ];
  const accountIssues = post.platforms
    .map((p) => db.socialAccounts.find((a) => a.platform === p))
    .filter((a): a is SocialAccount => !!a && a.status !== "connected")
    .map((a) => `${PLATFORM_LABEL[a.platform]} access ${a.status}`);
  return { consent, street, addressAssets, checklistDone, reasons, needsApproval: reasons.length > 0, approved, blockers, accountIssues };
}

export interface PostInput {
  title: string;
  template: PostTemplate;
  copy: string;
  assetIds: string[];
  platforms: SocialPlatform[];
  flags: MarketingPost["flags"];
}

function validateInput(db: Database, input: PostInput) {
  if (!input.title.trim()) return "Give the post a working title.";
  const street = findStreetAddress(input.copy);
  if (street) return `Blocked: "${street}" is a street address. Only the neighbourhood is shown — never the street address.`;
  const bad = input.assetIds.map((id) => byId(db.mediaAssets, id)).find((a) => a && (a.withdrawnAt || a.deletedForPrivacyAt));
  if (bad) return `${bad.id} can't be used: permission withdrawn.`;
  return undefined;
}

export function createPost(db: Database, actor: User, input: PostInput) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "draft a post", whoCan("marketing.post"));
  const err = validateInput(db, input);
  if (err) return fail(err, "copy");
  const id = nextId(db, "post", "POST-");
  const at = now();
  db.marketingPosts.unshift({
    id, ...input, title: input.title.trim(), checklist: { houseNumbers: false, faces: false, plates: false, neighbouring: false }, version: 1,
    versions: [{ version: 1, at, by: actor.id, copy: input.copy, assetIds: input.assetIds, note: "Drafted" }], state: "draft", publications: [], createdBy: actor.id, createdAt: at,
  });
  log(db, actor, MODULE, `Marketing: Post ${id} drafted by ${actor.name} using template ${TEMPLATE_LABEL[input.template]}. Media: ${input.assetIds.join(", ") || "none"}`);
  return ok(id);
}

/** A material edit (image, identifying text, claim) voids the approval. A typo keeps it. */
export function updatePost(db: Database, actor: User, id: string, input: PostInput) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "edit a post", whoCan("marketing.post"));
  const post = byId(db.marketingPosts, id);
  if (!post) return fail("Post not found.");
  if (post.state === "published" || post.state === "partially_failed" || post.state === "cancelled") return fail("Published and cancelled posts can't be edited.");
  const err = validateInput(db, input);
  if (err) return fail(err, "copy");
  const wasApproved = approvalCurrent(post);
  const changed = post.copy !== input.copy || post.assetIds.join() !== input.assetIds.join();
  const kind = changed ? materialEdit(post, input) : null;
  Object.assign(post, { ...input, title: input.title.trim() });
  if (changed) {
    post.version += 1;
    post.versions.push({ version: post.version, at: now(), by: actor.id, copy: input.copy, assetIds: input.assetIds, note: kind ? `Material edit (${kind})` : "Typo fix — approval carried" });
    if (wasApproved && !kind) post.approval!.version = post.version;
    if (wasApproved && kind) {
      post.approvalVoided = { at: now(), reason: kind };
      if (["approved", "scheduled", "awaiting_approval"].includes(post.state)) post.state = "draft";
      log(db, actor, MODULE, `Marketing: Post ${id} – Material edit (${kind}) by ${actor.name}. Renewed owner approval required.`);
    }
  }
  return ok(kind);
}

export function saveChecklist(db: Database, actor: User, id: string, checklist: MarketingPost["checklist"]) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "complete the checklist", whoCan("marketing.post"));
  const post = byId(db.marketingPosts, id);
  if (!post) return fail("Post not found.");
  post.checklist = checklist;
  return ok();
}

function consentLog(db: Database, actor: User, post: MarketingPost, c: ReturnType<typeof consentCheck>) {
  const jobs = [...new Set(postAssets(db, post).map((a) => a.jobId).filter(Boolean))].join(", ") || "—";
  log(db, actor, MODULE, `Marketing: Post ${post.id} – Consent check ${c.ok ? "Pass" : "Fail"}. Release: ${c.releases.join("; ") || (c.ok ? "not required" : "missing")} on job ${jobs}`, !c.ok);
}

/** Runs the consent check, then routes to the owner when the content is identifiable. */
export function sendForApproval(db: Database, actor: User, id: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "send a post for approval", whoCan("marketing.post"));
  const post = byId(db.marketingPosts, id);
  if (!post || post.state !== "draft") return fail("Only a draft can be sent for approval.");
  const c = postChecks(db, post);
  consentLog(db, actor, post, c.consent);
  if (!c.consent.ok) return fail(`Blocked by the consent check: ${c.consent.failures.join(" ")}`);
  if (c.street) return fail("Remove the street address first.");
  if (!c.needsApproval) {
    post.state = "approved";
    log(db, actor, MODULE, `Marketing: Post ${id} v${post.version} needs no owner approval — routine content with no identifiers.`);
    return ok("not_required");
  }
  post.state = "awaiting_approval";
  post.rejection = undefined;
  log(db, actor, MODULE, `Marketing: Post ${id} v${post.version} sent to the Business Owner for approval by ${actor.name}. Reason: ${c.reasons.join(", ")}`);
  return ok("sent");
}

export function approvePost(db: Database, actor: User, id: string) {
  if (!can(actor, "marketing.approve")) return denied(db, actor, MODULE, "approve a post", whoCan("marketing.approve"));
  const post = byId(db.marketingPosts, id);
  if (!post || post.state !== "awaiting_approval") return fail("This post isn't awaiting approval.");
  const reasons = approvalReasons(post, postAssets(db, post));
  const at = now();
  post.approval = { version: post.version, by: actor.id, at };
  post.approvalVoided = undefined;
  post.state = "approved";
  log(db, actor, MODULE, `Marketing: Post ${id} v${post.version} approved by ${actor.name} at ${localLabel(at)}. Reason for approval requirement: ${reasons.join(", ")}`);
  return ok();
}

export function rejectPost(db: Database, actor: User, id: string, comment: string) {
  if (!can(actor, "marketing.approve")) return denied(db, actor, MODULE, "reject a post", whoCan("marketing.approve"));
  const post = byId(db.marketingPosts, id);
  if (!post || post.state !== "awaiting_approval") return fail("This post isn't awaiting approval.");
  if (!comment.trim()) return fail("Say what needs to change.", "comment");
  post.rejection = { by: actor.id, at: now(), comment: comment.trim() };
  post.state = "draft";
  log(db, actor, MODULE, `Marketing: Post ${id} v${post.version} returned to draft by ${actor.name}. Comment: ${comment.trim()}`);
  return ok();
}

/** Schedules in local wall-clock time (34.Q01). Also used to reschedule a missed post. */
export function schedulePost(db: Database, actor: User, id: string, localDate: string, localTime: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "schedule a post", whoCan("marketing.post"));
  const post = byId(db.marketingPosts, id);
  if (!post || !["draft", "approved", "scheduled", "missed"].includes(post.state)) return fail("This post can't be scheduled.");
  if (!localDate || !localTime) return fail("Choose a local date and time.", "when");
  const c = postChecks(db, post);
  if (post.state === "draft") consentLog(db, actor, post, c.consent);
  if (c.blockers.length) return fail(c.blockers[0]);
  const r = resolveLocal(localDate, localTime);
  if (r.utc <= now()) return fail("Choose a time in the future.", "when");
  const rescheduled = post.state === "missed";
  post.schedule = { localDate, localTime, utc: r.utc, adjustment: r.adjustment };
  post.state = "scheduled";
  post.missedAt = undefined;
  post.publications = post.platforms.map((platform) => ({ platform, status: "pending" }));
  log(db, actor, MODULE, `Marketing: Post ${id} ${rescheduled ? "rescheduled" : "scheduled"} for ${localLabel(r.utc)} on ${post.platforms.map((p) => PLATFORM_LABEL[p]).join(", ")} by ${actor.name}. DST adjustment: ${DST_LOG[r.adjustment]}`);
  return ok(r);
}

function publishTo(db: Database, actor: User, post: MarketingPost, platform: SocialPlatform) {
  const pub = post.publications.find((p) => p.platform === platform)!;
  const account = db.socialAccounts.find((a) => a.platform === platform);
  const at = now();
  if (!account || account.status !== "connected") {
    Object.assign(pub, { status: "failed", at, error: `${PLATFORM_LABEL[platform]} access ${account?.status ?? "missing"}` });
    return;
  }
  const sim = post.simulate?.[platform];
  if (sim) {
    delete post.simulate![platform];
    Object.assign(pub, { status: sim, at, error: sim === "uncertain" ? "Timed out waiting for the platform's response." : "The platform rejected the request (media processing error)." });
    return;
  }
  const ref = `${account.mode === "draft_for_approval" ? "DRAFT-" : ""}${platform === "facebook" ? "fb" : "ig"}_${1790000 + nextNumber(db, "pubref")}`;
  Object.assign(pub, { status: "published", at, externalRef: ref, error: undefined });
  log(db, actor, MODULE, `Marketing: Post ${post.id} ${account.mode === "draft_for_approval" ? "pushed as a draft for approval" : "published"} to ${PLATFORM_LABEL[platform]} at ${localLabel(at)}. Platform reference: ${ref}`);
}

function settle(db: Database, actor: User, post: MarketingPost) {
  const done = post.publications.filter((p) => p.status === "published");
  const bad = post.publications.filter((p) => p.status === "failed" || p.status === "uncertain");
  post.state = bad.length ? "partially_failed" : "published";
  if (bad.length)
    log(db, actor, MODULE, `Marketing: Post ${post.id} published to ${done.map((p) => PLATFORM_LABEL[p.platform]).join(", ") || "no platform"}, failed on ${bad.map((p) => `${PLATFORM_LABEL[p.platform]}${p.status === "uncertain" ? " (outcome unclear)" : ""}`).join(", ")}. Retry limited to failed platform after outcome check.`);
}

/**
 * Publishes the post's pending platforms. "on_time" simulates the scheduler
 * reaching the scheduled minute. "manual" is the office manager's Publish now
 * for a post that is late but not yet missed. A missed post is rescheduled.
 */
export function publishPost(db: Database, actor: User, id: string, mode: "on_time" | "manual") {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "publish a post", whoCan("marketing.post"));
  const post = byId(db.marketingPosts, id);
  if (!post || post.state !== "scheduled") return fail(post?.state === "missed" ? "A missed post isn't published automatically or late. Reschedule it." : "Only a scheduled post can be published.");
  const c = postChecks(db, post);
  if (c.blockers.length) return fail(c.blockers[0]);
  if (mode === "manual" && post.schedule && lateness(post.schedule.utc, now()).state === "missed") return fail("This post is more than 30 minutes late. Reschedule it.");
  for (const p of post.publications.filter((x) => x.status === "pending")) publishTo(db, actor, post, p.platform);
  settle(db, actor, post);
  return ok<PostState>(post.state);
}

/** Scheduler pass: late posts never publish on their own. Over 30 minutes late is missed. */
export function runScheduler(db: Database, actor: User) {
  let missed = 0;
  let waiting = 0;
  for (const post of db.marketingPosts.filter((p) => p.state === "scheduled" && p.schedule)) {
    const l = lateness(post.schedule!.utc, now());
    if (l.state === "missed") {
      post.state = "missed";
      post.missedAt = now();
      missed += 1;
      log(db, actor, MODULE, `Marketing: Post ${post.id} missed its scheduled time of ${localLabel(post.schedule!.utc)}. Awaiting office manager action.`);
    } else if (l.state === "waiting") waiting += 1;
  }
  return ok({ missed, waiting });
}

/** Reconcile an uncertain outcome by checking the platform. */
export function checkOutcome(db: Database, actor: User, id: string, platform: SocialPlatform, found: boolean) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "check a publication outcome", whoCan("marketing.post"));
  const post = byId(db.marketingPosts, id);
  const pub = post?.publications.find((p) => p.platform === platform);
  if (!post || !pub || pub.status !== "uncertain") return fail("There is no unclear outcome to check.");
  if (found) Object.assign(pub, { status: "published", externalRef: `${platform === "facebook" ? "fb" : "ig"}_${1790000 + nextNumber(db, "pubref")}`, error: undefined });
  else Object.assign(pub, { status: "failed", error: "Checked on the platform: not published." });
  log(db, actor, MODULE, `Marketing: Post ${id} – ${PLATFORM_LABEL[platform]} outcome checked by ${actor.name}: ${found ? `found on the platform, reference ${pub.externalRef}` : "not published"}.`);
  settle(db, actor, post);
  return ok();
}

/** Retries only the failed platform, and only once no outcome is unclear. */
export function retryFailed(db: Database, actor: User, id: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "retry a publication", whoCan("marketing.post"));
  const post = byId(db.marketingPosts, id);
  if (!post || post.state !== "partially_failed") return fail("Nothing to retry.");
  if (post.publications.some((p) => p.status === "uncertain")) return fail("Publication outcome unclear. Check the platform before retrying.");
  const failed = post.publications.filter((p) => p.status === "failed");
  for (const p of failed) {
    p.status = "pending";
    publishTo(db, actor, post, p.platform);
  }
  log(db, actor, MODULE, `Marketing: Post ${id} retry by ${actor.name} limited to ${failed.map((p) => PLATFORM_LABEL[p.platform]).join(", ")}. Succeeded platforms not republished.`);
  settle(db, actor, post);
  return ok<PostState>(post.state);
}

export function cancelPost(db: Database, actor: User, id: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "cancel a post", whoCan("marketing.post"));
  const post = byId(db.marketingPosts, id);
  if (!post || ["published", "partially_failed", "cancelled"].includes(post.state)) return fail("This post can't be cancelled.");
  post.state = "cancelled";
  log(db, actor, MODULE, `Marketing: Post ${id} cancelled by ${actor.name}. History kept.`);
  return ok();
}

/** Copying never carries the approval across: the requirement is re-evaluated for the copy. */
export function copyToPlatform(db: Database, actor: User, id: string, platform: SocialPlatform) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "copy a post", whoCan("marketing.post"));
  const src = byId(db.marketingPosts, id);
  if (!src) return fail("Post not found.");
  const assets = src.assetIds.filter((a) => usable(byId(db.mediaAssets, a)!).ok);
  const r = createPost(db, actor, { title: `${src.title} (${PLATFORM_LABEL[platform]})`, template: src.template, copy: src.copy, assetIds: assets, platforms: [platform], flags: { ...src.flags } });
  if (!r.ok) return r;
  const copy = byId(db.marketingPosts, r.value!)!;
  copy.copiedFrom = src.id;
  const reasons = approvalReasons(copy, postAssets(db, copy));
  log(db, actor, MODULE, `Marketing: Post ${copy.id} copied from ${src.id} to ${PLATFORM_LABEL[platform]}. Approval requirement re-evaluated: ${reasons.length ? `owner approval required (${reasons.join(", ")})` : "not required"}.`);
  return ok(copy.id);
}

/* ------------------------------- Media ------------------------------- */

export function uploadMedia(db: Database, actor: User, file: { label: string; sizeMb: number; type: string; kind: MediaAsset["kind"]; jobId?: string }) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "upload media", whoCan("marketing.post"));
  const v = validateUpload(file);
  if (!v.ok) {
    log(db, actor, MODULE, `Marketing: Upload "${file.label || "untitled"}" rejected. ${v.error}`, true);
    return fail(v.error!, "file");
  }
  const job = byId(db.jobs, file.jobId);
  const id = nextId(db, "med", "MED-");
  db.mediaAssets.unshift({
    id, label: file.label.trim() || "Uploaded photo", jobId: job?.id, propertyId: job?.propertyId, kind: file.kind, identifying: false,
    release: file.kind === "crew" ? "hiring_release" : "none", releaseRef: file.kind === "crew" ? "Employee hiring release" : undefined,
    sizeMb: file.sizeMb, takenAt: now(), uploadedBy: actor.id, hex: "#94a3b8",
  });
  log(db, actor, MODULE, `Marketing: Media ${id} uploaded by ${actor.name} (${file.sizeMb} MB${job ? `, job ${job.id}` : ""}).`);
  return ok(id);
}

/**
 * NEW (34): "Use in marketing" on a work order photo. Copies the photo into the
 * media library, linked to the job. The original stays on the work order.
 * A photo from a signed contract carries the contract's release.
 */
export function sendPhotoToMarketing(db: Database, actor: User, woId: string, attachmentId: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "add a work order photo to marketing", whoCan("marketing.post"));
  const wo = byId(db.workOrders, woId);
  const att = wo?.attachments.find((a) => a.id === attachmentId);
  if (!wo || !att) return fail("Photo not found.");
  if (!att.fileType.startsWith("image")) return fail("Only photos can be used in marketing.");
  if (att.mediaAssetId) return fail(`Already in the media library as ${att.mediaAssetId}.`);
  const job = byId(db.jobs, wo.jobId);
  const id = nextId(db, "med", "MED-");
  db.mediaAssets.unshift({
    id, label: att.caption ?? att.fileName, jobId: job?.id, propertyId: job?.propertyId, kind: "customer_property", identifying: false,
    release: job?.contractSigned ? "signed_contract" : "none", releaseRef: job?.contractSigned ? `Contract ${job.estimateId ?? job.id}` : undefined,
    sizeMb: Math.max(0.1, Math.round(((att.fileSize ?? 2_400_000) / 1_000_000) * 10) / 10), takenAt: att.createdAt, uploadedBy: actor.id, hex: "#94a3b8",
  });
  att.mediaAssetId = id;
  log(db, actor, MODULE, `Marketing: Work order ${woId} photo "${att.fileName}" added to the media library as ${id} by ${actor.name}. Check it for identifying details before posting.`);
  return ok(id);
}

/** A publication crop is a new asset. The original job media is preserved unchanged. */
export function createCrop(db: Database, actor: User, assetId: string, format: "square" | "vertical", template: PostTemplate) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "crop media", whoCan("marketing.post"));
  const src = byId(db.mediaAssets, assetId);
  if (!src) return fail("Media not found.");
  if (src.withdrawnAt || src.deletedForPrivacyAt) return fail("Withdrawn media can't be cropped.");
  const id = nextId(db, "med", "MED-");
  const cropsOutAddress = addressDetail(src);
  db.mediaAssets.unshift({
    ...src, id, label: `${src.label} — ${format} crop`, cropOf: src.id, crop: { format, template: TEMPLATE_LABEL[template] }, takenAt: src.takenAt, uploadedBy: actor.id,
    identifying: cropsOutAddress ? false : src.identifying, identifyingNote: cropsOutAddress ? "Address detail cropped out" : src.identifyingNote,
  });
  log(db, actor, MODULE, `Marketing: Publication crop ${id} (${format}, ${TEMPLATE_LABEL[template]}) made from ${src.id} by ${actor.name}. Original preserved.`);
  return ok(id);
}

/**
 * Withdrawn permission: out of every future post and export at once. Published
 * posts go on the takedown list — removing a queued post is not a takedown.
 */
export function withdrawMedia(db: Database, actor: User, assetId: string, reason: string, privacy = false) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "withdraw media", whoCan("marketing.post"));
  const src = byId(db.mediaAssets, assetId);
  if (!src || src.withdrawnAt) return fail("This media is already withdrawn.");
  if (!reason.trim()) return fail("Record how the withdrawal arrived.", "reason");
  const at = now();
  const family = db.mediaAssets.filter((a) => a.id === src.id || a.cropOf === src.id);
  const ids = new Set(family.map((a) => a.id));
  for (const a of family) Object.assign(a, { withdrawnAt: at, withdrawnBy: actor.id, withdrawReason: reason.trim(), ...(privacy ? { deletedForPrivacyAt: at } : {}) });
  let scheduled = 0;
  for (const post of db.marketingPosts) {
    if (!post.assetIds.some((a) => ids.has(a))) continue;
    if (post.state === "published" || post.state === "partially_failed") {
      post.takedown = { requiredAt: at, reason: `${src.id} permission withdrawn: ${reason.trim()}` };
    } else if (post.state !== "cancelled") {
      post.assetIds = post.assetIds.filter((a) => !ids.has(a));
      if (post.state === "scheduled") {
        scheduled += 1;
        post.state = "draft";
      }
      post.versions.push({ version: post.version, at, by: actor.id, copy: post.copy, assetIds: post.assetIds, note: `${src.id} removed: permission withdrawn` });
    }
  }
  log(db, actor, MODULE, `Marketing: Media ${src.id} permission withdrawn on ${at.slice(0, 10)}. Removed from ${scheduled} scheduled posts and future exports by ${actor.name}`);
  if (privacy) log(db, actor, MODULE, `Marketing: Media ${src.id} deleted under a personal-data deletion request by ${actor.name}. Overrides the ten-year media retention rule.`);
  return ok(scheduled);
}

export function confirmTakedown(db: Database, actor: User, postId: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "confirm a takedown", whoCan("marketing.post"));
  const post = byId(db.marketingPosts, postId);
  if (!post?.takedown || post.takedown.doneAt) return fail("No takedown is outstanding for this post.");
  post.takedown.doneAt = now();
  post.takedown.doneBy = actor.id;
  log(db, actor, MODULE, `Marketing: Published post ${postId} taken down by ${actor.name} on ${now().slice(0, 10)}. Completion confirmed. Owner spot-check: Pending`);
  return ok();
}

export function spotCheckTakedown(db: Database, actor: User, postId: string) {
  if (!can(actor, "marketing.approve")) return denied(db, actor, MODULE, "spot-check a takedown", whoCan("marketing.approve"));
  const post = byId(db.marketingPosts, postId);
  if (!post?.takedown?.doneAt || post.takedown.spotCheckedBy) return fail("Nothing to spot-check.");
  post.takedown.spotCheckedBy = actor.id;
  log(db, actor, MODULE, `Marketing: Published post ${postId} taken down by ${userName(db, post.takedown.doneBy)} on ${post.takedown.doneAt.slice(0, 10)}. Completion confirmed. Owner spot-check: Done`);
  return ok();
}

/* ------------------------------ Accounts ----------------------------- */

export function affectedPosts(db: Database, platform: SocialPlatform) {
  return db.marketingPosts.filter((p) => p.state === "scheduled" && p.platforms.includes(platform));
}

/** Simulates Meta reporting an access problem. */
export function simulateAccountIssue(db: Database, actor: User, platform: SocialPlatform, status: "expired" | "suspended") {
  if (!can(actor, "marketing.access")) return denied(db, actor, MODULE, "simulate an account problem", whoCan("marketing.access"));
  const acc = db.socialAccounts.find((a) => a.platform === platform);
  if (!acc) return fail("Account not set up.");
  acc.status = status;
  const posts = affectedPosts(db, platform).map((p) => p.id);
  log(db, actor, MODULE, `Marketing: ${PLATFORM_LABEL[platform]} access ${status === "expired" ? "Expired" : "Suspended"} detected at ${localLabel(now())}. Office manager notified. Affected scheduled posts: ${posts.join(", ") || "none"}`);
  return ok(posts.length);
}

export function reconnectAccount(db: Database, actor: User, platform: SocialPlatform) {
  if (!can(actor, "marketing.accounts")) return denied(db, actor, MODULE, "reconnect a social account", whoCan("marketing.accounts"));
  const acc = db.socialAccounts.find((a) => a.platform === platform);
  if (!acc) return fail("Account not set up.");
  acc.status = "connected";
  acc.expiresAt = addDays(now(), 60);
  log(db, actor, MODULE, `Marketing: ${PLATFORM_LABEL[platform]} access renewed by ${actor.name}. Expires ${acc.expiresAt.slice(0, 10)}.`);
  return ok();
}

/** Only draft push is possible: use the agreed fallback and tell the owner early (34.A20). */
export function switchToDraftFallback(db: Database, actor: User, platform: SocialPlatform) {
  if (!can(actor, "marketing.access")) return denied(db, actor, MODULE, "switch to the draft fallback", whoCan("marketing.access"));
  const acc = db.socialAccounts.find((a) => a.platform === platform);
  if (!acc || acc.mode === "draft_for_approval") return fail("Already using the draft-for-approval fallback.");
  acc.mode = "draft_for_approval";
  acc.ownerNotifiedAt = now();
  log(db, actor, MODULE, `Marketing: ${PLATFORM_LABEL[platform]} permits draft push only. Draft-for-approval fallback in use; Business Owner notified. Launch not delayed.`);
  return ok();
}

/** Departure: access removed, post history kept. */
export function removeAccess(db: Database, actor: User, userId: string) {
  if (!can(actor, "marketing.accounts")) return denied(db, actor, MODULE, "remove account access", whoCan("marketing.accounts"));
  if (!db.socialAccounts.some((a) => a.access.includes(userId))) return fail("This person has no account access.");
  for (const a of db.socialAccounts) a.access = a.access.filter((u) => u !== userId);
  log(db, actor, MODULE, `Marketing: Access removed for departing employee ${userName(db, userId)} by ${actor.name} on ${now().slice(0, 10)}. Post history retained.`);
  return ok();
}

/* ------------------------------- Leads ------------------------------- */

export interface WebsiteSubmission {
  ref: string;
  name: string;
  phone: string;
  email: string;
  town: string;
  message: string;
}

export function leadContact(db: Database, leadId: string) {
  const l = byId(db.leads, leadId);
  const c = byId(db.customers, l?.customerId);
  return { name: l?.name ?? c?.name, phone: l?.phone ?? c?.phone, email: l?.email ?? c?.email };
}

export interface WebsiteOutcome {
  leadId: string;
  outcome: "duplicate" | "attached" | "new" | "review";
  on?: "phone" | "email";
}

/** Website form event → one lead, however many times the event is retried. */
export function submitWebsiteForm(db: Database, actor: User, sub: WebsiteSubmission): ActionResult<WebsiteOutcome> {
  if (!sub.ref.trim()) return fail("A website event needs its stable reference.");
  const dup = db.leads.find((l) => l.eventRef === sub.ref || l.events?.some((e) => e.ref === sub.ref));
  if (dup) {
    log(db, actor, MODULE, `Marketing: Website form event ${sub.ref} received again. Already recorded on ${dup.id}; no duplicate lead created.`);
    return ok({ leadId: dup.id, outcome: "duplicate" });
  }
  const at = now();
  const missing = missingLeadFields(sub);
  const contacts = db.leads.map((l) => ({ id: l.id, ...leadContact(db, l.id), lastActivityAt: l.lastActivityAt ?? l.createdAt }));
  const m = matchLead(contacts, sub, at);
  if (m.kind === "attach") {
    const lead = byId(db.leads, m.leadId)!;
    lead.events = [...(lead.events ?? []), { ref: sub.ref, at, message: sub.message, matchedOn: m.on }];
    lead.lastActivityAt = at;
    log(db, actor, MODULE, `Marketing: Lead ${lead.id} updated from website form event ${sub.ref}. Source: ${lead.source}. Match: ${m.on === "phone" ? "MatchedByPhone" : "MatchedByEmail"}`);
    return ok({ leadId: lead.id, outcome: "attached", on: m.on });
  }
  const custId = nextId(db, "cust", "C-NEW-");
  db.customers.push({ id: custId, name: sub.name.trim() || "Unnamed website enquiry", phone: sub.phone.trim() || undefined, email: sub.email.trim() || undefined, contactVerified: false, preferredChannel: "phone", consentSigned: false, authorisedSigners: [] });
  const leadId = nextId(db, "lead", "LEAD-2026-");
  db.leads.unshift({
    id: leadId, customerId: custId, source: "website", stage: "new_lead", createdAt: at, name: sub.name.trim(), phone: sub.phone.trim(), email: sub.email.trim(), town: sub.town.trim(),
    message: sub.message.trim(), eventRef: sub.ref, lastActivityAt: at, events: [{ ref: sub.ref, at, message: sub.message }], missingFields: missing.length ? missing : undefined,
    review: m.kind === "review" ? { phoneMatchLeadId: m.phoneLeadId, emailMatchLeadId: m.emailLeadId, status: "open" } : undefined,
    note: m.kind === "new" ? m.reason : undefined,
  });
  log(db, actor, MODULE, `Marketing: Lead ${leadId} created from website form event ${sub.ref}. Source: website. Match: NewLead${missing.length ? `. Missing mandatory fields: ${missing.join(", ")}` : ""}`);
  if (m.kind === "review") {
    const a = leadContact(db, m.phoneLeadId).name;
    const b = leadContact(db, m.emailLeadId).name;
    log(db, actor, MODULE, `Marketing: Lead ${leadId} – Phone matches ${a} (${m.phoneLeadId}), email matches ${b} (${m.emailLeadId}). Placed on review list; no automatic merge.`);
  }
  return ok({ leadId, outcome: m.kind === "review" ? "review" : "new" });
}

export function resolveLeadReview(db: Database, actor: User, leadId: string, resolution: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "resolve a lead review", whoCan("marketing.post"));
  const lead = byId(db.leads, leadId);
  if (!lead?.review || lead.review.status !== "open") return fail("Nothing to resolve.");
  if (!resolution.trim()) return fail("Record how it was resolved.", "resolution");
  Object.assign(lead.review, { status: "resolved", resolution: resolution.trim(), resolvedBy: actor.id, resolvedAt: now() });
  log(db, actor, MODULE, `Marketing: Lead ${leadId} review resolved by hand by ${actor.name}: ${resolution.trim()}. No automatic merge.`);
  return ok();
}

/* ------------------------------ Reporting ---------------------------- */

export const UNAVAILABLE_METRICS = ["Reach", "Engagement", "Revenue attribution"];

/** Posts published and website leads by source. Nothing permission-dependent is estimated. */
export function monthlyReport(db: Database, month: string) {
  const inMonth = (iso?: string) => !!iso && localParts(iso).date.slice(0, 7) === month;
  const published = db.marketingPosts.filter((p) => p.publications.some((x) => x.status === "published" && inMonth(x.at)));
  const perPlatform = { facebook: 0, instagram: 0 } as Record<SocialPlatform, number>;
  published.forEach((p) => p.publications.forEach((x) => x.status === "published" && inMonth(x.at) && (perPlatform[x.platform] += 1)));
  const leads = db.leads.filter((l) => inMonth(l.createdAt));
  const bySource = leads.reduce((acc, l) => ({ ...acc, [l.source]: (acc[l.source] ?? 0) + 1 }), {} as Partial<Record<LeadSource, number>>);
  return { month, published: published.length, perPlatform, leads: leads.length, bySource, unavailable: UNAVAILABLE_METRICS };
}

export function logMonthlyReport(db: Database, actor: User, month: string) {
  const r = monthlyReport(db, month);
  log(db, actor, MODULE, `Marketing: Monthly report for ${month} produced – posts published ${r.published}, website leads by source ${Object.entries(r.bySource).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}. Unavailable metrics: ${r.unavailable.join(", ")}`);
  return ok();
}

export function logContentExport(db: Database, actor: User, count: number) {
  log(db, actor, MODULE, `Marketing: Content history exported as CSV by ${actor.name} (${count} posts, last 12 months). Withdrawn media excluded.`);
  return ok();
}
