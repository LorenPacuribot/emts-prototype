"use client";
/**
 * Feature 34 — Post composer.
 * Menu: Marketing > Content Calendar > a post, or New Post
 *
 * Media picker with a consent indicator per asset, copy editor with the
 * street-address check, the pre-publication checklist, the approval panel
 * (why approval is needed, the reviewed version), the schedule panel in local
 * wall-clock time with a daylight-saving note, and per-platform publishing.
 */
import { useState } from "react";
import { CalendarClock, CheckCircle2, Copy, History, MapPinOff, Send, ShieldCheck, XCircle } from "lucide-react";
import type { MarketingPost, PostTemplate, SocialPlatform } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { AppLink, useNav, useParam } from "@/features/lib/navigation";
import { dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { findStreetAddress, lateness, localLabel, localParts, resolveLocal } from "@/features/lib/rules/marketing";
import { addDays } from "@/features/lib/rules/dates";
import {
  approvePost, cancelPost, checkOutcome, confirmTakedown, copyToPlatform, createPost, PLATFORM_LABEL, postChecks, publishPost, rejectPost, retryFailed, saveChecklist,
  schedulePost, sendForApproval, spotCheckTakedown, TEMPLATE_LABEL, updatePost, type PostInput,
} from "@/features/lib/store/actions/marketing";
import { userName } from "@/features/lib/store/helpers";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, CardLabel, Checkbox, Field, Input, Modal, Select, Textarea, DemoButton } from "@/features/components/ui";
import { MarketingFrame } from "./marketing-frame";
import { AssetTile, PlatformChip, PostStateBadge } from "./shared";

export function ComposeScreen() {
  const id = useParam("id");
  const db = useDb((d) => d);
  const post = byId(db.marketingPosts, id);
  return (
    <MarketingFrame tab="compose">
      <Composer key={post ? `${post.id}-${post.version}-${post.assetIds.join()}` : "new"} post={post} />
    </MarketingFrame>
  );
}

const EMPTY: PostInput = { title: "", template: "finished_job", copy: "", assetIds: [], platforms: ["facebook", "instagram"], flags: { customerProperty: false, testimonial: false, namedCrew: false } };

function Composer({ post }: { post?: MarketingPost }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const { push } = useNav();
  const [form, setForm] = useState<PostInput>(post ? { title: post.title, template: post.template, copy: post.copy, assetIds: post.assetIds, platforms: post.platforms, flags: post.flags } : EMPTY);
  const [err, setErr] = useState<string>();
  const locked = !!post && ["published", "partially_failed", "cancelled"].includes(post.state);
  const street = findStreetAddress(form.copy);
  const assets = db.mediaAssets.filter((a) => !a.deletedForPrivacyAt);
  const set = <K extends keyof PostInput>(k: K, v: PostInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const togglePlatform = (p: SocialPlatform) => set("platforms", form.platforms.includes(p) ? form.platforms.filter((x) => x !== p) : [...form.platforms, p]);
  const toggleAsset = (id: string) => set("assetIds", form.assetIds.includes(id) ? form.assetIds.filter((x) => x !== id) : [...form.assetIds, id]);

  const save = () => {
    setErr(undefined);
    if (!post) {
      const r = act(createPost, form);
      if (r.ok) { toast.success(`${r.value} drafted`); push(`/marketing/compose?id=${r.value}`); } else setErr(r.error);
      return;
    }
    const r = act(updatePost, post.id, form);
    if (!r.ok) return setErr(r.error);
    if (r.value) toast.info(`Material edit (${r.value})`, "Renewed owner approval is required.");
    else toast.success("Saved", post.approval ? "Typo-level change — the approval carries over." : undefined);
  };

  return (
    <>
      <PageHeader
        title={post ? post.title : "New Post"}
        subtitle={post ? `${post.id} · v${post.version} · ${TEMPLATE_LABEL[post.template]} · created by ${userName(db, post.createdBy)}` : "Pick job media, write the copy, run the checklist, then send it on."}
        actions={post && <div className="flex flex-wrap items-center gap-2"><PostStateBadge state={post.state} />{post.copiedFrom && <Badge tone="gray">Copied from {post.copiedFrom}</Badge>}</div>}
      />
      {post?.approvalVoided && !postChecks(db, post).approved && <Banner tone="warn" className="mb-4">This post changed materially since approval ({post.approvalVoided.reason === "IdentifyingText" ? "identifying text" : post.approvalVoided.reason.toLowerCase()}). Renewed approval is required.</Banner>}
      {post?.rejection && post.state === "draft" && <Banner tone="danger" className="mb-4" title={`Returned by ${userName(db, post.rejection.by)}`}>{post.rejection.comment}</Banner>}
      {post && postChecks(db, post).accountIssues.length > 0 && <Banner tone="danger" className="mb-4">Flagged: {postChecks(db, post).accountIssues.join("; ")}. The office manager has been notified. Renew access under Accounts.</Banner>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] [&>*]:min-w-0">
        <div className="space-y-4">
          <Card className="p-4" data-tour="marketing-composer">
            <CardLabel>Content</CardLabel>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Working title" required><Input value={form.title} disabled={locked} onChange={(e) => set("title", e.target.value)} /></Field>
              <Field label="Template">
                <Select value={form.template} disabled={locked} onChange={(e) => set("template", e.target.value as PostTemplate)}>
                  {(Object.keys(TEMPLATE_LABEL) as PostTemplate[]).map((t) => <option key={t} value={t}>{TEMPLATE_LABEL[t]}</option>)}
                </Select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-4">
              {(["facebook", "instagram"] as const).map((p) => <Checkbox key={p} checked={form.platforms.includes(p)} disabled={locked} onCheckedChange={() => togglePlatform(p)} label={PLATFORM_LABEL[p]} />)}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs">
              <Checkbox checked={form.flags.customerProperty} disabled={locked} onCheckedChange={(v) => set("flags", { ...form.flags, customerProperty: v })} label="Shows a customer's property" />
              <Checkbox checked={form.flags.testimonial} disabled={locked} onCheckedChange={(v) => set("flags", { ...form.flags, testimonial: v })} label="Includes a testimonial" />
              <Checkbox checked={form.flags.namedCrew} disabled={locked} onCheckedChange={(v) => set("flags", { ...form.flags, namedCrew: v })} label="Names a crew member" />
            </div>
            <Field label="Copy" className="mt-3" error={err} hint="Only the neighbourhood is shown — never the street address.">
              <Textarea rows={4} value={form.copy} disabled={locked} onChange={(e) => set("copy", e.target.value)} />
            </Field>
            {street && <Banner tone="danger" className="mt-2" title="Street address found"><MapPinOff className="mr-1 inline h-3.5 w-3.5" />&ldquo;{street}&rdquo; can&apos;t be published. Use the neighbourhood instead (for example, &ldquo;in Lakewood&rdquo;).</Banner>}
            {!locked && <div className="mt-3 flex justify-end"><Button variant="primary" onClick={save}>{post ? "Save changes" : "Save draft"}</Button></div>}
          </Card>

          <Card className="p-4" data-tour="marketing-media">
            <CardLabel right={<AppLink href="/marketing/media" className="text-xs font-semibold text-brand">Crop or upload in the Media Library</AppLink>}>Media</CardLabel>
            <p className="mt-1 text-xs text-gray-500">Without a release, only surface images can be used. Withdrawn media can&apos;t be selected. Crops keep the original job media untouched.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {assets.map((a) => <AssetTile key={a.id} asset={a} selected={form.assetIds.includes(a.id)} onClick={locked ? undefined : () => toggleAsset(a.id)} />)}
            </div>
          </Card>

          {post && <Versions post={post} />}
        </div>

        {post ? (
          <div className="space-y-4">
            <Checks post={post} />
            <Approval post={post} />
            <Schedule post={post} />
            <Publishing post={post} />
          </div>
        ) : (
          <Card className="p-4 text-xs text-gray-500">Save the draft to run the consent check, the checklist and the approval route.{!can(user, "marketing.post") && " Your role can't draft posts."}</Card>
        )}
      </div>
    </>
  );
}

function Checks({ post }: { post: MarketingPost }) {
  const db = useDb((d) => d);
  const c = postChecks(db, post);
  const items: [keyof MarketingPost["checklist"], string][] = [["houseNumbers", "House numbers stripped or blocked"], ["faces", "Faces checked"], ["plates", "License plates checked"], ["neighbouring", "Neighbouring property checked"]];
  const done = ["published", "partially_failed", "cancelled"].includes(post.state);
  return (
    <Card className="p-4" data-tour="marketing-checks">
      <CardLabel icon={<ShieldCheck />}>Consent and checklist</CardLabel>
      <div className="mt-3 space-y-2 text-xs">
        {c.consent.ok ? <div className="flex items-start gap-1.5 text-green-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Consent check passes.{c.consent.releases.length ? ` Release: ${c.consent.releases.join("; ")}.` : " No identifiable customer content."}</div>
          : c.consent.failures.map((f) => <div key={f} className="flex items-start gap-1.5 text-red-700"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /> Blocked — {f}</div>)}
        {c.addressAssets.map((a) => <div key={a.id} className="flex items-start gap-1.5 text-red-700"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /> Flagged — {a.id}: {a.identifyingNote}. Use a publication crop.</div>)}
      </div>
      <div className="mt-3 space-y-1.5 border-t border-line pt-3">
        {items.map(([k, label]) => (
          <div key={k}><Checkbox checked={post.checklist[k]} disabled={done} label={label} onCheckedChange={(v) => act(saveChecklist, post.id, { ...post.checklist, [k]: v })} /></div>
        ))}
      </div>
    </Card>
  );
}

const REASON_LABEL = { CustomerProperty: "customer-property content", Photo: "an identifiable photograph", Testimonial: "a testimonial", CrewSpotlight: "a named crew spotlight" } as const;

function Approval({ post }: { post: MarketingPost }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const c = postChecks(db, post);
  return (
    <Card className="p-4" data-tour="marketing-approval">
      <CardLabel>Owner approval</CardLabel>
      <div className="mt-2 text-xs">
        {c.needsApproval
          ? <p>Required because the post contains {c.reasons.map((r) => REASON_LABEL[r]).join(", ")}. Approval attaches to the version reviewed; a changed image, identifying text or claim voids it — a typo doesn&apos;t.</p>
          : <p className="text-gray-600">Not required — routine content with no identifiers.</p>}
        {post.approval && <p className="mt-1.5">Approved <strong>v{post.approval.version}</strong> by {userName(db, post.approval.by)} on {dateTime(post.approval.at)}{c.approved ? " — current version." : ` — this is v${post.version}, so it no longer applies.`}</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {post.state === "draft" && can(user, "marketing.post") && <Button variant="primary" onClick={() => { const r = act(sendForApproval, post.id); if (r.ok) toast.success(r.value === "sent" ? "Sent to the owner" : "No approval needed", r.value === "sent" ? "Scheduling unlocks once approved." : "Routine content. Schedule it when ready."); }}><Send className="h-4 w-4" /> {c.needsApproval ? "Send for approval" : "Run consent check"}</Button>}
        {post.state === "awaiting_approval" && (can(user, "marketing.approve") ? (
          <>
            <Button variant="primary" onClick={() => act(approvePost, post.id).ok && toast.success(`${post.id} v${post.version} approved`)}>Approve v{post.version}</Button>
            <Button variant="danger" onClick={() => setRejecting(true)}>Reject</Button>
          </>
        ) : <Badge tone="purple">Waiting for the business owner</Badge>)}
      </div>
      <Modal open={rejecting} onOpenChange={setRejecting} size="sm" title={`Return ${post.id} to draft`} description="Say what needs to change."
        footer={<><Button onClick={() => setRejecting(false)}>Cancel</Button><Button variant="danger" onClick={() => { if (act(rejectPost, post.id, comment).ok) { setRejecting(false); toast.success("Returned to draft"); } }}>Reject</Button></>}>
        <Field label="Comment" required><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      </Modal>
    </Card>
  );
}

function Schedule({ post }: { post: MarketingPost }) {
  const db = useDb((d) => d);
  const start = post.schedule ? { date: post.schedule.localDate, time: post.schedule.localTime } : { date: localParts(addDays(now(), 1)).date, time: "09:00" };
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const c = postChecks(db, post);
  const canSchedule = ["draft", "approved", "scheduled", "missed"].includes(post.state);
  let preview: ReturnType<typeof resolveLocal> | undefined;
  try { preview = date && time ? resolveLocal(date, time) : undefined; } catch { preview = undefined; }
  if (!canSchedule && !post.schedule) return null;
  return (
    <Card className="p-4" data-tour="marketing-schedule">
      <CardLabel icon={<CalendarClock />}>Schedule</CardLabel>
      {post.schedule && (
        <p className="mt-2 text-xs">
          {post.state === "missed" ? <Badge tone="amber">Missed</Badge> : <Badge tone="indigo">Scheduled</Badge>} {localLabel(post.schedule.utc)} (America/Chicago) on {post.platforms.map((p) => PLATFORM_LABEL[p]).join(" and ")}.
          {post.schedule.adjustment === "first_occurrence" && " That time happens twice as the clocks go back; the first occurrence is used."}
          {post.schedule.adjustment === "moved_to_first_valid" && " That time doesn't exist as the clocks go forward; moved to the first valid time after the gap."}
        </p>
      )}
      {canSchedule && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Field label="Local date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Local time"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          </div>
          {preview && preview.adjustment !== "none" && (
            <Banner tone="info" className="mt-2">{preview.adjustment === "moved_to_first_valid" ? `${time} doesn't exist on ${date} (clocks go forward). It will post at ${preview.resolvedLocal.slice(11)}, the first valid time after the gap.` : `${time} happens twice on ${date} (clocks go back). The first occurrence is used.`}</Banner>
          )}
          {c.blockers.length > 0 ? <p className="mt-2 text-xs text-red-700">Scheduling is disabled: {c.blockers[0]}</p> : null}
          <div className="mt-3 flex justify-end">
            <Button variant="primary" disabled={c.blockers.length > 0} onClick={() => { const r = act(schedulePost, post.id, date, time); if (r.ok) toast.success(post.state === "missed" ? "Rescheduled" : "Scheduled", localLabel(r.value!.utc)); }}>{post.state === "missed" ? "Reschedule" : post.state === "scheduled" ? "Change time" : "Schedule"}</Button>
          </div>
        </>
      )}
    </Card>
  );
}

function Publishing({ post }: { post: MarketingPost }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const late = post.state === "scheduled" && post.schedule ? lateness(post.schedule.utc, now()) : undefined;
  const other: SocialPlatform | undefined = post.platforms.length === 1 ? (post.platforms[0] === "facebook" ? "instagram" : "facebook") : undefined;
  const office = can(user, "marketing.post");
  if (post.state === "draft" && !other) return null;
  return (
    <Card className="p-4" data-tour="marketing-publishing">
      <CardLabel>Publishing</CardLabel>
      <p className="mt-1 text-xs text-gray-500">Organic posts only. Publishing never creates advertising spend, and a post is never treated as an advertisement.</p>
      {post.publications.length > 0 && (
        <div className="mt-3 space-y-2">
          {post.publications.map((p) => (
            <div key={p.platform} className="rounded-lg border border-line px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5"><PlatformChip platform={p.platform} status={p.status} /> <strong>{p.status === "uncertain" ? "Outcome unclear" : p.status[0].toUpperCase() + p.status.slice(1)}</strong></span>
                {p.status === "uncertain" && office && (
                  <span className="flex gap-1">
                    <Button size="sm" onClick={() => act(checkOutcome, post.id, p.platform, true).ok && toast.success("Found on the platform")}>Found it</Button>
                    <Button size="sm" onClick={() => act(checkOutcome, post.id, p.platform, false).ok && toast.info("Recorded as not published", "You can now retry that platform.")}>Not there</Button>
                  </span>
                )}
              </div>
              <div className="text-gray-500">{p.externalRef ? `Reference ${p.externalRef}` : ""}{p.at ? ` · ${localLabel(p.at)}` : ""}{p.error ? ` · ${p.error}` : ""}</div>
              {p.status === "uncertain" && <div className="text-amber-700">Publication outcome unclear. Check the platform before retrying.</div>}
            </div>
          ))}
        </div>
      )}
      {late && late.state === "waiting" && <Banner tone="warn" className="mt-3">{late.minutes} minutes past its time. It won&apos;t publish on its own — publish now or reschedule. After 30 minutes it becomes a missed post.</Banner>}
      <div className="mt-3 flex flex-wrap gap-2">
        {office && post.state === "scheduled" && late?.state === "not_due" && <DemoButton onClick={() => { const r = act(publishPost, post.id, "on_time"); if (r.ok) toast.success(r.value === "published" ? "Published" : "Partly published", "Simulated the scheduler reaching the scheduled minute."); }}>Simulate scheduled time</DemoButton>}
        {office && post.state === "scheduled" && late?.state === "waiting" && <Button variant="primary" onClick={() => { const r = act(publishPost, post.id, "manual"); if (r.ok) toast.success("Published by the office manager"); }}>Publish now</Button>}
        {office && post.state === "partially_failed" && <Button variant="primary" onClick={() => { const r = act(retryFailed, post.id); if (r.ok) toast.success("Retried the failed platform only"); }}>Retry failed platform</Button>}
        {office && other && <Button onClick={() => { const r = act(copyToPlatform, post.id, other); if (r.ok) toast.success(`Copied to ${PLATFORM_LABEL[other]} as ${r.value}`, "The approval requirement was re-evaluated for the copy."); }}><Copy className="h-4 w-4" /> Copy to {PLATFORM_LABEL[other]}</Button>}
        {office && !["published", "partially_failed", "cancelled"].includes(post.state) && <Button variant="ghost" onClick={() => act(cancelPost, post.id).ok && toast.success("Canceled")}>Cancel post</Button>}
      </div>
      {post.takedown && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-xs">
          <div className="font-semibold text-red-800">Takedown review</div>
          <div className="text-gray-600">{post.takedown.reason}. Removing a queued post is not a takedown — confirm once it is off the platforms.</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!post.takedown.doneAt ? (office && <Button size="sm" variant="danger" onClick={() => act(confirmTakedown, post.id).ok && toast.success("Takedown confirmed", "The owner spot-checks it next.")}>Confirm taken down</Button>)
              : <Badge tone="green">Taken down {dateTime(post.takedown.doneAt)} by {userName(db, post.takedown.doneBy)}</Badge>}
            {post.takedown.doneAt && (post.takedown.spotCheckedBy ? <Badge tone="green">Owner spot-check done</Badge> : can(user, "marketing.approve") ? <Button size="sm" onClick={() => act(spotCheckTakedown, post.id).ok && toast.success("Spot-check recorded")}>Record spot-check</Button> : <Badge tone="amber">Owner spot-check pending</Badge>)}
          </div>
        </div>
      )}
    </Card>
  );
}

function Versions({ post }: { post: MarketingPost }) {
  const db = useDb((d) => d);
  return (
    <Card className="p-4">
      <CardLabel icon={<History />}>Version history</CardLabel>
      <div className="mt-3 space-y-2">
        {[...post.versions].reverse().map((v, i) => (
          <div key={i} className="rounded-lg border border-line px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5"><strong>v{v.version}</strong> <span className="text-gray-500">{v.note} · {userName(db, v.by)} · {dateTime(v.at)}</span>{post.approval?.version === v.version && <Badge tone="green">Approved version</Badge>}</div>
            <div className="mt-0.5 text-gray-600">{v.copy}</div>
            <div className="text-xs text-gray-500">Media: {v.assetIds.join(", ") || "none"}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
