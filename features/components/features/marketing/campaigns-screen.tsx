"use client";
/**
 * Patent §34 — Campaigns. The campaign is what leads, posts, spend, tracked
 * links, offers and email/SMS campaigns attach to, so its results (leads,
 * estimates, jobs won, revenue, spend, CAC, ROI) come from real records:
 * campaignResults() in lib/rules/marketing-growth.
 *
 * - List with status (words, not colour only), budget, spend, leads, jobs,
 *   revenue and ROI; filter by status.
 * - Create / edit (validateCampaignInput); status draft → active ⇄ paused →
 *   completed, each confirmed; completing can't be undone.
 * - Detail drawer: results, attached leads and posts (attach/remove), spend
 *   (log an expense), tracked links and QR codes, offers, messages.
 */
import { useMemo, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Link2, Pencil, Plus, QrCode, Target, Trash2, X } from "lucide-react";
import type { CampaignObjective, CampaignStatus, ExpenseCategory, MarketingCampaign, MarketingChannel, MarketingService } from "@/features/types/marketing-growth";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can, whoCan } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { now } from "@/features/lib/clock";
import { dateLong } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { absoluteUrl, AppLink, useParam } from "@/features/lib/navigation";
import {
  CAMPAIGN_STATUS_LABEL, campaignResults, CHANNEL_LABEL, CHANNELS, EXPENSE_LABEL, leadFacts, OBJECTIVE_LABEL, SERVICE_LABEL, SERVICES, shortUrl, trackedUrl,
} from "@/features/lib/rules/marketing-growth";
import {
  attachLeadToCampaign, CAMPAIGN_TRANSITIONS, campaignAttachments, createTrackLink, defaultUtm, deleteMarketingExpense, detachLeadFromCampaign, logMarketingExpense, saveCampaign,
  setCampaignPost, setCampaignStatus, setLinkActive,
} from "@/features/lib/store/actions/marketing-growth";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, Checkbox, ConfirmDialog, Drawer, EmptyState, Field, Input, Modal, PillTabs, Select, Stat, StatStrip, Table, TD, Textarea, TH, THead, TR } from "@/features/components/ui";
import { MarketingFrame } from "./marketing-frame";
import { PostStateBadge } from "./shared";
import { CampaignStatusBadge, cents, GatedButton, pct, SectionTitle, TAP, TAP_SCOPE } from "./growth-shared";

const today = () => now().slice(0, 10);
type Err = { field?: string; message: string };
type Confirm = { title: string; body: ReactNode; label: string; tone?: "danger" | "primary"; run: () => void };

export function CampaignsScreen() {
  return <MarketingFrame tab="campaigns"><Campaigns /></MarketingFrame>;
}

function Campaigns() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const initial = useParam("id");
  const [openId, setOpenId] = useState<string | undefined>(initial);
  const [filter, setFilter] = useState<CampaignStatus | "all">("all");
  const [editing, setEditing] = useState<MarketingCampaign | "new">();
  const campaigns = db.mktCampaigns ?? [];
  const rows = useMemo(() => campaigns.map((c) => ({ c, r: campaignResults(db, c.id, now()) })), [db, campaigns]);
  const shown = filter === "all" ? rows : rows.filter((x) => x.c.status === filter);
  const canEdit = can(user, "marketing.post");
  const reason = `Creating campaigns needs ${whoCan("marketing.post")}.`;
  const spend = rows.reduce((a, x) => a + x.r.spend, 0);
  const revenue = rows.reduce((a, x) => a + x.r.revenue, 0);
  const newButton = <GatedButton allowed={canEdit} reason={reason} variant="primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New campaign</GatedButton>;

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Each campaign with the leads, jobs, revenue and ROI it produced." details="Leads, posts, marketing spend and tracked links attach to a campaign, so each one shows the leads, estimates, jobs won, revenue, spend, CAC and ROI it produced."
        actions={campaigns.length > 0 && newButton}
      />
      {campaigns.length === 0 ? (
        <EmptyState icon={<Target />} title="No campaigns yet" body="Create a campaign first. Leads, posts, spend and tracked links all attach to one, and its results build from them." action={newButton} />
      ) : (
        <>
          <StatStrip className="mb-4">
            <Stat label="Active campaigns" value={campaigns.filter((c) => c.status === "active").length} hint={`${campaigns.length} in total`} />
            <Stat label="Marketing spend" value={cents(spend)} hint="Expenses and ad spend on campaigns" />
            <Stat label="Revenue from campaigns" value={cents(revenue)} hint="Signed contract value before tax" />
            <Stat label="Return on spend" value={pct(spend > 0 ? (revenue - spend) / spend : undefined)} hint="(revenue − spend) ÷ spend" tone={revenue >= spend ? "good" : "warn"} />
          </StatStrip>
          <div className="mb-4">
            <PillTabs
              value={filter}
              onChange={setFilter}
              options={[{ value: "all" as const, label: "All", count: campaigns.length }, ...(["active", "draft", "paused", "completed"] as CampaignStatus[]).map((s) => ({ value: s, label: CAMPAIGN_STATUS_LABEL[s], count: campaigns.filter((c) => c.status === s).length }))]}
            />
          </div>
          {shown.length === 0 ? (
            <EmptyState icon={<Target />} title={`No ${filter === "all" ? "" : CAMPAIGN_STATUS_LABEL[filter as CampaignStatus].toLowerCase()} campaigns`} body="Choose another status above to see the rest." action={<Button className={TAP} onClick={() => setFilter("all")}>Show all campaigns</Button>} />
          ) : (
            <Card className="p-0">
              <Table className="relative rounded-2xl border-0">
                <THead><tr><TH>Campaign</TH><TH>Status</TH><TH className="text-right">Budget</TH><TH className="text-right">Spend</TH><TH className="text-right">Leads</TH><TH className="text-right">Jobs won</TH><TH className="text-right">Revenue</TH><TH className="text-right">ROI</TH></tr></THead>
                <tbody>
                  {shown.map(({ c, r }) => (
                    <TR key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)}>
                      <TD className="min-w-56">
                        <button type="button" className={`text-left font-semibold text-brand hover:underline ${TAP}`} onClick={(e) => { e.stopPropagation(); setOpenId(c.id); }}>{c.name}</button>
                        <div className="text-xs text-gray-500">{c.id} · {OBJECTIVE_LABEL[c.objective]} · {dateLong(c.startDate)} – {c.endDate ? dateLong(c.endDate) : "open"}</div>
                      </TD>
                      <TD><CampaignStatusBadge status={c.status} /></TD>
                      <TD className="text-right tabular-nums">{cents(c.budget)}</TD>
                      <TD className="text-right tabular-nums">{cents(r.spend)}{c.budget > 0 && r.spend > c.budget && <div><Badge tone="red">Over budget</Badge></div>}</TD>
                      <TD className="text-right tabular-nums">{r.leads}</TD>
                      <TD className="text-right tabular-nums">{r.jobs}</TD>
                      <TD className="text-right tabular-nums">{cents(r.revenue)}</TD>
                      <TD className="text-right tabular-nums">{pct(r.roi)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </>
      )}
      {editing && <CampaignForm campaign={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} onSaved={(id) => { setEditing(undefined); setOpenId(id); }} />}
      {openId && byId(campaigns, openId) && <CampaignDrawer id={openId} onClose={() => setOpenId(undefined)} onEdit={(c) => setEditing(c)} />}
    </>
  );
}

/* ================================ Form ================================ */

function CampaignForm({ campaign, onClose, onSaved }: { campaign?: MarketingCampaign; onClose: () => void; onSaved: (id: string) => void }) {
  const db = useDb((d) => d);
  const [f, setF] = useState({
    name: campaign?.name ?? "", objective: campaign?.objective ?? ("leads" as CampaignObjective), budget: campaign ? String(campaign.budget) : "", startDate: campaign?.startDate ?? today(),
    endDate: campaign?.endDate ?? "", services: campaign?.services ?? ([] as MarketingService[]), channels: campaign?.channels ?? ([] as MarketingChannel[]),
    locations: campaign?.locations.join(", ") ?? "", segmentId: campaign?.segmentId ?? "", notes: campaign?.notes ?? "",
  });
  const [err, setErr] = useState<Err>();
  const e = (k: string) => (err?.field === k ? err.message : undefined);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const submit = () => {
    const r = act(saveCampaign, {
      id: campaign?.id, name: f.name, objective: f.objective, budget: f.budget === "" ? NaN : Number(f.budget), startDate: f.startDate, endDate: f.endDate || undefined,
      services: f.services, channels: f.channels, locations: f.locations.split(","), segmentId: f.segmentId || undefined, notes: f.notes,
    });
    if (!r.ok) return setErr({ field: r.field, message: r.error });
    toast.success(campaign ? `Campaign ${campaign.id} updated` : `Campaign ${r.value} created as a draft`, campaign ? undefined : "Attach leads, posts, spend and tracked links from its page, then set it active.");
    onSaved(r.value as string);
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="lg" title={campaign ? `Edit ${campaign.name}` : "New campaign"} description="Campaign name, objective, budget and dates. Services, channels and locations are used by reports and recommendations."
      footer={<><Button className={TAP} onClick={onClose}>Cancel</Button><Button className={TAP} variant="primary" onClick={submit}>{campaign ? "Save campaign" : "Create campaign"}</Button></>}>
      <div className={`space-y-3 ${TAP_SCOPE}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Campaign name" htmlFor="cmp-name" required error={e("name")}><Input id="cmp-name" value={f.name} invalid={!!e("name")} onChange={(x) => setF({ ...f, name: x.target.value })} placeholder="Spring exterior push" /></Field>
          <Field label="Objective" htmlFor="cmp-obj"><Select id="cmp-obj" value={f.objective} onChange={(x) => setF({ ...f, objective: x.target.value as CampaignObjective })}>{Object.entries(OBJECTIVE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Budget (USD)" htmlFor="cmp-budget" required error={e("budget")} hint="Total for the campaign, e.g. 1500.00"><Input id="cmp-budget" type="number" min={0} step={0.01} inputMode="decimal" value={f.budget} invalid={!!e("budget")} onChange={(x) => setF({ ...f, budget: x.target.value })} placeholder="0.00" /></Field>
          <Field label="Start date" htmlFor="cmp-start" required error={e("startDate")}><Input id="cmp-start" type="date" value={f.startDate} invalid={!!e("startDate")} onChange={(x) => setF({ ...f, startDate: x.target.value })} /></Field>
          <Field label="End date" htmlFor="cmp-end" hint="Optional" error={e("endDate")}><Input id="cmp-end" type="date" value={f.endDate} invalid={!!e("endDate")} onChange={(x) => setF({ ...f, endDate: x.target.value })} /></Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-gray-700">Services promoted</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">{SERVICES.map((s) => <Checkbox key={s} checked={f.services.includes(s)} onCheckedChange={() => setF({ ...f, services: toggle(f.services, s) })} label={SERVICE_LABEL[s]} />)}</div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-gray-700">Channels</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">{CHANNELS.map((ch) => <Checkbox key={ch} checked={f.channels.includes(ch)} onCheckedChange={() => setF({ ...f, channels: toggle(f.channels, ch) })} label={CHANNEL_LABEL[ch]} />)}</div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Towns or ZIP codes" htmlFor="cmp-loc" hint="Separate with commas"><Input id="cmp-loc" value={f.locations} onChange={(x) => setF({ ...f, locations: x.target.value })} placeholder="Dallas, Plano, 75214" /></Field>
          <Field label="Audience segment" htmlFor="cmp-seg" error={e("segmentId")}>
            <Select id="cmp-seg" value={f.segmentId} onChange={(x) => setF({ ...f, segmentId: x.target.value })}>
              <option value="">No segment</option>
              {(db.mktSegments ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Notes" htmlFor="cmp-notes"><Textarea id="cmp-notes" value={f.notes} onChange={(x) => setF({ ...f, notes: x.target.value })} /></Field>
        {err && !["name", "budget", "startDate", "endDate", "segmentId"].includes(err.field ?? "") && <Banner tone="danger">{err.message}</Banner>}
      </div>
    </Modal>
  );
}

/* ================================ Detail ================================ */

const NEXT_LABEL: Record<CampaignStatus, string> = { draft: "Set to draft", active: "Set active", paused: "Pause", completed: "Mark completed" };

function CampaignDrawer({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (c: MarketingCampaign) => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const c = byId(db.mktCampaigns ?? [], id)!;
  const r = useMemo(() => campaignResults(db, c.id, now()), [db, c.id]);
  const att = useMemo(() => campaignAttachments(db, c), [db, c]);
  const facts = useMemo(() => leadFacts(db, now()).filter((x) => x.campaignId === c.id), [db, c.id]);
  const [confirm, setConfirm] = useState<Confirm>();
  const [leadPick, setLeadPick] = useState("");
  const [postPick, setPostPick] = useState("");
  const [expense, setExpense] = useState(false);
  const [linkForm, setLinkForm] = useState(false);
  const [qrFor, setQrFor] = useState<string>();
  const canEdit = can(user, "marketing.post");
  const reason = `Needs ${whoCan("marketing.post")}.`;
  const done = c.status === "completed";
  const spentPct = c.budget > 0 ? r.spend / c.budget : undefined;
  const leadOptions = db.leads.filter((l) => !facts.some((x) => x.leadId === l.id));
  const postOptions = db.marketingPosts.filter((p) => !att.posts.some((x) => x.id === p.id) && p.state !== "cancelled");
  const custName = (customerId: string) => byId(db.customers, customerId)?.name ?? "—";

  const changeStatus = (to: CampaignStatus) => setConfirm({
    title: `${NEXT_LABEL[to]}: ${c.name}?`,
    tone: to === "completed" ? "danger" : "primary",
    label: NEXT_LABEL[to],
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Status changes from <b>{CAMPAIGN_STATUS_LABEL[c.status]}</b> to <b>{CAMPAIGN_STATUS_LABEL[to]}</b>.</li>
        {to === "completed" && <li>The end date is set to today if it is later. <b>This can&apos;t be undone:</b> a completed campaign can&apos;t be reopened or edited.</li>}
        {to === "paused" && <li>Its results stop growing only if you also pause its ads and links; leads still attach.</li>}
        {to === "active" && <li>It shows as running in reports and recommendations.</li>}
        <li>Nothing is sent to customers.</li>
      </ul>
    ),
    run: () => { if (act(setCampaignStatus, c.id, to).ok) toast.success(`${c.name} is now ${CAMPAIGN_STATUS_LABEL[to].toLowerCase()}`); },
  });

  const attachLead = () => {
    const lead = byId(db.leads, leadPick);
    if (!lead) return toast.error("Choose a lead first", "Pick the lead to attach from the list.");
    const current = leadFacts(db, now()).find((x) => x.leadId === lead.id)?.campaignId;
    const from = current ? byId(db.mktCampaigns ?? [], current)?.name : undefined;
    setConfirm({
      title: `Attach ${lead.id} to ${c.name}?`,
      label: "Attach lead",
      body: (
        <ul className="list-disc space-y-1 pl-5">
          <li>{lead.id} ({custName(lead.customerId)}) is credited to this campaign in results and reports.</li>
          {from && <li>It is removed from <b>{from}</b>.</li>}
          <li>Its estimate, job and revenue count toward this campaign&apos;s CAC and ROI.</li>
        </ul>
      ),
      run: () => { const x = act(attachLeadToCampaign, c.id, lead.id); if (x.ok) { toast.success(`${lead.id} attached to ${c.name}`); setLeadPick(""); } },
    });
  };

  const attachPost = () => {
    const post = byId(db.marketingPosts, postPick);
    if (!post) return toast.error("Choose a post first", "Pick the post to link from the list.");
    setConfirm({
      title: `Link ${post.id} to ${c.name}?`, label: "Link post",
      body: <p>The post &ldquo;{post.title}&rdquo; is tagged with this campaign, and its reach, engagement and clicks count in the results. The post itself isn&apos;t changed or republished.</p>,
      run: () => { if (act(setCampaignPost, c.id, post.id, true).ok) { toast.success(`${post.id} linked to ${c.name}`); setPostPick(""); } },
    });
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={c.name}
      subtitle={<div className="flex flex-wrap items-center gap-2"><CampaignStatusBadge status={c.status} /><span>{c.id} · {OBJECTIVE_LABEL[c.objective]} · {dateLong(c.startDate)} – {c.endDate ? dateLong(c.endDate) : "open"}</span></div>}
      footer={<Button className={TAP} onClick={onClose}>Close</Button>}
    >
      <div className="flex flex-wrap gap-2">
        {!done && <GatedButton allowed={canEdit} reason={reason} size="sm" onClick={() => onEdit(c)}><Pencil className="h-3.5 w-3.5" /> Edit campaign</GatedButton>}
        {CAMPAIGN_TRANSITIONS[c.status].map((to) => (
          <GatedButton key={to} allowed={canEdit} reason={reason} size="sm" variant={to === "active" ? "primary" : to === "completed" ? "danger" : "secondary"} onClick={() => changeStatus(to)}>{NEXT_LABEL[to]}</GatedButton>
        ))}
        {done && <p className="text-xs text-gray-500">Completed campaigns are read-only. Leads can still be credited to it.</p>}
      </div>

      <section>
        <SectionTitle>Results</SectionTitle>
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-line p-3 sm:grid-cols-4">
          <Stat label="Leads" value={r.leads} hint={r.costPerLead !== undefined ? `${cents(r.costPerLead)} per lead` : undefined} />
          <Stat label="Estimates" value={r.estimates} />
          <Stat label="Jobs won" value={r.jobs} hint={`${r.newCustomers} new customer${r.newCustomers === 1 ? "" : "s"}`} />
          <Stat label="Revenue" value={cents(r.revenue)} hint="Signed, before tax" />
          <Stat label="Spend" value={cents(r.spend)} hint={`${cents(r.expenseSpend)} expenses · ${cents(r.adSpend)} ads`} tone={c.budget > 0 && r.spend > c.budget ? "danger" : "default"} />
          <Stat label="CAC" value={r.cac !== undefined ? cents(r.cac) : "—"} hint="Spend ÷ new customers" />
          <Stat label="ROI" value={pct(r.roi)} hint="(Revenue − spend) ÷ spend" tone={r.roi !== undefined && r.roi < 0 ? "danger" : "default"} />
          <Stat label="Clicks" value={r.clicks} hint={`${r.inquiries} inquiries`} />
        </div>
        <p className="mt-2 text-xs text-gray-600">
          Budget {cents(c.budget)} · spent {cents(r.spend)}{spentPct !== undefined && ` (${pct(spentPct)})`}
          {c.budget > 0 && r.spend > c.budget && <Badge tone="red" className="ml-2">Over budget by {cents(r.spend - c.budget)}</Badge>}
        </p>
        {r.sandboxMetrics && <p className="mt-1 text-xs text-gray-500">Reach and engagement include sandbox connector numbers.</p>}
      </section>

      <section>
        <SectionTitle>Leads ({facts.length})</SectionTitle>
        {facts.length === 0 ? <p className="mb-2 text-xs text-gray-500">No leads yet. Attach one below, or share a tracked link so new leads arrive already credited.</p> : (
          <div className="mb-2 divide-y divide-line rounded-xl border border-line">
            {facts.map((x) => (
              <div key={x.leadId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <AppLink href={`/leads/${x.leadId}`} className="font-semibold text-brand hover:underline">{x.leadId}</AppLink> <span className="text-ink">{x.customerName}</span>
                  <div className="text-xs text-gray-500">{x.source} · {dateLong(x.at)}</div>
                </div>
                {x.job ? <Badge tone="green">Job won · {cents(x.revenue)}</Badge> : x.estimate ? <Badge tone="blue">Estimate</Badge> : <Badge tone="gray">Lead</Badge>}
                {att.manual.has(x.leadId) && canEdit && (
                  <Button size="icon" variant="ghost" className={TAP} aria-label={`Remove ${x.leadId} from this campaign`} onClick={() => setConfirm({
                    title: `Remove ${x.leadId} from ${c.name}?`, label: "Remove lead", tone: "danger",
                    body: <p>{x.leadId} ({x.customerName}) stops counting toward this campaign&apos;s results. The lead itself isn&apos;t changed.</p>,
                    run: () => { if (act(detachLeadFromCampaign, c.id, x.leadId).ok) toast.success(`${x.leadId} removed from ${c.name}`); },
                  })}><X className="h-4 w-4" /></Button>
                )}
              </div>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Attach a lead" htmlFor={`lead-${c.id}`} className="min-w-0 flex-1">
              <Select id={`lead-${c.id}`} className={TAP} value={leadPick} onChange={(x) => setLeadPick(x.target.value)}>
                <option value="">Choose a lead…</option>
                {leadOptions.map((l) => <option key={l.id} value={l.id}>{l.id} · {custName(l.customerId)}</option>)}
              </Select>
            </Field>
            <Button className={TAP} onClick={attachLead}><Plus className="h-4 w-4" /> Attach lead</Button>
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Posts and ads ({att.posts.length + att.ads.length})</SectionTitle>
        {att.posts.length + att.ads.length === 0 && <p className="mb-2 text-xs text-gray-500">No posts linked yet. Link a post so its reach and clicks count here.</p>}
        {att.posts.length > 0 && (
          <div className="mb-2 divide-y divide-line rounded-xl border border-line">
            {att.posts.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                <div className="min-w-0 flex-1"><AppLink href={`/marketing/compose?id=${p.id}`} className="font-semibold text-brand hover:underline">{p.id}</AppLink> <span className="text-ink">{p.title}</span></div>
                <PostStateBadge state={p.state} />
                {canEdit && <Button size="icon" variant="ghost" className={TAP} aria-label={`Unlink ${p.id} from this campaign`} onClick={() => { if (act(setCampaignPost, c.id, p.id, false).ok) toast.success(`${p.id} unlinked from ${c.name}`); }}><X className="h-4 w-4" /></Button>}
              </div>
            ))}
          </div>
        )}
        {att.ads.map((a) => <div key={a.id} className="mb-1 text-xs"><Badge tone="indigo">Ad</Badge> {a.name} · {a.status}{a.performance && ` · ${cents(a.performance.spend)} spent`}</div>)}
        {canEdit && postOptions.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Link a post" htmlFor={`post-${c.id}`} className="min-w-0 flex-1">
              <Select id={`post-${c.id}`} className={TAP} value={postPick} onChange={(x) => setPostPick(x.target.value)}>
                <option value="">Choose a post…</option>
                {postOptions.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.title}</option>)}
              </Select>
            </Field>
            <Button className={TAP} onClick={attachPost}><Link2 className="h-4 w-4" /> Link post</Button>
          </div>
        )}
      </section>

      <section>
        <SectionTitle right={<GatedButton allowed={canEdit} reason={reason} size="sm" onClick={() => setExpense(true)}><Plus className="h-3.5 w-3.5" /> Log expense</GatedButton>}>Spend ({att.expenses.length})</SectionTitle>
        {att.expenses.length === 0 ? <p className="text-xs text-gray-500">No spend logged. Log printing, ads, photography and other costs so CAC and ROI are right.</p> : (
          <Table className="relative">
            <THead><tr><TH>Date</TH><TH>Expense</TH><TH className="text-right">Amount</TH>{canEdit && <TH><span className="sr-only">Actions</span></TH>}</tr></THead>
            <tbody>
              {att.expenses.map((x) => (
                <TR key={x.id}>
                  <TD className="whitespace-nowrap">{dateLong(x.date)}</TD>
                  <TD className="min-w-48"><div className="font-semibold text-ink">{x.vendor}</div><div className="text-xs text-gray-500">{EXPENSE_LABEL[x.category]} · {x.description}{x.platform && ` · ${CHANNEL_LABEL[x.platform]}`}</div></TD>
                  <TD className="text-right tabular-nums">{cents(x.amount)}</TD>
                  {canEdit && (
                    <TD className="text-right">
                      <Button size="icon" variant="ghost" className={TAP} aria-label={`Delete expense ${x.id}`} onClick={() => setConfirm({
                        title: `Delete ${x.vendor} ${cents(x.amount)}?`, label: "Delete expense", tone: "danger",
                        body: <p>The expense is removed and this campaign&apos;s spend, CAC and ROI are recalculated. <b>This can&apos;t be undone.</b></p>,
                        run: () => { if (act(deleteMarketingExpense, x.id).ok) toast.success(`Expense ${x.id} deleted`, `${cents(x.amount)} removed from ${c.name}.`); },
                      })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </TD>
                  )}
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section>
        <SectionTitle right={<GatedButton allowed={canEdit} reason={reason} size="sm" onClick={() => setLinkForm(true)}><Plus className="h-3.5 w-3.5" /> Create tracked link or QR</GatedButton>}>Tracked links and QR codes ({att.links.length})</SectionTitle>
        {att.links.length === 0 ? <p className="text-xs text-gray-500">No tracked links yet. Create one for each place you share the campaign (a post, a flyer, a yard sign) to see which brings clicks and leads.</p> : (
          <div className="space-y-2">
            {att.links.map((l) => {
              const short = shortUrl(absoluteUrl(""), l.code);
              const full = trackedUrl(l.target, l.utm, absoluteUrl("") || undefined);
              const qr = l.clicks.filter((k) => k.via === "qr").length;
              return (
                <div key={l.id} className="rounded-xl border border-line p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-ink">{l.name} {l.kind === "qr" && <Badge tone="gray" icon={<QrCode className="h-3 w-3" />}>QR code</Badge>} {!l.active && <Badge tone="red">Turned off</Badge>}</div>
                      <div className="break-all text-gray-600">{short}</div>
                      <div className="break-all text-xs text-gray-500">Opens {full}</div>
                    </div>
                    <div className="text-right tabular-nums"><div className="font-display text-lg font-bold text-ink">{l.clicks.length}</div><div className="text-xs text-gray-500">clicks{qr ? ` (${qr} by QR)` : ""}</div></div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" className={TAP} onClick={() => { void navigator.clipboard?.writeText(l.kind === "qr" ? shortUrl(absoluteUrl(""), l.code, "qr") : short).then(() => toast.success("Link copied", short), () => toast.error("Couldn't copy", "Select the link and copy it by hand.")); }}><Copy className="h-3.5 w-3.5" /> Copy link</Button>
                    <Button size="sm" className={TAP} aria-expanded={qrFor === l.id} onClick={() => setQrFor(qrFor === l.id ? undefined : l.id)}><QrCode className="h-3.5 w-3.5" /> {qrFor === l.id ? "Hide QR" : "Show QR"}</Button>
                    {canEdit && <Button size="sm" variant="ghost" className={TAP} onClick={() => setConfirm({
                      title: `${l.active ? "Turn off" : "Turn on"} /r/${l.code}?`, label: l.active ? "Turn off link" : "Turn on link", tone: l.active ? "danger" : "primary",
                      body: <p>{l.active ? "People who open the link or scan the QR code will be told it has been turned off, including printed copies already handed out." : "The link and QR code start working again and count clicks."}</p>,
                      run: () => { if (act(setLinkActive, l.id, !l.active).ok) toast.success(`/r/${l.code} turned ${l.active ? "off" : "on"}`); },
                    })}>{l.active ? "Turn off" : "Turn on"}</Button>}
                  </div>
                  {qrFor === l.id && (
                    <div className="mt-3 inline-block rounded-xl border border-line bg-white p-3">
                      <QRCodeSVG value={shortUrl(absoluteUrl("") || "http://localhost", l.code, "qr")} size={148} level="M" title={`QR code for ${l.name}`} />
                      <div className="mt-1 text-center text-xs text-gray-500">Scans count as QR clicks</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {(att.offers.length > 0 || att.messages.length > 0) && (
        <section>
          <SectionTitle>Offers and messages</SectionTitle>
          <div className="space-y-1 text-xs">
            {att.offers.map((p) => <div key={p.id}><Badge tone="purple">Offer</Badge> <AppLink href="/marketing/promotions" className="font-semibold text-brand hover:underline">{p.code}</AppLink> {p.name} · {p.redemptions.length} redeemed{!p.active && " · paused"}</div>)}
            {att.messages.map((m) => <div key={m.id}><Badge tone="blue">{m.channel === "email" ? "Email" : "SMS"}</Badge> <AppLink href={`/marketing/messages?id=${m.id}`} className="font-semibold text-brand hover:underline">{m.name}</AppLink> · {m.status === "sent" ? `sent ${dateLong(m.sentAt)}` : "draft"}</div>)}
          </div>
        </section>
      )}

      {(c.budgetHistory?.length ?? 0) > 0 && (
        <section>
          <SectionTitle>Budget changes</SectionTitle>
          <ul className="space-y-1 text-xs text-gray-600">{c.budgetHistory!.map((h, i) => <li key={i}>{dateLong(h.at)} · {cents(h.from)} → {cents(h.to)} · {h.reason}</li>)}</ul>
        </section>
      )}

      {expense && <ExpenseForm campaignId={c.id} onClose={() => setExpense(false)} />}
      {linkForm && <LinkForm campaignId={c.id} onClose={() => setLinkForm(false)} />}
      <ConfirmDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(undefined)} title={confirm?.title ?? ""} body={confirm?.body} confirmLabel={confirm?.label} tone={confirm?.tone ?? "primary"} onConfirm={() => { confirm?.run(); setConfirm(undefined); }} />
    </Drawer>
  );
}

/* =============================== Expense form =============================== */

export function ExpenseForm({ campaignId, onClose }: { campaignId?: string; onClose: () => void }) {
  const db = useDb((d) => d);
  const [f, setF] = useState({ date: today(), category: "ads" as ExpenseCategory, vendor: "", description: "", amount: "", campaignId: campaignId ?? "", platform: "" as MarketingChannel | "" });
  const [err, setErr] = useState<Err>();
  const e = (k: string) => (err?.field === k ? err.message : undefined);
  const submit = () => {
    const r = act(logMarketingExpense, { date: f.date, category: f.category, vendor: f.vendor, description: f.description, amount: f.amount === "" ? NaN : Number(f.amount), campaignId: f.campaignId || undefined, platform: f.platform || undefined });
    if (!r.ok) return setErr({ field: r.field, message: r.error });
    const v = r.value as { id: string; spent: number; overBudget: boolean };
    const camp = byId(db.mktCampaigns ?? [], f.campaignId);
    toast.success(`Expense ${v.id} logged: ${cents(Number(f.amount))}`, camp ? `${camp.name} has now spent ${cents(v.spent)} of ${cents(camp.budget)}${v.overBudget ? " — over budget" : ""}.` : undefined);
    onClose();
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title="Log marketing expense" description="Recorded against the campaign so spend, CAC and ROI are right. Nothing is paid from here."
      footer={<><Button className={TAP} onClick={onClose}>Cancel</Button><Button className={TAP} variant="primary" onClick={submit}>Log expense</Button></>}>
      <div className={`space-y-3 ${TAP_SCOPE}`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date" htmlFor="mex-date" required error={e("date")}><Input id="mex-date" type="date" value={f.date} invalid={!!e("date")} onChange={(x) => setF({ ...f, date: x.target.value })} /></Field>
          <Field label="Amount (USD)" htmlFor="mex-amt" required error={e("amount")}><Input id="mex-amt" type="number" min={0} step={0.01} inputMode="decimal" value={f.amount} invalid={!!e("amount")} onChange={(x) => setF({ ...f, amount: x.target.value })} placeholder="0.00" /></Field>
          <Field label="Category" htmlFor="mex-cat"><Select id="mex-cat" value={f.category} onChange={(x) => setF({ ...f, category: x.target.value as ExpenseCategory })}>{Object.entries(EXPENSE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
        <Field label="Vendor" htmlFor="mex-vendor" required error={e("vendor")}><Input id="mex-vendor" value={f.vendor} invalid={!!e("vendor")} onChange={(x) => setF({ ...f, vendor: x.target.value })} placeholder="Lone Star Print Co." /></Field>
        <Field label="What it was for" htmlFor="mex-desc" required error={e("description")}><Input id="mex-desc" value={f.description} invalid={!!e("description")} onChange={(x) => setF({ ...f, description: x.target.value })} placeholder="500 door hangers" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Campaign" htmlFor="mex-cmp" error={e("campaignId")}>
            <Select id="mex-cmp" value={f.campaignId} onChange={(x) => setF({ ...f, campaignId: x.target.value })}>
              <option value="">No campaign (general marketing)</option>
              {(db.mktCampaigns ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Platform or channel" htmlFor="mex-plat">
            <Select id="mex-plat" value={f.platform} onChange={(x) => setF({ ...f, platform: x.target.value as MarketingChannel | "" })}>
              <option value="">Not specific</option>
              {CHANNELS.map((ch) => <option key={ch} value={ch}>{CHANNEL_LABEL[ch]}</option>)}
            </Select>
          </Field>
        </div>
        {err && !["date", "amount", "vendor", "description", "campaignId"].includes(err.field ?? "") && <Banner tone="danger">{err.message}</Banner>}
      </div>
    </Modal>
  );
}

/* ================================ Link form ================================ */

function LinkForm({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const db = useDb((d) => d);
  const [f, setF] = useState({ name: "", target: "/website-form", kind: "link" as "link" | "qr", platform: "" as MarketingChannel | "", code: "", promotionId: "", content: "" });
  const [err, setErr] = useState<Err>();
  const e = (k: string) => (err?.field === k ? err.message : undefined);
  const utm = defaultUtm(db, { kind: f.kind, platform: f.platform || undefined, campaignId });
  const preview = trackedUrl(f.target || "/", { ...utm, content: f.content || undefined }, absoluteUrl("") || undefined);
  const submit = () => {
    const r = act(createTrackLink, { name: f.name, target: f.target, kind: f.kind, platform: f.platform || undefined, code: f.code, campaignId, promotionId: f.promotionId || undefined, utm: { content: f.content } });
    if (!r.ok) return setErr({ field: r.field, message: r.error });
    const v = r.value as { code: string };
    toast.success(`${f.kind === "qr" ? "QR code" : "Tracked link"} /r/${v.code} created`, "Copy it or show the QR code from the campaign's links list.");
    onClose();
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title="Create tracked link or QR code" description="A short link that records each click, then opens the page with UTM tags so leads arrive credited to this campaign."
      footer={<><Button className={TAP} onClick={onClose}>Cancel</Button><Button className={TAP} variant="primary" onClick={submit}>Create {f.kind === "qr" ? "QR code" : "link"}</Button></>}>
      <div className={`space-y-3 ${TAP_SCOPE}`}>
        <PillTabs value={f.kind} onChange={(k) => setF({ ...f, kind: k })} options={[{ value: "link", label: "Link" }, { value: "qr", label: "QR code (print)" }]} />
        <Field label="Where it will be used" htmlFor="lnk-name" required error={e("name")}><Input id="lnk-name" value={f.name} invalid={!!e("name")} onChange={(x) => setF({ ...f, name: x.target.value })} placeholder={f.kind === "qr" ? "Yard sign — Lakewood" : "Facebook post, week 2"} /></Field>
        <Field label="Page it opens" htmlFor="lnk-target" required error={e("target")} hint="An app page such as /website-form, or a full https:// address"><Input id="lnk-target" value={f.target} invalid={!!e("target")} onChange={(x) => setF({ ...f, target: x.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Platform or channel" htmlFor="lnk-plat">
            <Select id="lnk-plat" value={f.platform} onChange={(x) => setF({ ...f, platform: x.target.value as MarketingChannel | "" })}>
              <option value="">Not specific</option>
              {CHANNELS.map((ch) => <option key={ch} value={ch}>{CHANNEL_LABEL[ch]}</option>)}
            </Select>
          </Field>
          <Field label="Offer" htmlFor="lnk-offer">
            <Select id="lnk-offer" value={f.promotionId} onChange={(x) => setF({ ...f, promotionId: x.target.value })}>
              <option value="">No offer</option>
              {(db.mktPromotions ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </Select>
          </Field>
          <Field label="Short code" htmlFor="lnk-code" hint="Optional; made for you if blank" error={e("code")}><Input id="lnk-code" value={f.code} invalid={!!e("code")} onChange={(x) => setF({ ...f, code: x.target.value.toUpperCase() })} placeholder="FALL-SIGN" /></Field>
          <Field label="Content tag (utm_content)" htmlFor="lnk-content" hint="Optional, e.g. which ad or flyer"><Input id="lnk-content" value={f.content} onChange={(x) => setF({ ...f, content: x.target.value })} /></Field>
        </div>
        <div className="rounded-lg border border-line bg-gray-50 p-3 text-xs">
          <div className="font-semibold text-gray-700">Opens</div>
          <div className="break-all text-gray-600">{preview}</div>
        </div>
        {err && !["name", "target", "code"].includes(err.field ?? "") && <Banner tone="danger">{err.message}</Banner>}
      </div>
    </Modal>
  );
}
