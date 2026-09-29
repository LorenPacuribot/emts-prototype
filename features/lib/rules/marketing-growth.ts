/**
 * Feature 34 (part 2) — pure rules for campaigns and growth.
 *
 * Nothing here mutates the database. Store actions (lib/store/actions/
 * marketing-growth.ts) validate with these functions before they change
 * anything, and every screen and report derives its numbers from them.
 *
 * Money: revenue is the signed contract value before tax (Job.contractValue on
 * a signed, non-estimating job). Spend is marketing expenses plus ad spend
 * reported by the ad connector (part 1). CAC = spend ÷ new customers won.
 * ROI = (revenue − spend) ÷ spend.
 */
import type { Database, Estimate, Job, Lead } from "@/features/types";
import type {
  AppointmentRequest, AudienceSegment, AudienceStatus, AutomationKind, CampaignObjective, ContactGroup, ExpenseCategory, FormField, FormKind, InboundChannel, IntakeAttribution,
  LandingPage, LinkClick, MarketingAutomation, MarketingCampaign, MarketingChannel, MarketingService, MessageCampaign, PromotionKind, Promotion, ReferralCode, ReferralRecord,
  SegmentRules, SendStatus, TrackLink, UtmParams,
} from "@/features/types/marketing-growth";
import { addDays, daysBetween } from "./dates";
import { normEmail, normPhone } from "./marketing";

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export const SERVICE_LABEL: Record<MarketingService, string> = {
  interior_repaint: "Interior painting", exterior_repaint: "Exterior painting", cabinets: "Cabinet refinishing", deck_fence: "Deck and fence",
  commercial: "Commercial", new_construction: "New construction", mixed: "Interior and exterior",
};
export const SERVICES = Object.keys(SERVICE_LABEL) as MarketingService[];

export const CHANNEL_LABEL: Record<MarketingChannel, string> = {
  facebook: "Facebook", instagram: "Instagram", google: "Google", nextdoor: "Nextdoor", email: "Email", sms: "SMS", website: "Website", print: "Print / flyer",
  referral: "Referral", event: "Event", other: "Other",
};
export const CHANNELS = Object.keys(CHANNEL_LABEL) as MarketingChannel[];

export const GROUP_LABEL: Record<ContactGroup, string> = {
  prospect: "Prospect", existing_customer: "Existing customer", past_customer: "Past customer", referral_partner: "Referral partner",
  property_manager: "Property manager", real_estate: "Real-estate professional", other: "Other",
};
export const GROUPS = Object.keys(GROUP_LABEL) as ContactGroup[];

export const STATUS_LABEL: Record<AudienceStatus, string> = { prospect: "Prospect", lead: "Open lead", active_customer: "Active customer", past_customer: "Past customer", partner: "Partner" };

export const OBJECTIVE_LABEL: Record<CampaignObjective, string> = {
  awareness: "Awareness", leads: "Leads", bookings: "Bookings", reviews: "Reviews", referrals: "Referrals", reengagement: "Re-engagement", seasonal: "Seasonal",
};
export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  ads: "Advertising", promo_materials: "Promotional materials", photography: "Photography", video: "Video", printing: "Printing", sponsorships: "Sponsorships", software: "Software", other: "Other",
};
export const PROMO_KIND_LABEL: Record<PromotionKind, string> = { discount: "Discount", coupon: "Coupon", referral: "Referral programme", seasonal: "Seasonal offer", package: "Service package" };
export const AUTOMATION_LABEL: Record<AutomationKind, string> = {
  estimate_follow_up: "Estimate follow-up", review_request: "Review request after completion", seasonal_reminder: "Seasonal reminder", referral_request: "Referral request", reengagement: "Re-engagement",
};
export const INBOUND_LABEL: Record<InboundChannel, string> = { social: "Social", ad: "Ad", landing_page: "Landing page", qr: "QR code", referral: "Referral", promo: "Promo code", other: "Other" };

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export const normCode = (s?: string) => (s ?? "").trim().toUpperCase().replace(/\s+/g, "");
export const day = (iso: string) => iso.slice(0, 10);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));
const within = (iso: string | undefined, from?: string, to?: string) => !!iso && (!from || day(iso) >= from) && (!to || day(iso) <= to);

export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
export const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,23}$/;

/** Service a job belongs to, from its type and name. */
export function jobService(job: Pick<Job, "jobType" | "name">): MarketingService {
  const n = job.name.toLowerCase();
  if (/cabinet/.test(n)) return "cabinets";
  if (/deck|fence/.test(n)) return "deck_fence";
  if (/commercial|office|retail/.test(n)) return "commercial";
  return job.jobType;
}

/** Revenue credited to a job: its signed pre-tax contract value. */
export function jobRevenue(job: Pick<Job, "contractSigned" | "contractValue" | "status">): number {
  return job.contractSigned && job.status !== "estimating" ? job.contractValue : 0;
}

export function isWonJob(job: Pick<Job, "contractSigned" | "status">) {
  return job.contractSigned && job.status !== "estimating";
}

/** The date a job finished: closed, else the scheduled end. */
export function jobCompletedAt(job: Job): string | undefined {
  return job.status === "completed" ? job.closedAt ?? job.scheduleEnd : undefined;
}

/* ------------------------------------------------------------------ */
/* Promotions, coupons, referral programmes (item 9)                   */
/* ------------------------------------------------------------------ */

export interface PromoContext {
  customerId?: string;
  service?: MarketingService;
  /** Pre-tax amount the code is applied to. */
  amount?: number;
  at: string;
}

export type PromoCheck =
  | { ok: true; promotion: Promotion; referral?: ReferralCode; discount: number }
  | { ok: false; reason: string };

export function findPromotion(db: Database, code: string): { promotion?: Promotion; referral?: ReferralCode } {
  const c = normCode(code);
  if (!c) return {};
  const promotion = (db.mktPromotions ?? []).find((p) => p.code === c);
  if (promotion) return { promotion };
  const referral = (db.mktReferralCodes ?? []).find((r) => r.code === c);
  if (referral) return { promotion: (db.mktPromotions ?? []).find((p) => p.id === referral.promotionId), referral };
  return {};
}

export function promoDiscount(p: Pick<Promotion, "discountType" | "value" | "kind" | "referralReward">, amount = 0, viaReferral = false): number {
  if (viaReferral && p.referralReward) return round2(Math.min(amount || p.referralReward.refereeReward, p.referralReward.refereeReward));
  if (p.discountType === "percent") return round2((amount * Math.min(100, Math.max(0, p.value))) / 100);
  return round2(amount ? Math.min(amount, p.value) : p.value);
}

/** Validity window, limits, minimum spend and service restriction. */
export function validatePromoCode(db: Database, code: string, ctx: PromoContext): PromoCheck {
  const c = normCode(code);
  if (!c) return { ok: false, reason: "Enter a code." };
  const { promotion: p, referral } = findPromotion(db, c);
  if (!p) return { ok: false, reason: `Code ${c} doesn't exist.` };
  if (!p.active) return { ok: false, reason: `Code ${c} is no longer active.` };
  const today = day(ctx.at);
  if (today < p.validFrom) return { ok: false, reason: `Code ${c} is valid from ${p.validFrom}.` };
  if (p.validTo && today > p.validTo) return { ok: false, reason: `Code ${c} expired on ${p.validTo}.` };
  const used = p.redemptions.length;
  if (p.maxRedemptions !== undefined && used >= p.maxRedemptions) return { ok: false, reason: `Code ${c} has reached its limit of ${p.maxRedemptions} redemptions.` };
  if (ctx.customerId && p.perCustomerLimit !== undefined) {
    const mine = p.redemptions.filter((r) => r.customerId === ctx.customerId).length;
    if (mine >= p.perCustomerLimit) return { ok: false, reason: `This customer has already used ${c} ${mine} time${mine === 1 ? "" : "s"} (limit ${p.perCustomerLimit}).` };
  }
  if (referral && ctx.customerId && referral.referrerCustomerId === ctx.customerId) return { ok: false, reason: "A referrer can't redeem their own referral code." };
  if (p.minSpend !== undefined && ctx.amount !== undefined && ctx.amount < p.minSpend) return { ok: false, reason: `Code ${c} needs a job of at least $${p.minSpend} before tax.` };
  if (p.services?.length && ctx.service && !p.services.includes(ctx.service)) return { ok: false, reason: `Code ${c} applies to ${p.services.map((s) => SERVICE_LABEL[s]).join(", ")} only.` };
  return { ok: true, promotion: p, referral, discount: promoDiscount(p, ctx.amount, !!referral) };
}

export function validatePromotionInput(db: Database, p: Pick<Promotion, "name" | "code" | "kind" | "discountType" | "value" | "validFrom" | "validTo" | "maxRedemptions" | "perCustomerLimit" | "referralReward">, selfId?: string): string | undefined {
  if (!p.name.trim()) return "Name the promotion.";
  const c = normCode(p.code);
  if (!CODE_RE.test(c)) return "Codes are 3–24 letters, numbers or dashes.";
  if ((db.mktPromotions ?? []).some((x) => x.code === c && x.id !== selfId) || (db.mktReferralCodes ?? []).some((r) => r.code === c)) return `Code ${c} is already in use.`;
  if (!(p.value >= 0)) return "The discount can't be negative.";
  if (p.discountType === "percent" && p.value > 100) return "A percentage discount can't exceed 100%.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.validFrom)) return "Choose the date the code starts.";
  if (p.validTo && p.validTo < p.validFrom) return "The end date is before the start date.";
  if (p.maxRedemptions !== undefined && !(Number.isInteger(p.maxRedemptions) && p.maxRedemptions > 0)) return "The redemption limit must be a whole number above zero.";
  if (p.perCustomerLimit !== undefined && !(Number.isInteger(p.perCustomerLimit) && p.perCustomerLimit > 0)) return "The per-customer limit must be a whole number above zero.";
  if (p.kind === "referral" && !p.referralReward) return "A referral programme needs its rewards.";
  if (p.referralReward && (p.referralReward.referrerReward < 0 || p.referralReward.refereeReward < 0)) return "Rewards can't be negative.";
  return undefined;
}

/** Whether a referred lead has met the programme's qualifying event. */
export function referralQualified(db: Database, rec: Pick<ReferralRecord, "leadId">, promo: Pick<Promotion, "referralReward">): { qualified: boolean; at?: string } {
  const lead = (db.leads ?? []).find((l) => l.id === rec.leadId);
  if (!lead || !promo.referralReward) return { qualified: false };
  const est = leadEstimate(db, lead);
  if (promo.referralReward.qualifyOn === "estimate_accepted") {
    return est?.status === "ACCEPTED" ? { qualified: true, at: est.acceptedAt } : { qualified: false };
  }
  const job = leadJob(db, lead, est);
  return job?.status === "completed" ? { qualified: true, at: jobCompletedAt(job) } : { qualified: false };
}

export interface RewardDue { codeId: string; code: string; referrerName: string; leadId: string; amount: number; rewardType: string }

/** Referral rewards earned but not yet given. */
export function referralRewardsDue(db: Database): RewardDue[] {
  const out: RewardDue[] = [];
  for (const r of db.mktReferralCodes ?? []) {
    const promo = (db.mktPromotions ?? []).find((p) => p.id === r.promotionId);
    if (!promo?.referralReward) continue;
    for (const rec of r.referrals) {
      if (rec.status === "rewarded") continue;
      if (rec.status === "qualified" || referralQualified(db, rec, promo).qualified) {
        out.push({ codeId: r.id, code: r.code, referrerName: r.referrerName, leadId: rec.leadId, amount: promo.referralReward.referrerReward, rewardType: promo.referralReward.rewardType });
      }
    }
  }
  return out;
}

export function referralTotals(r: ReferralCode) {
  return {
    referrals: r.referrals.length,
    qualified: r.referrals.filter((x) => x.status !== "pending").length,
    rewarded: r.referrals.filter((x) => x.status === "rewarded").length,
    rewardsPaid: sum(r.referrals.map((x) => x.rewardAmount ?? 0)),
  };
}

/* ------------------------------------------------------------------ */
/* Attribution (items 10, 11)                                          */
/* ------------------------------------------------------------------ */

export interface ResolvedAttribution {
  channel: InboundChannel | "direct";
  /** Human source label: "Facebook ad — Spring exterior", "Referral — Korah Singer". */
  source: string;
  sourceKey: string;
  campaignId?: string;
  adId?: string;
  postId?: string;
  platform?: string;
  referralCode?: string;
  referralCodeId?: string;
  landingPageId?: string;
  promotionId?: string;
  promoCode?: string;
  linkId?: string;
  service?: MarketingService;
  estimateRequested?: boolean;
}

/** Attribution the lead-intake route stores on the lead (shared contract), read defensively. */
function intakeAttribution(lead: Lead): IntakeAttribution | undefined {
  const a = (lead as Lead & { attribution?: unknown }).attribution;
  return a && typeof a === "object" ? (a as IntakeAttribution) : undefined;
}

export function leadAttribution(db: Database, lead: Lead): ResolvedAttribution {
  const rec = (db.mktAttributions ?? []).find((a) => a.leadId === lead.id);
  const intake = intakeAttribution(lead);
  const social = (db.socialMessages ?? []).find((m) => m.leadId === lead.id)?.attribution;
  const campaignId = rec?.campaignId ?? intake?.campaignId ?? social?.campaignId;
  const adId = rec?.adId ?? intake?.adId ?? social?.adId;
  const postId = rec?.postId ?? intake?.postId ?? social?.postId;
  const landingPageId = rec?.landingPageId ?? intake?.landingPageId;
  const promoCode = normCode(rec?.promoCode ?? intake?.promoCode) || undefined;
  const referralCode = normCode(rec?.referralCode ?? intake?.referralCode) || undefined;
  const found = promoCode ? findPromotion(db, promoCode) : {};
  const ref = referralCode ? (db.mktReferralCodes ?? []).find((r) => r.code === referralCode) : undefined;
  const promotionId = rec?.promotionId ?? found.promotion?.id ?? social?.promotionId;
  const ad = adId ? (db.socialAds ?? []).find((a) => a.id === adId) : undefined;
  const platform = rec?.platform ?? intake?.platform ?? social?.platform ?? ad?.platform;
  const channel: ResolvedAttribution["channel"] = rec?.channel ?? (adId ? "ad" : landingPageId ? "landing_page" : referralCode || lead.source === "referral" ? "referral" : promoCode ? "promo" : postId || social ? "social" : "direct");
  const campaign = campaignId ? (db.mktCampaigns ?? []).find((c) => c.id === campaignId) : undefined;
  let source: string;
  let sourceKey: string;
  if (channel === "ad") { source = `${platform ? titleWord(platform) + " " : ""}ad${ad ? ` — ${ad.name}` : ""}`; sourceKey = `ad:${platform ?? "unknown"}`; }
  else if (channel === "social") { source = `${platform ? titleWord(platform) : "Social"} post`; sourceKey = `social:${platform ?? "unknown"}`; }
  else if (channel === "landing_page") { const lp = (db.mktLandingPages ?? []).find((p) => p.id === landingPageId); source = `Landing page${lp ? ` — ${lp.title}` : ""}`; sourceKey = "landing_page"; }
  else if (channel === "qr") { source = "QR code"; sourceKey = "qr"; }
  else if (channel === "referral") { source = `Referral${ref ? ` — ${ref.referrerName}` : ""}`; sourceKey = "referral"; }
  else if (channel === "promo") { source = `Promo code${promoCode ? ` ${promoCode}` : ""}`; sourceKey = "promo"; }
  else { source = lead.sourceLabel ?? titleWord(lead.source); sourceKey = lead.source; }
  if (campaign && channel !== "direct") source += ` (${campaign.name})`;
  return {
    channel, source, sourceKey, campaignId, adId, postId, platform, referralCode, referralCodeId: ref?.id ?? rec?.referralCodeId, landingPageId, promotionId, promoCode,
    linkId: rec?.linkId, service: rec?.service ?? leadServiceFromJob(db, lead), estimateRequested: rec?.estimateRequested,
  };
}

function titleWord(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function leadEstimate(db: Database, lead: Lead): Estimate | undefined {
  return (db.estimates ?? []).find((e) => e.id === lead.estimateId) ?? (db.estimates ?? []).find((e) => e.leadId === lead.id);
}

export function leadJob(db: Database, lead: Lead, est = leadEstimate(db, lead)): Job | undefined {
  const jobs = db.jobs ?? [];
  return jobs.find((j) => j.leadId === lead.id && j.status !== "estimating") ?? (est ? jobs.find((j) => (j.estimateId === est.id || j.id === est.jobId) && j.status !== "estimating") : undefined);
}

function leadServiceFromJob(db: Database, lead: Lead): MarketingService | undefined {
  const est = leadEstimate(db, lead);
  const job = (db.jobs ?? []).find((j) => j.leadId === lead.id) ?? (est ? (db.jobs ?? []).find((j) => j.estimateId === est.id || j.id === est.jobId) : undefined);
  return job ? jobService(job) : undefined;
}

export function leadAppointment(db: Database, lead: Lead): { at?: string; request?: AppointmentRequest } {
  const request = (db.mktAppointmentRequests ?? []).find((a) => a.leadId === lead.id);
  return { at: lead.scheduledAt ?? request?.scheduledAt, request };
}

export interface ChainStep { stage: "lead" | "customer" | "property" | "estimate" | "appointment" | "job"; label: string; id?: string; at?: string; done: boolean; href?: string }

/** lead → customer → property → appointment → estimate → job, with revenue. */
export function attributionChain(db: Database, leadId: string) {
  const lead = (db.leads ?? []).find((l) => l.id === leadId);
  if (!lead) return undefined;
  const customer = (db.customers ?? []).find((c) => c.id === lead.customerId);
  const est = leadEstimate(db, lead);
  const job = leadJob(db, lead, est);
  const propertyId = lead.propertyId ?? est?.propertyId ?? job?.propertyId;
  const property = (db.properties ?? []).find((p) => p.id === propertyId);
  const appt = leadAppointment(db, lead);
  const attribution = leadAttribution(db, lead);
  const steps: ChainStep[] = [
    { stage: "lead", label: `Lead ${lead.id} — ${attribution.source}`, id: lead.id, at: lead.createdAt, done: true, href: `/leads/${lead.id}` },
    { stage: "customer", label: customer?.name ?? "No customer", id: customer?.id, done: !!customer, href: customer ? `/contacts` : undefined },
    { stage: "property", label: property ? `${property.address}, ${property.city}` : "No property yet", id: property?.id, done: !!property },
    { stage: "appointment", label: appt.at ? "Estimate appointment" : appt.request ? `Appointment requested (${appt.request.status})` : "No appointment", at: appt.at ?? appt.request?.at, done: !!appt.at, id: appt.request?.id },
    { stage: "estimate", label: est ? `${est.id} — ${est.status}` : "No estimate", id: est?.id, at: est?.createdAt, done: !!est, href: est ? `/estimates/${est.id}` : undefined },
    { stage: "job", label: job ? `${job.id} — ${job.status.replace(/_/g, " ")}` : "No job", id: job?.id, at: job?.contractSignedAt, done: !!job, href: job ? `/jobs/${job.id}` : undefined },
  ];
  return { lead, customer, property, estimate: est, job, appointment: appt, attribution, revenue: job ? jobRevenue(job) : 0, steps };
}

/* ------------------------------------------------------------------ */
/* Facts: one row per lead and per spend item (items 24, 25, 27, 32)   */
/* ------------------------------------------------------------------ */

export interface LeadFact {
  leadId: string;
  at: string;
  customerId: string;
  customerName: string;
  sourceKey: string;
  source: string;
  channel: string;
  campaignId?: string;
  platform?: string;
  adId?: string;
  promotionId?: string;
  promoCode?: string;
  landingPageId?: string;
  referral?: string;
  service?: MarketingService;
  location?: string;
  group: ContactGroup;
  appointment: boolean;
  estimate: boolean;
  job: boolean;
  jobId?: string;
  revenue: number;
  newCustomer: boolean;
}

export function leadFacts(db: Database, nowIso: string): LeadFact[] {
  const members = new Map(audienceMembers(db, nowIso).filter((m) => m.customerId).map((m) => [m.customerId!, m]));
  return (db.leads ?? []).map((lead) => {
    const a = leadAttribution(db, lead);
    const est = leadEstimate(db, lead);
    const job = leadJob(db, lead, est);
    const prop = (db.properties ?? []).find((p) => p.id === (lead.propertyId ?? est?.propertyId ?? job?.propertyId));
    const cust = (db.customers ?? []).find((c) => c.id === lead.customerId);
    const earlierJob = (db.jobs ?? []).some((j) => j.customerId === lead.customerId && isWonJob(j) && j.id !== job?.id && (j.contractSignedAt ?? "") < lead.createdAt);
    return {
      leadId: lead.id, at: lead.createdAt, customerId: lead.customerId, customerName: cust?.name ?? lead.name ?? "—", sourceKey: a.sourceKey, source: a.source, channel: a.channel,
      campaignId: a.campaignId, platform: a.platform, adId: a.adId, promotionId: a.promotionId, promoCode: a.promoCode, landingPageId: a.landingPageId, referral: a.referralCode,
      service: a.service, location: prop?.city ?? lead.town, group: members.get(lead.customerId)?.group ?? "prospect",
      appointment: !!leadAppointment(db, lead).at || !!est, estimate: !!est, job: !!job, jobId: job?.id, revenue: job ? jobRevenue(job) : 0, newCustomer: !!job && !earlierJob,
    };
  });
}

export interface SpendFact { at: string; amount: number; kind: "expense" | "ad"; campaignId?: string; platform?: string; service?: MarketingService; location?: string; category: ExpenseCategory; ref: string }

export function spendFacts(db: Database): SpendFact[] {
  const out: SpendFact[] = (db.mktExpenses ?? []).map((e) => ({ at: e.date, amount: e.amount, kind: "expense" as const, campaignId: e.campaignId, platform: e.platform, service: e.service, location: e.location, category: e.category, ref: e.id }));
  for (const ad of db.socialAds ?? []) {
    if (!ad.performance?.spend) continue;
    const camp = (db.mktCampaigns ?? []).find((c) => c.id === ad.campaignId || c.adIds.includes(ad.id));
    out.push({ at: ad.performance.at ?? ad.createdAt, amount: ad.performance.spend, kind: "ad", campaignId: camp?.id ?? ad.campaignId, platform: ad.platform, service: camp?.services[0], location: ad.audience?.locations?.[0], category: "ads", ref: ad.id });
  }
  return out;
}

export const cac = (spend: number, customers: number) => (customers > 0 ? round2(spend / customers) : undefined);
export const roi = (revenue: number, spend: number) => (spend > 0 ? round2((revenue - spend) / spend) : undefined);
export const rate = (n: number, d: number) => (d > 0 ? n / d : undefined);

/* ------------------------------------------------------------------ */
/* Campaign results (item 24)                                          */
/* ------------------------------------------------------------------ */

export interface Results {
  impressions: number;
  reach: number;
  engagement: number;
  clicks: number;
  inquiries: number;
  leads: number;
  appointments: number;
  estimates: number;
  jobs: number;
  revenue: number;
  spend: number;
  adSpend: number;
  expenseSpend: number;
  newCustomers: number;
  cac?: number;
  roi?: number;
  costPerLead?: number;
  /** Social metrics come from sandbox connectors. */
  sandboxMetrics: boolean;
}

/** Latest metric snapshot per post and platform. */
function latestSnapshots(db: Database) {
  const latest = new Map<string, NonNullable<Database["socialMetrics"]>[number]>();
  for (const s of db.socialMetrics ?? []) {
    const k = `${s.postId}|${s.platform}`;
    const cur = latest.get(k);
    if (!cur || cur.at < s.at) latest.set(k, s);
  }
  return Array.from(latest.values());
}

export const engagementOf = (m: { likes: number; comments: number; shares: number; saves: number }) => m.likes + m.comments + m.shares + m.saves;

export function campaignPostIds(db: Database, c: MarketingCampaign): string[] {
  return uniq([...c.postIds, ...(db.marketingPosts ?? []).filter((p) => p.tags?.campaignId === c.id).map((p) => p.id)]);
}
export function campaignAdIds(db: Database, c: MarketingCampaign): string[] {
  return uniq([...c.adIds, ...(db.socialAds ?? []).filter((a) => a.campaignId === c.id).map((a) => a.id)]);
}

export function campaignResults(db: Database, campaignId: string, nowIso: string, range: { from?: string; to?: string } = {}): Results {
  const c = (db.mktCampaigns ?? []).find((x) => x.id === campaignId);
  const postIds = new Set(c ? campaignPostIds(db, c) : []);
  const adIds = new Set(c ? campaignAdIds(db, c) : []);
  const snaps = latestSnapshots(db).filter((s) => postIds.has(s.postId) && within(s.at, range.from, range.to));
  const ads = (db.socialAds ?? []).filter((a) => adIds.has(a.id) && a.performance && within(a.performance.at, range.from, range.to));
  const facts = leadFacts(db, nowIso).filter((f) => f.campaignId === campaignId && within(f.at, range.from, range.to));
  const spend = spendFacts(db).filter((s) => s.campaignId === campaignId && within(s.at, range.from, range.to));
  const links = (db.mktLinks ?? []).filter((l) => l.campaignId === campaignId);
  const lpIds = new Set([...(c?.landingPageIds ?? []), ...(db.mktLandingPages ?? []).filter((p) => p.campaignId === campaignId).map((p) => p.id)]);
  const submissions = (db.mktSubmissions ?? []).filter((s) => (s.attribution.campaignId === campaignId || (s.landingPageId && lpIds.has(s.landingPageId))) && within(s.at, range.from, range.to));
  const socialInq = (db.socialMessages ?? []).filter((m) => (m.attribution?.campaignId === campaignId || (m.postId && postIds.has(m.postId)) || (m.adId && adIds.has(m.adId))) && m.intent !== "general" && within(m.at, range.from, range.to));
  const adSpend = sum(spend.filter((s) => s.kind === "ad").map((s) => s.amount));
  const expenseSpend = sum(spend.filter((s) => s.kind === "expense").map((s) => s.amount));
  const total = round2(adSpend + expenseSpend);
  const revenue = sum(facts.map((f) => f.revenue));
  const newCustomers = facts.filter((f) => f.newCustomer).length;
  const leads = facts.length;
  return {
    impressions: sum(snaps.map((s) => s.metrics.impressions)) + sum(ads.map((a) => a.performance!.impressions)),
    reach: sum(snaps.map((s) => s.metrics.reach)) + sum(ads.map((a) => a.performance!.reach)),
    engagement: sum(snaps.map((s) => engagementOf(s.metrics))),
    clicks: sum(snaps.map((s) => s.metrics.clicks)) + sum(ads.map((a) => a.performance!.clicks)) + sum(links.map((l) => l.clicks.filter((k) => within(k.at, range.from, range.to)).length)),
    inquiries: submissions.length + socialInq.length,
    leads,
    appointments: facts.filter((f) => f.appointment).length,
    estimates: facts.filter((f) => f.estimate).length,
    jobs: facts.filter((f) => f.job).length,
    revenue,
    spend: total,
    adSpend,
    expenseSpend,
    newCustomers,
    cac: cac(total, newCustomers),
    roi: roi(revenue, total),
    costPerLead: leads ? round2(total / leads) : undefined,
    sandboxMetrics: snaps.some((s) => s.sandbox) || ads.some((a) => a.performance!.sandbox),
  };
}

export function campaignSpend(db: Database, campaignId: string) {
  return round2(sum(spendFacts(db).filter((s) => s.campaignId === campaignId).map((s) => s.amount)));
}

export function validateCampaignInput(c: Pick<MarketingCampaign, "name" | "budget" | "startDate" | "endDate">): string | undefined {
  if (!c.name.trim()) return "Name the campaign.";
  if (!(c.budget >= 0)) return "The budget can't be negative.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.startDate)) return "Choose a start date.";
  if (c.endDate && c.endDate < c.startDate) return "The end date is before the start date.";
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Audiences and segments (items 17, 18)                               */
/* ------------------------------------------------------------------ */

export interface AudienceMember {
  key: string;
  customerId?: string;
  contactId?: string;
  name: string;
  email?: string;
  phone?: string;
  group: ContactGroup;
  status: AudienceStatus;
  locations: string[];
  propertyTypes: ("single_family" | "multifamily" | "commercial")[];
  services: MarketingService[];
  jobCount: number;
  lastJobAt?: string;
  lastActivityAt?: string;
  interests: MarketingService[];
  leadSources: string[];
  engaged: boolean;
  optOutEmail: boolean;
  optOutSms: boolean;
}

/** A customer is existing within this many days of their last job; past after it. */
export const EXISTING_WINDOW_DAYS = 548;
export const ENGAGED_WINDOW_DAYS = 90;

function optedOut(db: Database, channel: "email" | "sms", address?: string) {
  if (!address) return false;
  const a = channel === "email" ? normEmail(address) : normPhone(address);
  return (db.mktOptOuts ?? []).some((o) => o.channel === channel && o.address === a);
}

export function audienceMembers(db: Database, nowIso: string): AudienceMember[] {
  const contactsByCustomer = new Map((db.mktContacts ?? []).filter((c) => c.customerId).map((c) => [c.customerId!, c]));
  const out: AudienceMember[] = [];
  const comms = db.mktCommunications ?? [];
  for (const c of db.customers ?? []) {
    if (c.personalDataDeleted) continue;
    const jobs = (db.jobs ?? []).filter((j) => j.customerId === c.id && j.status !== "estimating");
    const leads = (db.leads ?? []).filter((l) => l.customerId === c.id);
    const props = (db.properties ?? []).filter((p) => p.ownership?.some((o) => o.customerId === c.id) || leads.some((l) => l.propertyId === p.id) || jobs.some((j) => j.propertyId === p.id));
    const completed = jobs.filter((j) => j.status === "completed");
    const active = jobs.filter((j) => j.status !== "completed");
    const lastJobAt = completed.map((j) => jobCompletedAt(j) ?? "").sort().pop() || undefined;
    const contact = contactsByCustomer.get(c.id);
    let status: AudienceStatus;
    if (active.length) status = "active_customer";
    else if (completed.length) status = lastJobAt && daysBetween(lastJobAt, nowIso) > EXISTING_WINDOW_DAYS ? "past_customer" : "active_customer";
    else if (leads.some((l) => l.stage !== "lost" && l.stage !== "archived")) status = "lead";
    else status = "prospect";
    const baseGroup: ContactGroup = status === "active_customer" ? "existing_customer" : status === "past_customer" ? "past_customer" : "prospect";
    const group = contact && contact.group !== "prospect" && contact.group !== "existing_customer" && contact.group !== "past_customer" ? contact.group : baseGroup;
    const lastActivityAt = [
      ...leads.map((l) => l.lastActivityAt ?? l.createdAt), ...comms.filter((x) => x.customerId === c.id && x.direction === "inbound").map((x) => x.at),
      ...(db.mktSubmissions ?? []).filter((s) => s.customerId === c.id).map((s) => s.at), ...jobs.map((j) => j.closedAt ?? j.scheduleStart ?? j.contractSignedAt ?? ""), contact?.lastEngagedAt ?? "",
    ].filter(Boolean).sort().pop();
    const engagedAt = [...comms.filter((x) => x.customerId === c.id && x.direction === "inbound").map((x) => x.at), ...(db.mktSubmissions ?? []).filter((s) => s.customerId === c.id).map((s) => s.at), ...leads.map((l) => l.lastActivityAt ?? l.createdAt), contact?.lastEngagedAt ?? ""].filter(Boolean).sort().pop();
    out.push({
      key: `cust:${c.id}`, customerId: c.id, contactId: contact?.id, name: c.name, email: c.email ?? contact?.email, phone: c.phone ?? contact?.phone, group, status,
      locations: uniq([...props.flatMap((p) => [p.city, p.zip]), ...leads.map((l) => l.town ?? ""), contact?.town ?? "", contact?.zip ?? ""].filter(Boolean)),
      propertyTypes: uniq(props.map((p) => p.type)), services: uniq(jobs.map(jobService)), jobCount: jobs.length, lastJobAt, lastActivityAt,
      interests: uniq([...(contact?.interests ?? []), ...leads.map((l) => leadAttribution(db, l).service).filter((s): s is MarketingService => !!s)]),
      leadSources: uniq(leads.map((l) => leadAttribution(db, l).sourceKey)),
      engaged: !!engagedAt && daysBetween(engagedAt, nowIso) <= ENGAGED_WINDOW_DAYS,
      optOutEmail: !!contact?.optOutEmail || optedOut(db, "email", c.email) || props.some((p) => p.optOut),
      optOutSms: !!contact?.optOutSms || optedOut(db, "sms", c.phone) || props.some((p) => p.optOut),
    });
  }
  for (const m of db.mktContacts ?? []) {
    if (m.customerId && out.some((o) => o.customerId === m.customerId)) continue;
    const partner = m.group === "referral_partner" || m.group === "property_manager" || m.group === "real_estate";
    out.push({
      key: `mc:${m.id}`, contactId: m.id, name: m.name, email: m.email, phone: m.phone, group: m.group,
      status: partner ? "partner" : m.group === "past_customer" ? "past_customer" : m.group === "existing_customer" ? "active_customer" : "prospect",
      locations: [m.town, m.zip].filter((x): x is string => !!x), propertyTypes: m.group === "property_manager" ? ["multifamily"] : [], services: [], jobCount: 0,
      lastActivityAt: m.lastEngagedAt ?? m.createdAt, interests: m.interests, leadSources: m.source ? [m.source] : [],
      engaged: !!m.lastEngagedAt && daysBetween(m.lastEngagedAt, nowIso) <= ENGAGED_WINDOW_DAYS,
      optOutEmail: !!m.optOutEmail || optedOut(db, "email", m.email), optOutSms: !!m.optOutSms || optedOut(db, "sms", m.phone),
    });
  }
  return out;
}

const lc = (s: string) => s.trim().toLowerCase();

export function matchesSegment(m: AudienceMember, r: SegmentRules, nowIso: string): boolean {
  if (r.groups?.length && !r.groups.includes(m.group)) return false;
  if (r.statuses?.length && !r.statuses.includes(m.status)) return false;
  if (r.locations?.length && !r.locations.some((l) => m.locations.some((x) => lc(x) === lc(l)))) return false;
  if (r.services?.length && !r.services.some((s) => m.services.includes(s))) return false;
  if (r.propertyTypes?.length && !r.propertyTypes.some((t) => m.propertyTypes.includes(t))) return false;
  if (r.minJobs !== undefined && m.jobCount < r.minJobs) return false;
  if (r.maxJobs !== undefined && m.jobCount > r.maxJobs) return false;
  if (r.lastJobOlderThanDays !== undefined && (!m.lastJobAt || daysBetween(m.lastJobAt, nowIso) < r.lastJobOlderThanDays)) return false;
  if (r.interests?.length && !r.interests.some((s) => m.interests.includes(s) || m.services.includes(s))) return false;
  if (r.engagement === "engaged" && !m.engaged) return false;
  if (r.engagement === "unengaged" && m.engaged) return false;
  if (r.leadSources?.length && !r.leadSources.some((s) => m.leadSources.includes(s))) return false;
  if (r.reachableBy === "email" && (!m.email || m.optOutEmail)) return false;
  if (r.reachableBy === "sms" && (!m.phone || m.optOutSms)) return false;
  return true;
}

export function segmentMembers(db: Database, seg: Pick<AudienceSegment, "rules">, nowIso: string, members = audienceMembers(db, nowIso)): AudienceMember[] {
  return members.filter((m) => matchesSegment(m, seg.rules, nowIso));
}

export function describeRules(r: SegmentRules): string {
  const parts: string[] = [];
  if (r.groups?.length) parts.push(r.groups.map((g) => GROUP_LABEL[g]).join(" or "));
  if (r.statuses?.length) parts.push(`status ${r.statuses.map((s) => STATUS_LABEL[s]).join("/")}`);
  if (r.locations?.length) parts.push(`in ${r.locations.join(", ")}`);
  if (r.services?.length) parts.push(`had ${r.services.map((s) => SERVICE_LABEL[s]).join("/")}`);
  if (r.propertyTypes?.length) parts.push(r.propertyTypes.map((t) => t.replace(/_/g, " ")).join("/"));
  if (r.minJobs !== undefined) parts.push(`≥ ${r.minJobs} jobs`);
  if (r.maxJobs !== undefined) parts.push(`≤ ${r.maxJobs} jobs`);
  if (r.lastJobOlderThanDays !== undefined) parts.push(`last job ${r.lastJobOlderThanDays}+ days ago`);
  if (r.interests?.length) parts.push(`interested in ${r.interests.map((s) => SERVICE_LABEL[s]).join("/")}`);
  if (r.engagement) parts.push(r.engagement);
  if (r.leadSources?.length) parts.push(`source ${r.leadSources.join("/")}`);
  if (r.reachableBy) parts.push(`reachable by ${r.reachableBy}`);
  return parts.join(" · ") || "Everyone";
}

/* ------------------------------------------------------------------ */
/* Email / SMS campaigns (item 19)                                     */
/* ------------------------------------------------------------------ */

export function fillTemplate(body: string, vars: Record<string, string | undefined>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

export interface Recipient { member: AudienceMember; to: string }
export interface Skipped { member: AudienceMember; status: Extract<SendStatus, "skipped_opt_out" | "skipped_no_address"> }

/** Who a message goes to. Opted-out and unreachable members are skipped and logged, never sent. */
export function campaignRecipients(db: Database, mc: Pick<MessageCampaign, "segmentId" | "channel">, nowIso: string): { send: Recipient[]; skipped: Skipped[] } {
  const seg = (db.mktSegments ?? []).find((s) => s.id === mc.segmentId);
  if (!seg) return { send: [], skipped: [] };
  const send: Recipient[] = [];
  const skipped: Skipped[] = [];
  const seen = new Set<string>();
  for (const m of segmentMembers(db, seg, nowIso)) {
    const to = mc.channel === "email" ? m.email : m.phone;
    if (!to) { skipped.push({ member: m, status: "skipped_no_address" }); continue; }
    if (mc.channel === "email" ? m.optOutEmail : m.optOutSms) { skipped.push({ member: m, status: "skipped_opt_out" }); continue; }
    const k = mc.channel === "email" ? normEmail(to) : normPhone(to);
    if (seen.has(k)) continue;
    seen.add(k);
    send.push({ member: m, to });
  }
  return { send, skipped };
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/* ------------------------------------------------------------------ */
/* Automations (item 20)                                               */
/* ------------------------------------------------------------------ */

export interface AutomationTarget { targetKey: string; customerId?: string; name: string; to?: string; optedOut: boolean; vars: Record<string, string>; reason: string }

function customerTarget(db: Database, customerId: string, channel: "email" | "sms", members: Map<string, AudienceMember>) {
  const c = (db.customers ?? []).find((x) => x.id === customerId);
  const m = members.get(customerId);
  const to = channel === "email" ? c?.email : c?.phone;
  return { name: c?.name ?? "Customer", to, optedOut: !!(channel === "email" ? m?.optOutEmail : m?.optOutSms) || !!c?.personalDataDeleted };
}

/** Targets an automation should message today. Anything already sent (or skipped) for the same target is excluded. */
export function dueAutomationTargets(db: Database, auto: MarketingAutomation, nowIso: string): AutomationTarget[] {
  if (!auto.active) return [];
  const done = new Set((db.mktAutomationRuns ?? []).filter((r) => r.automationId === auto.id && r.status !== "failed").map((r) => r.targetKey));
  const members = new Map(audienceMembers(db, nowIso).filter((m) => m.customerId).map((m) => [m.customerId!, m]));
  const out: AutomationTarget[] = [];
  const push = (t: Omit<AutomationTarget, "vars"> & { vars?: Record<string, string> }) => {
    if (done.has(t.targetKey)) return;
    out.push({ ...t, vars: { name: t.name, first_name: firstName(t.name), ...(t.vars ?? {}) } });
  };
  const due = (iso: string | undefined) => !!iso && addDays(iso, auto.delayDays) <= nowIso;
  const refCode = (customerId: string) => (db.mktReferralCodes ?? []).find((r) => r.referrerCustomerId === customerId)?.code ?? "";

  if (auto.kind === "estimate_follow_up") {
    for (const e of db.estimates ?? []) {
      if (!(e.status === "SENT" || e.status === "VIEWED") || !due(e.sentAt)) continue;
      push({ targetKey: `EST:${e.id}`, customerId: e.customerId, ...customerTarget(db, e.customerId, auto.channel, members), vars: { estimate: e.id }, reason: `${e.id} sent ${day(e.sentAt!)} and not yet answered` });
    }
  }
  if (auto.kind === "review_request" || auto.kind === "referral_request") {
    for (const j of db.jobs ?? []) {
      const at = jobCompletedAt(j);
      if (!at || !due(at) || daysBetween(at, nowIso) > auto.delayDays + 60) continue;
      if (auto.kind === "review_request" && (db.reviewRequests ?? []).some((r) => r.jobId === j.id)) continue;
      if (auto.kind === "review_request" && (db.socialReviews ?? []).some((r) => r.jobId === j.id || (r.customerId === j.customerId && r.at >= at))) continue;
      const suffix = auto.kind === "review_request" ? "review" : "referral";
      push({ targetKey: `JOB:${j.id}:${suffix}`, customerId: j.customerId, ...customerTarget(db, j.customerId, auto.channel, members), vars: { job: j.name, code: refCode(j.customerId) }, reason: `${j.id} completed ${day(at)}` });
    }
  }
  if (auto.kind === "seasonal_reminder" && auto.seasonMonth) {
    const [y, mo, d] = day(nowIso).split("-").map(Number);
    const reached = mo > auto.seasonMonth || (mo === auto.seasonMonth && d >= (auto.seasonDay ?? 1));
    const tooLate = mo > auto.seasonMonth + 1;
    if (reached && !tooLate) {
      for (const m of members.values()) {
        if (!m.jobCount) continue;
        if (auto.seasonServices?.length && !auto.seasonServices.some((s) => m.services.includes(s))) continue;
        push({ targetKey: `SEAS:${m.customerId}:${y}`, customerId: m.customerId, ...customerTarget(db, m.customerId!, auto.channel, members), reason: `Seasonal reminder ${y}` });
      }
    }
  }
  if (auto.kind === "reengagement") {
    const inactive = auto.inactiveDays ?? 365;
    const year = day(nowIso).slice(0, 4);
    for (const m of members.values()) {
      if (m.status === "active_customer" && m.lastJobAt === undefined) continue;
      if (!m.lastActivityAt || daysBetween(m.lastActivityAt, nowIso) < inactive) continue;
      if (m.status === "lead") continue;
      push({ targetKey: `RE:${m.customerId}:${year}`, customerId: m.customerId, ...customerTarget(db, m.customerId!, auto.channel, members), reason: `No activity since ${day(m.lastActivityAt)}` });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Trackable links and QR (item 13)                                    */
/* ------------------------------------------------------------------ */

/** Target URL with UTM parameters added (existing query kept, utm_* replaced). */
export function trackedUrl(target: string, utm: Partial<UtmParams>, origin = "http://localhost"): string {
  let url: URL;
  try {
    url = new URL(target, origin);
  } catch {
    url = new URL("/", origin);
  }
  const set = (k: string, v?: string) => v && url.searchParams.set(k, v);
  set("utm_source", utm.source);
  set("utm_medium", utm.medium);
  set("utm_campaign", utm.campaign);
  set("utm_content", utm.content);
  set("utm_term", utm.term);
  return url.toString();
}

export function shortUrl(origin: string, code: string, via: "link" | "qr" = "link") {
  return `${origin.replace(/\/$/, "")}/r/${encodeURIComponent(code)}${via === "qr" ? "?via=qr" : ""}`;
}

/** Only app paths or http(s) URLs can be a link target. */
export function validTarget(target: string): boolean {
  if (target.startsWith("/") && !target.startsWith("//")) return true;
  try {
    const u = new URL(target);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function deviceFrom(ua?: string | null): LinkClick["device"] {
  const s = (ua ?? "").toLowerCase();
  if (/ipad|tablet/.test(s)) return "tablet";
  if (/mobi|iphone|android/.test(s)) return "mobile";
  return "desktop";
}

/** Adds a click once (the server event id is the key). Returns false for a repeat. */
export function applyClick(link: TrackLink, click: LinkClick): boolean {
  if (link.clicks.some((c) => c.id === click.id)) return false;
  link.clicks.push(click);
  return true;
}

/* ------------------------------------------------------------------ */
/* Landing pages and forms (item 12)                                   */
/* ------------------------------------------------------------------ */

export function defaultFields(kind: FormKind): FormField[] {
  const base: FormField[] = [
    { key: "name", label: "Your name", type: "text", required: true, maps: "name" },
    { key: "email", label: "Email", type: "email", required: false, maps: "email" },
    { key: "phone", label: "Phone", type: "tel", required: true, maps: "phone" },
  ];
  if (kind === "contact") return [...base, { key: "message", label: "How can we help?", type: "textarea", required: false, maps: "message" }];
  const addr: FormField[] = [
    { key: "street", label: "Street address", type: "text", required: true, maps: "street" },
    { key: "city", label: "City", type: "text", required: true, maps: "city" },
    { key: "zip", label: "ZIP", type: "text", required: false, maps: "zip" },
    { key: "service", label: "Service", type: "select", required: true, options: SERVICES.map((s) => SERVICE_LABEL[s]), maps: "service" },
  ];
  if (kind === "quote") return [...base, ...addr, { key: "message", label: "Tell us about the project", type: "textarea", required: false, maps: "message" }, { key: "promo", label: "Promo or referral code", type: "text", required: false, maps: "promoCode" }];
  return [...base, ...addr, { key: "date", label: "Preferred date", type: "date", required: true, maps: "preferredDate" }, { key: "window", label: "Preferred time", type: "select", required: false, options: ["Morning", "Afternoon", "Evening"], maps: "preferredWindow" }, { key: "promo", label: "Promo or referral code", type: "text", required: false, maps: "promoCode" }];
}

export function validateLandingPage(db: Database, p: Pick<LandingPage, "slug" | "title" | "headline" | "form">, selfId?: string): string | undefined {
  if (!p.title.trim()) return "Give the page a title.";
  if (!SLUG_RE.test(p.slug)) return "The address can use lower-case letters, numbers and dashes.";
  if ((db.mktLandingPages ?? []).some((x) => x.slug === p.slug && x.id !== selfId)) return `/lp/${p.slug} is already used by another page.`;
  if (!p.headline.trim()) return "Write a headline.";
  if (!p.form.fields.length) return "The form needs at least one field.";
  const keys = p.form.fields.map((f) => f.key);
  if (new Set(keys).size !== keys.length) return "Two form fields share the same key.";
  const maps = p.form.fields.map((f) => f.maps);
  if (!maps.includes("name")) return "The form needs a name field.";
  if (!maps.includes("email") && !maps.includes("phone")) return "The form needs an email or a phone field.";
  if (p.form.kind === "booking" && !maps.includes("preferredDate")) return "A booking form needs a preferred date field.";
  return undefined;
}

/** Field errors for a submission, keyed by field. */
export function validateSubmission(fields: FormField[], values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = (values[f.key] ?? "").trim();
    if (f.required && !v && f.type !== "checkbox") errors[f.key] = `${f.label} is required.`;
    else if (f.required && f.type === "checkbox" && v !== "yes") errors[f.key] = `${f.label} is required.`;
    else if (v && f.type === "email" && !/^\S+@\S+\.\S+$/.test(v)) errors[f.key] = "Enter a valid email.";
    else if (v && f.type === "tel" && normPhone(v).length < 10) errors[f.key] = "Enter a 10-digit phone number.";
    else if (v.length > 2000) errors[f.key] = "That's too long.";
  }
  return errors;
}

export interface InboundPayload {
  ref: string;
  channel: InboundChannel;
  name: string;
  email?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  message?: string;
  service?: MarketingService;
  formKind?: FormKind;
  wantsEstimate?: boolean;
  booking?: { preferredDate?: string; preferredWindow?: string };
  attribution: IntakeAttribution & { linkId?: string };
  values?: Record<string, string>;
  /** Lead the shared intake route reported, when it answered. */
  intakeLeadId?: string;
}

export function serviceFromLabel(label?: string): MarketingService | undefined {
  if (!label) return undefined;
  return SERVICES.find((s) => SERVICE_LABEL[s] === label || s === label);
}

/** Map a landing-page submission onto the intake payload. */
export function submissionToInbound(page: Pick<LandingPage, "id" | "campaignId" | "promotionId" | "form" | "service">, values: Record<string, string>, ref: string, extra: IntakeAttribution & { linkId?: string } = {}): InboundPayload {
  const by = (m: NonNullable<FormField["maps"]>) => {
    const f = page.form.fields.find((x) => x.maps === m);
    return f ? (values[f.key] ?? "").trim() || undefined : undefined;
  };
  const code = normCode(by("promoCode") ?? by("referralCode") ?? extra.promoCode ?? extra.referralCode);
  return {
    ref, channel: "landing_page", name: by("name") ?? "", email: by("email"), phone: by("phone"), street: by("street"), city: by("city"), state: by("state"), zip: by("zip"),
    message: by("message"), service: serviceFromLabel(by("service")) ?? page.service, formKind: page.form.kind, wantsEstimate: page.form.kind !== "contact",
    booking: page.form.kind === "booking" ? { preferredDate: by("preferredDate"), preferredWindow: by("preferredWindow") } : undefined,
    attribution: { ...extra, landingPageId: page.id, formId: page.id, campaignId: extra.campaignId ?? page.campaignId, promoCode: code || undefined },
    values,
  };
}

/* ------------------------------------------------------------------ */
/* Reports (item 25)                                                   */
/* ------------------------------------------------------------------ */

export interface ReportTable { key: string; title: string; columns: string[]; rows: (string | number)[][] }
const pctText = (r?: number) => (r === undefined ? "—" : `${Math.round(r * 100)}%`);
const moneyText = (n?: number) => (n === undefined ? "—" : `$${n.toFixed(2)}`);

export interface Range { from?: string; to?: string }

export function leadsBySourceReport(db: Database, nowIso: string, r: Range = {}): ReportTable {
  const facts = leadFacts(db, nowIso).filter((f) => within(f.at, r.from, r.to));
  const groups = groupBy(facts, (f) => f.sourceKey);
  return {
    key: "leads-by-source", title: "Leads by source", columns: ["Source", "Leads", "Appointments", "Estimates", "Jobs", "Revenue"],
    rows: Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length).map(([k, fs]) => [sourceKeyLabel(k), fs.length, fs.filter((f) => f.appointment).length, fs.filter((f) => f.estimate).length, fs.filter((f) => f.job).length, sum(fs.map((f) => f.revenue))]),
  };
}

export function sourceKeyLabel(k: string): string {
  const [a, b] = k.split(":");
  if (a === "ad") return `${titleWord(b ?? "")} ads`;
  if (a === "social") return `${titleWord(b ?? "")} posts`;
  return titleWord(a);
}

export function revenueByCampaignReport(db: Database, nowIso: string, r: Range = {}): ReportTable {
  return {
    key: "revenue-by-campaign", title: "Revenue by campaign", columns: ["Campaign", "Status", "Budget", "Spend", "Leads", "Jobs", "Revenue", "CAC", "ROI"],
    rows: (db.mktCampaigns ?? []).map((c) => {
      const x = campaignResults(db, c.id, nowIso, r);
      return [c.name, c.status, c.budget, x.spend, x.leads, x.jobs, x.revenue, moneyText(x.cac), pctText(x.roi)];
    }),
  };
}

export function engagementByPlatformReport(db: Database, r: Range = {}): ReportTable {
  const snaps = latestSnapshots(db).filter((s) => within(s.at, r.from, r.to));
  const groups = groupBy(snaps, (s) => s.platform);
  const clicks = groupBy((db.mktLinks ?? []).flatMap((l) => l.clicks.filter((c) => within(c.at, r.from, r.to)).map(() => l.platform ?? "other")), (p) => p);
  const keys = uniq([...groups.keys(), ...clicks.keys()]);
  return {
    key: "engagement-by-platform", title: "Engagement by platform", columns: ["Platform", "Posts", "Impressions", "Reach", "Engagement", "Engagement rate", "Link clicks", "Sandbox"],
    rows: keys.map((k) => {
      const s = groups.get(k) ?? [];
      const imp = sum(s.map((x) => x.metrics.impressions));
      const eng = sum(s.map((x) => engagementOf(x.metrics)));
      return [titleWord(k), uniq(s.map((x) => x.postId)).length, imp, sum(s.map((x) => x.metrics.reach)), eng, pctText(rate(eng, imp)), (clicks.get(k) ?? []).length, s.some((x) => x.sandbox) ? "yes" : "no"];
    }),
  };
}

export function adPerformanceReport(db: Database, nowIso: string): ReportTable {
  const facts = leadFacts(db, nowIso);
  return {
    key: "ad-performance", title: "Ad performance", columns: ["Ad", "Platform", "Status", "Spend", "Impressions", "Clicks", "CTR", "Platform leads", "Attributed leads", "Jobs", "Revenue", "Cost per lead", "ROI"],
    rows: (db.socialAds ?? []).map((a) => {
      const p = a.performance;
      const fs = facts.filter((f) => f.adId === a.id);
      const leads = Math.max(fs.length, 0);
      const spend = p?.spend ?? 0;
      const revenue = sum(fs.map((f) => f.revenue));
      return [a.name, titleWord(a.platform), a.status, spend, p?.impressions ?? 0, p?.clicks ?? 0, pctText(rate(p?.clicks ?? 0, p?.impressions ?? 0)), p?.leads ?? 0, leads, fs.filter((f) => f.job).length, revenue, moneyText(leads ? spend / leads : undefined), pctText(roi(revenue, spend))];
    }),
  };
}

export function cacReport(db: Database, nowIso: string, r: Range = {}): ReportTable {
  const facts = leadFacts(db, nowIso).filter((f) => within(f.at, r.from, r.to));
  const spend = spendFacts(db).filter((s) => within(s.at, r.from, r.to));
  const byChannel = (k?: string) => k ?? "none";
  const keys = uniq([...facts.map((f) => byChannel(f.platform ?? f.channel)), ...spend.map((s) => byChannel(s.platform))]);
  const rows = keys.map((k) => {
    const fs = facts.filter((f) => byChannel(f.platform ?? f.channel) === k);
    const sp = sum(spend.filter((s) => byChannel(s.platform) === k).map((s) => s.amount));
    const won = fs.filter((f) => f.newCustomer).length;
    return [titleWord(k), round2(sp), fs.length, won, moneyText(cac(sp, won)), moneyText(fs.length ? sp / fs.length : undefined)];
  });
  const totalSpend = sum(spend.map((s) => s.amount));
  const totalWon = facts.filter((f) => f.newCustomer).length;
  rows.push(["All channels", round2(totalSpend), facts.length, totalWon, moneyText(cac(totalSpend, totalWon)), moneyText(facts.length ? totalSpend / facts.length : undefined)]);
  return { key: "cac", title: "Customer acquisition cost", columns: ["Channel / platform", "Spend", "Leads", "New customers", "CAC", "Cost per lead"], rows };
}

export function conversionReport(db: Database, nowIso: string, r: Range = {}): ReportTable {
  const facts = leadFacts(db, nowIso).filter((f) => within(f.at, r.from, r.to));
  const groups = groupBy(facts, (f) => f.sourceKey);
  const row = (label: string, fs: LeadFact[]) => [label, fs.length, pctText(rate(fs.filter((f) => f.appointment).length, fs.length)), pctText(rate(fs.filter((f) => f.estimate).length, fs.length)), pctText(rate(fs.filter((f) => f.job).length, fs.length))];
  return { key: "conversion", title: "Conversion", columns: ["Source", "Leads", "→ Appointment", "→ Estimate", "→ Job"], rows: [...Array.from(groups.entries()).map(([k, fs]) => row(sourceKeyLabel(k), fs)), row("All sources", facts)] };
}

export function reviewsReport(db: Database, r: Range = {}): ReportTable {
  const reviews = (db.socialReviews ?? []).filter((x) => within(x.at, r.from, r.to));
  const requests = [
    ...(db.reviewRequests ?? []).filter((x) => within(x.at, r.from, r.to)).map((x) => ({ platform: String(x.platform), ok: x.status !== "failed" })),
    ...(db.mktAutomationRuns ?? []).filter((x) => within(x.at, r.from, r.to) && (db.mktAutomations ?? []).find((a) => a.id === x.automationId)?.kind === "review_request").map((x) => ({ platform: "automation", ok: x.status === "sent" || x.status === "sandbox" })),
  ];
  const groups = groupBy(reviews, (x) => String(x.platform));
  const rows = Array.from(groups.entries()).map(([k, rs]) => [titleWord(k), rs.length, round2(sum(rs.map((x) => x.rating)) / rs.length), rs.filter((x) => x.rating >= 4).length, rs.filter((x) => x.response?.status === "sent").length]);
  rows.push(["All platforms", reviews.length, reviews.length ? round2(sum(reviews.map((x) => x.rating)) / reviews.length) : 0, reviews.filter((x) => x.rating >= 4).length, reviews.filter((x) => x.response?.status === "sent").length]);
  rows.push(["Review requests sent", requests.filter((x) => x.ok).length, "", "", ""]);
  return { key: "reviews", title: "Reviews", columns: ["Platform", "Reviews", "Average rating", "4–5 stars", "Responded"], rows };
}

export function expensesReport(db: Database, r: Range = {}): ReportTable {
  const ex = (db.mktExpenses ?? []).filter((e) => within(e.date, r.from, r.to));
  const camp = (id?: string) => (db.mktCampaigns ?? []).find((c) => c.id === id)?.name ?? "—";
  return {
    key: "expenses", title: "Marketing expenses", columns: ["Date", "Category", "Vendor", "Description", "Amount", "Campaign", "Platform", "Service", "Location", "Customer", "Job", "Finance record"],
    rows: ex.slice().sort((a, b) => a.date.localeCompare(b.date)).map((e) => [e.date, EXPENSE_LABEL[e.category], e.vendor, e.description, e.amount, camp(e.campaignId), e.platform ? CHANNEL_LABEL[e.platform] : "—", e.service ? SERVICE_LABEL[e.service] : "—", e.location ?? "—", e.customerId ?? "—", e.jobId ?? "—", e.financeExpenseId ?? "—"]),
  };
}

export function expenseTotals(db: Database, r: Range = {}) {
  const ex = (db.mktExpenses ?? []).filter((e) => within(e.date, r.from, r.to));
  const byCategory = {} as Record<ExpenseCategory, number>;
  for (const e of ex) byCategory[e.category] = round2((byCategory[e.category] ?? 0) + e.amount);
  return { total: round2(sum(ex.map((e) => e.amount))), byCategory };
}

export function validateExpense(e: { date: string; vendor: string; amount: number; description: string }): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return "Choose the expense date.";
  if (!e.vendor.trim()) return "Enter the vendor.";
  if (!(e.amount > 0)) return "Enter an amount above zero.";
  if (!e.description.trim()) return "Describe the expense.";
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Historical analysis (item 32)                                       */
/* ------------------------------------------------------------------ */

export type Dimension = "platform" | "campaign" | "service" | "location" | "group" | "source" | "period";
export type Period = "month" | "quarter" | "year";

export function periodKey(iso: string, p: Period): string {
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  if (p === "year") return y;
  if (p === "quarter") return `${y}-Q${Math.ceil(m / 3)}`;
  return iso.slice(0, 7);
}

export interface AnalysisRow { key: string; label: string; leads: number; appointments: number; estimates: number; jobs: number; revenue: number; spend: number; conversion?: number; cac?: number; roi?: number }

export function analyse(db: Database, nowIso: string, dim: Dimension, period: Period = "month", r: Range = {}): AnalysisRow[] {
  const facts = leadFacts(db, nowIso).filter((f) => within(f.at, r.from, r.to));
  const spend = spendFacts(db).filter((s) => within(s.at, r.from, r.to));
  const campName = (id?: string) => (db.mktCampaigns ?? []).find((c) => c.id === id)?.name ?? "No campaign";
  const fKey = (f: LeadFact): string => {
    switch (dim) {
      case "platform": return f.platform ?? f.channel;
      case "campaign": return f.campaignId ?? "none";
      case "service": return f.service ?? "unknown";
      case "location": return f.location ?? "unknown";
      case "group": return f.group;
      case "source": return f.sourceKey;
      default: return periodKey(f.at, period);
    }
  };
  const sKey = (s: SpendFact): string | undefined => {
    switch (dim) {
      case "platform": return s.platform ?? "other";
      case "campaign": return s.campaignId ?? "none";
      case "service": return s.service ?? "unknown";
      case "location": return s.location ?? "unknown";
      case "period": return periodKey(s.at, period);
      default: return undefined;
    }
  };
  const label = (k: string) => {
    if (dim === "campaign") return k === "none" ? "No campaign" : campName(k);
    if (dim === "service") return SERVICE_LABEL[k as MarketingService] ?? "Unknown";
    if (dim === "group") return GROUP_LABEL[k as ContactGroup] ?? k;
    if (dim === "source") return sourceKeyLabel(k);
    if (dim === "period") return k;
    return titleWord(k);
  };
  const keys = uniq([...facts.map(fKey), ...spend.map(sKey).filter((k): k is string => !!k)]);
  const rows = keys.map((k) => {
    const fs = facts.filter((f) => fKey(f) === k);
    const sp = round2(sum(spend.filter((s) => sKey(s) === k).map((s) => s.amount)));
    const revenue = sum(fs.map((f) => f.revenue));
    return {
      key: k, label: label(k), leads: fs.length, appointments: fs.filter((f) => f.appointment).length, estimates: fs.filter((f) => f.estimate).length, jobs: fs.filter((f) => f.job).length,
      revenue, spend: sp, conversion: rate(fs.filter((f) => f.job).length, fs.length), cac: cac(sp, fs.filter((f) => f.newCustomer).length), roi: roi(revenue, sp),
    };
  });
  return dim === "period" ? rows.sort((a, b) => a.key.localeCompare(b.key)) : rows.sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);
}

export function analysisTable(rows: AnalysisRow[], dim: Dimension): ReportTable {
  return {
    key: `history-${dim}`, title: `Historical analysis by ${dim}`, columns: [titleWord(dim), "Leads", "Appointments", "Estimates", "Jobs", "Conversion", "Revenue", "Spend", "CAC", "ROI"],
    rows: rows.map((r) => [r.label, r.leads, r.appointments, r.estimates, r.jobs, pctText(r.conversion), r.revenue, r.spend, moneyText(r.cac), pctText(r.roi)]),
  };
}

/* ------------------------------------------------------------------ */
/* Search (item 27)                                                    */
/* ------------------------------------------------------------------ */

export interface SearchQuery { text?: string; customerId?: string; campaignId?: string; platform?: string; service?: string; location?: string; from?: string; to?: string; source?: string; adId?: string; promotionId?: string }

export interface SearchHit { kind: "lead" | "campaign" | "promotion" | "expense" | "submission" | "link"; id: string; label: string; detail: string; at?: string; href: string }

export function searchMarketing(db: Database, nowIso: string, q: SearchQuery): SearchHit[] {
  const text = (q.text ?? "").trim().toLowerCase();
  const has = (...xs: (string | undefined)[]) => !text || xs.some((x) => (x ?? "").toLowerCase().includes(text));
  const loc = (x?: string) => !q.location || (x ?? "").toLowerCase() === q.location.toLowerCase();
  const hits: SearchHit[] = [];
  for (const f of leadFacts(db, nowIso)) {
    if (q.customerId && f.customerId !== q.customerId) continue;
    if (q.campaignId && f.campaignId !== q.campaignId) continue;
    if (q.platform && f.platform !== q.platform) continue;
    if (q.service && f.service !== q.service) continue;
    if (!loc(f.location)) continue;
    if (!within(f.at, q.from, q.to)) continue;
    if (q.source && f.sourceKey !== q.source && f.channel !== q.source) continue;
    if (q.adId && f.adId !== q.adId) continue;
    if (q.promotionId && f.promotionId !== q.promotionId) continue;
    if (!has(f.customerName, f.leadId, f.source, f.promoCode, f.location)) continue;
    hits.push({ kind: "lead", id: f.leadId, label: `${f.leadId} — ${f.customerName}`, detail: `${f.source}${f.service ? ` · ${SERVICE_LABEL[f.service]}` : ""}${f.location ? ` · ${f.location}` : ""}${f.job ? ` · won ${f.revenue ? `$${f.revenue}` : ""}` : ""}`, at: f.at, href: `/marketing/leads?lead=${f.leadId}` });
  }
  const onlyLeadFilters = q.customerId || q.source || q.adId;
  if (!onlyLeadFilters) {
    for (const c of db.mktCampaigns ?? []) {
      if (q.campaignId && c.id !== q.campaignId) continue;
      if (q.service && !c.services.includes(q.service as MarketingService)) continue;
      if (q.location && !c.locations.some((l) => l.toLowerCase() === q.location!.toLowerCase())) continue;
      if (q.platform && !c.channels.includes(q.platform as MarketingChannel)) continue;
      if (q.promotionId && !c.offerIds.includes(q.promotionId)) continue;
      if ((q.from || q.to) && !(within(c.startDate, undefined, q.to) && (!c.endDate || !q.from || c.endDate >= q.from))) continue;
      if (!has(c.name, c.id, c.notes)) continue;
      hits.push({ kind: "campaign", id: c.id, label: c.name, detail: `${OBJECTIVE_LABEL[c.objective]} · ${c.status} · ${c.startDate}${c.endDate ? ` → ${c.endDate}` : ""}`, at: c.startDate, href: `/marketing/campaigns?id=${c.id}` });
    }
    for (const p of db.mktPromotions ?? []) {
      if (q.promotionId && p.id !== q.promotionId) continue;
      if (q.campaignId && p.campaignId !== q.campaignId) continue;
      if (q.service && p.services?.length && !p.services.includes(q.service as MarketingService)) continue;
      if (q.platform || q.location) continue;
      if (!has(p.name, p.code, p.description)) continue;
      hits.push({ kind: "promotion", id: p.id, label: `${p.code} — ${p.name}`, detail: `${PROMO_KIND_LABEL[p.kind]} · ${p.redemptions.length} redeemed`, at: p.validFrom, href: `/marketing/promotions?id=${p.id}` });
    }
    for (const e of db.mktExpenses ?? []) {
      if (q.campaignId && e.campaignId !== q.campaignId) continue;
      if (q.platform && e.platform !== q.platform) continue;
      if (q.service && e.service !== q.service) continue;
      if (q.location && !loc(e.location)) continue;
      if (q.promotionId) continue;
      if (!within(e.date, q.from, q.to)) continue;
      if (!has(e.vendor, e.description, e.id)) continue;
      hits.push({ kind: "expense", id: e.id, label: `${e.vendor} — $${e.amount.toFixed(2)}`, detail: `${EXPENSE_LABEL[e.category]} · ${e.description}`, at: e.date, href: `/marketing/expenses?id=${e.id}` });
    }
    for (const l of db.mktLinks ?? []) {
      if (q.campaignId && l.campaignId !== q.campaignId) continue;
      if (q.platform && l.platform !== q.platform) continue;
      if (q.promotionId && l.promotionId !== q.promotionId) continue;
      if (q.service || q.location) continue;
      if (!has(l.name, l.code, l.target)) continue;
      hits.push({ kind: "link", id: l.id, label: `/r/${l.code} — ${l.name}`, detail: `${l.kind === "qr" ? "QR code" : "Link"} · ${l.clicks.length} clicks`, at: l.createdAt, href: `/marketing/links?id=${l.id}` });
    }
  }
  return hits.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

/* ------------------------------------------------------------------ */
/* Trend alerts (item 33)                                              */
/* ------------------------------------------------------------------ */

export interface TrendAlert { key: string; kind: "many_inquiries" | "ad_leads_few_bookings" | "declining_engagement" | "review_increase" | "seasonal_opportunity" | "over_budget"; severity: "info" | "warning" | "critical"; title: string; detail: string; href?: string }

function inWindow(iso: string | undefined, nowIso: string, fromDaysAgo: number, toDaysAgo: number) {
  if (!iso) return false;
  return iso > addDays(nowIso, -fromDaysAgo) && iso <= addDays(nowIso, -toDaysAgo);
}

const SEASONS: { name: string; months: number[]; services: MarketingService[] }[] = [
  { name: "Spring exterior season", months: [3, 4, 5], services: ["exterior_repaint", "deck_fence"] },
  { name: "Summer exterior season", months: [6, 7, 8], services: ["exterior_repaint", "deck_fence"] },
  { name: "Autumn exterior window", months: [9, 10], services: ["exterior_repaint"] },
  { name: "Holiday interior refresh", months: [11, 12, 1, 2], services: ["interior_repaint", "cabinets"] },
];

export function trendAlerts(db: Database, nowIso: string): TrendAlert[] {
  const out: TrendAlert[] = [];
  const inquiriesAt = [
    ...(db.mktSubmissions ?? []).map((s) => s.at), ...(db.leads ?? []).map((l) => l.createdAt),
    ...(db.socialMessages ?? []).filter((m) => m.intent === "quote_request").map((m) => m.at),
  ];
  const last7 = inquiriesAt.filter((a) => inWindow(a, nowIso, 7, 0)).length;
  const prior28 = inquiriesAt.filter((a) => inWindow(a, nowIso, 35, 7)).length;
  const weeklyAvg = prior28 / 4;
  if (last7 >= 5 && last7 >= 2 * Math.max(weeklyAvg, 1)) {
    out.push({ key: `inquiries:${day(nowIso)}`, kind: "many_inquiries", severity: "info", title: `${last7} inquiries in the last 7 days`, detail: `That's ${weeklyAvg ? `${(last7 / weeklyAvg).toFixed(1)}×` : "well above"} the weekly average of ${weeklyAvg.toFixed(1)}. Make sure the office can answer them all quickly.`, href: "/marketing/leads" });
  }

  const facts = leadFacts(db, nowIso);
  for (const ad of db.socialAds ?? []) {
    const fs = facts.filter((f) => f.adId === ad.id);
    const leads = Math.max(fs.length, ad.performance?.leads ?? 0);
    const booked = fs.filter((f) => f.appointment || f.job).length;
    if (leads >= 5 && booked / leads < 0.2) {
      out.push({ key: `adbook:${ad.id}`, kind: "ad_leads_few_bookings", severity: "warning", title: `${ad.name}: ${leads} leads but ${booked} booked`, detail: `Only ${Math.round((booked / leads) * 100)}% of this ad's leads became appointments. Check the targeting, the offer and how fast leads are followed up.`, href: "/marketing/analytics?report=ad-performance" });
    }
  }

  const snaps = latestSnapshots(db);
  for (const platform of uniq(snaps.map((s) => String(s.platform)))) {
    const ps = snaps.filter((s) => String(s.platform) === platform);
    const recent = sum(ps.filter((s) => inWindow(s.at, nowIso, 30, 0)).map((s) => engagementOf(s.metrics)));
    const before = sum(ps.filter((s) => inWindow(s.at, nowIso, 60, 30)).map((s) => engagementOf(s.metrics)));
    if (before >= 20 && recent <= before * 0.7) {
      out.push({ key: `eng:${platform}:${day(nowIso).slice(0, 7)}`, kind: "declining_engagement", severity: "warning", title: `${titleWord(platform)} engagement down ${Math.round((1 - recent / before) * 100)}%`, detail: `${recent} interactions in the last 30 days against ${before} the 30 days before.`, href: "/marketing/analytics?report=engagement-by-platform" });
    }
  }

  const reviews = db.socialReviews ?? [];
  const rNow = reviews.filter((r) => inWindow(r.at, nowIso, 30, 0));
  const rBefore = reviews.filter((r) => inWindow(r.at, nowIso, 60, 30));
  if (rNow.length >= 3 && rNow.length >= Math.max(1, rBefore.length) * 1.5) {
    const avg = sum(rNow.map((r) => r.rating)) / rNow.length;
    out.push({ key: `reviews:${day(nowIso).slice(0, 7)}`, kind: "review_increase", severity: "info", title: `${rNow.length} new reviews this month (was ${rBefore.length})`, detail: `Average rating ${avg.toFixed(1)}. Good moment to share the best ones as testimonials.`, href: "/marketing/analytics?report=reviews" });
  }

  const nextMonth = Number(addDays(nowIso, 30).slice(5, 7));
  const season = SEASONS.find((s) => s.months.includes(nextMonth));
  if (season) {
    const lastYear = Number(nowIso.slice(0, 4)) - 1;
    const hist = (db.jobs ?? []).filter((j) => isWonJob(j) && season.services.includes(jobService(j)) && (j.scheduleStart ?? j.contractSignedAt ?? "").startsWith(String(lastYear)) && season.months.includes(Number((j.scheduleStart ?? j.contractSignedAt ?? "").slice(5, 7))));
    const hasCampaign = (db.mktCampaigns ?? []).some((c) => c.status !== "completed" && c.services.some((s) => season.services.includes(s)) && (!c.endDate || c.endDate >= day(nowIso)));
    if (!hasCampaign && (hist.length >= 1 || season.months.length)) {
      out.push({ key: `season:${season.name}:${nowIso.slice(0, 4)}`, kind: "seasonal_opportunity", severity: "info", title: `${season.name} starts soon`, detail: `${hist.length} ${season.services.map((s) => SERVICE_LABEL[s].toLowerCase()).join("/")} jobs ran in the same months last year and there's no campaign for them yet.`, href: "/marketing/campaigns" });
    }
  }

  for (const c of db.mktCampaigns ?? []) {
    if (c.status === "draft" || !c.budget) continue;
    const spent = campaignSpend(db, c.id);
    if (spent > c.budget) out.push({ key: `budget:${c.id}:over`, kind: "over_budget", severity: "critical", title: `${c.name} is over budget`, detail: `Spent $${spent.toFixed(2)} of a $${c.budget.toFixed(2)} budget (${Math.round((spent / c.budget) * 100)}%).`, href: `/marketing/campaigns?id=${c.id}` });
    else if (spent >= c.budget * 0.9) out.push({ key: `budget:${c.id}:near`, kind: "over_budget", severity: "warning", title: `${c.name} has used ${Math.round((spent / c.budget) * 100)}% of its budget`, detail: `Spent $${spent.toFixed(2)} of $${c.budget.toFixed(2)}.`, href: `/marketing/campaigns?id=${c.id}` });
  }
  const dismissed = new Set(db.mktSettings?.dismissedAlerts ?? []);
  return out.filter((a) => !dismissed.has(a.key));
}

/* ------------------------------------------------------------------ */
/* Crew capacity (read from the scheduler's job windows)               */
/* ------------------------------------------------------------------ */

function weekdaysBetween(fromIso: string, days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(fromIso, i);
    const wd = new Date(d).getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(day(d));
  }
  return out;
}

/** Open crew-days in the next `days`: crews × working days minus days booked on scheduled jobs. */
export function crewCapacity(db: Database, nowIso: string, days = 21) {
  const crews = db.crews ?? [];
  const dates = weekdaysBetween(nowIso, days);
  let booked = 0;
  for (const crew of crews) {
    const jobs = (db.jobs ?? []).filter((j) => j.crewLeadId === crew.leadUserId && j.scheduleStart && ["scheduled", "confirmed", "in_production", "touch_up"].includes(j.status));
    for (const d of dates) if (jobs.some((j) => day(j.scheduleStart!) <= d && d <= day(j.scheduleEnd ?? j.scheduleStart!))) booked++;
  }
  const total = crews.length * dates.length;
  return { crews: crews.length, workingDays: dates.length, total, booked, open: Math.max(0, total - booked), utilisation: total ? booked / total : 0 };
}

/* ------------------------------------------------------------------ */
/* Recommendations (item 34)                                           */
/* ------------------------------------------------------------------ */

export type RecommendationAction =
  | { type: "create_campaign"; name: string; objective: CampaignObjective; services: MarketingService[]; locations: string[]; budget: number; notes: string }
  | { type: "follow_up_lead"; leadId: string }
  | { type: "request_review"; jobId: string; customerId: string }
  | { type: "copy_campaign"; campaignId: string }
  | { type: "adjust_ad_budget"; adId: string; to: number; from: number };

export interface Recommendation { key: string; kind: "promote_service" | "follow_up_lead" | "request_review" | "reuse_high_performer" | "adjust_ad_budget" | "capacity_campaign"; title: string; detail: string; actionLabel: string; action: RecommendationAction }

export const INACTIVE_LEAD_DAYS = 10;

export function recommendations(db: Database, nowIso: string): Recommendation[] {
  const out: Recommendation[] = [];
  const done = new Set((db.mktRecommendationLog ?? []).map((r) => r.key));
  const facts = leadFacts(db, nowIso);
  const activeCampaigns = (db.mktCampaigns ?? []).filter((c) => c.status === "active" || c.status === "draft");

  // Promote the best-converting service in a location with no campaign on it.
  const yearAgo = addDays(nowIso, -365);
  const combos = groupBy(facts.filter((f) => f.at >= yearAgo && f.service && f.location), (f) => `${f.service}|${f.location}`);
  const best = Array.from(combos.entries()).map(([k, fs]) => ({ k, fs, revenue: sum(fs.map((f) => f.revenue)), won: fs.filter((f) => f.job).length }))
    .filter((x) => x.won >= 1 && !activeCampaigns.some((c) => c.services.includes(x.fs[0].service!) && c.locations.some((l) => l.toLowerCase() === x.fs[0].location!.toLowerCase())))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 2);
  for (const b of best) {
    const [service, location] = b.k.split("|") as [MarketingService, string];
    out.push({
      key: `promote:${b.k}:${nowIso.slice(0, 7)}`, kind: "promote_service", title: `Promote ${SERVICE_LABEL[service].toLowerCase()} in ${location}`,
      detail: `${b.won} of ${b.fs.length} leads there became jobs worth $${b.revenue.toLocaleString("en-US")} in the last year, and no campaign targets it now.`, actionLabel: "Create draft campaign",
      action: { type: "create_campaign", name: `${SERVICE_LABEL[service]} — ${location}`, objective: "leads", services: [service], locations: [location], budget: 500, notes: "Created from a recommendation: best-converting service and location." },
    });
  }

  // Follow up inactive leads.
  for (const l of db.leads ?? []) {
    if (!(l.stage === "new_lead" || l.stage === "contacted")) continue;
    const last = l.lastActivityAt ?? l.createdAt;
    if (daysBetween(last, nowIso) < INACTIVE_LEAD_DAYS) continue;
    const name = (db.customers ?? []).find((c) => c.id === l.customerId)?.name ?? l.name ?? l.id;
    out.push({ key: `followup:${l.id}:${day(last)}`, kind: "follow_up_lead", title: `Follow up ${name}`, detail: `${l.id} has had no activity for ${daysBetween(last, nowIso)} days (stage ${l.stage.replace(/_/g, " ")}).`, actionLabel: "Create follow-up task", action: { type: "follow_up_lead", leadId: l.id } });
    if (out.filter((r) => r.kind === "follow_up_lead").length >= 4) break;
  }

  // Request reviews from satisfied (completed, no complaint) customers.
  const members = new Map(audienceMembers(db, nowIso).filter((m) => m.customerId).map((m) => [m.customerId!, m]));
  for (const j of db.jobs ?? []) {
    const at = jobCompletedAt(j);
    if (!at || daysBetween(at, nowIso) > 90) continue;
    const asked = (db.reviewRequests ?? []).some((r) => r.jobId === j.id) || (db.mktAutomationRuns ?? []).some((r) => r.targetKey === `JOB:${j.id}:review` && r.status !== "failed");
    const reviewed = (db.socialReviews ?? []).some((r) => r.jobId === j.id);
    const m = members.get(j.customerId);
    if (asked || reviewed || !m || (m.optOutEmail && m.optOutSms) || (!m.email && !m.phone)) continue;
    const open = (db.touchUpRequests ?? []).some((t) => (t as { jobId?: string; status?: string }).jobId === j.id && (t as { status?: string }).status !== "closed" && (t as { status?: string }).status !== "done");
    if (open) continue;
    out.push({ key: `review:${j.id}`, kind: "request_review", title: `Ask ${m.name} for a review`, detail: `${j.name} (${j.id}) finished ${day(at)} with no open touch-ups and no review request yet.`, actionLabel: "Send review request", action: { type: "request_review", jobId: j.id, customerId: j.customerId } });
  }

  // Reuse high performers.
  for (const c of db.mktCampaigns ?? []) {
    if (c.status !== "completed" && c.status !== "paused") continue;
    const r = campaignResults(db, c.id, nowIso);
    if (r.roi === undefined || r.roi < 2) continue;
    if ((db.mktCampaigns ?? []).some((x) => x.copiedFrom === c.id && x.status !== "completed")) continue;
    out.push({ key: `reuse:${c.id}`, kind: "reuse_high_performer", title: `Run "${c.name}" again`, detail: `It returned ${Math.round(r.roi * 100)}% ROI: $${r.revenue.toLocaleString("en-US")} from $${r.spend.toLocaleString("en-US")} spend.`, actionLabel: "Copy as draft", action: { type: "copy_campaign", campaignId: c.id } });
  }

  // Adjust ad budgets by cost per lead.
  const ads = (db.socialAds ?? []).filter((a) => (a.status === "active" || a.status === "paused") && a.performance && a.performance.spend > 0);
  const cpl = (a: (typeof ads)[number]) => {
    const leads = Math.max(facts.filter((f) => f.adId === a.id).length, a.performance!.leads);
    return leads ? a.performance!.spend / leads : Infinity;
  };
  const finite = ads.map(cpl).filter(Number.isFinite);
  const avg = finite.length ? sum(finite) / finite.length : 0;
  for (const a of ads) {
    const c = cpl(a);
    if (avg && Number.isFinite(c) && c <= avg * 0.7) {
      const to = Math.round(a.budget.amount * 1.2);
      out.push({ key: `adbudget:${a.id}:${a.budget.amount}`, kind: "adjust_ad_budget", title: `Raise the budget on ${a.name}`, detail: `Cost per lead $${c.toFixed(2)} is well below the $${avg.toFixed(2)} average. Raise ${a.budget.type} budget $${a.budget.amount} → $${to}.`, actionLabel: `Raise to $${to}`, action: { type: "adjust_ad_budget", adId: a.id, from: a.budget.amount, to } });
    } else if (a.performance!.spend >= 100 && (!Number.isFinite(c) || (avg && c >= avg * 1.5))) {
      const to = Math.max(1, Math.round(a.budget.amount * 0.7));
      out.push({ key: `adbudget:${a.id}:${a.budget.amount}`, kind: "adjust_ad_budget", title: `Cut the budget on ${a.name}`, detail: Number.isFinite(c) ? `Cost per lead $${c.toFixed(2)} is far above the $${avg.toFixed(2)} average.` : `$${a.performance!.spend.toFixed(2)} spent with no leads yet.`, actionLabel: `Lower to $${to}`, action: { type: "adjust_ad_budget", adId: a.id, from: a.budget.amount, to } });
    }
  }

  // Fill open crew capacity.
  const cap = crewCapacity(db, nowIso);
  if (cap.crews && cap.open >= 5 && cap.utilisation < 0.7) {
    const bySvc = groupBy(facts.filter((f) => f.job && f.service), (f) => f.service!);
    const top = Array.from(bySvc.entries()).sort((a, b) => sum(b[1].map((f) => f.revenue)) - sum(a[1].map((f) => f.revenue)))[0]?.[0] ?? "interior_repaint";
    const has = activeCampaigns.some((c) => c.objective === "bookings" && c.services.includes(top));
    if (!has) out.push({
      key: `capacity:${day(nowIso)}`, kind: "capacity_campaign", title: `Fill ${cap.open} open crew-days with a ${SERVICE_LABEL[top].toLowerCase()} campaign`,
      detail: `Crews are ${Math.round(cap.utilisation * 100)}% booked over the next ${cap.workingDays} working days (${cap.booked}/${cap.total} crew-days).`, actionLabel: "Create booking campaign",
      action: { type: "create_campaign", name: `Open dates — ${SERVICE_LABEL[top]}`, objective: "bookings", services: [top], locations: [], budget: 300, notes: `Created from a recommendation: ${cap.open} open crew-days in the next ${cap.workingDays} working days.` },
    });
  }
  return out.filter((r) => !done.has(r.key));
}

/* ------------------------------------------------------------------ */
/* Dashboard summary (item 26)                                         */
/* ------------------------------------------------------------------ */

export function dashboardSummary(db: Database, nowIso: string, days = 30) {
  const from = day(addDays(nowIso, -days));
  const r: Range = { from };
  const facts = leadFacts(db, nowIso).filter((f) => within(f.at, from));
  const spend = round2(sum(spendFacts(db).filter((s) => within(s.at, from)).map((s) => s.amount)));
  const revenue = sum(facts.map((f) => f.revenue));
  const won = facts.filter((f) => f.newCustomer).length;
  const snaps = latestSnapshots(db).filter((s) => within(s.at, from));
  return {
    from,
    leads: facts.length,
    appointments: facts.filter((f) => f.appointment).length,
    jobs: facts.filter((f) => f.job).length,
    revenue,
    spend,
    cac: cac(spend, won),
    roi: roi(revenue, spend),
    impressions: sum(snaps.map((s) => s.metrics.impressions)) + sum((db.socialAds ?? []).filter((a) => a.performance && within(a.performance.at, from)).map((a) => a.performance!.impressions)),
    engagement: sum(snaps.map((s) => engagementOf(s.metrics))),
    clicks: sum((db.mktLinks ?? []).map((l) => l.clicks.filter((c) => within(c.at, from)).length)),
    activeCampaigns: (db.mktCampaigns ?? []).filter((c) => c.status === "active").length,
    openAppointmentRequests: (db.mktAppointmentRequests ?? []).filter((a) => a.status === "requested").length,
    bySource: leadsBySourceReport(db, nowIso, r),
    rewardsDue: referralRewardsDue(db).length,
  };
}

/* ------------------------------------------------------------------ */

export function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}

export function tableToCsv(t: ReportTable): (string | number)[][] {
  return [t.columns, ...t.rows];
}
