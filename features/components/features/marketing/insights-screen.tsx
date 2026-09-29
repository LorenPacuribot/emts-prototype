"use client";
/**
 * Patent §34 — marketing alerts, recommendations and search.
 * - Alerts: trendAlerts (inquiry spikes, ad leads that don't book, declining
 *   engagement, more reviews, seasonal opportunities, budgets) plus what needs
 *   attention now (unanswered messages, ads awaiting approval, automations
 *   due), each with the link it suggests. Trend alerts can be dismissed.
 * - Recommendations: recommendations() with the action each suggests, run
 *   after a confirmation that lists what it will change.
 * - Search: searchMarketing across leads, campaigns, posts, ads, promotions,
 *   landing pages, inbox messages, spend and links.
 */
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Bell, Lightbulb, Search, X } from "lucide-react";
import type { Database } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can, whoCan } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { now } from "@/features/lib/clock";
import { dateLong } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { AppLink } from "@/features/lib/navigation";
import {
  CHANNEL_LABEL, CHANNELS, dueAutomationTargets, recommendations, searchMarketing, SERVICE_LABEL, SERVICES, trendAlerts, type Recommendation, type SearchHit, type SearchQuery, type TrendAlert,
} from "@/features/lib/rules/marketing-growth";
import { applyRecommendation, dismissAlert } from "@/features/lib/store/actions/marketing-engage";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Button, Card, EmptyState, Field, Input, Select } from "@/features/components/ui";
import type { Tone } from "@/features/components/ui/badge";
import { MarketingFrame } from "./marketing-frame";
import { cents, GatedButton, SectionTitle, TAP, TAP_SCOPE, useConfirm } from "./growth-shared";

const SEVERITY: Record<TrendAlert["severity"], { label: string; tone: Tone }> = { critical: { label: "Critical", tone: "red" }, warning: { label: "Warning", tone: "amber" }, info: { label: "For your information", tone: "blue" } };
const HIT_LABEL: Record<SearchHit["kind"], string> = { lead: "Lead", campaign: "Campaign", promotion: "Promotion", expense: "Spend", submission: "Form submission", link: "Tracked link", post: "Post", ad: "Ad", landing_page: "Landing page", message: "Inbox message" };
const linkLabel = (href?: string) => (!href ? "Open" : href.startsWith("/leads") ? "Open leads" : href.includes("/campaigns") ? "Open campaign" : href.includes("/ads") ? "Open ad" : href.includes("/reviews") ? "Open reviews" : href.includes("/inbox") ? "Open inbox" : href.includes("/automations") ? "Open automations" : "Open report");

export function InsightsScreen() {
  return <MarketingFrame tab="insights"><Insights /></MarketingFrame>;
}

/** Things waiting on someone right now, from the inbox, ads and automations. */
function attention(db: Database): { key: string; title: string; detail: string; href: string }[] {
  const out: { key: string; title: string; detail: string; href: string }[] = [];
  const open = (db.socialMessages ?? []).filter((m) => m.status === "open");
  if (open.length) out.push({ key: "inbox", title: `${open.length} social message${open.length === 1 ? "" : "s"} waiting for a reply`, detail: `${((n) => `${n} ${n === 1 ? "is a quote request" : "are quote requests"}`)(open.filter((m) => m.intent === "quote_request").length)}. Oldest from ${dateLong(open.map((m) => m.at).sort()[0])}.`, href: "/marketing/inbox" });
  const ads = (db.socialAds ?? []).filter((a) => a.status === "pending_approval");
  if (ads.length) out.push({ key: "ads", title: `${ads.length} ad${ads.length === 1 ? "" : "s"} awaiting owner approval`, detail: ads.map((a) => a.name).join(", "), href: `/marketing/ads?id=${ads[0]!.id}` });
  const autos = (db.mktAutomations ?? []).map((a) => ({ a, n: dueAutomationTargets(db, a, now()).length })).filter((x) => x.n > 0);
  if (autos.length) out.push({ key: "autos", title: `${((n) => `${n} automated message${n === 1 ? "" : "s"} due today`)(autos.reduce((s, x) => s + x.n, 0))}`, detail: autos.map((x) => `${x.a.name} (${x.n})`).join(", "), href: "/marketing/automations" });
  return out;
}

function Insights() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const { setConfirm, dialog } = useConfirm();
  const alerts = useMemo(() => trendAlerts(db, now()), [db]);
  const now_ = useMemo(() => attention(db), [db]);
  const recs = useMemo(() => recommendations(db, now()), [db]);
  const done = (db.mktRecommendationLog ?? []).slice(0, 5);
  const canPost = can(user, "marketing.post");
  const canApprove = can(user, "marketing.approve");
  const postReason = `Needs ${whoCan("marketing.post")}.`;

  const dismiss = (a: TrendAlert) => { if (act(dismissAlert, a.key).ok) toast.success("Alert dismissed", `"${a.title}" won't show again.`); };
  const confirmRec = (r: Recommendation) => {
    const a = r.action;
    let lines: ReactNode[];
    let label = r.actionLabel;
    if (a.type === "create_campaign") lines = [`Creates a draft campaign "${a.name}" with a ${cents(a.budget)} budget${a.locations.length ? ` in ${a.locations.join(", ")}` : ""}.`, "Nothing is spent or sent: it stays a draft until you start it."];
    else if (a.type === "follow_up_lead") lines = [`Adds a task to follow up ${a.leadId}.`, "The lead itself doesn't change."];
    else if (a.type === "request_review") {
      const c = byId(db.customers, a.customerId);
      lines = [`Sends a review request to ${c?.name ?? a.customerId} by ${c?.email ? `email (${c.email})` : `SMS (${c?.phone ?? "no number"})`} for ${a.jobId}.`, "They can't be asked again for 90 days.", "Sandbox: recorded, not delivered. It can't be unsent."];
      label = "Send review request";
    } else if (a.type === "copy_campaign") lines = [`Copies ${byId(db.mktCampaigns ?? [], a.campaignId)?.name ?? a.campaignId} as a new draft starting today, with the same budget, services and areas.`, "Leads, posts and spend are not copied."];
    else lines = [`Changes the ${byId(db.socialAds ?? [], a.adId)?.budget.type ?? ""} budget of ${byId(db.socialAds ?? [], a.adId)?.name ?? a.adId} from ${cents(a.from)} to ${cents(a.to)}.`, "Sandbox: not sent to the platform. You can change it again later."];
    setConfirm({
      title: `${r.actionLabel}?`, label,
      body: <ul className="list-disc space-y-1 pl-5">{lines.map((l, i) => <li key={i}>{l}</li>)}<li>The recommendation is marked done and won&apos;t be suggested again.</li></ul>,
      run: () => {
        const x = act(applyRecommendation, r);
        if (x.ok) toast.success(r.title, `${(x.value as { result: string }).result}.`);
      },
    });
  };

  return (
    <>
      <PageHeader title="Alerts, Recommendations & Search" subtitle="What changed, what needs someone now, what to do next, and a search across every marketing record." />
      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-4">
          <SectionTitle>Alerts ({alerts.length + now_.length})</SectionTitle>
          {alerts.length + now_.length === 0 ? (
            <EmptyState className="border-0 p-4" icon={<Bell />} title="No alerts right now" body="Alerts appear when inquiries spike, ad leads don't book, engagement drops, reviews rise, a season is coming or a campaign nears its budget." action={<AppLink className={`inline-flex h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-gray-50 ${TAP}`} href="/marketing/campaigns">Open campaigns</AppLink>} />
          ) : (
            <ul className="divide-y divide-line">
              {now_.map((x) => (
                <li key={x.key} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone="purple">Needs attention</Badge><span className="font-semibold text-ink">{x.title}</span></div><p className="mt-1 text-xs text-gray-600">{x.detail}</p></div>
                  <AppLink href={x.href} className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-brand hover:bg-gray-100 ${TAP}`}>{linkLabel(x.href)} <ArrowRight className="h-3.5 w-3.5" /></AppLink>
                </li>
              ))}
              {alerts.map((a) => (
                <li key={a.key} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><Badge tone={SEVERITY[a.severity].tone} icon={a.severity !== "info" ? <AlertTriangle className="h-3 w-3" /> : undefined}>{SEVERITY[a.severity].label}</Badge><span className="font-semibold text-ink">{a.title}</span></div>
                    <p className="mt-1 text-xs text-gray-600">{a.detail}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {a.href && <AppLink href={a.href} className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-brand hover:bg-gray-100 ${TAP}`}>{linkLabel(a.href)} <ArrowRight className="h-3.5 w-3.5" /></AppLink>}
                    {canPost
                      ? <Button size="icon" variant="ghost" className={TAP} aria-label={`Dismiss alert: ${a.title}`} onClick={() => dismiss(a)}><X className="h-4 w-4" /></Button>
                      : <GatedButton allowed={false} reason={`Dismissing alerts ${postReason.toLowerCase()}`} size="icon" variant="ghost" aria-label={`Dismiss alert: ${a.title}`}><X className="h-4 w-4" /></GatedButton>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <SectionTitle>Recommendations ({recs.length})</SectionTitle>
          {recs.length === 0 ? (
            <EmptyState className="border-0 p-4" icon={<Lightbulb />} title="No recommendations right now" body="Recommendations come from your results: services and areas that convert, inactive leads, happy customers to ask for reviews, campaigns worth repeating, ad budgets and open crew days." action={<AppLink className={`inline-flex h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-gray-50 ${TAP}`} href="/marketing/reports">Open Monthly Report</AppLink>} />
          ) : (
            <ul className="divide-y divide-line">
              {recs.map((r) => {
                const owner = r.action.type === "adjust_ad_budget";
                return (
                  <li key={r.key} className="py-3">
                    <div className="font-semibold text-ink">{r.title}</div>
                    <p className="mt-1 text-xs text-gray-600">{r.detail}</p>
                    <div className="mt-2">
                      <GatedButton allowed={owner ? canApprove : canPost} reason={owner ? `Only the ${whoCan("marketing.approve")} changes ad budgets.` : postReason} size="sm" variant="primary" onClick={() => confirmRec(r)}>{r.actionLabel}</GatedButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {done.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-1 text-xs font-semibold text-gray-500">Done recently</div>
              <ul className="space-y-1 text-xs text-gray-600">{done.map((d) => <li key={d.id}>{dateLong(d.at)} · {byId(db.users, d.by)?.name ?? "—"}: {d.result}</li>)}</ul>
            </div>
          )}
        </Card>
      </div>
      <MarketingSearch />
      {dialog}
    </>
  );
}

const EMPTY_Q = { text: "", campaignId: "", platform: "", service: "", from: "", to: "" };

function MarketingSearch() {
  const db = useDb((d) => d);
  const [q, setQ] = useState(EMPTY_Q);
  const active = Object.values(q).some(Boolean);
  const query: SearchQuery = { text: q.text || undefined, campaignId: q.campaignId || undefined, platform: q.platform || undefined, service: q.service || undefined, from: q.from || undefined, to: q.to || undefined };
  const hits = useMemo(() => (active ? searchMarketing(db, now(), query) : []), [db, active, JSON.stringify(query)]);
  return (
    <Card className="mt-4 p-4">
      <SectionTitle>Search marketing</SectionTitle>
      <form role="search" className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-6 ${TAP_SCOPE}`} onSubmit={(e) => e.preventDefault()}>
        <Field label="Search" htmlFor="ms-text" className="sm:col-span-2"><Input id="ms-text" type="search" value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} placeholder="Name, code, campaign, post, ad…" /></Field>
        <Field label="Campaign" htmlFor="ms-cmp"><Select id="ms-cmp" value={q.campaignId} onChange={(e) => setQ({ ...q, campaignId: e.target.value })}><option value="">Any</option>{(db.mktCampaigns ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Channel" htmlFor="ms-plat"><Select id="ms-plat" value={q.platform} onChange={(e) => setQ({ ...q, platform: e.target.value })}><option value="">Any</option>{CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</Select></Field>
        <Field label="Service" htmlFor="ms-svc"><Select id="ms-svc" value={q.service} onChange={(e) => setQ({ ...q, service: e.target.value })}><option value="">Any</option>{SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABEL[s]}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="From" htmlFor="ms-from"><Input id="ms-from" type="date" value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} /></Field>
          <Field label="To" htmlFor="ms-to"><Input id="ms-to" type="date" value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} /></Field>
        </div>
      </form>
      <div className="mt-4" aria-live="polite">
        {!active ? (
          <p className="text-xs text-gray-500">Type a name, code or word, or choose a filter, to search leads, campaigns, posts, ads, promotions, landing pages, inbox messages, spend and tracked links.</p>
        ) : hits.length === 0 ? (
          <EmptyState className="border-0 p-4" icon={<Search />} title="Nothing matches" body="Try fewer words or clear the filters." action={<Button className={TAP} onClick={() => setQ(EMPTY_Q)}>Clear search</Button>} />
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between text-xs text-gray-500"><span>{hits.length} result{hits.length === 1 ? "" : "s"}</span><Button size="sm" variant="ghost" className={TAP} onClick={() => setQ(EMPTY_Q)}>Clear search</Button></div>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {hits.slice(0, 60).map((h) => (
                <li key={`${h.kind}-${h.id}`}>
                  <AppLink href={h.href} className="flex flex-wrap items-center gap-2 px-3 py-2.5 hover:bg-gray-50 max-sm:min-h-11">
                    <Badge tone="gray">{HIT_LABEL[h.kind]}</Badge>
                    <span className="min-w-0 flex-1"><span className="font-semibold text-ink">{h.label}</span><span className="block text-xs text-gray-500">{h.detail}</span></span>
                    {h.at && <span className="text-xs text-gray-500">{dateLong(h.at)}</span>}
                  </AppLink>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}
