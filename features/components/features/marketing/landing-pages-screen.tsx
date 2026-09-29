"use client";
/**
 * Patent §34 — Landing pages and forms. Build a page (title, headline, body,
 * form fields from defaultFields(kind), linked campaign and promotion, address
 * checked by validateLandingPage), publish or unpublish it after a
 * confirmation, and see the submissions and leads it produced. The public page
 * is /lp/{slug} (app/lp/[slug]/page.tsx).
 */
import { useMemo, useState } from "react";
import { Copy, ExternalLink, LayoutTemplate, Pencil, Plus } from "lucide-react";
import type { FormField, FormKind, LandingPage, MarketingService } from "@/features/types/marketing-growth";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can, whoCan } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { dateLong, dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { absoluteUrl, AppLink, useParam } from "@/features/lib/navigation";
import { defaultFields, SERVICE_LABEL, SERVICES, slugify } from "@/features/lib/rules/marketing-growth";
import { saveLandingPage, setLandingPagePublished } from "@/features/lib/store/actions/marketing-engage";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PillTabs, Select, Stat, StatStrip, Table, TD, Textarea, TH, THead, TR } from "@/features/components/ui";
import { MarketingFrame } from "./marketing-frame";
import { errFor, GatedButton, pct, SectionTitle, TAP, TAP_SCOPE, useConfirm, type FieldErr } from "./growth-shared";

const KIND_LABEL: Record<FormKind, string> = { contact: "Contact form", quote: "Quote request", booking: "Booking request" };
const STATUS: Record<LandingPage["status"], { label: string; tone: "green" | "gray" | "amber" }> = { published: { label: "Live", tone: "green" }, draft: { label: "Draft — not public", tone: "gray" }, archived: { label: "Archived", tone: "amber" } };

export function LandingPagesScreen() {
  return <MarketingFrame tab="landing-pages"><LandingPages /></MarketingFrame>;
}

function LandingPages() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const initial = useParam("id");
  const [editing, setEditing] = useState<LandingPage | "new" | undefined>(() => (initial ? byId(db.mktLandingPages ?? [], initial) : undefined));
  const { setConfirm, dialog } = useConfirm();
  const pages = db.mktLandingPages ?? [];
  const subs = db.mktSubmissions ?? [];
  const canEdit = can(user, "marketing.post");
  const reason = `Needs ${whoCan("marketing.post")}.`;
  const newButton = <GatedButton allowed={canEdit} reason={reason} variant="primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New landing page</GatedButton>;
  const totalViews = pages.reduce((a, p) => a + p.views, 0);

  const togglePublish = (p: LandingPage) => {
    const publish = p.status !== "published";
    const camp = byId(db.mktCampaigns ?? [], p.campaignId);
    const promo = byId(db.mktPromotions ?? [], p.promotionId);
    setConfirm({
      title: publish ? `Publish /lp/${p.slug}?` : `Unpublish /lp/${p.slug}?`, label: publish ? "Publish page" : "Unpublish page", tone: publish ? "primary" : "danger",
      body: publish ? (
        <ul className="list-disc space-y-1 pl-5">
          <li>Anyone with the link can open {absoluteUrl(`/lp/${p.slug}`)} and send the {KIND_LABEL[p.form.kind].toLowerCase()}.</li>
          <li>Each submission creates a lead (or matches an existing one) attributed to this page{camp ? ` and the campaign ${camp.name}` : ""}{p.form.kind === "booking" ? ", with a booking request" : ""}.</li>
          {promo && <li>The page shows the offer {promo.code}; quoted codes are recorded as redemptions.</li>}
          <li>You can unpublish it again at any time.</li>
        </ul>
      ) : (
        <ul className="list-disc space-y-1 pl-5">
          <li>Visitors, links and QR codes pointing at /lp/{p.slug} will see &ldquo;This page isn&apos;t available&rdquo;.</li>
          <li>The {subs.filter((s) => s.landingPageId === p.id).length} submissions and leads already received stay.</li>
          <li>You can publish it again later.</li>
        </ul>
      ),
      run: () => { if (act(setLandingPagePublished, p.id, publish).ok) toast.success(publish ? `/lp/${p.slug} is live` : `/lp/${p.slug} unpublished`, publish ? "Share the link or put it on a tracked link or QR code." : "The page is a draft again."); },
    });
  };
  const copy = (p: LandingPage) => {
    const url = absoluteUrl(`/lp/${p.slug}`);
    void navigator.clipboard?.writeText(url).then(() => toast.success("Link copied", url), () => toast.info("Copy this link", url));
  };

  return (
    <>
      <PageHeader title="Landing Pages & Forms" subtitle="Campaign pages with a contact, quote or booking form. Each submission becomes a lead attributed to the page and its campaign, with the promo or referral code it quoted." actions={pages.length > 0 && newButton} />
      {pages.length === 0 ? (
        <EmptyState icon={<LayoutTemplate />} title="No landing pages yet" body="Create a page for a campaign or offer. Its form turns visitors into leads that are credited to the campaign." action={newButton} />
      ) : (
        <>
          <StatStrip className="mb-4">
            <Stat label="Live pages" value={pages.filter((p) => p.status === "published").length} hint={`${pages.length} in total`} />
            <Stat label="Page views" value={totalViews} />
            <Stat label="Form submissions" value={subs.filter((s) => s.landingPageId).length} />
            <Stat label="Visit → submission" value={pct(totalViews ? subs.filter((s) => s.landingPageId).length / totalViews : undefined)} />
          </StatStrip>
          <Card className="mb-4 p-0">
            <div className="overflow-x-auto">
              <Table className="relative rounded-2xl border-0">
                <THead><tr><TH>Page</TH><TH>Campaign</TH><TH>Form</TH><TH>Status</TH><TH className="text-right">Views</TH><TH className="text-right">Submissions</TH><TH><span className="sr-only">Actions</span></TH></tr></THead>
                <tbody>
                  {pages.map((p) => {
                    const n = subs.filter((s) => s.landingPageId === p.id).length;
                    return (
                      <TR key={p.id}>
                        <TD className="min-w-52"><div className="font-semibold text-ink">{p.title}</div><div className="font-mono text-[11.5px] text-slate-500">/lp/{p.slug}</div></TD>
                        <TD className="min-w-36">{byId(db.mktCampaigns ?? [], p.campaignId)?.name ?? "—"}{p.promotionId && <div className="text-[11.5px] text-slate-500">Offer {byId(db.mktPromotions ?? [], p.promotionId)?.code}</div>}</TD>
                        <TD className="whitespace-nowrap">{KIND_LABEL[p.form.kind]} · {p.form.fields.length} fields</TD>
                        <TD><Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>{p.publishedAt && p.status === "published" && <div className="text-[11px] text-slate-500">since {dateLong(p.publishedAt)}</div>}</TD>
                        <TD className="text-right tabular-nums">{p.views}</TD>
                        <TD className="text-right tabular-nums">{n}{p.views > 0 && <div className="text-[11px] text-slate-500">{pct(n / p.views)}</div>}</TD>
                        <TD className="whitespace-nowrap text-right">
                          <GatedButton allowed={canEdit} reason={reason} size="sm" variant="ghost" onClick={() => setEditing(p)}><Pencil className="h-3.5 w-3.5" /> Edit</GatedButton>
                          <GatedButton allowed={canEdit} reason={reason} size="sm" variant={p.status === "published" ? "ghost" : "primary"} onClick={() => togglePublish(p)}>{p.status === "published" ? "Unpublish" : "Publish"}</GatedButton>
                          {p.status === "published" && (
                            <>
                              <Button size="icon" variant="ghost" className={TAP} aria-label={`Copy link to /lp/${p.slug}`} onClick={() => copy(p)}><Copy className="h-4 w-4" /></Button>
                              <a href={`/lp/${p.slug}`} target="_blank" rel="noreferrer" aria-label={`Open /lp/${p.slug} in a new tab`} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 ${TAP}`}><ExternalLink className="h-4 w-4" /></a>
                            </>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </Card>
          <Card className="p-4">
            <SectionTitle>Recent submissions</SectionTitle>
            {subs.filter((s) => s.landingPageId).length === 0 ? <p className="text-[12.5px] text-slate-500">None yet. Submissions from a live page show here with the lead they created.</p> : (
              <div className="overflow-x-auto">
                <Table className="relative">
                  <THead><tr><TH>When</TH><TH>Page</TH><TH>Name</TH><TH>Result</TH><TH>Code</TH></tr></THead>
                  <tbody>
                    {subs.filter((s) => s.landingPageId).slice(0, 20).map((s) => {
                      const page = byId(pages, s.landingPageId);
                      const name = page?.form.fields.find((f) => f.maps === "name");
                      return (
                        <TR key={s.id}>
                          <TD className="whitespace-nowrap">{dateTime(s.at)}</TD>
                          <TD className="font-mono text-[12px]">/lp/{page?.slug ?? "—"}</TD>
                          <TD>{name ? s.values[name.key] : "—"}</TD>
                          <TD className="min-w-44">
                            <Badge tone={s.outcome === "new" ? "green" : "blue"}>{s.outcome === "new" ? "New lead" : "Matched existing lead"}</Badge>{" "}
                            <AppLink className="text-[12px] underline" href={`/leads/${s.leadId}`}>{s.leadId}</AppLink>
                            {s.appointmentRequestId && <div className="text-[11px] text-slate-500">Booking request {s.appointmentRequestId}</div>}
                          </TD>
                          <TD className="font-mono text-[12px]">{s.attribution.promoCode ?? "—"}</TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            )}
          </Card>
        </>
      )}
      {editing && <PageForm page={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} />}
      {dialog}
    </>
  );
}

type FieldRow = FormField & { include: boolean };
const rowsFor = (kind: FormKind, existing?: FormField[]): FieldRow[] =>
  defaultFields(kind).map((d) => {
    const cur = existing?.find((f) => f.key === d.key);
    return cur ? { ...d, ...cur, include: true } : { ...d, include: !existing };
  });

function PageForm({ page, onClose }: { page?: LandingPage; onClose: () => void }) {
  const db = useDb((d) => d);
  const [f, setF] = useState({
    title: page?.title ?? "", slug: page?.slug ?? "", slugEdited: !!page, headline: page?.headline ?? "", body: page?.body ?? "", service: page?.service ?? ("" as MarketingService | ""),
    location: page?.location ?? "", campaignId: page?.campaignId ?? "", promotionId: page?.promotionId ?? "", kind: page?.form.kind ?? ("quote" as FormKind),
    submitLabel: page?.form.submitLabel ?? "Get my free estimate", successMessage: page?.form.successMessage ?? "Thanks! We'll call you within one business day.",
  });
  const [rows, setRows] = useState<FieldRow[]>(() => rowsFor(page?.form.kind ?? "quote", page?.form.fields));
  const [err, setErr] = useState<FieldErr>();
  const e = (k: string) => errFor(err, k);
  const live = page?.status === "published";
  const promo = byId(db.mktPromotions ?? [], f.promotionId);
  const fields = useMemo(() => rows.filter((r) => r.include).map(({ include: _i, ...x }) => x), [rows]);
  const setRow = (key: string, patch: Partial<FieldRow>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const submit = () => {
    const r = act(saveLandingPage, {
      id: page?.id, title: f.title, slug: f.slug, headline: f.headline, body: f.body, service: f.service || undefined, location: f.location, campaignId: f.campaignId || undefined, promotionId: f.promotionId || undefined,
      formKind: f.kind, fields, submitLabel: f.submitLabel, successMessage: f.successMessage,
    });
    if (!r.ok) return setErr({ field: r.field, message: r.error });
    toast.success(page ? `${f.title.trim()} saved` : `Draft page ${f.title.trim()} created`, live ? "Changes are live now." : "Publish it when you're ready for customers to see it.");
    onClose();
  };
  const known = ["title", "slug", "headline", "body", "fields", "campaignId", "promotionId"];
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="lg" title={page ? `Edit ${page.title}` : "New landing page"} description={live ? "This page is live: saved changes show to customers straight away." : "Saved as a draft. Nobody can open it until you publish it."}
      footer={<><Button className={TAP} onClick={onClose}>Cancel</Button><Button className={TAP} variant="primary" onClick={submit}>{page ? "Save page" : "Create draft"}</Button></>}>
      <div className={`space-y-3 ${TAP_SCOPE}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Page title" htmlFor="lp-title" required error={e("title")}><Input id="lp-title" value={f.title} invalid={!!e("title")} onChange={(x) => setF({ ...f, title: x.target.value, slug: f.slugEdited ? f.slug : slugify(x.target.value) })} placeholder="Spring exterior special" /></Field>
          <Field label="Page address" htmlFor="lp-slug" required error={e("slug")} hint={`/lp/${f.slug || "…"} · lower-case letters, numbers and dashes`}>
            <Input id="lp-slug" value={f.slug} invalid={!!e("slug")} onChange={(x) => setF({ ...f, slug: x.target.value.toLowerCase(), slugEdited: true })} />
          </Field>
        </div>
        <Field label="Headline" htmlFor="lp-head" required error={e("headline")}><Input id="lp-head" value={f.headline} invalid={!!e("headline")} onChange={(x) => setF({ ...f, headline: x.target.value })} /></Field>
        <Field label="Body" htmlFor="lp-body" error={e("body")} hint="Public text. Never include a customer's street address."><Textarea id="lp-body" value={f.body} invalid={!!e("body")} onChange={(x) => setF({ ...f, body: x.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Campaign" htmlFor="lp-cmp" error={e("campaignId")} hint="Leads from this page are credited to it">
            <Select id="lp-cmp" value={f.campaignId} onChange={(x) => setF({ ...f, campaignId: x.target.value })}>
              <option value="">No campaign</option>
              {(db.mktCampaigns ?? []).filter((c) => c.status !== "completed" || c.id === f.campaignId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Promotion shown" htmlFor="lp-promo" error={e("promotionId")}>
            <Select id="lp-promo" value={f.promotionId} onChange={(x) => setF({ ...f, promotionId: x.target.value })}>
              <option value="">No offer</option>
              {(db.mktPromotions ?? []).filter((p) => p.active || p.id === f.promotionId).map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </Select>
          </Field>
          <Field label="Service" htmlFor="lp-svc" hint="Used when the form doesn't ask">
            <Select id="lp-svc" value={f.service} onChange={(x) => setF({ ...f, service: x.target.value as MarketingService | "" })}>
              <option value="">Not set</option>
              {SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABEL[s]}</option>)}
            </Select>
          </Field>
          <Field label="Area" htmlFor="lp-loc" hint="Town or neighbourhood, not a street address"><Input id="lp-loc" value={f.location} onChange={(x) => setF({ ...f, location: x.target.value })} placeholder="Dallas" /></Field>
        </div>
        <fieldset className="rounded-lg border border-line p-3">
          <legend className="px-1 text-[12px] font-semibold text-slate-700">Form</legend>
          <PillTabs className="mb-3" value={f.kind} onChange={(k) => { setF({ ...f, kind: k }); setRows(rowsFor(k)); }} options={(Object.keys(KIND_LABEL) as FormKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.key} className="grid items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                <Checkbox checked={r.include} onCheckedChange={(v) => setRow(r.key, { include: v })} label={<span className="sr-only">Include {r.label}</span>} />
                <Input aria-label={`Label for the ${r.key} field`} value={r.label} disabled={!r.include} onChange={(x) => setRow(r.key, { label: x.target.value })} />
                <Checkbox checked={r.required} disabled={!r.include} onCheckedChange={(v) => setRow(r.key, { required: v })} label="Required" />
              </div>
            ))}
          </div>
          {e("fields") && <p className="mt-2 text-[11.5px] font-medium text-red-600">{e("fields")}</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Button text" htmlFor="lp-btn"><Input id="lp-btn" value={f.submitLabel} onChange={(x) => setF({ ...f, submitLabel: x.target.value })} /></Field>
            <Field label="Thank-you message" htmlFor="lp-thanks"><Input id="lp-thanks" value={f.successMessage} onChange={(x) => setF({ ...f, successMessage: x.target.value })} /></Field>
          </div>
        </fieldset>
        <div className="rounded-lg border border-line bg-slate-50 p-3 text-[12.5px]">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Preview</div>
          <div className="font-display text-[16px] font-bold text-ink">{f.headline || "Your headline"}</div>
          {f.body && <p className="mt-1 whitespace-pre-wrap text-slate-600">{f.body}</p>}
          {promo && <p className="mt-1 font-semibold text-slate-700">Quote {promo.code}: {promo.discountType === "percent" ? `${promo.value}% off` : `$${promo.value.toFixed(2)} off`}</p>}
          <p className="mt-1 text-slate-500">{fields.map((x) => `${x.label}${x.required ? " *" : ""}`).join(" · ")}</p>
        </div>
        {err && !known.includes(err.field ?? "") && <Banner tone="danger">{err.message}</Banner>}
      </div>
    </Modal>
  );
}
