/**
 * Feature 34 part 2 (patent §34): campaigns and growth.
 *
 * Campaigns are the spine: leads, posts, spend, tracked links, offers and
 * email/SMS campaigns attach to one, and campaignResults() (rules) turns them
 * into leads, estimates, jobs won, revenue, spend, CAC and ROI.
 *
 * Also here: promotions and referral codes, reviews and testimonials, review
 * requests, audience segments and email/SMS campaigns. Every message is
 * sandbox: it is written to the send log and the communication history and
 * no email or SMS provider is called. Recording a reward or an expense never
 * moves money.
 */
import type { Database, SocialPlatform, User } from "@/features/types";
import type {
  AudienceSegment, CampaignObjective, CampaignStatus, CommEntry, ExpenseCategory, LeadAttributionRecord, MarketingCampaign, MarketingChannel, MarketingExpense, MarketingService,
  MessageCampaign, PromotionKind, Promotion, ReferralCode, SegmentRules, SendLogEntry, TrackLink, UtmParams,
} from "@/features/types/marketing-growth";
import type { SocialReview } from "@/features/types/marketing-social";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId } from "@/features/lib/selectors";
import { findStreetAddress } from "@/features/lib/rules/marketing";
import {
  audienceMembers, CAMPAIGN_STATUS_LABEL, campaignRecipients, campaignSpend, CODE_RE, day, fillTemplate, firstName, leadAttribution, normCode, referralQualified, slugify,
  validateCampaignInput, validateExpense, validatePromotionInput, validTarget,
} from "@/features/lib/rules/marketing-growth";
import { displayNameOf, PLATFORM_LABEL, reviewRequestBlocker, reviewRequestBody, validateReply } from "@/features/lib/rules/marketing-social";
import { denied, fail, log, nextId, ok } from "../helpers";

const MODULE = "Marketing";
const BUSINESS = "Estimate Master Painting";
const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Which field a rules message belongs to, so the screen can show it next to the input. */
function fieldOf(message: string, map: [RegExp, string][]): string | undefined {
  return map.find(([re]) => re.test(message))?.[1];
}

/* ================================ Campaigns ================================ */

export interface CampaignDraft {
  id?: string;
  name: string;
  objective: CampaignObjective;
  services: MarketingService[];
  locations: string[];
  channels: MarketingChannel[];
  budget: number;
  startDate: string;
  endDate?: string;
  segmentId?: string;
  notes?: string;
}

/** The status moves a campaign can make. Completed is final. */
export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["active"],
  active: ["paused", "completed"],
  paused: ["active", "completed"],
  completed: [],
};

export function saveCampaign(db: Database, actor: User, d: CampaignDraft) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, d.id ? "edit a campaign" : "create a campaign", whoCan("marketing.post"));
  const err = validateCampaignInput({ name: d.name, budget: d.budget, startDate: d.startDate, endDate: d.endDate || undefined });
  if (err) return fail(err, fieldOf(err, [[/end date/i, "endDate"], [/name/i, "name"], [/budget/i, "budget"], [/start date/i, "startDate"]]));
  if (d.segmentId && !byId(db.mktSegments ?? [], d.segmentId)) return fail("That audience segment no longer exists.", "segmentId");
  db.mktCampaigns ??= [];
  const clean = {
    name: d.name.trim(), objective: d.objective, services: d.services, locations: d.locations.map((l) => l.trim()).filter(Boolean), channels: d.channels,
    budget: round2(d.budget), startDate: d.startDate, endDate: d.endDate || undefined, segmentId: d.segmentId || undefined, notes: d.notes?.trim() || undefined,
  };
  if (d.id) {
    const c = byId(db.mktCampaigns, d.id);
    if (!c) return fail("Campaign not found.");
    if (c.status === "completed") return fail("A completed campaign can't be edited.");
    if (c.budget !== clean.budget) (c.budgetHistory ??= []).push({ at: now(), by: actor.id, from: c.budget, to: clean.budget, reason: "Edited by hand" });
    Object.assign(c, clean, { updatedAt: now() });
    log(db, actor, MODULE, `Marketing: Campaign ${c.id} (${c.name}) updated by ${actor.name}. Budget ${money(c.budget)}, ${c.startDate} to ${c.endDate ?? "open"}.`);
    return ok(c.id);
  }
  const id = nextId(db, "mktcmp", "CMP-");
  db.mktCampaigns.unshift({
    id, ...clean, status: "draft", offerIds: [], postIds: [], adIds: [], messageCampaignIds: [], landingPageIds: [], createdBy: actor.id, createdAt: now(),
  });
  log(db, actor, MODULE, `Marketing: Campaign ${id} (${clean.name}) created as a draft by ${actor.name}. Budget ${money(clean.budget)}.`);
  return ok(id);
}

export function setCampaignStatus(db: Database, actor: User, id: string, status: CampaignStatus) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "change a campaign's status", whoCan("marketing.post"));
  const c = byId(db.mktCampaigns ?? [], id);
  if (!c) return fail("Campaign not found.");
  if (!CAMPAIGN_TRANSITIONS[c.status].includes(status)) return fail(`A ${CAMPAIGN_STATUS_LABEL[c.status].toLowerCase()} campaign can't be set to ${CAMPAIGN_STATUS_LABEL[status].toLowerCase()}.`);
  const from = c.status;
  c.status = status;
  c.updatedAt = now();
  const today = day(now());
  if (status === "completed" && (!c.endDate || c.endDate > today)) c.endDate = today < c.startDate ? c.startDate : today;
  log(db, actor, MODULE, `Marketing: Campaign ${c.id} (${c.name}) moved from ${CAMPAIGN_STATUS_LABEL[from]} to ${CAMPAIGN_STATUS_LABEL[status]} by ${actor.name}.`);
  return ok({ from, to: status });
}

/** Attaches a lead to a campaign (its attribution record); a lead belongs to one campaign at a time. */
export function attachLeadToCampaign(db: Database, actor: User, campaignId: string, leadId: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "attach a lead to a campaign", whoCan("marketing.post"));
  const c = byId(db.mktCampaigns ?? [], campaignId);
  const lead = byId(db.leads, leadId);
  if (!c) return fail("Campaign not found.");
  if (!lead) return fail("Choose a lead.", "leadId");
  db.mktAttributions ??= [];
  const rec = db.mktAttributions.find((a) => a.leadId === leadId);
  const before = leadAttribution(db, lead);
  if (before.campaignId === campaignId) return fail(`${leadId} is already on this campaign.`, "leadId");
  const previous = before.campaignId ? byId(db.mktCampaigns ?? [], before.campaignId)?.name : undefined;
  if (rec) rec.campaignId = campaignId;
  else {
    const fresh: LeadAttributionRecord = { leadId, channel: before.channel === "direct" ? "other" : before.channel, campaignId, at: now() };
    db.mktAttributions.push(fresh);
  }
  log(db, actor, MODULE, `Marketing: Lead ${leadId} attached to campaign ${c.id} (${c.name}) by ${actor.name}${previous ? `; moved from ${previous}` : ""}.`);
  return ok({ previous });
}

export function detachLeadFromCampaign(db: Database, actor: User, campaignId: string, leadId: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "remove a lead from a campaign", whoCan("marketing.post"));
  const rec = (db.mktAttributions ?? []).find((a) => a.leadId === leadId && a.campaignId === campaignId);
  if (!rec) return fail("This lead's campaign comes from its source (a link, form or message), so it can't be removed here.");
  rec.campaignId = undefined;
  log(db, actor, MODULE, `Marketing: Lead ${leadId} removed from campaign ${campaignId} by ${actor.name}.`);
  return ok();
}

/** Attaches or detaches a social post. */
export function setCampaignPost(db: Database, actor: User, campaignId: string, postId: string, attached: boolean) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "link a post to a campaign", whoCan("marketing.post"));
  const c = byId(db.mktCampaigns ?? [], campaignId);
  const post = byId(db.marketingPosts, postId);
  if (!c) return fail("Campaign not found.");
  if (!post) return fail("Choose a post.", "postId");
  if (attached) {
    if (c.postIds.includes(postId) || post.tags?.campaignId === campaignId) return fail(`${postId} is already on this campaign.`, "postId");
    c.postIds.push(postId);
    post.tags = { ...post.tags, campaignId };
  } else {
    c.postIds = c.postIds.filter((p) => p !== postId);
    if (post.tags?.campaignId === campaignId) post.tags = { ...post.tags, campaignId: undefined };
  }
  log(db, actor, MODULE, `Marketing: Post ${postId} ${attached ? "linked to" : "removed from"} campaign ${c.id} (${c.name}) by ${actor.name}.`);
  return ok();
}

/* ============================== Marketing spend ============================= */

export interface ExpenseDraft {
  date: string;
  category: ExpenseCategory;
  vendor: string;
  description: string;
  amount: number;
  campaignId?: string;
  platform?: MarketingChannel;
  service?: MarketingService;
  location?: string;
}

export function logMarketingExpense(db: Database, actor: User, d: ExpenseDraft) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "log a marketing expense", whoCan("marketing.post"));
  const err = validateExpense(d);
  if (err) return fail(err, fieldOf(err, [[/date/i, "date"], [/vendor/i, "vendor"], [/amount/i, "amount"], [/describe/i, "description"]]));
  const c = d.campaignId ? byId(db.mktCampaigns ?? [], d.campaignId) : undefined;
  if (d.campaignId && !c) return fail("That campaign no longer exists.", "campaignId");
  const e: MarketingExpense = {
    id: nextId(db, "mktmex", "MEX-"), date: d.date, category: d.category, vendor: d.vendor.trim(), description: d.description.trim(), amount: round2(d.amount),
    campaignId: c?.id, platform: d.platform || undefined, service: d.service || undefined, location: d.location?.trim() || undefined, createdBy: actor.id, createdAt: now(),
  };
  (db.mktExpenses ??= []).unshift(e);
  const spent = c ? campaignSpend(db, c.id) : 0;
  const overBudget = !!c && c.budget > 0 && spent > c.budget;
  log(db, actor, MODULE, `Marketing: Expense ${e.id} of ${money(e.amount)} to ${e.vendor} (${e.description}) logged by ${actor.name}${c ? ` against campaign ${c.id}. Campaign spend now ${money(spent)} of ${money(c.budget)}` : ""}.`);
  return ok({ id: e.id, spent, overBudget });
}

export function deleteMarketingExpense(db: Database, actor: User, id: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "delete a marketing expense", whoCan("marketing.post"));
  const e = byId(db.mktExpenses ?? [], id);
  if (!e) return fail("Expense not found.");
  if (e.financeExpenseId) return fail(`This expense is also finance record ${e.financeExpenseId}. Correct it in Accounting.`);
  db.mktExpenses = db.mktExpenses!.filter((x) => x.id !== id);
  log(db, actor, MODULE, `Marketing: Expense ${id} of ${money(e.amount)} to ${e.vendor} deleted by ${actor.name}.`);
  return ok();
}

/* ============================= Tracked links / QR ============================ */

export interface LinkDraft {
  name: string;
  target: string;
  kind: "link" | "qr";
  code?: string;
  campaignId?: string;
  promotionId?: string;
  platform?: MarketingChannel;
  utm?: Partial<UtmParams>;
}

const SOCIAL_CHANNELS: MarketingChannel[] = ["facebook", "instagram", "nextdoor", "google"];

/** Default UTM tags for a link: source is the platform, medium the kind of placement. */
export function defaultUtm(db: Database, d: Pick<LinkDraft, "kind" | "platform" | "campaignId">): UtmParams {
  const c = d.campaignId ? byId(db.mktCampaigns ?? [], d.campaignId) : undefined;
  const source = d.platform ?? (d.kind === "qr" ? "qr" : "direct");
  const medium = d.kind === "qr" ? (d.platform === "print" ? "print" : "qr") : d.platform === "email" ? "email" : d.platform === "sms" ? "sms" : d.platform && SOCIAL_CHANNELS.includes(d.platform) ? "social" : "referral";
  return { source, medium, campaign: c ? slugify(c.name) : "general" };
}

function uniqueLinkCode(db: Database, base: string) {
  const stem = normCode(base).replace(/[^A-Z0-9-]/g, "").slice(0, 18) || "LINK";
  const taken = new Set((db.mktLinks ?? []).map((l) => l.code));
  let code = stem.length >= 3 ? stem : `${stem}-LNK`;
  for (let n = 2; taken.has(code); n++) code = `${stem.slice(0, 20)}-${n}`;
  return code;
}

export function createTrackLink(db: Database, actor: User, d: LinkDraft) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "create a tracked link", whoCan("marketing.post"));
  if (!d.name.trim()) return fail("Name the link (where it will be used).", "name");
  const target = d.target.trim();
  if (!validTarget(target)) return fail("Enter a web address starting with https:// or an app path such as /website-form.", "target");
  const c = d.campaignId ? byId(db.mktCampaigns ?? [], d.campaignId) : undefined;
  if (d.campaignId && !c) return fail("That campaign no longer exists.", "campaignId");
  let code: string;
  if (d.code?.trim()) {
    code = normCode(d.code);
    if (!CODE_RE.test(code)) return fail("Short codes are 3–24 letters, numbers or dashes.", "code");
    if ((db.mktLinks ?? []).some((l) => l.code === code)) return fail(`/r/${code} is already used by another link.`, "code");
  } else code = uniqueLinkCode(db, `${c ? slugify(c.name).split("-").slice(0, 2).join("-") : "LINK"}-${d.kind === "qr" ? "QR" : d.platform ?? "WEB"}`);
  const utm = { ...defaultUtm(db, d), ...Object.fromEntries(Object.entries(d.utm ?? {}).filter(([, v]) => !!v?.trim())) } as UtmParams;
  const link: TrackLink = {
    id: nextId(db, "mktlnk", "LNK-"), code, name: d.name.trim(), target, utm, campaignId: c?.id, promotionId: d.promotionId || undefined, platform: d.platform || undefined,
    kind: d.kind, active: true, clicks: [], createdBy: actor.id, createdAt: now(),
  };
  (db.mktLinks ??= []).unshift(link);
  log(db, actor, MODULE, `Marketing: Tracked ${d.kind === "qr" ? "QR code" : "link"} ${link.id} (/r/${code}) created by ${actor.name}${c ? ` for campaign ${c.id}` : ""}, pointing to ${target}.`);
  return ok({ id: link.id, code });
}

export function setLinkActive(db: Database, actor: User, id: string, active: boolean) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, active ? "turn a tracked link on" : "turn a tracked link off", whoCan("marketing.post"));
  const l = byId(db.mktLinks ?? [], id);
  if (!l) return fail("Link not found.");
  l.active = active;
  log(db, actor, MODULE, `Marketing: Tracked link /r/${l.code} turned ${active ? "on" : "off"} by ${actor.name}.`);
  return ok();
}

/** A visitor opened /r/{code}. System action: no staff actor. Returns where to send them. */
export function recordLinkClick(db: Database, code: string, via: "link" | "qr", device: "mobile" | "tablet" | "desktop", clickId: string, referrer?: string) {
  const l = (db.mktLinks ?? []).find((x) => x.code === normCode(code));
  if (!l) return fail("This link doesn't exist.");
  if (!l.active) return fail("This link has been turned off.");
  if (!l.clicks.some((k) => k.id === clickId)) l.clicks.push({ id: clickId, at: now(), device, via, referrer });
  return ok({ target: l.target, utm: l.utm });
}

/* ========================== Promotions and referrals ========================= */

export interface PromotionDraft {
  id?: string;
  name: string;
  kind: PromotionKind;
  code: string;
  description?: string;
  discountType: "percent" | "amount";
  value: number;
  validFrom: string;
  validTo?: string;
  maxRedemptions?: number;
  perCustomerLimit?: number;
  minSpend?: number;
  services?: MarketingService[];
  campaignId?: string;
  referralReward?: Promotion["referralReward"];
}

export function savePromotion(db: Database, actor: User, d: PromotionDraft) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, d.id ? "edit a promotion" : "create a promotion", whoCan("marketing.post"));
  const input = { ...d, validTo: d.validTo || undefined, referralReward: d.kind === "referral" ? d.referralReward : undefined };
  const err = validatePromotionInput(db, input, d.id);
  if (err) {
    return fail(err, fieldOf(err, [[/end date/i, "validTo"], [/starts/i, "validFrom"], [/Name the/i, "name"], [/redemption limit/i, "maxRedemptions"], [/per-customer/i, "perCustomerLimit"], [/[Rr]eward/, "referralReward"], [/discount|percentage/i, "value"], [/[Cc]ode/, "code"]]));
  }
  if (d.minSpend !== undefined && !(d.minSpend >= 0)) return fail("The minimum job value can't be negative.", "minSpend");
  const c = d.campaignId ? byId(db.mktCampaigns ?? [], d.campaignId) : undefined;
  if (d.campaignId && !c) return fail("That campaign no longer exists.", "campaignId");
  db.mktPromotions ??= [];
  const clean = {
    name: d.name.trim(), kind: d.kind, code: normCode(d.code), description: d.description?.trim() || undefined, discountType: d.discountType, value: round2(d.value),
    validFrom: d.validFrom, validTo: d.validTo || undefined, maxRedemptions: d.maxRedemptions, perCustomerLimit: d.perCustomerLimit, minSpend: d.minSpend,
    services: d.services?.length ? d.services : undefined, campaignId: c?.id, referralReward: input.referralReward,
  };
  let id = d.id;
  if (id) {
    const p = byId(db.mktPromotions, id);
    if (!p) return fail("Promotion not found.");
    if (p.redemptions.length && p.code !== clean.code) return fail(`${p.code} has been redeemed ${p.redemptions.length} time${p.redemptions.length === 1 ? "" : "s"}, so its code can't change.`, "code");
    const oldCampaign = p.campaignId;
    Object.assign(p, clean);
    if (oldCampaign && oldCampaign !== c?.id) { const oc = byId(db.mktCampaigns ?? [], oldCampaign); if (oc) oc.offerIds = oc.offerIds.filter((x) => x !== p.id); }
  } else {
    id = nextId(db, "mktpromo", "PROMO-");
    db.mktPromotions.unshift({ id, ...clean, active: true, redemptions: [], createdBy: actor.id, createdAt: now() });
  }
  if (c && !c.offerIds.includes(id)) c.offerIds.push(id);
  log(db, actor, MODULE, `Marketing: Promotion ${id} (${clean.code}, ${clean.name}) ${d.id ? "updated" : "created"} by ${actor.name}${c ? ` for campaign ${c.id}` : ""}.`);
  return ok(id);
}

export function setPromotionActive(db: Database, actor: User, id: string, active: boolean) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, active ? "resume a promotion" : "pause a promotion", whoCan("marketing.post"));
  const p = byId(db.mktPromotions ?? [], id);
  if (!p) return fail("Promotion not found.");
  if (p.active === active) return fail(`${p.code} is already ${active ? "active" : "paused"}.`);
  p.active = active;
  log(db, actor, MODULE, `Marketing: Promotion ${p.code} ${active ? "resumed" : "paused"} by ${actor.name}.`);
  return ok();
}

export function createReferralCode(db: Database, actor: User, d: { promotionId: string; referrerCustomerId?: string; referrerName: string; code?: string }) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "create a referral code", whoCan("marketing.post"));
  const p = byId(db.mktPromotions ?? [], d.promotionId);
  if (!p || p.kind !== "referral") return fail("Choose a referral programme.", "promotionId");
  const cust = d.referrerCustomerId ? byId(db.customers, d.referrerCustomerId) : undefined;
  const name = (d.referrerName || cust?.name || "").trim();
  if (!name) return fail("Enter who is referring (a customer or partner).", "referrerName");
  if (cust && (db.mktReferralCodes ?? []).some((r) => r.promotionId === p.id && r.referrerCustomerId === cust.id)) return fail(`${cust.name} already has a code in this programme.`, "referrerCustomerId");
  const taken = (c: string) => (db.mktReferralCodes ?? []).some((r) => r.code === c) || (db.mktPromotions ?? []).some((x) => x.code === c);
  let code = normCode(d.code);
  if (code) {
    if (!CODE_RE.test(code)) return fail("Codes are 3–24 letters, numbers or dashes.", "code");
    if (taken(code)) return fail(`Code ${code} is already in use.`, "code");
  } else {
    const stem = (firstName(name).toUpperCase().replace(/[^A-Z0-9]/g, "") || "FRIEND").slice(0, 12);
    const amount = p.referralReward?.refereeReward ?? p.value;
    code = `${stem}${Math.round(amount)}`;
    for (let n = 2; taken(code) || !CODE_RE.test(code); n++) code = `${stem}${Math.round(amount)}-${n}`;
  }
  const r: ReferralCode = { id: nextId(db, "mktref", "REF-"), code, promotionId: p.id, referrerCustomerId: cust?.id, referrerName: name, createdAt: now(), createdBy: actor.id, referrals: [] };
  (db.mktReferralCodes ??= []).push(r);
  log(db, actor, MODULE, `Marketing: Referral code ${code} created for ${name} under ${p.name} by ${actor.name}.`);
  return ok({ id: r.id, code });
}

/** Records that a lead came from a referrer's code. */
export function recordReferral(db: Database, actor: User, codeId: string, leadId: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "record a referral", whoCan("marketing.post"));
  const r = byId(db.mktReferralCodes ?? [], codeId);
  const lead = byId(db.leads, leadId);
  if (!r) return fail("Referral code not found.");
  if (!lead) return fail("Choose the referred lead.", "leadId");
  if (r.referrerCustomerId && lead.customerId === r.referrerCustomerId) return fail("A referrer can't refer themselves.", "leadId");
  const other = (db.mktReferralCodes ?? []).find((x) => x.referrals.some((y) => y.leadId === leadId));
  if (other) return fail(`${leadId} is already credited to ${other.referrerName} (${other.code}).`, "leadId");
  r.referrals.push({ leadId, customerId: lead.customerId, at: now(), status: "pending" });
  db.mktAttributions ??= [];
  const rec = db.mktAttributions.find((a) => a.leadId === leadId);
  const p = byId(db.mktPromotions ?? [], r.promotionId);
  if (rec) Object.assign(rec, { channel: "referral", referralCodeId: r.id, referralCode: r.code });
  else db.mktAttributions.push({ leadId, channel: "referral", referralCodeId: r.id, referralCode: r.code, campaignId: p?.campaignId, promotionId: p?.id, at: now() });
  log(db, actor, MODULE, `Marketing: Lead ${leadId} recorded as referred by ${r.referrerName} (${r.code}) by ${actor.name}.`);
  return ok();
}

/** Records the referrer's reward as given. Nothing is paid from here. */
export function markReferralRewarded(db: Database, actor: User, codeId: string, leadId: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "record a referral reward", whoCan("marketing.post"));
  const r = byId(db.mktReferralCodes ?? [], codeId);
  const rec = r?.referrals.find((x) => x.leadId === leadId);
  const p = r && byId(db.mktPromotions ?? [], r.promotionId);
  if (!r || !rec || !p?.referralReward) return fail("Referral not found.");
  if (rec.status === "rewarded") return fail("This reward was already given.");
  const q = referralQualified(db, rec, p);
  if (rec.status !== "qualified" && !q.qualified) return fail(`Not qualified yet: the referred customer's ${p.referralReward.qualifyOn === "estimate_accepted" ? "estimate must be accepted" : "job must be completed"} first.`);
  Object.assign(rec, { status: "rewarded", qualifiedAt: rec.qualifiedAt ?? q.at ?? now(), rewardAmount: p.referralReward.referrerReward, rewardedAt: now(), rewardedBy: actor.id });
  log(db, actor, MODULE, `Marketing: Referral reward of ${money(p.referralReward.referrerReward)} (${p.referralReward.rewardType.replace("_", " ")}) for ${r.referrerName}, lead ${leadId}, recorded as given by ${actor.name}.`);
  return ok();
}

/* ========================== Reviews and testimonials ========================= */

export interface ReviewDraft { platform: SocialPlatform; author: string; rating: number; text: string; at?: string; customerId?: string; jobId?: string }

export function recordReview(db: Database, actor: User, d: ReviewDraft) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "record a review", whoCan("marketing.post"));
  if (!d.author.trim()) return fail("Enter the reviewer's name as it shows on the review.", "author");
  if (!(Number.isInteger(d.rating) && d.rating >= 1 && d.rating <= 5)) return fail("Choose a rating from 1 to 5 stars.", "rating");
  if (d.text.length > 5000) return fail("That review is too long.", "text");
  const id = nextId(db, "mktrev", "SREV-");
  const r: SocialReview = {
    id, platform: d.platform, externalId: `MANUAL-${id}`, author: d.author.trim(), rating: d.rating, text: d.text.trim(), at: d.at ? new Date(`${d.at.slice(0, 10)}T12:00:00`).toISOString() : now(),
    sandbox: false, customerId: d.customerId || undefined, jobId: d.jobId || undefined,
  };
  (db.socialReviews ??= []).unshift(r);
  log(db, actor, MODULE, `Marketing: ${d.rating}-star ${PLATFORM_LABEL[d.platform]} review from ${r.author} recorded by ${actor.name}.`);
  return ok(id);
}

/** Records the public response. Sandbox: no platform connection posts it. */
export function respondToReview(db: Database, actor: User, id: string, text: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "respond to a review", whoCan("marketing.post"));
  const r = byId(db.socialReviews ?? [], id);
  if (!r) return fail("Review not found.");
  if (r.response?.status === "sent") return fail("This review already has a response.");
  const err = validateReply(r.platform, text);
  if (err) return fail(err, "response");
  r.response = { text: text.trim(), by: actor.id, at: now(), status: "sent", externalRef: `SBX-RESP-${r.id}` };
  log(db, actor, MODULE, `Marketing: Response to ${r.author}'s ${PLATFORM_LABEL[r.platform]} review recorded by ${actor.name} (sandbox — not posted to the platform).`);
  return ok();
}

/** Approves (owner) a review as a public testimonial, attributed by first name and initial. */
export function setTestimonial(db: Database, actor: User, id: string, decision: "approved" | "rejected", quote?: string) {
  if (!can(actor, "marketing.approve")) return denied(db, actor, MODULE, "approve a testimonial", whoCan("marketing.approve"));
  const r = byId(db.socialReviews ?? [], id);
  if (!r) return fail("Review not found.");
  const q = (quote ?? r.text).trim();
  if (decision === "approved") {
    if (!q) return fail("Enter the quote to use.", "quote");
    const street = findStreetAddress(q);
    if (street) return fail(`Remove the street address ("${street}") from the quote.`, "quote");
  }
  r.testimonial = { status: decision, by: actor.id, at: now(), displayName: displayNameOf(r.author), quote: q };
  log(db, actor, MODULE, `Marketing: ${r.author}'s review ${decision === "approved" ? `approved as a testimonial (shown as "${r.testimonial.displayName}")` : "not used as a testimonial"} by ${actor.name}.`);
  return ok();
}

/** Sends a review request (sandbox) once per customer per 90 days. */
export function requestReview(db: Database, actor: User, d: { customerId: string; jobId?: string; channel: "email" | "sms"; platform: SocialPlatform }) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "request a review", whoCan("marketing.post"));
  const customer = byId(db.customers, d.customerId);
  if (!customer) return fail("Choose a customer.", "customerId");
  const member = audienceMembers(db, now()).find((m) => m.customerId === customer.id);
  const last = (db.reviewRequests ?? []).filter((x) => x.customerId === customer.id && x.status !== "failed").map((x) => x.at).sort().pop();
  const block = reviewRequestBlocker({ customer, channel: d.channel, optedOut: d.channel === "email" ? member?.optOutEmail : member?.optOutSms, lastRequestAt: last, nowIso: now() });
  if (block) return fail(block, "customerId");
  const link = `https://reviews.example.com/${d.platform}/estimate-master`;
  const body = reviewRequestBody(firstName(customer.name), BUSINESS, link, d.platform);
  const id = nextId(db, "mktrvrq", "RVRQ-");
  const to = (d.channel === "email" ? customer.email : customer.phone)!;
  (db.reviewRequests ??= []).unshift({ id, customerId: customer.id, jobId: d.jobId || undefined, channel: d.channel, to, platform: d.platform, link, body, by: actor.id, at: now(), status: "sent", messageRef: `SBX-${id}` });
  comm(db, { customerId: customer.id, channel: d.channel, direction: "outbound", subject: d.channel === "email" ? `How did we do, ${firstName(customer.name)}?` : undefined, body, status: "sandbox" });
  log(db, actor, MODULE, `Marketing: Review request ${id} for ${PLATFORM_LABEL[d.platform]} sent to ${customer.name} by ${d.channel} (${to}) by ${actor.name}. Sandbox: no provider called.`);
  return ok({ id, to });
}

function comm(db: Database, e: Omit<CommEntry, "id" | "at">) {
  (db.mktCommunications ??= []).unshift({ id: nextId(db, "mktcom", "COM-"), at: now(), ...e });
}

/* ========================= Segments and message campaigns ==================== */

export function saveSegment(db: Database, actor: User, d: { id?: string; name: string; description?: string; rules: SegmentRules }) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "save an audience segment", whoCan("marketing.post"));
  if (!d.name.trim()) return fail("Name the segment.", "name");
  if ((db.mktSegments ?? []).some((s) => s.name.trim().toLowerCase() === d.name.trim().toLowerCase() && s.id !== d.id)) return fail(`A segment called "${d.name.trim()}" already exists.`, "name");
  const bad = (n?: number) => n !== undefined && !(Number.isInteger(n) && n >= 0);
  if (bad(d.rules.minJobs) || bad(d.rules.maxJobs) || bad(d.rules.lastJobOlderThanDays)) return fail("Job counts and days are whole numbers of zero or more.", "rules");
  if (d.rules.minJobs !== undefined && d.rules.maxJobs !== undefined && d.rules.minJobs > d.rules.maxJobs) return fail("The minimum number of jobs is above the maximum.", "rules");
  db.mktSegments ??= [];
  const clean = { name: d.name.trim(), description: d.description?.trim() || undefined, rules: d.rules };
  if (d.id) {
    const s = byId(db.mktSegments, d.id);
    if (!s) return fail("Segment not found.");
    Object.assign(s, clean);
    log(db, actor, MODULE, `Marketing: Segment ${s.id} (${s.name}) updated by ${actor.name}.`);
    return ok(s.id);
  }
  const seg: AudienceSegment = { id: nextId(db, "mktseg", "SEG-"), ...clean, createdBy: actor.id, createdAt: now() };
  db.mktSegments.push(seg);
  log(db, actor, MODULE, `Marketing: Segment ${seg.id} (${seg.name}) created by ${actor.name}.`);
  return ok(seg.id);
}

export interface MessageDraft { id?: string; name: string; channel: "email" | "sms"; segmentId: string; campaignId?: string; subject?: string; body: string; promotionId?: string }

export const SMS_MAX = 480;

export function saveMessageCampaign(db: Database, actor: User, d: MessageDraft) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "draft an email or SMS campaign", whoCan("marketing.post"));
  if (!d.name.trim()) return fail("Name the message.", "name");
  if (!byId(db.mktSegments ?? [], d.segmentId)) return fail("Choose who it goes to (an audience segment).", "segmentId");
  if (d.channel === "email" && !d.subject?.trim()) return fail("Write a subject line.", "subject");
  if (!d.body.trim()) return fail("Write the message.", "body");
  if (d.channel === "sms" && d.body.length > SMS_MAX) return fail(`SMS messages are limited to ${SMS_MAX} characters (${d.body.length} now).`, "body");
  if (d.channel === "sms" && !/\bstop\b/i.test(d.body)) return fail('SMS messages must say how to opt out, e.g. "Reply STOP to opt out."', "body");
  const street = findStreetAddress(d.body);
  if (street) return fail(`Remove the street address ("${street}") from the message.`, "body");
  const c = d.campaignId ? byId(db.mktCampaigns ?? [], d.campaignId) : undefined;
  if (d.campaignId && !c) return fail("That campaign no longer exists.", "campaignId");
  if (d.promotionId && !byId(db.mktPromotions ?? [], d.promotionId)) return fail("That promotion no longer exists.", "promotionId");
  db.mktMessageCampaigns ??= [];
  const clean = { name: d.name.trim(), channel: d.channel, segmentId: d.segmentId, campaignId: c?.id, subject: d.channel === "email" ? d.subject!.trim() : undefined, body: d.body.trim(), promotionId: d.promotionId || undefined };
  let id = d.id;
  if (id) {
    const m = byId(db.mktMessageCampaigns, id);
    if (!m) return fail("Message not found.");
    if (m.status === "sent") return fail("A sent message can't be edited. Copy it into a new one instead.");
    if (m.campaignId && m.campaignId !== c?.id) { const oc = byId(db.mktCampaigns ?? [], m.campaignId); if (oc) oc.messageCampaignIds = oc.messageCampaignIds.filter((x) => x !== id); }
    Object.assign(m, clean);
  } else {
    id = nextId(db, "mktmsg", "MSG-");
    const m: MessageCampaign = { id, ...clean, status: "draft", sends: [], createdBy: actor.id, createdAt: now() };
    db.mktMessageCampaigns.unshift(m);
  }
  if (c && !c.messageCampaignIds.includes(id)) c.messageCampaignIds.push(id);
  log(db, actor, MODULE, `Marketing: ${d.channel === "email" ? "Email" : "SMS"} campaign ${id} (${clean.name}) ${d.id ? "updated" : "drafted"} by ${actor.name}.`);
  return ok(id);
}

/** What a message says for one recipient. */
export function personalise(db: Database, m: Pick<MessageCampaign, "body" | "subject" | "promotionId">, name: string) {
  const code = m.promotionId ? byId(db.mktPromotions ?? [], m.promotionId)?.code : undefined;
  const vars = { first_name: firstName(name), name, code };
  return { body: fillTemplate(m.body, vars), subject: m.subject ? fillTemplate(m.subject, vars) : undefined };
}

/**
 * Sends to everyone in the segment who can receive it (owner only). Opted-out
 * and unreachable members are logged as skipped. Sandbox: no provider is
 * called; each message is recorded in the send log. It can't be undone.
 */
export function sendMessageCampaign(db: Database, actor: User, id: string) {
  if (!can(actor, "marketing.approve")) return denied(db, actor, MODULE, "send an email or SMS campaign", whoCan("marketing.approve"));
  const m = byId(db.mktMessageCampaigns ?? [], id);
  if (!m) return fail("Message not found.");
  if (m.status === "sent") return fail("This message was already sent.");
  const { send, skipped } = campaignRecipients(db, m, now());
  if (!send.length) return fail("Nobody in this segment can receive it (no address, or opted out).");
  const at = now();
  const sends: SendLogEntry[] = [];
  send.forEach((r, i) => {
    const p = personalise(db, m, r.member.name);
    const messageId = `SBX-${m.id}-${i + 1}`;
    sends.push({ memberKey: r.member.key, name: r.member.name, to: r.to, status: "sandbox", messageId, at });
    comm(db, { customerId: r.member.customerId, contactId: r.member.contactId, channel: m.channel, direction: "outbound", subject: p.subject, body: p.body, campaignId: m.campaignId, messageCampaignId: m.id, status: "sandbox" });
  });
  for (const s of skipped) sends.push({ memberKey: s.member.key, name: s.member.name, status: s.status, at });
  Object.assign(m, { status: "sent", sentAt: at, sentBy: actor.id, sends });
  log(db, actor, MODULE, `Marketing: ${m.channel === "email" ? "Email" : "SMS"} campaign ${m.id} (${m.name}) sent by ${actor.name} to ${send.length} recipient${send.length === 1 ? "" : "s"}; ${skipped.length} skipped. Sandbox: no provider called.`);
  return ok({ sent: send.length, skipped: skipped.length });
}

/* ================================== Helpers ================================= */

/** Leads, posts, expenses, links and offers attached to a campaign, for its detail view. */
export function campaignAttachments(db: Database, c: MarketingCampaign) {
  const leads = db.leads.filter((l) => leadAttribution(db, l).campaignId === c.id);
  const manual = new Set((db.mktAttributions ?? []).filter((a) => a.campaignId === c.id).map((a) => a.leadId));
  const postIds = new Set([...c.postIds, ...db.marketingPosts.filter((p) => p.tags?.campaignId === c.id).map((p) => p.id)]);
  return {
    leads,
    /** Leads attached by hand (their campaign can be removed here). */
    manual,
    posts: db.marketingPosts.filter((p) => postIds.has(p.id)),
    expenses: (db.mktExpenses ?? []).filter((e) => e.campaignId === c.id).sort((a, b) => b.date.localeCompare(a.date)),
    ads: (db.socialAds ?? []).filter((a) => a.campaignId === c.id || c.adIds.includes(a.id)),
    links: (db.mktLinks ?? []).filter((l) => l.campaignId === c.id),
    offers: (db.mktPromotions ?? []).filter((p) => p.campaignId === c.id || c.offerIds.includes(p.id)),
    messages: (db.mktMessageCampaigns ?? []).filter((m) => m.campaignId === c.id || c.messageCampaignIds.includes(m.id)),
  };
}
