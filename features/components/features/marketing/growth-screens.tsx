"use client";
/**
 * Patent §34 — campaigns and growth, after Campaigns (campaigns-screen.tsx):
 * - Promotions & Referrals: offers and coupon codes (validatePromotionInput),
 *   a code checker (validatePromoCode), referral programmes with personal
 *   codes, referrals and rewards (referralTotals, referralRewardsDue).
 * - Reviews & Testimonials: reviews to answer, responses, owner-approved
 *   testimonials, and review requests (sandbox, 90-day cooldown).
 * - Email & SMS Campaigns: audience segments (segmentMembers) and messages
 *   sent to them (campaignRecipients). Sends are sandbox: each one is
 *   recorded in the send log and no provider is called.
 */
import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Gift, Mail, MessageSquare, Pencil, Plus, Send, Star, Ticket, Users } from "lucide-react";
import type { SocialPlatform } from "@/features/types";
import type { AudienceStatus, ContactGroup, MarketingService, MessageCampaign, Promotion, PromotionKind, SegmentRules } from "@/features/types/marketing-growth";
import type { SocialReview } from "@/features/types/marketing-social";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can, whoCan } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { now } from "@/features/lib/clock";
import { dateLong } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { useParam } from "@/features/lib/navigation";
import {
  audienceMembers, campaignRecipients, describeRules, GROUP_LABEL, GROUPS, PROMO_KIND_LABEL, referralQualified, referralRewardsDue, referralTotals, segmentMembers, SERVICE_LABEL, SERVICES,
  STATUS_LABEL, validatePromoCode,
} from "@/features/lib/rules/marketing-growth";
import { PLATFORM_LABEL, REVIEW_REQUEST_COOLDOWN_DAYS, reviewRequestBody, SOCIAL_PLATFORMS } from "@/features/lib/rules/marketing-social";
import {
  createReferralCode, markReferralRewarded, personalise, recordReferral, recordReview, requestReview, respondToReview, saveMessageCampaign, savePromotion, saveSegment,
  sendMessageCampaign, setPromotionActive, setTestimonial, SMS_MAX,
} from "@/features/lib/store/actions/marketing-growth";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, Checkbox, ConfirmDialog, Drawer, EmptyState, Field, Input, Modal, PillTabs, Select, Stat, StatStrip, Table, TD, Textarea, TH, THead, TR } from "@/features/components/ui";
import { MarketingFrame } from "./marketing-frame";
import { cents, GatedButton, SectionTitle, Stars, TAP, TAP_SCOPE } from "./growth-shared";

const today = () => now().slice(0, 10);
type Err = { field?: string; message: string };
type Confirm = { title: string; body: ReactNode; label: string; tone?: "danger" | "primary"; run: () => void };
const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function useConfirm() {
  const [confirm, setConfirm] = useState<Confirm>();
  const dialog = (
    <ConfirmDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(undefined)} title={confirm?.title ?? ""} body={confirm?.body} confirmLabel={confirm?.label} tone={confirm?.tone ?? "primary"} onConfirm={() => { confirm?.run(); setConfirm(undefined); }} />
  );
  return { setConfirm, dialog };
}

/* ============================ Promotions & referrals ============================ */

export function PromotionsScreen() {
  return <MarketingFrame tab="promotions"><Promotions /></MarketingFrame>;
}

function promoStatus(p: Promotion): { label: string; tone: "green" | "gray" | "amber" | "blue" | "red" } {
  const t = today();
  if (!p.active) return { label: "Paused", tone: "gray" };
  if (p.validTo && p.validTo < t) return { label: "Expired", tone: "red" };
  if (p.validFrom > t) return { label: "Scheduled", tone: "blue" };
  if (p.maxRedemptions !== undefined && p.redemptions.length >= p.maxRedemptions) return { label: "Limit reached", tone: "amber" };
  return { label: "Active", tone: "green" };
}
const discountText = (p: Pick<Promotion, "discountType" | "value">) => (p.discountType === "percent" ? `${p.value}% off` : `${cents(p.value)} off`);

function Promotions() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [editing, setEditing] = useState<Promotion | "new">();
  const [codeFor, setCodeFor] = useState<string>();
  const [referralFor, setReferralFor] = useState<string>();
  const { setConfirm, dialog } = useConfirm();
  const promos = db.mktPromotions ?? [];
  const programmes = promos.filter((p) => p.kind === "referral");
  const due = useMemo(() => referralRewardsDue(db), [db]);
  const canEdit = can(user, "marketing.post");
  const reason = `Needs ${whoCan("marketing.post")}.`;
  const newButton = <GatedButton allowed={canEdit} reason={reason} variant="primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New promotion</GatedButton>;

  return (
    <>
      <PageHeader title="Promotions & Referrals" subtitle="Discounts, coupons, seasonal offers and service packages with the code customers quote, plus referral programmes where each referrer has their own code." actions={promos.length > 0 && newButton} />
      {promos.length === 0 ? (
        <EmptyState icon={<Ticket />} title="No promotions yet" body="Create an offer with a code customers can quote, or a referral programme for existing customers." action={newButton} />
      ) : (
        <>
          <StatStrip className="mb-4">
            <Stat label="Active offers" value={promos.filter((p) => promoStatus(p).label === "Active").length} hint={`${promos.length} in total`} />
            <Stat label="Redemptions" value={promos.reduce((a, p) => a + p.redemptions.length, 0)} />
            <Stat label="Referral codes" value={(db.mktReferralCodes ?? []).length} hint={`${(db.mktReferralCodes ?? []).reduce((a, r) => a + r.referrals.length, 0)} referrals`} />
            <Stat label="Rewards due" value={due.length} hint={due.length ? cents(due.reduce((a, x) => a + x.amount, 0)) : "None waiting"} tone={due.length ? "warn" : "default"} />
          </StatStrip>
          <Card className="mb-4 p-0">
            <Table className="relative rounded-2xl border-0">
              <THead><tr><TH>Code</TH><TH>Offer</TH><TH>Discount</TH><TH>Valid</TH><TH className="text-right">Redeemed</TH><TH>Status</TH>{canEdit && <TH><span className="sr-only">Actions</span></TH>}</tr></THead>
              <tbody>
                {promos.map((p) => {
                  const s = promoStatus(p);
                  const camp = byId(db.mktCampaigns ?? [], p.campaignId);
                  return (
                    <TR key={p.id}>
                      <TD className="font-mono text-xs font-bold text-ink">{p.code}</TD>
                      <TD className="min-w-52"><div className="font-semibold text-ink">{p.name}</div><div className="text-xs text-gray-500">{PROMO_KIND_LABEL[p.kind]}{camp && ` · ${camp.name}`}{p.minSpend !== undefined && ` · min ${cents(p.minSpend)}`}</div></TD>
                      <TD className="whitespace-nowrap">{discountText(p)}</TD>
                      <TD className="whitespace-nowrap text-xs">{dateLong(p.validFrom)} – {p.validTo ? dateLong(p.validTo) : "no end"}</TD>
                      <TD className="text-right tabular-nums">{p.redemptions.length}{p.maxRedemptions !== undefined && ` of ${p.maxRedemptions}`}</TD>
                      <TD><Badge tone={s.tone}>{s.label}</Badge></TD>
                      {canEdit && (
                        <TD className="whitespace-nowrap text-right">
                          <Button size="sm" variant="ghost" className={TAP} onClick={() => setEditing(p)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                          <Button size="sm" variant="ghost" className={TAP} onClick={() => setConfirm({
                            title: `${p.active ? "Pause" : "Resume"} ${p.code}?`, label: p.active ? "Pause offer" : "Resume offer", tone: p.active ? "danger" : "primary",
                            body: <p>{p.active ? `Customers who quote ${p.code} will be told it is no longer active. Redemptions already recorded stay.` : `${p.code} works again for customers until ${p.validTo ? dateLong(p.validTo) : "you pause it"}.`}</p>,
                            run: () => { if (act(setPromotionActive, p.id, !p.active).ok) toast.success(`${p.code} ${p.active ? "paused" : "resumed"}`); },
                          })}>{p.active ? "Pause" : "Resume"}</Button>
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </Card>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] [&>*]:min-w-0">
            <div className="space-y-4">
              {programmes.length === 0 && <EmptyState icon={<Gift />} title="No referral programme yet" body="Create a promotion of type Referral programme to give customers their own referral codes." action={<GatedButton allowed={canEdit} reason={reason} onClick={() => setEditing("new")}>New referral programme</GatedButton>} />}
              {programmes.map((p) => {
                const codes = (db.mktReferralCodes ?? []).filter((r) => r.promotionId === p.id);
                const rw = p.referralReward!;
                return (
                  <Card key={p.id} className="p-4">
                    <SectionTitle right={<GatedButton allowed={canEdit} reason={reason} size="sm" onClick={() => setCodeFor(p.id)}><Plus className="h-3.5 w-3.5" /> New referral code</GatedButton>}>Referral programme · {p.code}</SectionTitle>
                    <div className="mb-3 text-xs text-gray-600"><b className="text-ink">{p.name}.</b> The friend gets {cents(rw.refereeReward)} off; the referrer gets {cents(rw.referrerReward)} ({rw.rewardType.replace("_", " ")}) once the {rw.qualifyOn === "job_completed" ? "job is completed" : "estimate is accepted"}.</div>
                    {codes.length === 0 ? <p className="text-xs text-gray-500">No referrer codes yet. Give a happy customer their own code.</p> : (
                      <Table className="relative">
                        <THead><tr><TH>Code</TH><TH>Referrer</TH><TH className="text-right">Referrals</TH><TH className="text-right">Qualified</TH><TH className="text-right">Rewarded</TH><TH className="text-right">Rewards given</TH>{canEdit && <TH><span className="sr-only">Actions</span></TH>}</tr></THead>
                        <tbody>
                          {codes.map((r) => {
                            const t = referralTotals(r);
                            return (
                              <TR key={r.id}>
                                <TD className="font-mono font-bold text-ink">{r.code}</TD>
                                <TD>{r.referrerName}<div className="text-xs text-gray-500">{r.referrals.map((x) => `${x.leadId} (${x.status === "pending" && referralQualified(db, x, p).qualified ? "qualified" : x.status})`).join(", ")}</div></TD>
                                <TD className="text-right tabular-nums">{t.referrals}</TD>
                                <TD className="text-right tabular-nums">{t.qualified}</TD>
                                <TD className="text-right tabular-nums">{t.rewarded}</TD>
                                <TD className="text-right tabular-nums">{cents(t.rewardsPaid)}</TD>
                                {canEdit && <TD className="text-right"><Button size="sm" variant="ghost" className={TAP} onClick={() => setReferralFor(r.id)}>Record referral</Button></TD>}
                              </TR>
                            );
                          })}
                        </tbody>
                      </Table>
                    )}
                  </Card>
                );
              })}
              {due.length > 0 && (
                <Card className="p-4">
                  <SectionTitle>Rewards due</SectionTitle>
                  <div className="divide-y divide-line">
                    {due.map((x) => (
                      <div key={`${x.codeId}-${x.leadId}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                        <span><b className="text-ink">{x.referrerName}</b> ({x.code}) for {x.leadId} · {cents(x.amount)} {x.rewardType.replace("_", " ")}</span>
                        <GatedButton allowed={canEdit} reason={reason} size="sm" variant="primary" onClick={() => setConfirm({
                          title: `Record ${cents(x.amount)} reward for ${x.referrerName}?`, label: "Record reward given",
                          body: <p>Marks the reward for {x.leadId} as given ({x.rewardType.replace("_", " ")}). Nothing is paid from here: give the reward the usual way. <b>This can&apos;t be undone.</b></p>,
                          run: () => { if (act(markReferralRewarded, x.codeId, x.leadId).ok) toast.success(`Reward recorded for ${x.referrerName}`, `${cents(x.amount)} for ${x.leadId}.`); },
                        })}>Mark reward given</GatedButton>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
            <CodeChecker />
          </div>
        </>
      )}
      {editing && <PromotionForm promo={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} />}
      {codeFor && <ReferralCodeForm promotionId={codeFor} onClose={() => setCodeFor(undefined)} />}
      {referralFor && <RecordReferralForm codeId={referralFor} onClose={() => setReferralFor(undefined)} />}
      {dialog}
    </>
  );
}

function CodeChecker() {
  const db = useDb((d) => d);
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [customerId, setCustomerId] = useState("");
  const check = code.trim() ? validatePromoCode(db, code, { at: now(), amount: num(amount), customerId: customerId || undefined }) : undefined;
  return (
    <Card className={`h-fit p-4 ${TAP_SCOPE}`}>
      <SectionTitle>Check a code</SectionTitle>
      <p className="mb-3 text-xs text-gray-500">When a customer quotes a code, check it is valid for them and what it is worth.</p>
      <div className="space-y-3">
        <Field label="Code" htmlFor="chk-code"><Input id="chk-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="FALL10" /></Field>
        <Field label="Job amount before tax (USD)" htmlFor="chk-amt" hint="Optional"><Input id="chk-amt" type="number" min={0} step={0.01} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></Field>
        <Field label="Customer" htmlFor="chk-cust" hint="Optional; checks the per-customer limit">
          <Select id="chk-cust" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Any customer</option>
            {db.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        {check && (check.ok
          ? <Banner tone="success" title={`${check.promotion.code} is valid`}>{check.promotion.name}{check.referral && ` (referred by ${check.referral.referrerName})`}. Worth {cents(check.discount)}{num(amount) === undefined && check.promotion.discountType === "percent" ? ` — ${check.promotion.value}% of the job` : ""}.</Banner>
          : <Banner tone="danger" title="Not valid">{check.reason}</Banner>)}
      </div>
    </Card>
  );
}

function PromotionForm({ promo, onClose }: { promo?: Promotion; onClose: () => void }) {
  const db = useDb((d) => d);
  const rw = promo?.referralReward;
  const [f, setF] = useState({
    name: promo?.name ?? "", kind: promo?.kind ?? ("coupon" as PromotionKind), code: promo?.code ?? "", description: promo?.description ?? "", discountType: promo?.discountType ?? ("percent" as "percent" | "amount"),
    value: promo ? String(promo.value) : "", validFrom: promo?.validFrom ?? today(), validTo: promo?.validTo ?? "", maxRedemptions: promo?.maxRedemptions?.toString() ?? "", perCustomerLimit: promo?.perCustomerLimit?.toString() ?? "1",
    minSpend: promo?.minSpend?.toString() ?? "", services: promo?.services ?? ([] as MarketingService[]), campaignId: promo?.campaignId ?? "",
    referrerReward: rw ? String(rw.referrerReward) : "100", refereeReward: rw ? String(rw.refereeReward) : "150", rewardType: rw?.rewardType ?? ("gift_card" as "credit" | "gift_card" | "discount"), qualifyOn: rw?.qualifyOn ?? ("job_completed" as "estimate_accepted" | "job_completed"),
  });
  const [err, setErr] = useState<Err>();
  const e = (k: string) => (err?.field === k ? err.message : undefined);
  const referral = f.kind === "referral";
  const submit = () => {
    const r = act(savePromotion, {
      id: promo?.id, name: f.name, kind: f.kind, code: f.code, description: f.description, discountType: referral ? "amount" : f.discountType, value: referral ? Number(f.refereeReward) : f.value === "" ? NaN : Number(f.value),
      validFrom: f.validFrom, validTo: f.validTo || undefined, maxRedemptions: num(f.maxRedemptions), perCustomerLimit: num(f.perCustomerLimit), minSpend: num(f.minSpend), services: f.services, campaignId: f.campaignId || undefined,
      referralReward: referral ? { referrerReward: Number(f.referrerReward), refereeReward: Number(f.refereeReward), rewardType: f.rewardType, qualifyOn: f.qualifyOn } : undefined,
    });
    if (!r.ok) return setErr({ field: r.field, message: r.error });
    toast.success(promo ? `${f.code.toUpperCase()} updated` : `Promotion ${f.code.toUpperCase()} created`, promo ? undefined : "Customers can quote the code from today's start date.");
    onClose();
  };
  const known = ["name", "code", "value", "validFrom", "validTo", "maxRedemptions", "perCustomerLimit", "minSpend", "referralReward", "campaignId"];
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="lg" title={promo ? `Edit ${promo.code}` : "New promotion"} description="The code customers quote, what it is worth, and when and how often it can be used."
      footer={<><Button className={TAP} onClick={onClose}>Cancel</Button><Button className={TAP} variant="primary" onClick={submit}>{promo ? "Save promotion" : "Create promotion"}</Button></>}>
      <div className={`space-y-3 ${TAP_SCOPE}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="pr-name" required error={e("name")}><Input id="pr-name" value={f.name} invalid={!!e("name")} onChange={(x) => setF({ ...f, name: x.target.value })} placeholder="Spring exterior $200 off" /></Field>
          <Field label="Type" htmlFor="pr-kind"><Select id="pr-kind" value={f.kind} onChange={(x) => setF({ ...f, kind: x.target.value as PromotionKind })}>{Object.entries(PROMO_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Code customers quote" htmlFor="pr-code" required error={e("code")} hint="3–24 letters, numbers or dashes"><Input id="pr-code" value={f.code} invalid={!!e("code")} onChange={(x) => setF({ ...f, code: x.target.value.toUpperCase() })} placeholder="SPRING200" /></Field>
          <Field label="Campaign" htmlFor="pr-cmp" error={e("campaignId")}>
            <Select id="pr-cmp" value={f.campaignId} onChange={(x) => setF({ ...f, campaignId: x.target.value })}>
              <option value="">No campaign</option>
              {(db.mktCampaigns ?? []).filter((c) => c.status !== "completed" || c.id === f.campaignId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
        {referral ? (
          <div className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-2">
            <Field label="Friend's discount (USD)" htmlFor="pr-ref1" required error={e("referralReward")}><Input id="pr-ref1" type="number" min={0} step={0.01} value={f.refereeReward} onChange={(x) => setF({ ...f, refereeReward: x.target.value })} /></Field>
            <Field label="Referrer's reward (USD)" htmlFor="pr-ref2" required><Input id="pr-ref2" type="number" min={0} step={0.01} value={f.referrerReward} onChange={(x) => setF({ ...f, referrerReward: x.target.value })} /></Field>
            <Field label="Reward is a" htmlFor="pr-ref3"><Select id="pr-ref3" value={f.rewardType} onChange={(x) => setF({ ...f, rewardType: x.target.value as typeof f.rewardType })}><option value="gift_card">Gift card</option><option value="credit">Account credit</option><option value="discount">Discount on next job</option></Select></Field>
            <Field label="Earned when the friend's" htmlFor="pr-ref4"><Select id="pr-ref4" value={f.qualifyOn} onChange={(x) => setF({ ...f, qualifyOn: x.target.value as typeof f.qualifyOn })}><option value="job_completed">Job is completed</option><option value="estimate_accepted">Estimate is accepted</option></Select></Field>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Discount is" htmlFor="pr-dtype"><Select id="pr-dtype" value={f.discountType} onChange={(x) => setF({ ...f, discountType: x.target.value as "percent" | "amount" })}><option value="percent">A percentage (%)</option><option value="amount">An amount (USD)</option></Select></Field>
            <Field label={f.discountType === "percent" ? "Discount (%)" : "Discount (USD)"} htmlFor="pr-value" required error={e("value")}><Input id="pr-value" type="number" min={0} step={f.discountType === "percent" ? 1 : 0.01} value={f.value} invalid={!!e("value")} onChange={(x) => setF({ ...f, value: x.target.value })} /></Field>
            <Field label="Minimum job before tax (USD)" htmlFor="pr-min" hint="Optional" error={e("minSpend")}><Input id="pr-min" type="number" min={0} step={0.01} value={f.minSpend} onChange={(x) => setF({ ...f, minSpend: x.target.value })} /></Field>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Valid from" htmlFor="pr-from" required error={e("validFrom")}><Input id="pr-from" type="date" value={f.validFrom} invalid={!!e("validFrom")} onChange={(x) => setF({ ...f, validFrom: x.target.value })} /></Field>
          <Field label="Valid to" htmlFor="pr-to" hint="Optional" error={e("validTo")}><Input id="pr-to" type="date" value={f.validTo} invalid={!!e("validTo")} onChange={(x) => setF({ ...f, validTo: x.target.value })} /></Field>
          <Field label="Total uses allowed" htmlFor="pr-max" hint="Blank = unlimited" error={e("maxRedemptions")}><Input id="pr-max" type="number" min={1} step={1} value={f.maxRedemptions} invalid={!!e("maxRedemptions")} onChange={(x) => setF({ ...f, maxRedemptions: x.target.value })} /></Field>
          <Field label="Uses per customer" htmlFor="pr-per" hint="Blank = unlimited" error={e("perCustomerLimit")}><Input id="pr-per" type="number" min={1} step={1} value={f.perCustomerLimit} invalid={!!e("perCustomerLimit")} onChange={(x) => setF({ ...f, perCustomerLimit: x.target.value })} /></Field>
        </div>
        {!referral && (
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-gray-700">Only for these services <span className="font-normal text-gray-500">(none ticked = any)</span></legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">{SERVICES.map((s) => <Checkbox key={s} checked={f.services.includes(s)} onCheckedChange={() => setF({ ...f, services: toggle(f.services, s) })} label={SERVICE_LABEL[s]} />)}</div>
          </fieldset>
        )}
        <Field label="Description" htmlFor="pr-desc"><Textarea id="pr-desc" value={f.description} onChange={(x) => setF({ ...f, description: x.target.value })} /></Field>
        {err && !known.includes(err.field ?? "") && <Banner tone="danger">{err.message}</Banner>}
      </div>
    </Modal>
  );
}

function ReferralCodeForm({ promotionId, onClose }: { promotionId: string; onClose: () => void }) {
  const db = useDb((d) => d);
  const [f, setF] = useState({ referrerCustomerId: "", referrerName: "", code: "" });
  const [err, setErr] = useState<Err>();
  const e = (k: string) => (err?.field === k ? err.message : undefined);
  const submit = () => {
    const r = act(createReferralCode, { promotionId, referrerCustomerId: f.referrerCustomerId || undefined, referrerName: f.referrerName, code: f.code });
    if (!r.ok) return setErr({ field: r.field, message: r.error });
    toast.success(`Referral code ${(r.value as { code: string }).code} created`, "Share it with the referrer; friends quote it when they get in touch.");
    onClose();
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="sm" title="New referral code" description="A personal code for one referrer under this programme."
      footer={<><Button className={TAP} onClick={onClose}>Cancel</Button><Button className={TAP} variant="primary" onClick={submit}>Create code</Button></>}>
      <div className={`space-y-3 ${TAP_SCOPE}`}>
        <Field label="Customer" htmlFor="rc-cust" error={e("referrerCustomerId")}>
          <Select id="rc-cust" value={f.referrerCustomerId} onChange={(x) => setF({ ...f, referrerCustomerId: x.target.value, referrerName: byId(db.customers, x.target.value)?.name ?? f.referrerName })}>
            <option value="">Not a customer (partner, agent…)</option>
            {db.customers.filter((c) => !c.personalDataDeleted).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Referrer's name" htmlFor="rc-name" required error={e("referrerName")}><Input id="rc-name" value={f.referrerName} invalid={!!e("referrerName")} onChange={(x) => setF({ ...f, referrerName: x.target.value })} /></Field>
        <Field label="Code" htmlFor="rc-code" hint="Optional; made from the first name if blank" error={e("code")}><Input id="rc-code" value={f.code} invalid={!!e("code")} onChange={(x) => setF({ ...f, code: x.target.value.toUpperCase() })} /></Field>
        {err && !["referrerCustomerId", "referrerName", "code"].includes(err.field ?? "") && <Banner tone="danger">{err.message}</Banner>}
      </div>
    </Modal>
  );
}

function RecordReferralForm({ codeId, onClose }: { codeId: string; onClose: () => void }) {
  const db = useDb((d) => d);
  const code = byId(db.mktReferralCodes ?? [], codeId)!;
  const [leadId, setLeadId] = useState("");
  const [err, setErr] = useState<Err>();
  const submit = () => {
    const r = act(recordReferral, codeId, leadId);
    if (!r.ok) return setErr({ field: r.field, message: r.error });
    toast.success(`${leadId} credited to ${code.referrerName}`, "The reward becomes due when the referral qualifies.");
    onClose();
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="sm" title={`Record a referral for ${code.code}`} description={`Credit a lead to ${code.referrerName}. The lead's source becomes this referral.`}
      footer={<><Button className={TAP} onClick={onClose}>Cancel</Button><Button className={TAP} variant="primary" onClick={submit}>Record referral</Button></>}>
      <div className={TAP_SCOPE}>
        <Field label="Referred lead" htmlFor="rr-lead" required error={err?.message}>
          <Select id="rr-lead" value={leadId} invalid={!!err} onChange={(x) => setLeadId(x.target.value)}>
            <option value="">Choose a lead…</option>
            {db.leads.map((l) => <option key={l.id} value={l.id}>{l.id} · {byId(db.customers, l.customerId)?.name ?? l.name ?? "—"}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

/* ============================ Reviews & testimonials ============================ */

export function ReviewsScreen() {
  return <MarketingFrame tab="reviews"><Reviews /></MarketingFrame>;
}

const REVIEW_PLATFORMS = SOCIAL_PLATFORMS.filter((p) => p.reviews).map((p) => p.id);

function Reviews() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [tab, setTab] = useState<"respond" | "all" | "testimonials">("respond");
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [testimonialFor, setTestimonialFor] = useState<SocialReview>();
  const { setConfirm, dialog } = useConfirm();
  const reviews = (db.socialReviews ?? []).slice().sort((a, b) => b.at.localeCompare(a.at));
  const waiting = reviews.filter((r) => r.response?.status !== "sent");
  const testimonials = reviews.filter((r) => r.testimonial?.status === "approved");
  const shown = tab === "respond" ? waiting : tab === "testimonials" ? testimonials : reviews;
  const canPost = can(user, "marketing.post");
  const canApprove = can(user, "marketing.approve");
  const reason = `Needs ${whoCan("marketing.post")}.`;
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : undefined;
  const requests = db.reviewRequests ?? [];

  return (
    <>
      <PageHeader
        title="Reviews & Testimonials"
        subtitle="Reviews from Facebook and Google in one place: answer each one, turn the best into testimonials (owner approval, first name and initial only), and ask finished customers for a review."
        actions={<>
          <GatedButton allowed={canPost} reason={reason} onClick={() => setRecording(true)}><Plus className="h-4 w-4" /> Record review</GatedButton>
          <GatedButton allowed={canPost} reason={reason} variant="primary" onClick={() => setRequesting(true)}><Send className="h-4 w-4" /> Request a review</GatedButton>
        </>}
      />
      <StatStrip className="mb-4">
        <Stat label="Reviews" value={reviews.length} />
        <Stat label="Average rating" value={avg === undefined ? "—" : `${avg.toFixed(1)} of 5`} />
        <Stat label="Waiting for a response" value={waiting.length} tone={waiting.length ? "warn" : "default"} />
        <Stat label="Testimonials" value={testimonials.length} hint="Owner approved" />
        <Stat label="Review requests sent" value={requests.filter((r) => r.status === "sent").length} hint="Sandbox" />
      </StatStrip>
      <div className="mb-4"><PillTabs kind="view" value={tab} onChange={setTab} options={[{ value: "respond", label: "Needs a response", count: waiting.length }, { value: "all", label: "All reviews", count: reviews.length }, { value: "testimonials", label: "Testimonials", count: testimonials.length }]} /></div>
      {shown.length === 0 ? (
        tab === "respond" ? <EmptyState icon={<CheckCircle2 />} title="Every review has a response" body="Ask recently finished customers for a review to keep them coming." action={<GatedButton allowed={canPost} reason={reason} onClick={() => setRequesting(true)}>Request a review</GatedButton>} />
          : tab === "testimonials" ? <EmptyState icon={<Star />} title="No testimonials yet" body="Open All reviews and use a 4 or 5-star review as a testimonial." action={<Button className={TAP} onClick={() => setTab("all")}>See all reviews</Button>} />
            : <EmptyState icon={<Star />} title="No reviews yet" body="Record reviews as they arrive, or request one from a finished customer." action={<GatedButton allowed={canPost} reason={reason} onClick={() => setRecording(true)}>Record review</GatedButton>} />
      ) : (
        <div className="space-y-3">{shown.map((r) => <ReviewCard key={r.id} r={r} canPost={canPost} canApprove={canApprove} onTestimonial={() => setTestimonialFor(r)} onReject={() => setConfirm({
          title: `Don't use ${r.author}'s review as a testimonial?`, label: "Don't use", tone: "danger", body: <p>It is marked as not for marketing. You can approve it later.</p>,
          run: () => { if (act(setTestimonial, r.id, "rejected").ok) toast.success("Marked as not for testimonials"); },
        })} />)}</div>
      )}
      <Card className="mt-6 p-4">
        <SectionTitle>Review requests</SectionTitle>
        {requests.length === 0 ? <p className="text-xs text-gray-500">None sent yet. Each customer can be asked once every {REVIEW_REQUEST_COOLDOWN_DAYS} days.</p> : (
          <Table className="relative">
            <THead><tr><TH>Sent</TH><TH>Customer</TH><TH>By</TH><TH>Platform</TH><TH>Status</TH></tr></THead>
            <tbody>
              {requests.map((q) => (
                <TR key={q.id}>
                  <TD className="whitespace-nowrap">{dateLong(q.at)}</TD>
                  <TD>{byId(db.customers, q.customerId)?.name ?? "—"}{q.jobId && <div className="text-xs text-gray-500">{q.jobId}</div>}</TD>
                  <TD>{q.channel === "email" ? "Email" : "SMS"} · {q.to}</TD>
                  <TD>{PLATFORM_LABEL[q.platform]}</TD>
                  <TD><Badge tone={q.status === "failed" ? "red" : "green"}>{q.status === "sent" ? "Sent (sandbox)" : q.status === "failed" ? "Failed" : "Sending"}</Badge></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {recording && <RecordReviewForm onClose={() => setRecording(false)} />}
      {requesting && <RequestReviewForm onClose={() => setRequesting(false)} />}
      {testimonialFor && <TestimonialForm review={testimonialFor} onClose={() => setTestimonialFor(undefined)} />}
      {dialog}
    </>
  );
}

function ReviewCard({ r, canPost, canApprove, onTestimonial, onReject }: { r: SocialReview; canPost: boolean; canApprove: boolean; onTestimonial: () => void; onReject: () => void }) {
  const db = useDb((d) => d);
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string>();
  const send = () => {
    const x = act(respondToReview, r.id, text);
    if (!x.ok) return setErr(x.error);
    toast.success(`Response to ${r.author} recorded`, "Sandbox: not posted to the platform. Paste it there if needed.");
    setReplying(false);
  };
  const approveReason = `Only the ${whoCan("marketing.approve")} approves testimonials, because they show a customer's words publicly.`;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{r.author}</span><Stars rating={r.rating} /><Badge tone="gray">{PLATFORM_LABEL[r.platform]}</Badge>{r.sandbox && <Badge tone="gray">Sandbox</Badge>}</div>
          <div className="text-xs text-gray-500">{dateLong(r.at)}{r.jobId && ` · ${r.jobId}`}{r.customerId && ` · ${byId(db.customers, r.customerId)?.name ?? ""}`}</div>
        </div>
        <div className="flex flex-wrap gap-1">
          {r.response?.status === "sent" ? <Badge tone="green">Responded</Badge> : <Badge tone="amber">Needs a response</Badge>}
          {r.testimonial?.status === "approved" && <Badge tone="purple">Testimonial</Badge>}
          {r.testimonial?.status === "rejected" && <Badge tone="gray">Not for testimonials</Badge>}
        </div>
      </div>
      {r.text ? <p className="mt-2 text-sm text-gray-700">&ldquo;{r.text}&rdquo;</p> : <p className="mt-2 text-xs italic text-gray-500">Rating only, no text.</p>}
      {r.response && <div className="mt-2 rounded-lg border border-line bg-gray-50 px-3 py-2 text-xs"><b>Our response</b> ({dateLong(r.response.at)}): {r.response.text}</div>}
      {r.testimonial?.status === "approved" && <div className="mt-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs">Testimonial: &ldquo;{r.testimonial.quote}&rdquo; — {r.testimonial.displayName}</div>}
      {replying ? (
        <div className={`mt-3 space-y-2 ${TAP_SCOPE}`}>
          <Field label="Public response" htmlFor={`resp-${r.id}`} error={err}><Textarea id={`resp-${r.id}`} value={text} invalid={!!err} onChange={(e) => setText(e.target.value)} placeholder={`Thank you, ${r.author.split(" ")[0]}…`} autoFocus /></Field>
          <div className="flex justify-end gap-2"><Button size="sm" onClick={() => setReplying(false)}>Cancel</Button><Button size="sm" variant="primary" onClick={send}>Post response</Button></div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.response?.status !== "sent" && <GatedButton allowed={canPost} reason={`Needs ${whoCan("marketing.post")}.`} size="sm" variant="primary" onClick={() => { setReplying(true); setErr(undefined); }}><MessageSquare className="h-3.5 w-3.5" /> Respond</GatedButton>}
          {r.testimonial?.status !== "approved" && <GatedButton allowed={canApprove} reason={approveReason} size="sm" onClick={onTestimonial}><Star className="h-3.5 w-3.5" /> Use as testimonial</GatedButton>}
          {!r.testimonial && <GatedButton allowed={canApprove} reason={approveReason} size="sm" variant="ghost" onClick={onReject}>Don&apos;t use</GatedButton>}
        </div>
      )}
    </Card>
  );
}

function TestimonialForm({ review, onClose }: { review: SocialReview; onClose: () => void }) {
  const [quote, setQuote] = useState(review.testimonial?.quote ?? review.text);
  const [err, setErr] = useState<string>();
  const submit = () => {
    const r = act(setTestimonial, review.id, "approved", quote);
    if (!r.ok) return setErr(r.error);
    toast.success("Testimonial approved", "Posts and pages can now quote it.");
    onClose();
  };
  const first = review.author.trim().split(/\s+/);
  const shownAs = first.length > 1 ? `${first[0]} ${first[first.length - 1]![0]!.toUpperCase()}.` : first[0];
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title="Use as testimonial" description={`Shown publicly as "${shownAs}" — first name and initial only. Remove anything that identifies the home.`}
      footer={<><Button className={TAP} onClick={onClose}>Cancel</Button><Button className={TAP} variant="primary" onClick={submit}>Approve testimonial</Button></>}>
      <div className={TAP_SCOPE}>
        {review.rating < 4 && <Banner tone="warn" className="mb-3">This is a {review.rating}-star review. Testimonials usually come from 4 and 5-star reviews.</Banner>}
        <Field label="Quote to use" htmlFor="tm-quote" required error={err}><Textarea id="tm-quote" value={quote} invalid={!!err} onChange={(e) => setQuote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function RecordReviewForm({ onClose }: { onClose: () => void }) {
  const db = useDb((d) => d);
  const [f, setF] = useState({ platform: "google_business" as SocialPlatform, author: "", rating: "5", text: "", at: today(), customerId: "" });
  const [err, setErr] = useState<Err>();
  const e = (k: string) => (err?.field === k ? err.message : undefined);
  const submit = () => {
    const r = act(recordReview, { platform: f.platform, author: f.author, rating: Number(f.rating), text: f.text, at: f.at, customerId: f.customerId || undefined });
    if (!r.ok) return setErr({ field: r.field, message: r.error });
    toast.success(`${f.rating}-star review from ${f.author.trim()} recorded`, "It is in Needs a response.");
    onClose();
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title="Record review" description="Add a review that arrived on a platform we don't read automatically."
      footer={<><Button className={TAP} onClick={onClose}>Cancel</Button><Button className={TAP} variant="primary" onClick={submit}>Record review</Button></>}>
      <div className={`space-y-3 ${TAP_SCOPE}`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Platform" htmlFor="rv-plat"><Select id="rv-plat" value={f.platform} onChange={(x) => setF({ ...f, platform: x.target.value as SocialPlatform })}>{SOCIAL_PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></Field>
          <Field label="Rating" htmlFor="rv-rating" required error={e("rating")}><Select id="rv-rating" value={f.rating} onChange={(x) => setF({ ...f, rating: x.target.value })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} of 5 stars</option>)}</Select></Field>
          <Field label="Date" htmlFor="rv-date"><Input id="rv-date" type="date" value={f.at} onChange={(x) => setF({ ...f, at: x.target.value })} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Reviewer's name" htmlFor="rv-author" required error={e("author")}><Input id="rv-author" value={f.author} invalid={!!e("author")} onChange={(x) => setF({ ...f, author: x.target.value })} /></Field>
          <Field label="Customer" htmlFor="rv-cust" hint="Optional">
            <Select id="rv-cust" value={f.customerId} onChange={(x) => setF({ ...f, customerId: x.target.value, author: f.author || (byId(db.customers, x.target.value)?.name ?? "") })}>
              <option value="">Not matched</option>
              {db.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Review text" htmlFor="rv-text" error={e("text")}><Textarea id="rv-text" value={f.text} onChange={(x) => setF({ ...f, text: x.target.value })} /></Field>
        {err && !["rating", "author", "text"].includes(err.field ?? "") && <Banner tone="danger">{err.message}</Banner>}
      </div>
    </Modal>
  );
}

function RequestReviewForm({ onClose }: { onClose: () => void }) {
  const db = useDb((d) => d);
  const [f, setF] = useState({ customerId: "", jobId: "", channel: "email" as "email" | "sms", platform: (REVIEW_PLATFORMS.includes("google_business") ? "google_business" : REVIEW_PLATFORMS[0]) as SocialPlatform });
  const [err, setErr] = useState<Err>();
  const [confirming, setConfirming] = useState(false);
  const customer = byId(db.customers, f.customerId);
  const jobs = db.jobs.filter((j) => j.customerId === f.customerId);
  const to = customer ? (f.channel === "email" ? customer.email : customer.phone) : undefined;
  const preview = customer ? reviewRequestBody(customer.name.split(" ")[0]!, "Estimate Master Painting", "(review link)", f.platform) : "";
  const send = () => {
    const r = act(requestReview, { customerId: f.customerId, jobId: f.jobId || undefined, channel: f.channel, platform: f.platform });
    setConfirming(false);
    if (!r.ok) return setErr({ field: r.field, message: r.error });
    toast.success(`Review request sent to ${customer!.name}`, `By ${f.channel === "email" ? "email" : "SMS"} to ${(r.value as { to: string }).to}. Sandbox: recorded, no provider called.`);
    onClose();
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title="Request a review" description={`Ask a customer for a review. Each customer can be asked once every ${REVIEW_REQUEST_COOLDOWN_DAYS} days; opted-out customers can't be asked.`}
      footer={<><Button className={TAP} onClick={onClose}>Cancel</Button><Button className={TAP} variant="primary" onClick={() => { if (!f.customerId) return setErr({ field: "customerId", message: "Choose a customer." }); setErr(undefined); setConfirming(true); }}>Review and send</Button></>}>
      <div className={`space-y-3 ${TAP_SCOPE}`}>
        <Field label="Customer" htmlFor="rq-cust" required error={err?.field === "customerId" ? err.message : undefined}>
          <Select id="rq-cust" value={f.customerId} invalid={err?.field === "customerId"} onChange={(x) => setF({ ...f, customerId: x.target.value, jobId: "" })}>
            <option value="">Choose a customer…</option>
            {db.customers.filter((c) => !c.personalDataDeleted).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Job" htmlFor="rq-job" hint="Optional">
            <Select id="rq-job" value={f.jobId} onChange={(x) => setF({ ...f, jobId: x.target.value })} disabled={!jobs.length}>
              <option value="">{jobs.length ? "Not a specific job" : "No jobs"}</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.id} · {j.name}</option>)}
            </Select>
          </Field>
          <Field label="Send by" htmlFor="rq-ch"><Select id="rq-ch" value={f.channel} onChange={(x) => setF({ ...f, channel: x.target.value as "email" | "sms" })}><option value="email">Email</option><option value="sms">SMS</option></Select></Field>
          <Field label="Review on" htmlFor="rq-plat"><Select id="rq-plat" value={f.platform} onChange={(x) => setF({ ...f, platform: x.target.value as SocialPlatform })}>{REVIEW_PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}</Select></Field>
        </div>
        {customer && (
          <div className="rounded-lg border border-line bg-gray-50 p-3 text-xs">
            <div className="font-semibold text-gray-700">To: {to ?? <span className="text-red-600">no {f.channel === "email" ? "email" : "mobile number"} on file</span>}</div>
            <div className="mt-1 text-gray-600">{preview}</div>
          </div>
        )}
        {err && err.field !== "customerId" && <Banner tone="danger">{err.message}</Banner>}
      </div>
      <ConfirmDialog open={confirming} onOpenChange={setConfirming} title={`Send a review request to ${customer?.name ?? ""}?`} confirmLabel="Send request" tone="primary" onConfirm={send}
        body={<ul className="list-disc space-y-1 pl-5"><li>One {f.channel === "email" ? "email" : "SMS"} to {to ?? "—"} asking for a {PLATFORM_LABEL[f.platform]} review.</li><li>Sandbox: it is recorded in the customer&apos;s history; no provider is called.</li><li><b>It can&apos;t be undone</b>, and this customer can&apos;t be asked again for {REVIEW_REQUEST_COOLDOWN_DAYS} days.</li></ul>} />
    </Modal>
  );
}

/* ============================ Email & SMS campaigns ============================ */

export function MessagesScreen() {
  return <MarketingFrame tab="messages"><Messages /></MarketingFrame>;
}

function Messages() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const initial = useParam("id");
  const [tab, setTab] = useState<"messages" | "segments">("messages");
  const [openId, setOpenId] = useState<string | undefined>(initial);
  const [editing, setEditing] = useState<MessageCampaign | "new">();
  const [segEditing, setSegEditing] = useState<string | "new">();
  const messages = db.mktMessageCampaigns ?? [];
  const segments = db.mktSegments ?? [];
  const members = useMemo(() => audienceMembers(db, now()), [db]);
  const canPost = can(user, "marketing.post");
  const reason = `Needs ${whoCan("marketing.post")}.`;
  const newMessage = segments.length
    ? <GatedButton allowed={canPost} reason={reason} variant="primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New email or SMS</GatedButton>
    : <GatedButton allowed={canPost} reason={reason} variant="primary" onClick={() => { setTab("segments"); setSegEditing("new"); }}><Plus className="h-4 w-4" /> New segment first</GatedButton>;

  return (
    <>
      <PageHeader title="Email & SMS Campaigns" subtitle="Messages to a saved audience segment, personalised with {{first_name}} and the offer {{code}}. Opted-out and unreachable people are skipped and logged. Sandbox: nothing leaves the app." actions={<>
        <GatedButton allowed={canPost} reason={reason} onClick={() => { setTab("segments"); setSegEditing("new"); }}><Users className="h-4 w-4" /> New segment</GatedButton>
        {newMessage}
      </>} />
      <Banner tone="info" className="mb-4" title="Sandbox sending">No email or SMS provider is connected. Sending records every recipient in the send log and in each customer&apos;s history, exactly as a live send would, without delivering anything.</Banner>
      <div className="mb-4"><PillTabs kind="view" value={tab} onChange={setTab} options={[{ value: "messages", label: "Messages", count: messages.length }, { value: "segments", label: "Audience segments", count: segments.length }]} /></div>
      {tab === "messages" ? (
        messages.length === 0 ? <EmptyState icon={<Mail />} title="No email or SMS campaigns yet" body={segments.length ? "Write a message to one of your audience segments." : "Save an audience segment first, then write a message to it."} action={newMessage} /> : (
          <Card className="p-0">
            <Table className="relative rounded-2xl border-0">
              <THead><tr><TH>Message</TH><TH>Channel</TH><TH>Audience</TH><TH>Status</TH><TH className="text-right">Recipients</TH></tr></THead>
              <tbody>
                {messages.map((m) => {
                  const seg = byId(segments, m.segmentId);
                  const sent = m.sends.filter((s) => s.status === "sandbox" || s.status === "sent").length;
                  return (
                    <TR key={m.id} className="cursor-pointer" onClick={() => setOpenId(m.id)}>
                      <TD className="min-w-56"><button type="button" className={`text-left font-semibold text-brand hover:underline ${TAP}`} onClick={(e) => { e.stopPropagation(); setOpenId(m.id); }}>{m.name}</button><div className="text-xs text-gray-500">{m.id}{m.campaignId && ` · ${byId(db.mktCampaigns ?? [], m.campaignId)?.name ?? ""}`}</div></TD>
                      <TD><Badge tone="gray">{m.channel === "email" ? "Email" : "SMS"}</Badge></TD>
                      <TD>{seg?.name ?? "—"}</TD>
                      <TD>{m.status === "sent" ? <Badge tone="green">Sent (sandbox) {dateLong(m.sentAt)}</Badge> : <Badge tone="gray">Draft</Badge>}</TD>
                      <TD className="text-right tabular-nums">{m.status === "sent" ? `${sent} sent` : `${campaignRecipients(db, m, now()).send.length} will receive`}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )
      ) : segments.length === 0 ? (
        <EmptyState icon={<Users />} title="No audience segments yet" body="A segment is a saved rule such as past exterior customers in Dallas. Messages and campaigns target one." action={<GatedButton allowed={canPost} reason={reason} onClick={() => setSegEditing("new")}>New segment</GatedButton>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {segments.map((s) => {
            const m = segmentMembers(db, s, now(), members);
            return (
              <Card key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="font-semibold text-ink">{s.name}</div><div className="text-xs text-gray-500">{describeRules(s.rules)}</div></div>
                  {canPost && <Button size="icon" variant="ghost" className={TAP} aria-label={`Edit segment ${s.name}`} onClick={() => setSegEditing(s.id)}><Pencil className="h-4 w-4" /></Button>}
                </div>
                <div className="mt-2 text-xs text-gray-700"><b>{m.length}</b> {m.length === 1 ? "person" : "people"} · {m.filter((x) => x.email && !x.optOutEmail).length} by email · {m.filter((x) => x.phone && !x.optOutSms).length} by SMS</div>
                {s.description && <div className="mt-1 text-xs text-gray-500">{s.description}</div>}
              </Card>
            );
          })}
        </div>
      )}
      {openId && byId(messages, openId) && <MessageDrawer id={openId} onClose={() => setOpenId(undefined)} onEdit={(m) => setEditing(m)} />}
      {editing && <MessageForm message={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} onSaved={(id) => { setEditing(undefined); setOpenId(id); }} />}
      {segEditing && <SegmentForm id={segEditing === "new" ? undefined : segEditing} onClose={() => setSegEditing(undefined)} />}
    </>
  );
}

const SEND_LABEL = { sent: "Sent", sandbox: "Sent (sandbox)", failed: "Failed", skipped_opt_out: "Skipped: opted out", skipped_no_address: "Skipped: no address" } as const;

function MessageDrawer({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (m: MessageCampaign) => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const m = byId(db.mktMessageCampaigns ?? [], id)!;
  const [confirming, setConfirming] = useState(false);
  const rec = useMemo(() => campaignRecipients(db, m, now()), [db, m]);
  const sample = rec.send[0]?.member.name ?? "Alex Morgan";
  const p = personalise(db, m, sample);
  const optedOut = rec.skipped.filter((s) => s.status === "skipped_opt_out").length;
  const noAddr = rec.skipped.length - optedOut;
  const canSend = can(user, "marketing.approve");
  const seg = byId(db.mktSegments ?? [], m.segmentId);
  const send = () => {
    const r = act(sendMessageCampaign, m.id);
    setConfirming(false);
    if (r.ok) { const v = r.value as { sent: number; skipped: number }; toast.success(`${m.name} sent to ${v.sent} ${v.sent === 1 ? "person" : "people"}`, `${v.skipped} skipped. Sandbox: recorded in the send log, nothing delivered.`); }
  };
  return (
    <Drawer open onOpenChange={(v) => !v && onClose()} title={m.name}
      subtitle={<div className="flex flex-wrap items-center gap-2">{m.status === "sent" ? <Badge tone="green">Sent (sandbox) {dateLong(m.sentAt)}</Badge> : <Badge tone="gray">Draft</Badge>}<span>{m.id} · {m.channel === "email" ? "Email" : "SMS"} · {seg?.name ?? "—"}</span></div>}
      footer={<Button className={TAP} onClick={onClose}>Close</Button>}>
      {m.status === "draft" && (
        <div className="flex flex-wrap gap-2">
          <GatedButton allowed={can(user, "marketing.post")} reason={`Needs ${whoCan("marketing.post")}.`} size="sm" onClick={() => onEdit(m)}><Pencil className="h-3.5 w-3.5" /> Edit message</GatedButton>
          <GatedButton allowed={canSend && rec.send.length > 0} reason={!canSend ? `Only the ${whoCan("marketing.approve")} sends to customers. Ask them to review and send it.` : "Nobody in this segment can receive it."} size="sm" variant="primary" onClick={() => setConfirming(true)}><Send className="h-3.5 w-3.5" /> Send to {rec.send.length}</GatedButton>
        </div>
      )}
      <section>
        <SectionTitle>Preview for {sample}</SectionTitle>
        <div className="rounded-xl border border-line p-3 text-sm">
          {p.subject && <div className="mb-2 font-semibold text-ink">Subject: {p.subject}</div>}
          <div className="whitespace-pre-wrap text-gray-700">{p.body}</div>
        </div>
      </section>
      {m.status === "draft" ? (
        <section>
          <SectionTitle>Who receives it</SectionTitle>
          <p className="text-xs text-gray-700"><b>{rec.send.length}</b> will receive it by {m.channel === "email" ? "email" : "SMS"}. {optedOut} opted out and {noAddr} with no {m.channel === "email" ? "email" : "mobile number"} will be skipped and logged.</p>
          <ul className="mt-2 max-h-48 overflow-y-auto text-xs text-gray-600">{rec.send.map((r) => <li key={r.member.key}>{r.member.name} · {r.to}</li>)}</ul>
        </section>
      ) : (
        <section>
          <SectionTitle>Send log ({m.sends.length})</SectionTitle>
          <Table className="relative">
            <THead><tr><TH>Recipient</TH><TH>To</TH><TH>Result</TH><TH>Message ID</TH></tr></THead>
            <tbody>{m.sends.map((s) => <TR key={s.memberKey}><TD>{s.name}</TD><TD>{s.to ?? "—"}</TD><TD><Badge tone={s.status === "sandbox" || s.status === "sent" ? "green" : s.status === "failed" ? "red" : "gray"}>{SEND_LABEL[s.status]}</Badge></TD><TD className="font-mono text-xs">{s.messageId ?? "—"}</TD></TR>)}</tbody>
          </Table>
        </section>
      )}
      <ConfirmDialog open={confirming} onOpenChange={setConfirming} title={`Send "${m.name}"?`} confirmLabel={`Send to ${rec.send.length}`} tone="primary" onConfirm={send}
        body={<ul className="list-disc space-y-1 pl-5"><li>{rec.send.length} {m.channel === "email" ? "emails" : "text messages"} to {seg?.name ?? "the segment"}.</li><li>{rec.skipped.length} skipped ({optedOut} opted out, {noAddr} no address), logged.</li><li>Sandbox: each message is recorded in the send log and the customer&apos;s history; nothing is delivered.</li><li><b>This can&apos;t be undone or recalled</b>, and the message can&apos;t be edited afterwards.</li></ul>} />
    </Drawer>
  );
}

function MessageForm({ message, onClose, onSaved }: { message?: MessageCampaign; onClose: () => void; onSaved: (id: string) => void }) {
  const db = useDb((d) => d);
  const [f, setF] = useState({
    name: message?.name ?? "", channel: message?.channel ?? ("email" as "email" | "sms"), segmentId: message?.segmentId ?? db.mktSegments?.[0]?.id ?? "", campaignId: message?.campaignId ?? "",
    promotionId: message?.promotionId ?? "", subject: message?.subject ?? "", body: message?.body ?? "",
  });
  const [err, setErr] = useState<Err>();
  const e = (k: string) => (err?.field === k ? err.message : undefined);
  const rec = useMemo(() => (f.segmentId ? campaignRecipients(db, { segmentId: f.segmentId, channel: f.channel }, now()) : undefined), [db, f.segmentId, f.channel]);
  const p = personalise(db, { body: f.body, subject: f.subject, promotionId: f.promotionId || undefined }, rec?.send[0]?.member.name ?? "Alex Morgan");
  const submit = () => {
    const r = act(saveMessageCampaign, { id: message?.id, name: f.name, channel: f.channel, segmentId: f.segmentId, campaignId: f.campaignId || undefined, promotionId: f.promotionId || undefined, subject: f.subject, body: f.body });
    if (!r.ok) return setErr({ field: r.field, message: r.error });
    toast.success(message ? "Message saved" : `Draft ${r.value} saved`, "Nothing is sent until the owner presses Send.");
    onSaved(r.value as string);
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="lg" title={message ? `Edit ${message.name}` : "New email or SMS"} description="Saved as a draft. The Business Owner reviews and sends it."
      footer={<><Button className={TAP} onClick={onClose}>Cancel</Button><Button className={TAP} variant="primary" onClick={submit}>Save draft</Button></>}>
      <div className={`space-y-3 ${TAP_SCOPE}`}>
        <PillTabs value={f.channel} onChange={(c) => setF({ ...f, channel: c })} options={[{ value: "email", label: "Email" }, { value: "sms", label: "SMS" }]} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name (for you)" htmlFor="msg-name" required error={e("name")}><Input id="msg-name" value={f.name} invalid={!!e("name")} onChange={(x) => setF({ ...f, name: x.target.value })} placeholder="Spring reminder to past customers" /></Field>
          <Field label="Audience segment" htmlFor="msg-seg" required error={e("segmentId")} hint={rec ? `${rec.send.length} will receive · ${rec.skipped.length} skipped` : undefined}>
            <Select id="msg-seg" value={f.segmentId} invalid={!!e("segmentId")} onChange={(x) => setF({ ...f, segmentId: x.target.value })}>
              <option value="">Choose a segment…</option>
              {(db.mktSegments ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Campaign" htmlFor="msg-cmp" error={e("campaignId")}>
            <Select id="msg-cmp" value={f.campaignId} onChange={(x) => setF({ ...f, campaignId: x.target.value })}>
              <option value="">No campaign</option>
              {(db.mktCampaigns ?? []).filter((c) => c.status !== "completed").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Offer ({{code}})" htmlFor="msg-offer" error={e("promotionId")}>
            <Select id="msg-offer" value={f.promotionId} onChange={(x) => setF({ ...f, promotionId: x.target.value })}>
              <option value="">No offer</option>
              {(db.mktPromotions ?? []).filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
            </Select>
          </Field>
        </div>
        {f.channel === "email" && <Field label="Subject" htmlFor="msg-subj" required error={e("subject")}><Input id="msg-subj" value={f.subject} invalid={!!e("subject")} onChange={(x) => setF({ ...f, subject: x.target.value })} /></Field>}
        <Field label="Message" htmlFor="msg-body" required error={e("body")} hint={f.channel === "sms" ? `${f.body.length} of ${SMS_MAX} characters. Must include "Reply STOP to opt out".` : "Use {{first_name}}, {{name}} and {{code}}. Include how to unsubscribe."}>
          <Textarea id="msg-body" className="min-h-40" value={f.body} invalid={!!e("body")} onChange={(x) => setF({ ...f, body: x.target.value })} />
        </Field>
        {f.body && (
          <div className="rounded-lg border border-line bg-gray-50 p-3 text-xs">
            <div className="mb-1 font-semibold text-gray-700">Preview for {rec?.send[0]?.member.name ?? "a customer"}</div>
            {p.subject && <div className="font-semibold text-ink">{p.subject}</div>}
            <div className="whitespace-pre-wrap text-gray-600">{p.body}</div>
          </div>
        )}
        {err && !["name", "segmentId", "subject", "body", "campaignId", "promotionId"].includes(err.field ?? "") && <Banner tone="danger">{err.message}</Banner>}
      </div>
    </Modal>
  );
}

const AUDIENCE_STATUSES: AudienceStatus[] = ["prospect", "lead", "active_customer", "past_customer", "partner"];

function SegmentForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const db = useDb((d) => d);
  const seg = id ? byId(db.mktSegments ?? [], id) : undefined;
  const r0 = seg?.rules ?? {};
  const [f, setF] = useState({
    name: seg?.name ?? "", description: seg?.description ?? "", groups: r0.groups ?? ([] as ContactGroup[]), statuses: r0.statuses ?? ([] as AudienceStatus[]), services: r0.services ?? ([] as MarketingService[]),
    locations: r0.locations?.join(", ") ?? "", reachableBy: r0.reachableBy ?? "", engagement: r0.engagement ?? "", minJobs: r0.minJobs?.toString() ?? "", maxJobs: r0.maxJobs?.toString() ?? "", lastJob: r0.lastJobOlderThanDays?.toString() ?? "",
  });
  const [err, setErr] = useState<Err>();
  const e = (k: string) => (err?.field === k ? err.message : undefined);
  const rules: SegmentRules = {
    groups: f.groups.length ? f.groups : undefined, statuses: f.statuses.length ? f.statuses : undefined, services: f.services.length ? f.services : undefined,
    locations: f.locations.split(",").map((s) => s.trim()).filter(Boolean).length ? f.locations.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    reachableBy: (f.reachableBy || undefined) as SegmentRules["reachableBy"], engagement: (f.engagement || undefined) as SegmentRules["engagement"],
    minJobs: num(f.minJobs), maxJobs: num(f.maxJobs), lastJobOlderThanDays: num(f.lastJob),
  };
  const members = useMemo(() => segmentMembers(db, { rules }, now()), [db, JSON.stringify(rules)]);
  const submit = () => {
    const r = act(saveSegment, { id, name: f.name, description: f.description, rules });
    if (!r.ok) return setErr({ field: r.field, message: r.error });
    toast.success(id ? `Segment ${f.name.trim()} updated` : `Segment ${f.name.trim()} saved`, `${members.length} ${members.length === 1 ? "person" : "people"} match today.`);
    onClose();
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="lg" title={id ? `Edit ${seg?.name}` : "New audience segment"} description="Rules are checked each time a message is sent, so the segment stays current."
      footer={<><Button className={TAP} onClick={onClose}>Cancel</Button><Button className={TAP} variant="primary" onClick={submit}>Save segment</Button></>}>
      <div className={`space-y-3 ${TAP_SCOPE}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="seg-name" required error={e("name")}><Input id="seg-name" value={f.name} invalid={!!e("name")} onChange={(x) => setF({ ...f, name: x.target.value })} placeholder="Past exterior customers in Plano" /></Field>
          <Field label="Description" htmlFor="seg-desc"><Input id="seg-desc" value={f.description} onChange={(x) => setF({ ...f, description: x.target.value })} /></Field>
        </div>
        <fieldset><legend className="mb-1.5 text-xs font-semibold text-gray-700">Status</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{AUDIENCE_STATUSES.map((s) => <Checkbox key={s} checked={f.statuses.includes(s)} onCheckedChange={() => setF({ ...f, statuses: toggle(f.statuses, s) })} label={STATUS_LABEL[s]} />)}</div></fieldset>
        <fieldset><legend className="mb-1.5 text-xs font-semibold text-gray-700">Contact group</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{GROUPS.map((g) => <Checkbox key={g} checked={f.groups.includes(g)} onCheckedChange={() => setF({ ...f, groups: toggle(f.groups, g) })} label={GROUP_LABEL[g]} />)}</div></fieldset>
        <fieldset><legend className="mb-1.5 text-xs font-semibold text-gray-700">Had these services</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{SERVICES.map((s) => <Checkbox key={s} checked={f.services.includes(s)} onCheckedChange={() => setF({ ...f, services: toggle(f.services, s) })} label={SERVICE_LABEL[s]} />)}</div></fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Towns or ZIP codes" htmlFor="seg-loc" hint="Separate with commas" className="sm:col-span-3"><Input id="seg-loc" value={f.locations} onChange={(x) => setF({ ...f, locations: x.target.value })} placeholder="Dallas, 75214" /></Field>
          <Field label="Reachable by" htmlFor="seg-reach"><Select id="seg-reach" value={f.reachableBy} onChange={(x) => setF({ ...f, reachableBy: x.target.value as typeof f.reachableBy })}><option value="">Either</option><option value="email">Email</option><option value="sms">SMS</option></Select></Field>
          <Field label="Engagement (last 90 days)" htmlFor="seg-eng"><Select id="seg-eng" value={f.engagement} onChange={(x) => setF({ ...f, engagement: x.target.value as typeof f.engagement })}><option value="">Any</option><option value="engaged">Engaged</option><option value="unengaged">Not engaged</option></Select></Field>
          <Field label="Last job at least (days ago)" htmlFor="seg-last" error={e("rules")}><Input id="seg-last" type="number" min={0} step={1} value={f.lastJob} onChange={(x) => setF({ ...f, lastJob: x.target.value })} /></Field>
          <Field label="At least (jobs)" htmlFor="seg-min"><Input id="seg-min" type="number" min={0} step={1} value={f.minJobs} onChange={(x) => setF({ ...f, minJobs: x.target.value })} /></Field>
          <Field label="At most (jobs)" htmlFor="seg-max"><Input id="seg-max" type="number" min={0} step={1} value={f.maxJobs} onChange={(x) => setF({ ...f, maxJobs: x.target.value })} /></Field>
        </div>
        <div className="rounded-lg border border-line bg-gray-50 p-3 text-xs">
          <b>{members.length}</b> {members.length === 1 ? "person matches" : "people match"} today: {describeRules(rules)}
          {members.length > 0 && <div className="mt-1 text-gray-500">{members.slice(0, 8).map((m) => m.name).join(", ")}{members.length > 8 && `, and ${members.length - 8} more`}</div>}
        </div>
        {err && !["name", "rules"].includes(err.field ?? "") && <Banner tone="danger">{err.message}</Banner>}
      </div>
    </Modal>
  );
}
