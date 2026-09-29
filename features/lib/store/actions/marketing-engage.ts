/**
 * Feature 34 (patent §34) — engagement and automation, after campaigns and
 * growth (marketing-growth.ts):
 *
 * - Social inbox: comments, DMs and mentions read from the connected
 *   platforms (sandbox), replies (sandbox), assignment, mark done, and
 *   "Create lead" which creates or links a lead attributed to the platform,
 *   post, ad and campaign.
 * - Landing pages: builder (validateLandingPage), publish / unpublish, and the
 *   public /lp/{slug} submission (validateSubmission → submissionToInbound →
 *   receiveInbound) that creates or matches a lead attributed to the page and
 *   its campaign, records promo/referral codes and booking requests.
 * - Ads: create/edit for a campaign, submit for approval, owner-only approve
 *   or reject, pause / resume, sandbox results.
 * - Automations: edit, turn on/off, run now (sandbox send, logged, opt-outs
 *   skipped), run history.
 * - Insights: dismiss trend alerts and act on recommendations.
 *
 * Nothing here calls a real provider: replies, ad delivery and messages are
 * recorded with sandbox references only.
 */
import type { Database, Lead, SocialPlatform, User } from "@/features/types";
import type {
  AppointmentRequest, AutomationRun, CommEntry, FormField, FormKind, FormSubmission, IntakeAttribution, LandingPage, LeadAttributionRecord, MarketingAutomation, MarketingChannel, MarketingService, UtmParams,
} from "@/features/types/marketing-growth";
import type { AdCreative, SocialAdCampaign, SocialMessage } from "@/features/types/marketing-social";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId } from "@/features/lib/selectors";
import { addDays, daysBetween } from "@/features/lib/rules/dates";
import { findStreetAddress, matchLead, type LeadMatch } from "@/features/lib/rules/marketing";
import { sourceFromLabel } from "@/features/lib/rules/lead-pipeline";
import {
  day, dueAutomationTargets, fillTemplate, findPromotion, normCode, submissionToInbound, validateLandingPage, validatePromoCode, validateSubmission,
  type InboundPayload, type Recommendation,
} from "@/features/lib/rules/marketing-growth";
import { approvedSpend, detectIntent, leadIntakeFromMessage, PLATFORM_LABEL, sandboxAdPerformance, socialUsable, validateAd, validateReply } from "@/features/lib/rules/marketing-social";
import { leadContact } from "./marketing";
import { requestReview, saveCampaign, SMS_MAX } from "./marketing-growth";
import { denied, fail, log, nextId, nextNumber, ok, userName } from "../helpers";

const MODULE = "Marketing";
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

function comm(db: Database, e: Omit<CommEntry, "id" | "at">) {
  (db.mktCommunications ??= []).unshift({ id: nextId(db, "mktcom", "COM-"), at: now(), ...e });
}

/** Activity entry for something a customer did on a public page (no staff actor). */
function logPublic(db: Database, message: string) {
  db.activity.unshift({ id: nextId(db, "act", "ACT-"), at: now(), userId: "WEB", module: MODULE, message });
}

/** Social platforms map onto the marketing channels we report on; others stay on the message. */
function channelOf(p?: SocialPlatform): MarketingChannel | undefined {
  if (p === "facebook" || p === "instagram") return p;
  if (p === "google_business") return "google";
  return undefined;
}

/**
 * One inbound enquiry → a lead. Phone first, then email: a repeat within 90
 * days attaches to the existing lead; phone and email matching different
 * leads makes a new lead on the review list (never an automatic merge).
 */
function upsertLead(
  db: Database,
  p: { ref: string; name: string; phone?: string; email?: string; message?: string; town?: string; sourceLabel: string; customerId?: string; propertyId?: string },
): { lead: Lead; outcome: "created" | "attached"; customerId: string } {
  const t = now();
  const contacts = db.leads.map((l) => ({ id: l.id, ...leadContact(db, l.id), lastActivityAt: l.lastActivityAt ?? l.createdAt }));
  const m: LeadMatch = p.phone || p.email ? matchLead(contacts, { phone: p.phone, email: p.email }, t) : { kind: "new" };
  if (m.kind === "attach") {
    const lead = byId(db.leads, m.leadId)!;
    lead.events = [...(lead.events ?? []), { ref: p.ref, at: t, message: p.message ?? "", matchedOn: m.on }];
    lead.lastActivityAt = t;
    return { lead, outcome: "attached", customerId: lead.customerId };
  }
  let customerId = p.customerId && byId(db.customers, p.customerId) ? p.customerId : undefined;
  if (!customerId) {
    customerId = nextId(db, "cust", "C-NEW-");
    db.customers.push({
      id: customerId, name: p.name.trim() || "Unnamed enquiry", phone: p.phone?.trim() || undefined, email: p.email?.trim() || undefined, contactVerified: false,
      preferredChannel: p.phone ? "phone" : "email", consentSigned: false, authorisedSigners: [],
    });
  }
  const id = nextId(db, "lead", "LEAD-2026-");
  const lead: Lead = {
    id, customerId, propertyId: p.propertyId, stage: "new_lead", createdAt: t, lastActivityAt: t, name: p.name.trim(), phone: p.phone?.trim(), email: p.email?.trim(), town: p.town?.trim() || undefined,
    message: p.message?.trim(), eventRef: p.ref, events: [{ ref: p.ref, at: t, message: p.message ?? "" }], ...sourceFromLabel(p.sourceLabel),
    review: m.kind === "review" ? { phoneMatchLeadId: m.phoneLeadId, emailMatchLeadId: m.emailLeadId, status: "open" } : undefined,
    note: m.kind === "new" ? m.reason : undefined,
  };
  db.leads.unshift(lead);
  return { lead, outcome: "created", customerId };
}

/** The attribution record for a lead: kept if one exists, created otherwise. */
function attribute(db: Database, rec: LeadAttributionRecord) {
  db.mktAttributions ??= [];
  if (db.mktAttributions.some((a) => a.leadId === rec.leadId)) return false;
  for (const k of Object.keys(rec) as (keyof LeadAttributionRecord)[]) if (rec[k] === undefined) delete rec[k];
  db.mktAttributions.push(rec);
  return true;
}

/* ================================ Social inbox =============================== */

export const MESSAGE_KIND_LABEL: Record<SocialMessage["kind"], string> = { comment: "Comment", dm: "Direct message", mention: "Mention" };
export const MESSAGE_STATUS_LABEL: Record<SocialMessage["status"], string> = { open: "Needs a reply", replied: "Replied", closed: "Done" };

/** Deterministic sandbox messages a connected platform returns when the inbox is checked. */
export function sandboxInboxBatch(nowIso: string): Omit<SocialMessage, "id" | "status" | "replies" | "sandbox" | "intent">[] {
  const at = (h: number) => new Date(new Date(nowIso).getTime() - h * 3_600_000).toISOString();
  const stamp = day(nowIso).replace(/-/g, "");
  return [
    { platform: "instagram", kind: "dm", externalId: `IG-DM-${stamp}-1`, threadId: `IG-T-${stamp}-1`, author: { name: "Priya Anand", handle: "@priya.at.home", phone: "(469) 555-0128" }, text: "Hi! Saw your fall reel. Could I get a quote for painting two bedrooms and a hallway?", at: at(1) },
    { platform: "facebook", kind: "comment", externalId: `FB-C-${stamp}-1`, postId: "POST-8", externalPostRef: "SBX-FB-POST-8", author: { name: "Marcus Webb" }, text: "Love the olive. Is that an exterior color too?", at: at(3) },
  ];
}

/** Reads new messages from the connected accounts (sandbox). Repeats (same platform ID) are ignored. */
export function checkInbox(db: Database, actor: User) {
  if (!can(actor, "marketing.access")) return denied(db, actor, MODULE, "check the social inbox", whoCan("marketing.access"));
  db.socialMessages ??= [];
  const connected = new Set(db.socialAccounts.filter((a) => a.status === "connected").map((a) => a.platform));
  let added = 0;
  let repeats = 0;
  const unreachable = new Set<string>();
  for (const m of sandboxInboxBatch(now())) {
    if (!connected.has(m.platform)) { unreachable.add(PLATFORM_LABEL[m.platform]); continue; }
    if (db.socialMessages.some((x) => x.platform === m.platform && x.externalId === m.externalId)) { repeats++; continue; }
    db.socialMessages.unshift({ ...m, id: nextId(db, "mktsmsg", "SMSG-"), sandbox: true, status: "open", replies: [], intent: detectIntent(m.text) });
    added++;
  }
  log(db, actor, MODULE, `Marketing: Social inbox checked by ${actor.name}: ${added} new, ${repeats} already in the inbox${unreachable.size ? `; ${[...unreachable].join(", ")} not connected` : ""}. Sandbox connector.`);
  return ok({ added, repeats, unreachable: [...unreachable] });
}

export function replyToMessage(db: Database, actor: User, id: string, text: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "reply to a social message", whoCan("marketing.post"));
  const m = byId(db.socialMessages ?? [], id);
  if (!m) return fail("Message not found.");
  if (m.status === "closed") return fail("This conversation is marked done. Reopen it to reply.", "reply");
  const err = validateReply(m.platform, text);
  if (err) return fail(err, "reply");
  m.replies.push({ at: now(), by: actor.id, text: text.trim(), status: "sent", externalRef: `SBX-RPL-${m.id}-${m.replies.length + 1}` });
  m.status = "replied";
  comm(db, { customerId: m.customerId, leadId: m.leadId, channel: "social", direction: "outbound", body: text.trim(), campaignId: m.attribution?.campaignId, status: "sandbox" });
  log(db, actor, MODULE, `Marketing: Reply to ${m.author.name}'s ${PLATFORM_LABEL[m.platform]} ${MESSAGE_KIND_LABEL[m.kind].toLowerCase()} (${m.id}) sent by ${actor.name}. Sandbox: not posted to the platform.`);
  return ok();
}

export function assignMessage(db: Database, actor: User, id: string, userId?: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "assign a social message", whoCan("marketing.post"));
  const m = byId(db.socialMessages ?? [], id);
  if (!m) return fail("Message not found.");
  const to = userId ? byId(db.users, userId) : undefined;
  if (userId && !to) return fail("Choose a staff member.", "assignee");
  if (to && !can(to, "marketing.access")) return fail(`${to.name} can't open Marketing, so can't answer social messages. Choose ${whoCan("marketing.access")}.`, "assignee");
  if ((m.assignedTo ?? "") === (userId ?? "")) return fail(to ? `Already assigned to ${to.name}.` : "Nobody is assigned.", "assignee");
  const from = m.assignedTo;
  m.assignedTo = to?.id;
  log(db, actor, MODULE, `Marketing: ${m.id} (${m.author.name}, ${PLATFORM_LABEL[m.platform]}) ${to ? `assigned to ${to.name}` : "unassigned"} by ${actor.name}${from ? `; was ${userName(db, from)}` : ""}.`);
  return ok();
}

export function setMessageDone(db: Database, actor: User, id: string, done: boolean) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, done ? "mark a social message done" : "reopen a social message", whoCan("marketing.post"));
  const m = byId(db.socialMessages ?? [], id);
  if (!m) return fail("Message not found.");
  if (done && m.status === "closed") return fail("Already marked done.");
  if (!done && m.status !== "closed") return fail("This conversation is already open.");
  if (done) Object.assign(m, { status: "closed", doneAt: now(), doneBy: actor.id });
  else Object.assign(m, { status: m.replies.some((r) => r.status === "sent") ? "replied" : "open", doneAt: undefined, doneBy: undefined });
  log(db, actor, MODULE, `Marketing: ${m.id} (${m.author.name}) ${done ? "marked done" : "reopened"} by ${actor.name}.`);
  return ok();
}

/**
 * Creates (or links) the lead for an inbox message, attributed to the
 * platform, the post or ad it came from and their campaign. A repeat enquiry
 * from the same phone or email within 90 days is linked to the existing lead.
 */
export function createLeadFromMessage(db: Database, actor: User, id: string) {
  if (!can(actor, "lead.create")) return denied(db, actor, MODULE, "create a lead from a social message", whoCan("lead.create"));
  const m = byId(db.socialMessages ?? [], id);
  if (!m) return fail("Message not found.");
  if (m.leadId && byId(db.leads, m.leadId)) return fail(`This message is already linked to ${m.leadId}.`);
  const post = m.postId ? byId(db.marketingPosts, m.postId) : undefined;
  const intake = leadIntakeFromMessage(m, post);
  const ad = m.adId ? byId(db.socialAds ?? [], m.adId) : undefined;
  const campaignId = intake.attribution.campaignId ?? ad?.campaignId ?? (m.postId ? (db.mktCampaigns ?? []).find((c) => c.postIds.includes(m.postId!))?.id : undefined);
  const attribution = { ...intake.attribution, campaignId, promotionId: intake.attribution.promotionId ?? ad?.promotionId };
  for (const k of Object.keys(attribution) as (keyof typeof attribution)[]) if (attribution[k] === undefined) delete attribution[k];
  const { lead, outcome, customerId } = upsertLead(db, {
    ref: `${m.platform}:${m.externalId}`, name: intake.name, phone: intake.phone, email: intake.email, message: intake.message, town: attribution.location, sourceLabel: intake.source, customerId: m.customerId,
  });
  attribute(db, { leadId: lead.id, channel: m.adId ? "ad" : "social", campaignId, adId: m.adId, postId: attribution.postId, platform: channelOf(m.platform), promotionId: attribution.promotionId, at: now() });
  Object.assign(m, { leadId: lead.id, customerId, attribution, leadRequest: { at: now(), by: actor.id, via: "local", status: outcome } });
  comm(db, { customerId, leadId: lead.id, channel: "social", direction: "inbound", body: m.text, campaignId, status: undefined });
  const camp = campaignId ? byId(db.mktCampaigns ?? [], campaignId) : undefined;
  log(db, actor, MODULE, `Marketing: ${outcome === "created" ? `Lead ${lead.id} created` : `Message linked to existing lead ${lead.id}`} from ${PLATFORM_LABEL[m.platform]} ${MESSAGE_KIND_LABEL[m.kind].toLowerCase()} ${m.id} (${m.author.name}) by ${actor.name}. Source: ${intake.source}${ad ? `, ad ${ad.id}` : ""}${camp ? `, campaign ${camp.id} (${camp.name})` : ""}.`);
  return ok({ leadId: lead.id, outcome, campaignName: camp?.name });
}

/* ================================ Landing pages ============================== */

export interface LandingPageDraft {
  id?: string;
  title: string;
  slug: string;
  headline: string;
  body: string;
  service?: MarketingService;
  location?: string;
  campaignId?: string;
  promotionId?: string;
  formKind: FormKind;
  fields: FormField[];
  submitLabel: string;
  successMessage: string;
}

/** Which input a landing-page rule message belongs to. */
function lpField(message: string): string {
  if (/title/i.test(message)) return "title";
  if (/address can use|\/lp\//i.test(message)) return "slug";
  if (/headline/i.test(message)) return "headline";
  return "fields";
}

export function saveLandingPage(db: Database, actor: User, d: LandingPageDraft) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, d.id ? "edit a landing page" : "create a landing page", whoCan("marketing.post"));
  const slug = d.slug.trim().toLowerCase();
  const form = { kind: d.formKind, fields: d.fields.map((f) => ({ ...f, label: f.label.trim() })), submitLabel: d.submitLabel.trim() || "Send", successMessage: d.successMessage.trim() || "Thanks! We'll be in touch shortly." };
  const err = validateLandingPage(db, { slug, title: d.title, headline: d.headline, form }, d.id);
  if (err) return fail(err, lpField(err));
  if (form.fields.some((f) => !f.label)) return fail("Every form field needs a label.", "fields");
  const street = findStreetAddress(`${d.headline} ${d.body}`);
  if (street) return fail(`Remove the street address ("${street}") from the page. It is public.`, "body");
  const c = d.campaignId ? byId(db.mktCampaigns ?? [], d.campaignId) : undefined;
  if (d.campaignId && !c) return fail("That campaign no longer exists.", "campaignId");
  if (d.promotionId && !byId(db.mktPromotions ?? [], d.promotionId)) return fail("That promotion no longer exists.", "promotionId");
  db.mktLandingPages ??= [];
  const clean = {
    title: d.title.trim(), slug, headline: d.headline.trim(), body: d.body.trim(), service: d.service || undefined, location: d.location?.trim() || undefined, campaignId: c?.id, promotionId: d.promotionId || undefined, form,
  };
  let id = d.id;
  if (id) {
    const p = byId(db.mktLandingPages, id);
    if (!p) return fail("Landing page not found.");
    if (p.status === "published" && p.slug !== slug) return fail(`Unpublish the page before changing its address: links and QR codes point to /lp/${p.slug}.`, "slug");
    if (p.campaignId && p.campaignId !== c?.id) { const oc = byId(db.mktCampaigns ?? [], p.campaignId); if (oc) oc.landingPageIds = oc.landingPageIds.filter((x) => x !== id); }
    Object.assign(p, clean);
  } else {
    id = nextId(db, "mktlp", "LP-");
    const page: LandingPage = { id, ...clean, accent: "#2563eb", status: "draft", views: 0, createdBy: actor.id, createdAt: now() };
    db.mktLandingPages.unshift(page);
  }
  if (c && !c.landingPageIds.includes(id)) c.landingPageIds.push(id);
  log(db, actor, MODULE, `Marketing: Landing page ${id} (/lp/${slug}, ${clean.title}) ${d.id ? "updated" : "created as a draft"} by ${actor.name}${c ? ` for campaign ${c.id}` : ""}.`);
  return ok(id);
}

export function setLandingPagePublished(db: Database, actor: User, id: string, publish: boolean) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, publish ? "publish a landing page" : "unpublish a landing page", whoCan("marketing.post"));
  const p = byId(db.mktLandingPages ?? [], id);
  if (!p) return fail("Landing page not found.");
  if (publish === (p.status === "published")) return fail(publish ? "This page is already live." : "This page isn't published.");
  if (publish) {
    const err = validateLandingPage(db, p, p.id);
    if (err) return fail(err, lpField(err));
    Object.assign(p, { status: "published", publishedAt: now() });
  } else p.status = "draft";
  log(db, actor, MODULE, `Marketing: Landing page /lp/${p.slug} (${p.title}) ${publish ? "published" : "unpublished"} by ${actor.name}.`);
  return ok();
}

/** A visitor opened a published page. System action. */
export function recordLandingView(db: Database, slug: string) {
  const p = (db.mktLandingPages ?? []).find((x) => x.slug === slug.trim().toLowerCase());
  if (!p || p.status !== "published") return fail("This page isn't available.");
  p.views += 1;
  return ok();
}

export interface InboundOutcome { submissionId: string; leadId: string; outcome: "new" | "matched" | "duplicate"; appointmentRequestId?: string; code?: { code: string; ok: boolean; reason?: string } }

/**
 * An inbound enquiry (landing page, QR, ad form) → customer, lead, property,
 * attribution, form submission, booking request and code redemption. The
 * submission reference makes it safe to retry: the same ref is never applied twice.
 */
export function receiveInbound(db: Database, p: InboundPayload) {
  const dup = (db.mktSubmissions ?? []).find((s) => s.ref === p.ref);
  if (dup) return ok<InboundOutcome>({ submissionId: dup.id, leadId: dup.leadId, outcome: "duplicate" });
  if (!p.name.trim()) return fail("Enter your name.", "name");
  if (!p.phone?.trim() && !p.email?.trim()) return fail("Enter a phone number or an email.", "phone");
  const t = now();
  const page = p.attribution.landingPageId ? byId(db.mktLandingPages ?? [], p.attribution.landingPageId) : undefined;
  let propertyId: string | undefined;
  if (p.street?.trim() && p.city?.trim()) {
    const same = db.properties.find((x) => x.address.trim().toLowerCase() === p.street!.trim().toLowerCase() && x.city.trim().toLowerCase() === p.city!.trim().toLowerCase());
    propertyId = same?.id;
  }
  const { lead, outcome, customerId } = upsertLead(db, {
    ref: p.ref, name: p.name, phone: p.phone, email: p.email, message: p.message, town: p.city, sourceLabel: page ? `Landing page — ${page.title}` : "Landing page", propertyId,
  });
  if (!propertyId && p.street?.trim() && p.city?.trim() && outcome === "created") {
    propertyId = `PROP-${2000 + nextNumber(db, "prop")}`;
    db.properties.push({
      id: propertyId, address: p.street.trim(), city: p.city.trim(), state: p.state?.trim() || "TX", zip: p.zip?.trim() ?? "", type: "single_family", optOut: false,
      ownership: [{ id: `OWN-${propertyId.slice(5)}-1`, customerId, start: t }],
    });
    lead.propertyId = propertyId;
  }
  // Promo or referral code: recorded when valid; an invalid code never blocks the enquiry.
  let code: InboundOutcome["code"];
  const quoted = normCode(p.attribution.promoCode ?? p.attribution.referralCode);
  let promotionId = page?.promotionId;
  let referralCode: string | undefined;
  let referralCodeId: string | undefined;
  if (quoted) {
    const check = validatePromoCode(db, quoted, { at: t, customerId, service: p.service });
    code = { code: quoted, ok: check.ok, reason: check.ok ? undefined : check.reason };
    if (check.ok) {
      promotionId = check.promotion.id;
      if (check.referral) {
        const r = byId(db.mktReferralCodes!, check.referral.id)!;
        referralCode = r.code;
        referralCodeId = r.id;
        if (!(db.mktReferralCodes ?? []).some((x) => x.referrals.some((y) => y.leadId === lead.id))) r.referrals.push({ leadId: lead.id, customerId, at: t, status: "pending" });
      } else {
        const promo = byId(db.mktPromotions!, check.promotion.id)!;
        promo.redemptions.push({ id: nextId(db, "mktred", "RED-"), at: t, code: promo.code, customerId, leadId: lead.id, source: "landing_page" });
      }
    } else if (!findPromotion(db, quoted).promotion) {
      lead.note = [lead.note, `Quoted code ${quoted}, which doesn't exist.`].filter(Boolean).join(" ");
    } else {
      lead.note = [lead.note, `Quoted code ${quoted}: ${check.reason}`].filter(Boolean).join(" ");
    }
  }
  const campaignId = p.attribution.campaignId;
  attribute(db, {
    leadId: lead.id, channel: referralCode ? "referral" : p.channel, campaignId, landingPageId: p.attribution.landingPageId, promotionId, promoCode: referralCode ? undefined : quoted || undefined,
    referralCode, referralCodeId, linkId: p.attribution.linkId, utm: p.attribution.utm, service: p.service, estimateRequested: p.wantsEstimate, at: t,
  });
  let appointmentRequestId: string | undefined;
  if (p.booking) {
    appointmentRequestId = nextId(db, "mktapr", "APR-");
    const req: AppointmentRequest = {
      id: appointmentRequestId, at: t, customerId, leadId: lead.id, propertyId, preferredDate: p.booking.preferredDate, preferredWindow: p.booking.preferredWindow, service: p.service, status: "requested", source: p.channel,
    };
    (db.mktAppointmentRequests ??= []).unshift(req);
  }
  const sub: FormSubmission = {
    id: nextId(db, "mktsub", "SUB-"), ref: p.ref, at: t, channel: p.channel, landingPageId: p.attribution.landingPageId, formKind: p.formKind ?? "contact", values: p.values ?? {},
    attribution: p.attribution, customerId, leadId: lead.id, propertyId, appointmentRequestId, outcome: outcome === "created" ? "new" : "matched",
  };
  (db.mktSubmissions ??= []).unshift(sub);
  comm(db, { customerId, leadId: lead.id, channel: "form", direction: "inbound", subject: page ? `${page.title} form` : "Form", body: p.message ?? "", campaignId });
  logPublic(db, `Marketing: ${page ? `Landing page /lp/${page.slug}` : "Form"} submission ${sub.id} from ${p.name.trim()}: ${outcome === "created" ? `lead ${lead.id} created` : `matched existing lead ${lead.id}`}${campaignId ? `, campaign ${campaignId}` : ""}${appointmentRequestId ? `, booking request ${appointmentRequestId}` : ""}${code ? `, code ${code.code} ${code.ok ? "recorded" : "not valid"}` : ""}.`);
  return ok<InboundOutcome>({ submissionId: sub.id, leadId: lead.id, outcome: outcome === "created" ? "new" : "matched", appointmentRequestId, code });
}

/** A customer submitted the form on /lp/{slug}. System action (no staff actor). */
export function submitLandingPage(db: Database, slug: string, values: Record<string, string>, ref: string, extra: IntakeAttribution & { linkId?: string; utm?: Partial<UtmParams> } = {}) {
  const page = (db.mktLandingPages ?? []).find((x) => x.slug === slug.trim().toLowerCase());
  if (!page || page.status !== "published") return fail("This page isn't available any more.");
  if (!ref.trim()) return fail("A submission needs its reference.");
  const errors = validateSubmission(page.form.fields, values);
  const first = Object.keys(errors)[0];
  if (first) return fail(errors[first]!, first);
  return receiveInbound(db, submissionToInbound(page, values, ref, extra));
}

/* ==================================== Ads ==================================== */

export const AD_STATUS_LABEL: Record<SocialAdCampaign["status"], string> = {
  draft: "Draft", pending_approval: "Awaiting owner approval", approved: "Approved — starts on its date", active: "Running (sandbox)", paused: "Paused", completed: "Completed", rejected: "Sent back", failed: "Failed",
};
export const AD_OBJECTIVE_LABEL: Record<SocialAdCampaign["objective"], string> = { awareness: "Awareness", traffic: "Website visits", leads: "Leads", messages: "Messages", video_views: "Video views" };
export const AD_CTA_LABEL: Record<AdCreative["cta"], string> = { learn_more: "Learn more", get_quote: "Get quote", call_now: "Call now", book_now: "Book now", contact_us: "Contact us" };

export interface AdDraft {
  id?: string;
  name: string;
  platform: SocialPlatform;
  objective: SocialAdCampaign["objective"];
  campaignId?: string;
  budgetType: "daily" | "lifetime";
  budgetAmount: number;
  start: string;
  end?: string;
  locations: string[];
  radiusMiles?: number;
  ageMin: number;
  ageMax: number;
  interests: string[];
  assetIds: string[];
  headline: string;
  text: string;
  cta: AdCreative["cta"];
  url?: string;
}

const AD_FIELD: [RegExp, string][] = [
  [/Name the ad/i, "name"], [/aren't available/i, "platform"], [/budget greater|whole cents|a day/i, "budgetAmount"], [/start date/i, "start"], [/end date|lifetime budget needs/i, "end"],
  [/location|audience|street addresses/i, "locations"], [/Age range/i, "age"], [/link must use https/i, "url"], [/creative/i, "creative"],
];

function adShape(d: AdDraft): Pick<SocialAdCampaign, "name" | "platform" | "budget" | "schedule" | "audience" | "creatives"> {
  return {
    name: d.name, platform: d.platform, budget: { type: d.budgetType, amount: d.budgetAmount, currency: "USD" }, schedule: { start: d.start, end: d.end || undefined },
    audience: { locations: d.locations.map((l) => l.trim()).filter(Boolean), radiusMiles: d.radiusMiles, ageMin: d.ageMin, ageMax: d.ageMax, interests: d.interests.map((i) => i.trim()).filter(Boolean) },
    creatives: [{ assetIds: d.assetIds, headline: d.headline, text: d.text, cta: d.cta, url: d.url?.trim() || undefined }],
  };
}

/** Every problem with an ad draft, keyed by the input it belongs to (shown next to that input). */
export function adFieldErrors(db: Database, d: AdDraft, todayIso: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const msg of validateAd(adShape(d), todayIso)) {
    const k = AD_FIELD.find(([re]) => re.test(msg))?.[1] ?? "creative";
    out[k] ??= msg;
  }
  if (d.campaignId && !byId(db.mktCampaigns ?? [], d.campaignId)) out.campaignId ??= "That campaign no longer exists.";
  if (!d.assetIds.length) out.assetIds ??= "Choose at least one photo or video from the media library.";
  for (const id of d.assetIds) {
    const a = byId(db.mediaAssets, id);
    const u = a ? socialUsable(a, db.employeeMediaConsents ?? []) : { ok: false, reason: `${id} is no longer in the media library.` };
    if (!u.ok) { out.assetIds ??= `${id}: ${u.reason}`; break; }
  }
  return out;
}

const EDITABLE: SocialAdCampaign["status"][] = ["draft", "rejected", "failed", "pending_approval", "paused", "approved"];

export function saveAd(db: Database, actor: User, d: AdDraft) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, d.id ? "edit an ad" : "create an ad", whoCan("marketing.post"));
  const errors = adFieldErrors(db, d, now());
  const first = Object.keys(errors)[0];
  if (first) return fail(errors[first]!, first);
  const shape = adShape(d);
  db.socialAds ??= [];
  let id = d.id;
  let back = false;
  if (id) {
    const ad = byId(db.socialAds, id);
    if (!ad) return fail("Ad not found.");
    if (!EDITABLE.includes(ad.status)) return fail(ad.status === "active" ? "Pause the ad before editing it." : `A ${AD_STATUS_LABEL[ad.status].toLowerCase()} ad can't be edited.`);
    back = ad.status !== "draft";
    if (ad.campaignId && ad.campaignId !== d.campaignId) { const oc = byId(db.mktCampaigns ?? [], ad.campaignId); if (oc) oc.adIds = oc.adIds.filter((x) => x !== id); }
    Object.assign(ad, shape, { objective: d.objective, campaignId: d.campaignId || undefined, status: "draft", approval: back ? undefined : ad.approval });
    ad.history.push({ at: now(), by: actor.id, note: back ? "Edited; back to draft — needs owner approval again." : "Edited." });
  } else {
    id = nextId(db, "mktad", "SAD-");
    db.socialAds.unshift({ id, ...shape, objective: d.objective, campaignId: d.campaignId || undefined, status: "draft", sandbox: true, createdBy: actor.id, createdAt: now(), history: [{ at: now(), by: actor.id, note: "Created as a draft." }] });
  }
  const c = d.campaignId ? byId(db.mktCampaigns ?? [], d.campaignId) : undefined;
  if (c && !c.adIds.includes(id)) c.adIds.push(id);
  log(db, actor, MODULE, `Marketing: Ad ${id} (${d.name.trim()}, ${PLATFORM_LABEL[d.platform]}, ${d.budgetType} ${money(d.budgetAmount)}) ${d.id ? "updated" : "created as a draft"} by ${actor.name}${back ? "; needs owner approval again" : ""}.`);
  return ok({ id, backToDraft: back });
}

export function submitAdForApproval(db: Database, actor: User, id: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "submit an ad for approval", whoCan("marketing.post"));
  const ad = byId(db.socialAds ?? [], id);
  if (!ad) return fail("Ad not found.");
  if (!["draft", "rejected", "failed"].includes(ad.status)) return fail(`A ${AD_STATUS_LABEL[ad.status].toLowerCase()} ad can't be submitted.`);
  const errs = validateAd(ad, now());
  if (errs.length) return fail(`Fix the ad first: ${errs[0]}`);
  ad.status = "pending_approval";
  ad.rejection = undefined;
  ad.history.push({ at: now(), by: actor.id, note: `Submitted for approval (${money(approvedSpend(ad))} total).` });
  log(db, actor, MODULE, `Marketing: Ad ${ad.id} (${ad.name}) submitted for owner approval by ${actor.name}. Spend up to ${money(approvedSpend(ad))}.`);
  return ok();
}

/** Owner approves: the ad goes to the platform (sandbox) and starts on its start date. */
export function approveAd(db: Database, actor: User, id: string) {
  if (!can(actor, "marketing.approve")) return denied(db, actor, MODULE, "approve an ad", whoCan("marketing.approve"));
  const ad = byId(db.socialAds ?? [], id);
  if (!ad) return fail("Ad not found.");
  if (ad.status !== "pending_approval") return fail("Only ads awaiting approval can be approved.");
  const errs = validateAd(ad, now());
  if (errs.length) return fail(`Can't approve: ${errs[0]} Send it back so the office can fix it.`);
  const t = now();
  const starts = ad.schedule.start <= day(t);
  Object.assign(ad, { status: starts ? "active" : "approved", approval: { by: actor.id, at: t, budget: approvedSpend(ad) }, sandbox: true, externalRef: ad.externalRef ?? `SBX-AD-${ad.id}` });
  if (starts) ad.performance = { at: t, sandbox: true, ...sandboxAdPerformance(ad, t) };
  ad.history.push({ at: t, by: actor.id, note: `Approved for up to ${money(approvedSpend(ad))}. Sandbox: not sent to ${PLATFORM_LABEL[ad.platform]} (no platform keys).` });
  const c = ad.campaignId ? byId(db.mktCampaigns ?? [], ad.campaignId) : undefined;
  if (c && !c.adIds.includes(ad.id)) c.adIds.push(ad.id);
  log(db, actor, MODULE, `Marketing: Ad ${ad.id} (${ad.name}) approved by ${actor.name} for up to ${money(approvedSpend(ad))}; ${starts ? "running" : `starts ${ad.schedule.start}`}. Sandbox: no platform called.`);
  return ok({ status: ad.status });
}

export function rejectAd(db: Database, actor: User, id: string, comment: string) {
  if (!can(actor, "marketing.approve")) return denied(db, actor, MODULE, "send an ad back", whoCan("marketing.approve"));
  const ad = byId(db.socialAds ?? [], id);
  if (!ad) return fail("Ad not found.");
  if (ad.status !== "pending_approval") return fail("Only ads awaiting approval can be sent back.");
  if (!comment.trim()) return fail("Say what needs to change.", "comment");
  Object.assign(ad, { status: "rejected", rejection: { by: actor.id, at: now(), comment: comment.trim() } });
  ad.history.push({ at: now(), by: actor.id, note: `Sent back: ${comment.trim()}` });
  log(db, actor, MODULE, `Marketing: Ad ${ad.id} (${ad.name}) sent back by ${actor.name}: ${comment.trim()}`);
  return ok();
}

export function pauseAd(db: Database, actor: User, id: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "pause an ad", whoCan("marketing.post"));
  const ad = byId(db.socialAds ?? [], id);
  if (!ad) return fail("Ad not found.");
  if (ad.status !== "active" && ad.status !== "approved") return fail("Only running or approved ads can be paused.");
  ad.status = "paused";
  ad.history.push({ at: now(), by: actor.id, note: "Paused. Sandbox: no platform called." });
  log(db, actor, MODULE, `Marketing: Ad ${ad.id} (${ad.name}) paused by ${actor.name}.`);
  return ok();
}

/** Resuming spends money again, so it is the owner's decision. */
export function resumeAd(db: Database, actor: User, id: string) {
  if (!can(actor, "marketing.approve")) return denied(db, actor, MODULE, "resume an ad", whoCan("marketing.approve"));
  const ad = byId(db.socialAds ?? [], id);
  if (!ad) return fail("Ad not found.");
  if (ad.status !== "paused") return fail("Only paused ads can be resumed.");
  if (!ad.approval) return fail("This ad hasn't been approved. Submit it for approval.");
  if (ad.schedule.end && ad.schedule.end < day(now())) return fail(`This ad ended on ${ad.schedule.end}. Edit its dates first.`);
  ad.status = ad.schedule.start <= day(now()) ? "active" : "approved";
  ad.history.push({ at: now(), by: actor.id, note: "Resumed." });
  log(db, actor, MODULE, `Marketing: Ad ${ad.id} (${ad.name}) resumed by ${actor.name}.`);
  return ok();
}

/** Reads the latest delivery numbers (sandbox: deterministic, bounded by the budget). */
export function refreshAdResults(db: Database, actor: User, id: string) {
  if (!can(actor, "marketing.access")) return denied(db, actor, MODULE, "refresh ad results", whoCan("marketing.access"));
  const ad = byId(db.socialAds ?? [], id);
  if (!ad) return fail("Ad not found.");
  if (ad.status !== "active") return fail("Only running ads report new results.");
  const t = now();
  const next = sandboxAdPerformance(ad, t);
  const prev = ad.performance;
  ad.performance = { at: t, sandbox: true, ...next, spend: Math.max(prev?.spend ?? 0, next.spend), impressions: Math.max(prev?.impressions ?? 0, next.impressions), reach: Math.max(prev?.reach ?? 0, next.reach), clicks: Math.max(prev?.clicks ?? 0, next.clicks), leads: Math.max(prev?.leads ?? 0, next.leads) };
  return ok(ad.performance);
}

/** Owner changes an ad's budget (from a recommendation or by hand). */
export function setAdBudget(db: Database, actor: User, id: string, amount: number, reason: string) {
  if (!can(actor, "marketing.approve")) return denied(db, actor, MODULE, "change an ad budget", whoCan("marketing.approve"));
  const ad = byId(db.socialAds ?? [], id);
  if (!ad) return fail("Ad not found.");
  if (!(amount > 0) || Math.round(amount * 100) !== amount * 100) return fail("Enter a budget greater than $0, in whole cents.", "budgetAmount");
  const from = ad.budget.amount;
  const errs = validateAd({ ...ad, budget: { ...ad.budget, amount }, schedule: { ...ad.schedule, start: ad.schedule.start < day(now()) ? day(now()) : ad.schedule.start } }, now()).filter((e) => /budget|a day/i.test(e));
  if (errs.length) return fail(errs[0]!, "budgetAmount");
  ad.budget.amount = round2(amount);
  if (ad.approval) ad.approval = { ...ad.approval, budget: approvedSpend(ad) };
  ad.history.push({ at: now(), by: actor.id, note: `Budget ${money(from)} → ${money(amount)} (${ad.budget.type}): ${reason}` });
  log(db, actor, MODULE, `Marketing: Ad ${ad.id} (${ad.name}) ${ad.budget.type} budget changed from ${money(from)} to ${money(amount)} by ${actor.name}: ${reason}. Sandbox: no platform called.`);
  return ok({ from, to: amount });
}

/* ================================= Automations =============================== */

export interface AutomationDraft {
  channel: "email" | "sms";
  delayDays: number;
  subject?: string;
  body: string;
  seasonMonth?: number;
  seasonDay?: number;
  inactiveDays?: number;
}

export function saveAutomation(db: Database, actor: User, id: string, d: AutomationDraft) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "edit an automation", whoCan("marketing.post"));
  const a = byId(db.mktAutomations ?? [], id);
  if (!a) return fail("Automation not found.");
  if (!(Number.isInteger(d.delayDays) && d.delayDays >= 0 && d.delayDays <= 365)) return fail("The delay is a whole number of days from 0 to 365.", "delayDays");
  if (d.channel === "email" && !d.subject?.trim()) return fail("Write a subject line.", "subject");
  if (!d.body.trim()) return fail("Write the message.", "body");
  if (d.channel === "sms" && d.body.length > SMS_MAX) return fail(`SMS messages are limited to ${SMS_MAX} characters (${d.body.length} now).`, "body");
  if (d.channel === "sms" && !/\bstop\b/i.test(d.body)) return fail('SMS messages must say how to opt out, e.g. "Reply STOP to opt out."', "body");
  if (d.channel === "email" && !/unsubscribe|opt out|stop/i.test(d.body)) return fail('Emails must say how to unsubscribe, e.g. "Reply UNSUBSCRIBE to stop these emails."', "body");
  const street = findStreetAddress(d.body);
  if (street) return fail(`Remove the street address ("${street}") from the message.`, "body");
  if (a.kind === "seasonal_reminder") {
    if (!(Number.isInteger(d.seasonMonth) && d.seasonMonth! >= 1 && d.seasonMonth! <= 12)) return fail("Choose the month the reminder goes out.", "seasonMonth");
    if (!(Number.isInteger(d.seasonDay) && d.seasonDay! >= 1 && d.seasonDay! <= 28)) return fail("Choose a day from 1 to 28.", "seasonDay");
  }
  if (a.kind === "reengagement" && !(Number.isInteger(d.inactiveDays) && d.inactiveDays! >= 30)) return fail("Re-engagement needs at least 30 days without activity.", "inactiveDays");
  const before = `${a.channel}, ${a.delayDays} days`;
  Object.assign(a, {
    channel: d.channel, delayDays: d.delayDays, subject: d.channel === "email" ? d.subject!.trim() : undefined, body: d.body.trim(),
    seasonMonth: a.kind === "seasonal_reminder" ? d.seasonMonth : a.seasonMonth, seasonDay: a.kind === "seasonal_reminder" ? d.seasonDay : a.seasonDay, inactiveDays: a.kind === "reengagement" ? d.inactiveDays : a.inactiveDays,
  });
  log(db, actor, MODULE, `Marketing: Automation ${a.id} (${a.name}) edited by ${actor.name} (was ${before}; now ${a.channel}, ${a.delayDays} days).`);
  return ok();
}

/** Turning an automation on starts messages to customers, so it is the owner's decision. */
export function setAutomationActive(db: Database, actor: User, id: string, active: boolean) {
  const perm = active ? "marketing.approve" : "marketing.post";
  if (!can(actor, perm)) return denied(db, actor, MODULE, active ? "turn an automation on" : "turn an automation off", whoCan(perm));
  const a = byId(db.mktAutomations ?? [], id);
  if (!a) return fail("Automation not found.");
  if (a.active === active) return fail(`${a.name} is already ${active ? "on" : "off"}.`);
  a.active = active;
  log(db, actor, MODULE, `Marketing: Automation ${a.id} (${a.name}) turned ${active ? "on" : "off"} by ${actor.name}.`);
  return ok();
}

/**
 * Sends the automation to everyone due today (sandbox: recorded in the run
 * history and the customer's communication history; nothing is delivered).
 * Opted-out and unreachable targets are logged as skipped. A target is never
 * messaged twice by the same automation.
 */
export function runAutomation(db: Database, actor: User, id: string, trigger: AutomationRun["trigger"] = "manual") {
  if (!can(actor, "marketing.approve")) return denied(db, actor, MODULE, "run an automation", whoCan("marketing.approve"));
  const a = byId(db.mktAutomations ?? [], id);
  if (!a) return fail("Automation not found.");
  if (!a.active) return fail(`${a.name} is off. Turn it on first.`);
  const targets = dueAutomationTargets(db, a, now());
  if (!targets.length) return fail("Nobody is due for this automation today.");
  const t = now();
  let sent = 0;
  let skipped = 0;
  for (const x of targets) {
    const status: AutomationRun["status"] = x.optedOut ? "skipped_opt_out" : !x.to ? "skipped_no_address" : "sandbox";
    const runId = nextId(db, "mktrun", "RUN-");
    const messageId = status === "sandbox" ? `SBX-${runId}` : undefined;
    (db.mktAutomationRuns ??= []).unshift({ id: runId, at: t, automationId: a.id, targetKey: x.targetKey, customerId: x.customerId, name: x.name, to: x.to, status, messageId, trigger });
    if (status === "sandbox") {
      sent++;
      comm(db, { customerId: x.customerId, channel: a.channel, direction: "outbound", subject: a.subject ? fillTemplate(a.subject, x.vars) : undefined, body: fillTemplate(a.body, x.vars), automationId: a.id, status: "sandbox" });
    } else skipped++;
  }
  a.lastRunAt = t;
  log(db, actor, MODULE, `Marketing: Automation ${a.id} (${a.name}) run by ${actor.name}: ${sent} sent, ${skipped} skipped (opted out or no ${a.channel === "email" ? "email" : "mobile number"}). Sandbox: no provider called.`);
  return ok({ sent, skipped });
}

const STANDARD_AUTOMATIONS: Omit<MarketingAutomation, "id" | "createdBy" | "createdAt">[] = [
  { name: "Estimate follow-up", kind: "estimate_follow_up", active: false, channel: "email", delayDays: 3, subject: "{{first_name}}, any questions about your estimate?", body: "Hi {{first_name}},\n\nJust checking in on estimate {{estimate}}. Happy to walk through it or adjust anything.\n\nReply UNSUBSCRIBE to stop these emails." },
  { name: "Review request after the job", kind: "review_request", active: false, channel: "sms", delayDays: 2, body: "Hi {{first_name}}, thanks for choosing us for {{job}}. Would you leave a quick review? Reply STOP to opt out." },
  { name: "Seasonal reminder", kind: "seasonal_reminder", active: false, channel: "email", delayDays: 0, seasonMonth: 3, seasonDay: 1, subject: "Spring is painting season, {{first_name}}", body: "Hi {{first_name}},\n\nSpring dates book up quickly. Reply to get on the calendar early.\n\nReply UNSUBSCRIBE to stop these emails." },
  { name: "Referral request", kind: "referral_request", active: false, channel: "email", delayDays: 14, subject: "Know someone who needs a painter?", body: "Hi {{first_name}},\n\nIf a friend books with us and quotes {{code}}, you both get a reward.\n\nReply UNSUBSCRIBE to stop these emails." },
  { name: "Win back past customers", kind: "reengagement", active: false, channel: "email", delayDays: 0, inactiveDays: 540, subject: "It's been a while, {{first_name}}", body: "Hi {{first_name}},\n\nPaint usually needs a refresh every 5–7 years. Want us to take a look?\n\nReply UNSUBSCRIBE to stop these emails." },
];

/** Adds any of the five standard automations that are missing, switched off. */
export function addStandardAutomations(db: Database, actor: User) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "add automations", whoCan("marketing.post"));
  db.mktAutomations ??= [];
  const have = new Set(db.mktAutomations.map((a) => a.kind));
  const add = STANDARD_AUTOMATIONS.filter((a) => !have.has(a.kind));
  if (!add.length) return fail("All five standard automations are already here.");
  for (const a of add) db.mktAutomations.push({ ...a, id: nextId(db, "mktauto", "AUTO-"), createdBy: actor.id, createdAt: now() });
  log(db, actor, MODULE, `Marketing: ${add.length} standard automation${add.length === 1 ? "" : "s"} added (switched off) by ${actor.name}.`);
  return ok(add.length);
}

/* ================================== Insights ================================= */

export function dismissAlert(db: Database, actor: User, key: string) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "dismiss a marketing alert", whoCan("marketing.post"));
  db.mktSettings ??= {};
  const list = (db.mktSettings.dismissedAlerts ??= []);
  if (list.includes(key)) return fail("Already dismissed.");
  list.push(key);
  log(db, actor, MODULE, `Marketing: Alert ${key} dismissed by ${actor.name}.`);
  return ok();
}

/** Copies a campaign as a new draft running for the same length from today. */
export function copyCampaign(db: Database, actor: User, id: string) {
  const c = byId(db.mktCampaigns ?? [], id);
  if (!c) return fail("Campaign not found.");
  const start = day(now());
  const length = c.endDate ? Math.max(1, daysBetween(c.startDate, c.endDate)) : undefined;
  const r = saveCampaign(db, actor, {
    name: `${c.name} (again)`, objective: c.objective, services: c.services, locations: c.locations, channels: c.channels, budget: c.budget, startDate: start,
    endDate: length ? day(addDays(`${start}T12:00:00.000Z`, length)) : undefined, segmentId: c.segmentId, notes: `Copied from ${c.id} (${c.name}).`,
  });
  if (!r.ok) return r;
  const copy = byId(db.mktCampaigns!, r.value!)!;
  copy.copiedFrom = c.id;
  return ok(copy.id);
}

/** Acts on a recommendation and records that it was done, so it isn't suggested again. */
export function applyRecommendation(db: Database, actor: User, rec: Recommendation) {
  if (!can(actor, "marketing.post")) return denied(db, actor, MODULE, "act on a marketing recommendation", whoCan("marketing.post"));
  if ((db.mktRecommendationLog ?? []).some((r) => r.key === rec.key)) return fail("This recommendation was already acted on.");
  const a = rec.action;
  let result: string;
  let href: string | undefined;
  if (a.type === "create_campaign") {
    const r = saveCampaign(db, actor, { name: a.name, objective: a.objective, services: a.services, locations: a.locations, channels: [], budget: a.budget, startDate: day(now()), notes: a.notes });
    if (!r.ok) return r;
    result = `Draft campaign ${r.value} created`;
    href = `/marketing/campaigns?id=${r.value}`;
  } else if (a.type === "follow_up_lead") {
    const lead = byId(db.leads, a.leadId);
    if (!lead) return fail("That lead no longer exists.");
    const name = byId(db.customers, lead.customerId)?.name ?? lead.name ?? lead.id;
    const taskId = nextId(db, "task", "T-");
    db.tasks.unshift({ id: taskId, title: `Marketing: follow up ${name} (${lead.id}) — no activity for ${daysBetween(lead.lastActivityAt ?? lead.createdAt, now())} days`, done: false, createdAt: now() });
    result = `Follow-up task ${taskId} created`;
    href = `/leads/${lead.id}`;
  } else if (a.type === "request_review") {
    const c = byId(db.customers, a.customerId);
    const r = requestReview(db, actor, { customerId: a.customerId, jobId: a.jobId, channel: c?.email ? "email" : "sms", platform: "google_business" });
    if (!r.ok) return r;
    result = `Review request ${r.value!.id} sent to ${r.value!.to} (sandbox)`;
    href = "/marketing/reviews";
  } else if (a.type === "copy_campaign") {
    const r = copyCampaign(db, actor, a.campaignId);
    if (!r.ok) return r;
    result = `Draft campaign ${r.value} copied`;
    href = `/marketing/campaigns?id=${r.value}`;
  } else {
    const r = setAdBudget(db, actor, a.adId, a.to, rec.title);
    if (!r.ok) return r;
    result = `Budget changed from ${money(a.from)} to ${money(a.to)}`;
    href = `/marketing/ads?id=${a.adId}`;
  }
  (db.mktRecommendationLog ??= []).unshift({ id: nextId(db, "mktrec", "REC-"), key: rec.key, at: now(), by: actor.id, kind: rec.kind, result });
  log(db, actor, MODULE, `Marketing: Recommendation "${rec.title}" acted on by ${actor.name}: ${result}.`);
  return ok({ result, href });
}
