"use client";
/**
 * Patent §34 — Ads. Create or edit an ad for a campaign (platform, budget,
 * dates, creative from the media library, audience), submit it for approval,
 * owner-only approve or send back (marketing.approve; others see the button
 * disabled with the reason), pause and resume. Results are read-only and come
 * from the sandbox connector until platform keys are added.
 */
import { useMemo, useState } from "react";
import { BadgeDollarSign, CirclePause, Pencil, Play, Plus, RefreshCw, Send, ShieldCheck, Undo2 } from "lucide-react";
import type { SocialPlatform } from "@/features/types";
import type { SocialAdCampaign } from "@/features/types/marketing-social";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can, whoCan } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { now } from "@/features/lib/clock";
import { dateLong, dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { AppLink, useParam } from "@/features/lib/navigation";
import { AD_MAX_WITHOUT_REVIEW, approvedSpend, PLATFORM_LABEL, SOCIAL_PLATFORMS } from "@/features/lib/rules/marketing-social";
import {
  AD_CTA_LABEL, AD_OBJECTIVE_LABEL, AD_STATUS_LABEL, adFieldErrors, approveAd, pauseAd, refreshAdResults, rejectAd, resumeAd, saveAd, submitAdForApproval, type AdDraft,
} from "@/features/lib/store/actions/marketing-engage";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, Drawer, EmptyState, Field, Input, KV, Modal, PillTabs, Select, Stat, StatStrip, Table, TD, Textarea, TH, THead, TR } from "@/features/components/ui";
import type { Tone } from "@/features/components/ui/badge";
import { MarketingFrame } from "./marketing-frame";
import { AssetTile } from "./shared";
import { cents, GatedButton, SectionTitle, TAP, TAP_SCOPE, useConfirm } from "./growth-shared";

const today = () => now().slice(0, 10);
const STATUS_TONE: Record<SocialAdCampaign["status"], Tone> = { draft: "gray", pending_approval: "purple", approved: "blue", active: "green", paused: "amber", completed: "gray", rejected: "red", failed: "red" };
const AD_PLATFORMS = SOCIAL_PLATFORMS.filter((p) => p.ads);
const budgetText = (a: Pick<SocialAdCampaign, "budget">) => `${cents(a.budget.amount)} ${a.budget.type === "daily" ? "a day" : "total"}`;
const num = (n: number) => n.toLocaleString("en-US");

export function AdsScreen() {
  return <MarketingFrame tab="ads"><Ads /></MarketingFrame>;
}

function Ads() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const initial = useParam("id");
  const [openId, setOpenId] = useState<string | undefined>(initial);
  const [editing, setEditing] = useState<SocialAdCampaign | "new">();
  const ads = db.socialAds ?? [];
  const canPost = can(user, "marketing.post");
  const reason = `Needs ${whoCan("marketing.post")}.`;
  const newButton = <GatedButton allowed={canPost} reason={reason} variant="primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New ad</GatedButton>;
  const running = ads.filter((a) => a.status === "active");
  const spend = ads.reduce((s, a) => s + (a.performance?.spend ?? 0), 0);

  return (
    <>
      <PageHeader title="Ads" subtitle="Paid ads for a campaign: platform, budget, dates, creative from the media library and audience. The Business Owner approves every budget before an ad runs." actions={ads.length > 0 && newButton} />
      <Banner tone="info" className="mb-4" title="Sandbox until platform keys are added">Approved ads are not sent to Facebook, Instagram or any other platform, and no money is spent. Results are simulated and marked Sandbox.</Banner>
      {ads.length === 0 ? (
        <EmptyState icon={<BadgeDollarSign />} title="No ads yet" body="Create an ad for a campaign. It is saved as a draft; the owner approves the budget before it runs." action={newButton} />
      ) : (
        <>
          <StatStrip className="mb-4">
            <Stat label="Running" value={running.length} hint={`${ads.length} ads in total`} />
            <Stat label="Awaiting owner approval" value={ads.filter((a) => a.status === "pending_approval").length} tone={ads.some((a) => a.status === "pending_approval") ? "warn" : "default"} />
            <Stat label="Approved spend" value={cents(ads.reduce((s, a) => s + (a.approval?.budget ?? 0), 0))} hint="Up to, across all ads" />
            <Stat label="Spent so far" value={cents(spend)} hint="Sandbox results" />
          </StatStrip>
          <Card className="p-0">
            <div className="overflow-x-auto">
              <Table className="relative rounded-2xl border-0">
                <THead><tr><TH>Ad</TH><TH>Budget</TH><TH>Dates</TH><TH>Status</TH><TH className="text-right">Spend</TH><TH className="text-right">Clicks</TH><TH className="text-right">Leads</TH><TH><span className="sr-only">Actions</span></TH></tr></THead>
                <tbody>
                  {ads.map((a) => (
                    <TR key={a.id}>
                      <TD className="min-w-52"><div className="font-semibold text-ink">{a.name}</div><div className="text-[11.5px] text-slate-500">{a.id} · {PLATFORM_LABEL[a.platform]} · {byId(db.mktCampaigns ?? [], a.campaignId)?.name ?? "No campaign"}</div></TD>
                      <TD className="whitespace-nowrap">{budgetText(a)}</TD>
                      <TD className="whitespace-nowrap text-[12px]">{dateLong(a.schedule.start)} – {a.schedule.end ? dateLong(a.schedule.end) : "no end"}</TD>
                      <TD><Badge tone={STATUS_TONE[a.status]}>{AD_STATUS_LABEL[a.status]}</Badge></TD>
                      <TD className="text-right tabular-nums">{a.performance ? cents(a.performance.spend) : "—"}</TD>
                      <TD className="text-right tabular-nums">{a.performance ? num(a.performance.clicks) : "—"}</TD>
                      <TD className="text-right tabular-nums">{a.performance ? num(a.performance.leads) : "—"}</TD>
                      <TD className="whitespace-nowrap text-right"><Button size="sm" variant="ghost" className={TAP} onClick={() => setOpenId(a.id)}>{a.status === "pending_approval" && can(user, "marketing.approve") ? "Review & approve" : "Open"}</Button></TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        </>
      )}
      {openId && byId(ads, openId) && <AdDrawer id={openId} onClose={() => setOpenId(undefined)} onEdit={(a) => setEditing(a)} />}
      {editing && <AdForm ad={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} onSaved={(id) => { setEditing(undefined); setOpenId(id); }} />}
    </>
  );
}

function AdDrawer({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (a: SocialAdCampaign) => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const a = byId(db.socialAds ?? [], id)!;
  const { setConfirm, dialog } = useConfirm();
  const [rejecting, setRejecting] = useState(false);
  const canPost = can(user, "marketing.post");
  const canApprove = can(user, "marketing.approve");
  const postReason = `Needs ${whoCan("marketing.post")}.`;
  const ownerReason = `Only the ${whoCan("marketing.approve")} approves ad spend. Ask them to review it.`;
  const camp = byId(db.mktCampaigns ?? [], a.campaignId);
  const cr = a.creatives[0];
  const total = approvedSpend(a);
  const p = a.performance;
  const editable = ["draft", "rejected", "failed", "pending_approval", "paused", "approved"].includes(a.status);

  const submit = () => setConfirm({
    title: `Submit ${a.name} for approval?`, label: "Submit for approval",
    body: <ul className="list-disc space-y-1 pl-5"><li>The {whoCan("marketing.approve")} is asked to approve {budgetText(a)}: up to {cents(total)} in total.</li><li>Nothing runs until they approve it. You can still edit it; editing sends it back to draft.</li></ul>,
    run: () => { if (act(submitAdForApproval, a.id).ok) toast.success(`${a.name} sent for approval`, `The owner approves up to ${cents(total)}.`); },
  });
  const approve = () => setConfirm({
    title: `Approve ${a.name}?`, label: `Approve up to ${cents(total)}`,
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Budget {budgetText(a)}, {dateLong(a.schedule.start)} to {a.schedule.end ? dateLong(a.schedule.end) : "no end date (approved per 30 days)"}: up to <b>{cents(total)}</b>.</li>
        <li>{PLATFORM_LABEL[a.platform]}, {a.audience.locations.join(", ")}{a.audience.radiusMiles ? ` + ${a.audience.radiusMiles} mi` : ""}, ages {a.audience.ageMin}–{a.audience.ageMax}{a.audience.ageMax >= 65 ? "+" : ""}.</li>
        <li>{a.schedule.start <= today() ? "It starts running now" : `It starts on ${dateLong(a.schedule.start)}`}{camp ? ` and its spend counts against ${camp.name}` : ""}.</li>
        {total > AD_MAX_WITHOUT_REVIEW && <li>This is above {cents(AD_MAX_WITHOUT_REVIEW)}: check the budget carefully.</li>}
        <li>Sandbox: nothing is sent to {PLATFORM_LABEL[a.platform]} and no money is spent. You can pause it at any time.</li>
      </ul>
    ),
    run: () => {
      const r = act(approveAd, a.id);
      if (r.ok) toast.success(`${a.name} approved`, (r.value as { status: string }).status === "active" ? "Running (sandbox). Results update when you refresh them." : `Starts ${dateLong(a.schedule.start)}.`);
    },
  });
  const pause = () => setConfirm({
    title: `Pause ${a.name}?`, label: "Pause ad", tone: "danger",
    body: <ul className="list-disc space-y-1 pl-5"><li>The ad stops showing and stops spending.</li><li>Results so far are kept. Resuming needs the {whoCan("marketing.approve")}.</li></ul>,
    run: () => { if (act(pauseAd, a.id).ok) toast.success(`${a.name} paused`, "It has stopped spending."); },
  });
  const resume = () => setConfirm({
    title: `Resume ${a.name}?`, label: "Resume ad",
    body: <ul className="list-disc space-y-1 pl-5"><li>The ad starts spending again at {budgetText(a)}, within the approved {cents(a.approval?.budget ?? total)}.</li><li>Sandbox: no money is spent.</li></ul>,
    run: () => { if (act(resumeAd, a.id).ok) toast.success(`${a.name} resumed`); },
  });
  const refresh = () => { const r = act(refreshAdResults, a.id); if (r.ok) toast.success("Results refreshed", "Sandbox numbers from the simulated connector."); };

  return (
    <Drawer open onOpenChange={(v) => !v && onClose()} title={a.name}
      subtitle={<div className="flex flex-wrap items-center gap-2"><Badge tone={STATUS_TONE[a.status]}>{AD_STATUS_LABEL[a.status]}</Badge><span>{a.id} · {PLATFORM_LABEL[a.platform]} · {AD_OBJECTIVE_LABEL[a.objective]}</span></div>}
      footer={<Button className={TAP} onClick={onClose}>Close</Button>}>
      <div className="flex flex-wrap gap-2">
        {editable && <GatedButton allowed={canPost} reason={postReason} size="sm" onClick={() => onEdit(a)}><Pencil className="h-3.5 w-3.5" /> Edit ad</GatedButton>}
        {["draft", "rejected", "failed"].includes(a.status) && <GatedButton allowed={canPost} reason={postReason} size="sm" variant="primary" onClick={submit}><Send className="h-3.5 w-3.5" /> Submit for approval</GatedButton>}
        {a.status === "pending_approval" && (
          <>
            <GatedButton allowed={canApprove} reason={ownerReason} size="sm" variant="primary" onClick={approve}><ShieldCheck className="h-3.5 w-3.5" /> Approve</GatedButton>
            <GatedButton allowed={canApprove} reason={ownerReason} size="sm" onClick={() => setRejecting(true)}><Undo2 className="h-3.5 w-3.5" /> Send back</GatedButton>
          </>
        )}
        {(a.status === "active" || a.status === "approved") && <GatedButton allowed={canPost} reason={postReason} size="sm" onClick={pause}><CirclePause className="h-3.5 w-3.5" /> Pause</GatedButton>}
        {a.status === "paused" && <GatedButton allowed={canApprove} reason={`Resuming spends money again, so only the ${whoCan("marketing.approve")} can resume.`} size="sm" variant="primary" onClick={resume}><Play className="h-3.5 w-3.5" /> Resume</GatedButton>}
      </div>
      {a.rejection && a.status === "rejected" && <Banner tone="warn" title="Sent back by the owner">{a.rejection.comment}</Banner>}
      <section>
        <SectionTitle>Budget and audience</SectionTitle>
        <KV items={[
          ["Campaign", camp ? <AppLink className="underline" href={`/marketing/campaigns?id=${camp.id}`}>{camp.name}</AppLink> : "None"],
          ["Budget", `${budgetText(a)} · up to ${cents(total)}`],
          ["Approved", a.approval ? `${cents(a.approval.budget)} by ${byId(db.users, a.approval.by)?.name ?? "—"}, ${dateLong(a.approval.at)}` : "Not yet"],
          ["Dates", `${dateLong(a.schedule.start)} – ${a.schedule.end ? dateLong(a.schedule.end) : "no end"}`],
          ["Where", `${a.audience.locations.join(", ") || "—"}${a.audience.radiusMiles ? ` + ${a.audience.radiusMiles} miles` : ""}`],
          ["Ages", `${a.audience.ageMin}–${a.audience.ageMax}${a.audience.ageMax >= 65 ? "+" : ""}`],
          ["Interests", a.audience.interests.join(", ") || "—"],
        ]} />
      </section>
      {cr && (
        <section>
          <SectionTitle>Creative</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">{cr.assetIds.map((id) => { const asset = byId(db.mediaAssets, id); return asset ? <AssetTile key={id} asset={asset} compact /> : <div key={id} className="text-[12px] text-slate-500">{id} (removed)</div>; })}</div>
            <div className="rounded-xl border border-line p-3 text-[13px]"><div className="font-semibold text-ink">{cr.headline}</div><p className="mt-1 text-slate-700">{cr.text}</p><div className="mt-2 text-[12px] text-slate-500">Button: {AD_CTA_LABEL[cr.cta]}{cr.url && ` → ${cr.url}`}</div></div>
          </div>
        </section>
      )}
      <section>
        <SectionTitle right={a.status === "active" && <Button size="sm" variant="ghost" className={TAP} onClick={refresh}><RefreshCw className="h-3.5 w-3.5" /> Refresh results</Button>}>Results {p?.sandbox && <Badge tone="gray" className="ml-1">Sandbox</Badge>}</SectionTitle>
        {p ? (
          <>
            <StatStrip>
              <Stat label="Spend" value={cents(p.spend)} hint={a.approval ? `of ${cents(a.approval.budget)} approved` : undefined} />
              <Stat label="Impressions" value={num(p.impressions)} hint={`${num(p.reach)} people reached`} />
              <Stat label="Clicks" value={num(p.clicks)} hint={p.impressions ? `${((p.clicks / p.impressions) * 100).toFixed(2)}% click rate` : undefined} />
              <Stat label="Leads" value={num(p.leads)} hint={p.leads ? `${cents(p.spend / p.leads)} per lead` : "None yet"} />
            </StatStrip>
            <p className="mt-2 text-[11.5px] text-slate-500">Read-only. Updated {dateTime(p.at)}.</p>
          </>
        ) : <p className="text-[12.5px] text-slate-500">No results yet. They appear once the ad is approved and running.</p>}
      </section>
      <section>
        <SectionTitle>History</SectionTitle>
        <ul className="space-y-1 text-[12.5px] text-slate-600">{[...a.history].reverse().map((h, i) => <li key={i}>{dateTime(h.at)} · {byId(db.users, h.by)?.name ?? "—"}: {h.note}</li>)}</ul>
      </section>
      {rejecting && <RejectForm ad={a} onClose={() => setRejecting(false)} />}
      {dialog}
    </Drawer>
  );
}

function RejectForm({ ad, onClose }: { ad: SocialAdCampaign; onClose: () => void }) {
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string>();
  const submit = () => {
    const r = act(rejectAd, ad.id, comment);
    if (!r.ok) return setErr(r.error);
    toast.success(`${ad.name} sent back`, "The office sees your comment on the ad.");
    onClose();
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="sm" title={`Send back ${ad.name}`} description="Nothing runs. The office fixes it and submits it again."
      footer={<><Button className={TAP} onClick={onClose}>Cancel</Button><Button className={TAP} variant="primary" onClick={submit}>Send back</Button></>}>
      <div className={TAP_SCOPE}><Field label="What needs to change" htmlFor="ad-rej" required error={err}><Textarea id="ad-rej" value={comment} invalid={!!err} onChange={(e) => setComment(e.target.value)} /></Field></div>
    </Modal>
  );
}

function AdForm({ ad, onClose, onSaved }: { ad?: SocialAdCampaign; onClose: () => void; onSaved: (id: string) => void }) {
  const db = useDb((d) => d);
  const cr = ad?.creatives[0];
  const [f, setF] = useState({
    name: ad?.name ?? "", platform: ad?.platform ?? ("facebook" as SocialPlatform), objective: ad?.objective ?? ("leads" as SocialAdCampaign["objective"]), campaignId: ad?.campaignId ?? "",
    budgetType: ad?.budget.type ?? ("daily" as "daily" | "lifetime"), budgetAmount: ad ? String(ad.budget.amount) : "", start: ad?.schedule.start ?? today(), end: ad?.schedule.end ?? "",
    locations: ad?.audience.locations.join(", ") ?? "", radiusMiles: ad?.audience.radiusMiles?.toString() ?? "10", ageMin: String(ad?.audience.ageMin ?? 25), ageMax: String(ad?.audience.ageMax ?? 65),
    interests: ad?.audience.interests.join(", ") ?? "Home improvement", assetIds: cr?.assetIds ?? ([] as string[]), headline: cr?.headline ?? "", text: cr?.text ?? "", cta: cr?.cta ?? ("get_quote" as AdDraft["cta"]), url: cr?.url ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const e = (k: string) => errors[k];
  const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const draft: AdDraft = {
    id: ad?.id, name: f.name, platform: f.platform, objective: f.objective, campaignId: f.campaignId || undefined, budgetType: f.budgetType, budgetAmount: f.budgetAmount === "" ? NaN : Number(f.budgetAmount),
    start: f.start, end: f.end || undefined, locations: split(f.locations), radiusMiles: f.radiusMiles === "" ? undefined : Number(f.radiusMiles), ageMin: Number(f.ageMin), ageMax: Number(f.ageMax),
    interests: split(f.interests), assetIds: f.assetIds, headline: f.headline, text: f.text, cta: f.cta, url: f.url || undefined,
  };
  const total = Number.isFinite(draft.budgetAmount) && draft.budgetAmount > 0 && f.start ? approvedSpend({ budget: { type: f.budgetType, amount: draft.budgetAmount, currency: "USD" }, schedule: { start: f.start, end: f.end || undefined } }) : undefined;
  const media = useMemo(() => db.mediaAssets.filter((m) => !m.withdrawnAt), [db.mediaAssets]);
  const backToDraft = !!ad && ad.status !== "draft";
  const submit = () => {
    const found = adFieldErrors(db, draft, now());
    setErrors(found);
    if (Object.keys(found).length) return;
    const r = act(saveAd, draft);
    if (!r.ok) return setErrors({ [r.field ?? "form"]: r.error });
    const v = r.value as { id: string; backToDraft: boolean };
    toast.success(ad ? `${f.name.trim()} saved` : `Draft ad ${v.id} created`, v.backToDraft ? "It's back to draft: submit it for the owner's approval again." : "Submit it for the owner's approval when it's ready.");
    onSaved(v.id);
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="lg" title={ad ? `Edit ${ad.name}` : "New ad"} description="Saved as a draft. The Business Owner approves the budget before it runs."
      footer={<><Button className={TAP} onClick={onClose}>Cancel</Button><Button className={TAP} variant="primary" onClick={submit}>{ad ? "Save ad" : "Create draft"}</Button></>}>
      <div className={`space-y-3 ${TAP_SCOPE}`}>
        {backToDraft && <Banner tone="warn">This ad is {AD_STATUS_LABEL[ad!.status].toLowerCase()}. Saving changes puts it back to draft, and the owner has to approve it again.</Banner>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ad name" htmlFor="ad-name" required error={e("name")}><Input id="ad-name" value={f.name} invalid={!!e("name")} onChange={(x) => setF({ ...f, name: x.target.value })} placeholder="Spring exterior — Facebook" /></Field>
          <Field label="Campaign" htmlFor="ad-cmp" error={e("campaignId")} hint="Spend and leads count towards it">
            <Select id="ad-cmp" value={f.campaignId} onChange={(x) => setF({ ...f, campaignId: x.target.value })}>
              <option value="">No campaign</option>
              {(db.mktCampaigns ?? []).filter((c) => c.status !== "completed" || c.id === f.campaignId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Platform" htmlFor="ad-plat" error={e("platform")}><Select id="ad-plat" value={f.platform} onChange={(x) => setF({ ...f, platform: x.target.value as SocialPlatform })}>{AD_PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label} (min {cents(p.minDailyBudget)} a day)</option>)}</Select></Field>
          <Field label="Goal" htmlFor="ad-obj"><Select id="ad-obj" value={f.objective} onChange={(x) => setF({ ...f, objective: x.target.value as SocialAdCampaign["objective"] })}>{Object.entries(AD_OBJECTIVE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
        <fieldset className="rounded-lg border border-line p-3">
          <legend className="px-1 text-[12px] font-semibold text-slate-700">Budget and dates</legend>
          <PillTabs className="mb-3" value={f.budgetType} onChange={(t) => setF({ ...f, budgetType: t })} options={[{ value: "daily", label: "Daily budget" }, { value: "lifetime", label: "Total (lifetime) budget" }]} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={f.budgetType === "daily" ? "Per day (USD)" : "Total (USD)"} htmlFor="ad-amt" required error={e("budgetAmount")} hint={total !== undefined ? `Up to ${cents(total)} in total` : undefined}>
              <Input id="ad-amt" type="number" min={0} step={0.01} inputMode="decimal" value={f.budgetAmount} invalid={!!e("budgetAmount")} onChange={(x) => setF({ ...f, budgetAmount: x.target.value })} placeholder="0.00" />
            </Field>
            <Field label="Start date" htmlFor="ad-start" required error={e("start")}><Input id="ad-start" type="date" value={f.start} invalid={!!e("start")} onChange={(x) => setF({ ...f, start: x.target.value })} /></Field>
            <Field label="End date" htmlFor="ad-end" error={e("end")} hint={f.budgetType === "lifetime" ? "Required for a total budget" : "Optional; approved per 30 days"}><Input id="ad-end" type="date" value={f.end} invalid={!!e("end")} onChange={(x) => setF({ ...f, end: x.target.value })} /></Field>
          </div>
        </fieldset>
        <fieldset className="rounded-lg border border-line p-3">
          <legend className="px-1 text-[12px] font-semibold text-slate-700">Audience</legend>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Towns or ZIP codes" htmlFor="ad-loc" required error={e("locations")} hint="Separate with commas. Never a street address." className="sm:col-span-3"><Input id="ad-loc" value={f.locations} invalid={!!e("locations")} onChange={(x) => setF({ ...f, locations: x.target.value })} placeholder="Dallas, 75214" /></Field>
            <Field label="Radius (miles)" htmlFor="ad-rad"><Input id="ad-rad" type="number" min={0} step={1} value={f.radiusMiles} onChange={(x) => setF({ ...f, radiusMiles: x.target.value })} /></Field>
            <Field label="Age from (years)" htmlFor="ad-amin" error={e("age")}><Input id="ad-amin" type="number" min={18} max={65} step={1} value={f.ageMin} invalid={!!e("age")} onChange={(x) => setF({ ...f, ageMin: x.target.value })} /></Field>
            <Field label="Age to (years, 65 = 65+)" htmlFor="ad-amax"><Input id="ad-amax" type="number" min={18} max={65} step={1} value={f.ageMax} onChange={(x) => setF({ ...f, ageMax: x.target.value })} /></Field>
            <Field label="Interests" htmlFor="ad-int" hint="Separate with commas" className="sm:col-span-2"><Input id="ad-int" value={f.interests} onChange={(x) => setF({ ...f, interests: x.target.value })} /></Field>
          </div>
        </fieldset>
        <fieldset className="rounded-lg border border-line p-3">
          <legend className="px-1 text-[12px] font-semibold text-slate-700">Creative</legend>
          <div className="mb-1 text-[12px] font-semibold text-slate-700">Photos or video from the media library <span className="text-red-500">*</span></div>
          <p className="mb-2 text-[11.5px] text-slate-500">Locked items have no photo release or were withdrawn, so they can&apos;t be used.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{media.map((m) => <AssetTile key={m.id} asset={m} compact selected={f.assetIds.includes(m.id)} onClick={() => setF({ ...f, assetIds: f.assetIds.includes(m.id) ? f.assetIds.filter((x) => x !== m.id) : [...f.assetIds, m.id] })} />)}</div>
          {e("assetIds") && <p className="mt-2 text-[11.5px] font-medium text-red-600">{e("assetIds")}</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Headline" htmlFor="ad-head" required error={e("creative")}><Input id="ad-head" value={f.headline} invalid={!!e("creative")} onChange={(x) => setF({ ...f, headline: x.target.value })} /></Field>
            <Field label="Button" htmlFor="ad-cta"><Select id="ad-cta" value={f.cta} onChange={(x) => setF({ ...f, cta: x.target.value as AdDraft["cta"] })}>{Object.entries(AD_CTA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Ad text" htmlFor="ad-text" required className="sm:col-span-2"><Textarea id="ad-text" value={f.text} onChange={(x) => setF({ ...f, text: x.target.value })} /></Field>
            <Field label="Link (https)" htmlFor="ad-url" error={e("url")} hint="A landing page works best, e.g. /lp/… on your site" className="sm:col-span-2"><Input id="ad-url" value={f.url} invalid={!!e("url")} onChange={(x) => setF({ ...f, url: x.target.value })} placeholder="https://" /></Field>
          </div>
        </fieldset>
        {e("form") && <Banner tone="danger">{e("form")}</Banner>}
      </div>
    </Modal>
  );
}
