"use client";
/**
 * Patent §34 — Social Inbox. Comments, direct messages and mentions read from
 * the connected platforms (sandbox connector) in one list. On each message:
 * reply (sandbox, confirmed first), assign to a staff member, mark done, and
 * "Create lead", which creates or links the lead attributed to the platform,
 * the post or ad it came from and their campaign.
 */
import { useMemo, useState } from "react";
import { CheckCircle2, Inbox, MessageSquare, RefreshCw, RotateCcw, UserPlus } from "lucide-react";
import type { SocialMessage } from "@/features/types/marketing-social";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can, whoCan } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { AppLink, useParam } from "@/features/lib/navigation";
import { PLATFORM_LABEL, validateReply } from "@/features/lib/rules/marketing-social";
import { assignMessage, checkInbox, createLeadFromMessage, MESSAGE_KIND_LABEL, MESSAGE_STATUS_LABEL, replyToMessage, setMessageDone } from "@/features/lib/store/actions/marketing-engage";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Button, Card, EmptyState, Field, PillTabs, Select, Stat, StatStrip, Textarea } from "@/features/components/ui";
import type { Tone } from "@/features/components/ui/badge";
import { MarketingFrame } from "./marketing-frame";
import { GatedButton, TAP, TAP_SCOPE, useConfirm } from "./growth-shared";

type Filter = "open" | "replied" | "closed" | "all";
const STATUS_TONE: Record<SocialMessage["status"], Tone> = { open: "amber", replied: "blue", closed: "gray" };
const INTENT_LABEL: Record<NonNullable<SocialMessage["intent"]>, string> = { quote_request: "Quote request", question: "Question", general: "General" };

export function SocialInboxScreen() {
  return <MarketingFrame tab="inbox"><SocialInbox /></MarketingFrame>;
}

function SocialInbox() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const focus = useParam("id");
  const [filter, setFilter] = useState<Filter>(() => {
    const m = focus ? byId(db.socialMessages ?? [], focus) : undefined;
    return m ? (m.status as Filter) : "open";
  });
  const { setConfirm, dialog } = useConfirm();
  const all = useMemo(() => [...(db.socialMessages ?? [])].sort((a, b) => b.at.localeCompare(a.at)), [db.socialMessages]);
  const count = (f: Filter) => (f === "all" ? all.length : all.filter((m) => m.status === f).length);
  const shown = filter === "all" ? all : all.filter((m) => m.status === filter);
  const staff = db.users.filter((u) => can(u, "marketing.access"));
  const check = () => {
    const r = act(checkInbox);
    if (!r.ok) return;
    const v = r.value as { added: number; repeats: number; unreachable: string[] };
    toast.success(v.added ? `${v.added} new message${v.added === 1 ? "" : "s"} in the inbox` : "No new messages", `${v.unreachable.length ? `${v.unreachable.join(", ")} not connected — reconnect in Settings › Social Accounts. ` : ""}Sandbox connector.`);
    if (v.added) setFilter("open");
  };
  const checkButton = <Button className={TAP} onClick={check}><RefreshCw className="h-4 w-4" /> Check for new messages</Button>;

  return (
    <>
      <PageHeader
        title="Social Inbox"
        subtitle="Comments, direct messages and mentions from every connected platform. Reply, assign, mark done, or create a lead attributed to the platform, post, ad and campaign. Sandbox: replies are recorded, not posted."
        actions={checkButton}
      />
      <StatStrip className="mb-4">
        <Stat label="Need a reply" value={count("open")} tone={count("open") ? "warn" : "default"} />
        <Stat label="Quote requests" value={all.filter((m) => m.intent === "quote_request" && m.status !== "closed").length} hint="Open or replied" />
        <Stat label="Assigned to me" value={all.filter((m) => m.assignedTo === user.id && m.status !== "closed").length} />
        <Stat label="Leads created" value={all.filter((m) => m.leadId).length} hint="From inbox messages" />
      </StatStrip>
      <PillTabs className="mb-4" value={filter} onChange={setFilter} options={(["open", "replied", "closed", "all"] as Filter[]).map((f) => ({ value: f, label: f === "all" ? "All" : MESSAGE_STATUS_LABEL[f], count: count(f) }))} />
      {shown.length === 0 ? (
        <EmptyState icon={<Inbox />} title={filter === "open" ? "Nothing needs a reply" : "No messages here"}
          body="New comments, direct messages and mentions arrive when the inbox checks the connected accounts. Check now to read the latest." action={checkButton} />
      ) : (
        <div className="space-y-3">
          {shown.map((m) => <MessageCard key={m.id} m={m} highlight={m.id === focus} staff={staff} setConfirm={setConfirm} />)}
        </div>
      )}
      {dialog}
    </>
  );
}

function MessageCard({ m, highlight, staff, setConfirm }: { m: SocialMessage; highlight: boolean; staff: { id: string; name: string }[]; setConfirm: ReturnType<typeof useConfirm>["setConfirm"] }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string>();
  const canPost = can(user, "marketing.post");
  const postReason = `Needs ${whoCan("marketing.post")}.`;
  const canLead = can(user, "lead.create");
  const post = m.postId ? byId(db.marketingPosts, m.postId) : undefined;
  const ad = m.adId ? byId(db.socialAds ?? [], m.adId) : undefined;
  const campaign = byId(db.mktCampaigns ?? [], m.attribution?.campaignId ?? ad?.campaignId ?? (m.postId ? (db.mktCampaigns ?? []).find((c) => c.postIds.includes(m.postId!))?.id : undefined));
  const where = `${PLATFORM_LABEL[m.platform]} ${MESSAGE_KIND_LABEL[m.kind].toLowerCase()}`;

  const send = () => {
    const problem = validateReply(m.platform, text);
    if (problem) return setErr(problem);
    setConfirm({
      title: `Send this reply to ${m.author.name}?`, label: "Send reply",
      body: (
        <ul className="list-disc space-y-1 pl-5">
          <li>Reply to the {where}{m.kind === "comment" ? " (public — anyone on the post can see it)" : ""}: &ldquo;{text.trim()}&rdquo;</li>
          <li>The message moves to Replied and the reply is added to the communication history.</li>
          <li>Sandbox: recorded with a sandbox reference; nothing is posted to {PLATFORM_LABEL[m.platform]}.</li>
          <li><b>A sent reply can&apos;t be edited or unsent.</b></li>
        </ul>
      ),
      run: () => {
        const r = act(replyToMessage, m.id, text);
        if (!r.ok) return setErr(r.error);
        toast.success(`Reply to ${m.author.name} sent`, "Sandbox: recorded, not posted to the platform.");
        setReplying(false);
        setText("");
      },
    });
  };
  const createLead = () => setConfirm({
    title: `Create a lead for ${m.author.name}?`, label: "Create lead",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Creates a new lead (and contact) for {m.author.name}{m.author.phone || m.author.email ? ` — ${[m.author.phone, m.author.email].filter(Boolean).join(", ")}` : " — no phone or email yet, so add them on the lead"}.</li>
        <li>If that phone or email enquired in the last 90 days, the message is linked to that lead instead.</li>
        <li>Source: {where}{ad ? `, ad ${ad.name}` : post ? `, post ${post.title}` : ""}{campaign ? `; campaign ${campaign.name}` : ""}. It counts in the campaign&apos;s leads and ROI.</li>
        <li>The lead appears in the Lead Pipeline as New lead. It can be archived there, but not removed here.</li>
      </ul>
    ),
    run: () => {
      const r = act(createLeadFromMessage, m.id);
      if (!r.ok) return;
      const v = r.value as { leadId: string; outcome: string; campaignName?: string };
      toast.success(v.outcome === "created" ? `Lead ${v.leadId} created for ${m.author.name}` : `Linked to existing lead ${v.leadId}`, v.campaignName ? `Attributed to ${v.campaignName}.` : `Attributed to ${PLATFORM_LABEL[m.platform]}.`);
    },
  });
  const assign = (userId: string) => {
    const r = act(assignMessage, m.id, userId || undefined);
    if (r.ok) toast.success(userId ? `Assigned to ${byId(db.users, userId)?.name}` : "Unassigned", `${m.author.name}'s ${MESSAGE_KIND_LABEL[m.kind].toLowerCase()}.`);
  };
  const done = (v: boolean) => {
    const r = act(setMessageDone, m.id, v);
    if (r.ok) toast.success(v ? "Marked done" : "Reopened", `${m.author.name}'s ${MESSAGE_KIND_LABEL[m.kind].toLowerCase()} ${v ? "moved to Done" : "is back in the inbox"}.`);
  };

  return (
    <Card className={`p-4 ${highlight ? "ring-2 ring-brand/40" : ""}`} id={m.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{m.author.name}</span>
            {m.author.handle && <span className="text-xs text-gray-500">{m.author.handle}</span>}
            <Badge tone="gray">{where}</Badge>
            {m.sandbox && <Badge tone="gray">Sandbox</Badge>}
          </div>
          <div className="text-xs text-gray-500">
            {dateTime(m.at)} · {m.id}
            {post && <> · on post {post.title}</>}
            {ad && <> · from ad {ad.name}</>}
            {campaign && <> · <AppLink className="underline" href={`/marketing/campaigns?id=${campaign.id}`}>{campaign.name}</AppLink></>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge tone={STATUS_TONE[m.status]}>{MESSAGE_STATUS_LABEL[m.status]}</Badge>
          {m.intent && m.intent !== "general" && <Badge tone={m.intent === "quote_request" ? "purple" : "blue"}>{INTENT_LABEL[m.intent]}</Badge>}
          {m.leadId && <Badge tone="green">Lead {m.leadId}</Badge>}
        </div>
      </div>
      <p className="mt-2 text-sm text-gray-700">&ldquo;{m.text}&rdquo;</p>
      {m.replies.map((r, i) => (
        <div key={i} className="mt-2 rounded-lg border border-line bg-gray-50 px-3 py-2 text-xs">
          <b>{byId(db.users, r.by)?.name ?? "Staff"}</b> replied {dateTime(r.at)}{r.externalRef?.startsWith("SBX") ? " (sandbox)" : ""}: {r.text}
        </div>
      ))}
      {replying ? (
        <div className={`mt-3 space-y-2 ${TAP_SCOPE}`}>
          <Field label={`Reply to ${m.author.name}`} htmlFor={`rpl-${m.id}`} error={err} hint={m.kind === "comment" ? "Public reply on the post. Never include a street address." : "Private reply."}>
            <Textarea id={`rpl-${m.id}`} value={text} invalid={!!err} onChange={(e) => { setText(e.target.value); setErr(undefined); }} autoFocus />
          </Field>
          <div className="flex justify-end gap-2"><Button className={TAP} size="sm" onClick={() => setReplying(false)}>Cancel</Button><Button className={TAP} size="sm" variant="primary" onClick={send}>Send reply…</Button></div>
        </div>
      ) : (
        <div className={`mt-3 flex flex-wrap items-end gap-2 ${TAP_SCOPE}`}>
          {m.status !== "closed" && <GatedButton allowed={canPost} reason={postReason} size="sm" variant="primary" onClick={() => { setReplying(true); setErr(undefined); }}><MessageSquare className="h-3.5 w-3.5" /> Reply</GatedButton>}
          {m.leadId ? (
            <AppLink href={`/leads/${m.leadId}`} className={`inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-gray-50 ${TAP}`}>Open lead {m.leadId}</AppLink>
          ) : (
            <GatedButton allowed={canLead} reason={`Creating leads needs ${whoCan("lead.create")}.`} size="sm" onClick={createLead}><UserPlus className="h-3.5 w-3.5" /> Create lead</GatedButton>
          )}
          {m.status === "closed"
            ? <GatedButton allowed={canPost} reason={postReason} size="sm" variant="ghost" onClick={() => done(false)}><RotateCcw className="h-3.5 w-3.5" /> Reopen</GatedButton>
            : <GatedButton allowed={canPost} reason={postReason} size="sm" variant="ghost" onClick={() => done(true)}><CheckCircle2 className="h-3.5 w-3.5" /> Mark done</GatedButton>}
          <div className="ml-auto min-w-44">
            <label htmlFor={`asg-${m.id}`} className="mb-1 block text-xs font-semibold text-gray-600">Assigned to</label>
            <Select id={`asg-${m.id}`} value={m.assignedTo ?? ""} disabled={!canPost} title={canPost ? undefined : postReason} onChange={(e) => assign(e.target.value)}>
              <option value="">Nobody</option>
              {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
        </div>
      )}
    </Card>
  );
}
