/**
 * Feature 34 (part 1) — social platforms and content: pure rules.
 *
 * The platform list is data: adding a platform means adding a row here (and
 * its live adapter in lib/integrations/social-server). Consent is extended to
 * employees who appear in media and to video; every publishing path still
 * runs through the feature-34 consent and approval gates.
 */
import type { Database, MarketingPost, MediaAsset, PostTemplate, SocialAccount, SocialPlatform } from "@/features/types";
import type {
  AdCreative, EmployeeMediaConsent, EngagementMetrics, LeadAttribution, PostTags, SocialAdCampaign, SocialContentType, SocialMessage,
} from "@/features/types/marketing-social";
import { consentCheck, findStreetAddress, usable, type ConsentResult } from "./marketing";

/* ------------------------------ Platforms ------------------------------ */

export interface PlatformSpec {
  id: SocialPlatform;
  label: string;
  /** Two-letter chip. */
  short: string;
  chip: string;
  maxChars: number;
  /** A post needs at least one photo or video. */
  requiresMedia: boolean;
  /** Only video can be posted (images not accepted). */
  videoOnly: boolean;
  maxImages: number;
  video: boolean;
  maxVideoSec: number;
  /** Title field (YouTube). */
  needsTitle: boolean;
  ads: boolean;
  /** Smallest daily budget the platform accepts, USD. */
  minDailyBudget: number;
  comments: boolean;
  dms: boolean;
  reviews: boolean;
}

export const SOCIAL_PLATFORMS: PlatformSpec[] = [
  { id: "facebook", label: "Facebook", short: "FB", chip: "bg-blue-50 text-blue-700 ring-blue-200", maxChars: 63206, requiresMedia: false, videoOnly: false, maxImages: 10, video: true, maxVideoSec: 14400, needsTitle: false, ads: true, minDailyBudget: 1, comments: true, dms: true, reviews: true },
  { id: "instagram", label: "Instagram", short: "IG", chip: "bg-pink-50 text-pink-700 ring-pink-200", maxChars: 2200, requiresMedia: true, videoOnly: false, maxImages: 10, video: true, maxVideoSec: 900, needsTitle: false, ads: true, minDailyBudget: 1, comments: true, dms: true, reviews: false },
  { id: "google_business", label: "Google Business Profile", short: "GB", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", maxChars: 1500, requiresMedia: false, videoOnly: false, maxImages: 1, video: true, maxVideoSec: 30, needsTitle: false, ads: false, minDailyBudget: 0, comments: false, dms: false, reviews: true },
  { id: "linkedin", label: "LinkedIn", short: "IN", chip: "bg-sky-50 text-sky-700 ring-sky-200", maxChars: 3000, requiresMedia: false, videoOnly: false, maxImages: 9, video: true, maxVideoSec: 900, needsTitle: false, ads: true, minDailyBudget: 10, comments: true, dms: false, reviews: false },
  { id: "tiktok", label: "TikTok", short: "TT", chip: "bg-slate-100 text-slate-800 ring-slate-300", maxChars: 2200, requiresMedia: true, videoOnly: false, maxImages: 35, video: true, maxVideoSec: 600, needsTitle: false, ads: true, minDailyBudget: 20, comments: true, dms: false, reviews: false },
  { id: "youtube", label: "YouTube", short: "YT", chip: "bg-red-50 text-red-700 ring-red-200", maxChars: 5000, requiresMedia: true, videoOnly: true, maxImages: 0, video: true, maxVideoSec: 43200, needsTitle: true, ads: true, minDailyBudget: 10, comments: true, dms: false, reviews: false },
  { id: "x", label: "X", short: "X", chip: "bg-zinc-100 text-zinc-800 ring-zinc-300", maxChars: 280, requiresMedia: false, videoOnly: false, maxImages: 4, video: true, maxVideoSec: 140, needsTitle: false, ads: true, minDailyBudget: 1, comments: true, dms: true, reviews: false },
];

export const PLATFORM_IDS = SOCIAL_PLATFORMS.map((p) => p.id);
export const PLATFORM_LABEL = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.id, p.label])) as Record<SocialPlatform, string>;
export const platformSpec = (id: SocialPlatform): PlatformSpec => SOCIAL_PLATFORMS.find((p) => p.id === id) ?? SOCIAL_PLATFORMS[0];
export const isPlatform = (v: unknown): v is SocialPlatform => typeof v === "string" && (PLATFORM_IDS as string[]).includes(v);

/* ------------------------------ Content types ------------------------------ */

export const CONTENT_TYPE_LABEL: Record<SocialContentType, string> = {
  text: "Text update", image: "Image", video: "Video", project_photos: "Project photos", before_after: "Before and after", testimonial: "Testimonial",
  announcement: "Announcement", promotion: "Promotion", educational: "Educational tip",
};
export const CONTENT_TYPES = Object.keys(CONTENT_TYPE_LABEL) as SocialContentType[];

/** The feature-34 template a content type is filed under (post.template stays required). */
export function legacyTemplate(t: SocialContentType): PostTemplate {
  if (t === "before_after") return "before_after";
  if (t === "project_photos" || t === "image" || t === "video" || t === "testimonial") return "finished_job";
  return "seasonal";
}

/** Default flags for the approval route. Testimonials and job photos always go to the owner. */
export function contentFlags(t: SocialContentType, tags: PostTags | undefined, base: MarketingPost["flags"]): MarketingPost["flags"] {
  return {
    customerProperty: base.customerProperty || ((t === "before_after" || t === "project_photos") && !!tags?.jobId),
    testimonial: base.testimonial || t === "testimonial",
    namedCrew: base.namedCrew,
  };
}

export const SEASONS: NonNullable<PostTags["season"]>[] = ["spring", "summer", "autumn", "winter", "holiday"];

export function seasonOf(iso: string): NonNullable<PostTags["season"]> {
  const m = new Date(iso).getUTCMonth();
  return m <= 1 || m === 11 ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "autumn";
}

/* ------------------------------ Uploads ------------------------------ */

export const MAX_IMAGE_MB = 8;
export const MAX_VIDEO_MB = 250;
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

/** Photos under 8 MB; MP4, MOV or WebM video under 250 MB. */
export function validateSocialUpload(file: { sizeMb: number; type: string; durationSec?: number }): { ok: boolean; error?: string; mediaType?: "image" | "video" } {
  if (file.type.startsWith("video/")) {
    if (!VIDEO_TYPES.includes(file.type)) return { ok: false, error: "Video must be MP4, MOV or WebM." };
    if (!(file.sizeMb < MAX_VIDEO_MB)) return { ok: false, error: `Video must be under ${MAX_VIDEO_MB} MB. This one is ${file.sizeMb} MB.` };
    return { ok: true, mediaType: "video" };
  }
  if (!file.type.startsWith("image/")) return { ok: false, error: "Only photographs and video can be uploaded." };
  if (!(file.sizeMb < MAX_IMAGE_MB)) return { ok: false, error: `Images must be under ${MAX_IMAGE_MB} MB. This one is ${file.sizeMb} MB.` };
  return { ok: true, mediaType: "image" };
}

/* ------------------------ Consent: employees and video (35) ------------------------ */

const isVideo = (a: MediaAsset) => a.mediaType === "video";

/**
 * Feature-34 consent plus two rules: every employee who appears needs a
 * media consent that covers the medium (photo or video), and video of a
 * customer's property needs a release that explicitly covers video.
 */
export function socialUsable(a: MediaAsset, consents: EmployeeMediaConsent[]): { ok: boolean; reason?: string } {
  const base = usable(a);
  if (!base.ok) return base;
  const video = isVideo(a);
  if (video && (a.kind === "customer_property" || (a.identifying && a.kind !== "crew")) && !a.videoRelease) {
    return { ok: false, reason: `Video of a customer's property needs a release that covers video. ${a.releaseRef ?? "The release on file"} covers photographs only.` };
  }
  const people = a.employeeIds ?? [];
  if (a.kind === "crew" && video && people.length === 0) return { ok: false, reason: "Name the employees in this video. The hiring release covers photographs only." };
  for (const id of people) {
    const c = consents.find((x) => x.employeeId === id && !x.withdrawnAt);
    if (!c) return { ok: false, reason: `${id} appears but has no employee media consent on file.` };
    if (video && !c.video) return { ok: false, reason: `${id}'s media consent (${c.ref}) covers photographs, not video.` };
    if (!video && !c.photo) return { ok: false, reason: `${id}'s media consent (${c.ref}) covers video, not photographs.` };
  }
  return { ok: true };
}

export function socialConsentCheck(assets: MediaAsset[], consents: EmployeeMediaConsent[]): ConsentResult {
  const base = consentCheck(assets);
  const failures = assets.map((a) => ({ a, u: socialUsable(a, consents) })).filter((x) => !x.u.ok).map((x) => `${x.a.id}: ${x.u.reason}`);
  const employeeRefs = assets.flatMap((a) => (a.employeeIds ?? []).map((e) => consents.find((c) => c.employeeId === e && !c.withdrawnAt)).filter((c): c is EmployeeMediaConsent => !!c).map((c) => `${c.ref} (${c.employeeId})`));
  return { ok: failures.length === 0, failures, releases: [...base.releases, ...new Set(employeeRefs)] };
}

/* ---------------------- Per-platform content and checks ---------------------- */

export function accountKey(a: Pick<SocialAccount, "id" | "platform">): string {
  return a.id ?? a.platform;
}

/** The account a post publishes to on a platform: the chosen one, else the first on that platform. */
export function accountFor(db: Pick<Database, "socialAccounts">, post: Pick<MarketingPost, "accountIds">, platform: SocialPlatform): SocialAccount | undefined {
  const chosen = post.accountIds?.[platform];
  const onPlatform = db.socialAccounts.filter((a) => a.platform === platform);
  return (chosen ? onPlatform.find((a) => accountKey(a) === chosen) : undefined) ?? onPlatform[0];
}

/** Copy and media that go to one platform: the platform's variant, falling back to the post. */
export function effectiveContent(post: Pick<MarketingPost, "copy" | "assetIds" | "variants">, platform: SocialPlatform) {
  const v = post.variants?.[platform];
  const assetIds = v?.assetIds ? v.assetIds.filter((id) => post.assetIds.includes(id)) : post.assetIds;
  const tags = v?.hashtags?.length ? `\n\n${v.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}` : "";
  return { copy: `${v?.copy ?? post.copy}${tags}`, assetIds, title: v?.title };
}

/** What stops one platform from taking this content. */
export function platformIssues(platform: SocialPlatform, content: { copy: string; title?: string }, assets: MediaAsset[]): string[] {
  const s = platformSpec(platform);
  const videos = assets.filter(isVideo);
  const images = assets.filter((a) => !isVideo(a));
  const out: string[] = [];
  if (content.copy.length > s.maxChars) out.push(`${s.label}: copy is ${content.copy.length} characters; the limit is ${s.maxChars}.`);
  if (s.requiresMedia && assets.length === 0) out.push(`${s.label} needs a ${s.videoOnly ? "video" : "photo or video"}.`);
  if (s.videoOnly && images.length) out.push(`${s.label} takes video only. Remove the photographs or customise the media for ${s.label}.`);
  if (!s.videoOnly && images.length > s.maxImages) out.push(`${s.label} takes at most ${s.maxImages} photo${s.maxImages === 1 ? "" : "s"} per post.`);
  if (videos.length && !s.video) out.push(`${s.label} doesn't take video.`);
  if (videos.length > 1) out.push(`${s.label}: one video per post.`);
  if (videos.length && images.length && platform !== "facebook") out.push(`${s.label}: don't mix photos and video in one post.`);
  for (const v of videos) if ((v.durationSec ?? 0) > s.maxVideoSec) out.push(`${s.label}: ${v.id} is ${v.durationSec}s; the limit is ${s.maxVideoSec}s.`);
  if (s.needsTitle && !content.title?.trim()) out.push(`${s.label} needs a video title. Add it under per-platform customisation.`);
  return out;
}

/**
 * Extra blockers on top of feature-34's postChecks: platform capability,
 * street addresses in per-platform copy, and variant media outside the
 * post's own (reviewed) media.
 */
export function socialBlockers(db: Pick<Database, "mediaAssets">, post: MarketingPost): string[] {
  const out: string[] = [];
  for (const platform of post.platforms) {
    const c = effectiveContent(post, platform);
    const v = post.variants?.[platform];
    const street = v?.copy ? findStreetAddress(v.copy) : null;
    if (street) out.push(`${PLATFORM_LABEL[platform]} copy contains a street address ("${street}"). Only the neighbourhood may be shown.`);
    if (v?.assetIds?.some((id) => !post.assetIds.includes(id))) out.push(`${PLATFORM_LABEL[platform]} uses media that isn't on the reviewed post.`);
    const assets = c.assetIds.map((id) => db.mediaAssets.find((a) => a.id === id)).filter((a): a is MediaAsset => !!a);
    out.push(...platformIssues(platform, c, assets));
  }
  return out;
}

/* ------------------------------ Generation (31) ------------------------------ */

export interface GenerationInput {
  contentType: SocialContentType;
  platform?: SocialPlatform;
  businessName?: string;
  serviceLabel?: string;
  /** Neighbourhood or city. A street address here is dropped. */
  area?: string;
  photos?: { count: number; beforeAfter?: boolean; video?: boolean };
  details?: string[];
  testimonial?: { quote: string; displayName: string };
  promotion?: { title: string; offer?: string; endsAt?: string };
  season?: PostTags["season"];
  /** A user template; built-in wording is used when absent. */
  templateBody?: string;
  hashtags?: string[];
  /** Private details the copy must never contain (customer name, street address, phone, email). */
  privateTerms?: string[];
}

export const BUILT_IN_BODIES: Record<SocialContentType, string> = {
  text: "{business} update: {details}",
  image: "{service} in {area}. {details}",
  video: "Watch the {service} come together in {area}. {details}",
  project_photos: "Another {service} finished in {area}. {photos} {details}",
  before_after: "Before and after: {service} in {area}. {photos} {details}",
  testimonial: "\"{testimonial}\" — {customer}, {area}. Thank you for trusting us with your {service}.",
  announcement: "News from {business}: {details}",
  promotion: "{promotion} {season_line} Ask us about {service} in {area}.",
  educational: "{season_line} Tip from the {business} crew: {details}",
};

const SEASON_LINE: Record<NonNullable<PostTags["season"]>, string> = {
  spring: "Spring is here — a good time to plan exterior work.",
  summer: "Long dry days are ideal for exterior painting.",
  autumn: "Mild days and low humidity make autumn great painting weather.",
  winter: "Winter is the time for interior projects.",
  holiday: "Getting the house ready for the holidays?",
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Strips street addresses, phone numbers, emails and any private term. */
export function scrubPrivate(text: string, privateTerms: string[] = []): { text: string; removed: string[] } {
  const removed: string[] = [];
  let t = text;
  for (let street = findStreetAddress(t); street; street = findStreetAddress(t)) {
    removed.push(street);
    t = t.replace(street, "");
  }
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, (m) => (removed.push(m), ""));
  t = t.replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, (m) => (removed.push(m), ""));
  for (const term of privateTerms.map((x) => x.trim()).filter((x) => x.length > 1)) {
    const re = new RegExp(`\\b${escapeRe(term)}\\b`, "gi");
    if (re.test(t)) {
      removed.push(term);
      t = t.replace(re, "");
    }
  }
  t = t.replace(/\s+([.,!?])/g, "$1").replace(/\(\s*\)/g, "").replace(/ {2,}/g, " ").replace(/\s+\n/g, "\n").trim();
  return { text: t, removed };
}

/**
 * Template-based post text (31). Placeholders: {business} {service} {area}
 * {photos} {details} {testimonial} {customer} {promotion} {season_line}.
 * Only the neighbourhood is ever shown; the customer is named only through an
 * approved testimonial's display name (first name and initial).
 */
export function generatePostText(input: GenerationInput): { text: string; hashtags: string[]; removed: string[] } {
  const area = input.area && !findStreetAddress(input.area) ? input.area : "the area";
  const photos = input.photos?.count
    ? input.photos.video ? "Video from the job." : input.photos.beforeAfter ? `Swipe to see the change.` : `${input.photos.count} photo${input.photos.count === 1 ? "" : "s"} from the job.`
    : "";
  const promo = input.promotion ? `${input.promotion.title}${input.promotion.offer ? `: ${input.promotion.offer}` : ""}${input.promotion.endsAt ? ` Ends ${input.promotion.endsAt.slice(0, 10)}.` : "."}` : "";
  const values: Record<string, string> = {
    business: input.businessName ?? "our",
    service: (input.serviceLabel ?? "painting").toLowerCase(),
    area,
    photos,
    details: (input.details ?? []).filter(Boolean).join(". "),
    testimonial: input.testimonial?.quote ?? "",
    customer: input.testimonial?.displayName ?? "a customer",
    promotion: promo,
    season_line: input.season ? SEASON_LINE[input.season] : "",
  };
  const body = input.templateBody?.trim() || BUILT_IN_BODIES[input.contentType];
  const filled = body.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");
  // The testimonial display name is allowed; the full private name is not.
  const scrub = scrubPrivate(filled, input.privateTerms);
  const spec = input.platform ? platformSpec(input.platform) : undefined;
  const hashtags = [...new Set([...(input.hashtags ?? []), ...(input.serviceLabel ? [input.serviceLabel.replace(/\W+/g, "")] : []), ...(input.area && area !== "the area" ? [area.replace(/\W+/g, "")] : [])])].filter(Boolean).slice(0, 5);
  let text = scrub.text.replace(/\.\s*\./g, ".");
  if (spec && text.length > spec.maxChars) text = `${text.slice(0, spec.maxChars - 1).trimEnd()}…`;
  return { text, hashtags, removed: scrub.removed };
}

/** First name and last initial, for public testimonial attribution. */
export function displayNameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A customer";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/* ------------------------------ Engagement (15) ------------------------------ */

export const METRIC_KEYS: (keyof EngagementMetrics)[] = ["likes", "comments", "shares", "saves", "messages", "mentions", "clicks", "views", "reach", "impressions"];
export const METRIC_LABEL: Record<keyof EngagementMetrics, string> = {
  likes: "Likes", comments: "Comments", shares: "Shares", saves: "Saves", messages: "Messages", mentions: "Mentions", clicks: "Clicks", views: "Views", reach: "Reach", impressions: "Impressions",
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Sandbox engagement: the same reference and age always give the same
 * numbers, growing with the post's age and levelling off after a week.
 */
export function sandboxMetrics(externalRef: string, ageHours: number): EngagementMetrics {
  const h = hash(externalRef);
  const growth = Math.min(1, Math.max(0, ageHours) / 168);
  const reach = Math.round((200 + (h % 1800)) * growth);
  const impressions = Math.round(reach * (1.2 + ((h >> 3) % 60) / 100));
  const f = (mod: number, pct: number) => Math.round(reach * (pct + ((h >> mod) % 20) / 1000));
  return { reach, impressions, views: f(5, 0.35), likes: f(7, 0.04), comments: f(9, 0.004), shares: f(11, 0.003), saves: f(13, 0.002), clicks: f(15, 0.01), messages: f(17, 0.001), mentions: f(19, 0.0005) };
}

/** Numbers from a connector must be whole and non-negative; missing keys count as zero. */
export function validateMetrics(m: unknown): { metrics: EngagementMetrics } | { error: string } {
  if (!m || typeof m !== "object") return { error: "Metrics must be an object." };
  const out = {} as EngagementMetrics;
  for (const k of METRIC_KEYS) {
    const v = (m as Record<string, unknown>)[k] ?? 0;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return { error: `${k} must be a non-negative number.` };
    out[k] = Math.round(v);
  }
  return { metrics: out };
}

/* ------------------------------ Inbox (16) ------------------------------ */

const QUOTE = /\b(quote|estimate|price|pricing|how much|cost|book|booking|availability|available|schedule|come out|free consult)\b/i;

export function detectIntent(text: string): SocialMessage["intent"] {
  if (QUOTE.test(text)) return "quote_request";
  if (/\?\s*$|\b(what|which|when|do you|can you)\b/i.test(text)) return "question";
  return "general";
}

export function validateReply(platform: SocialPlatform, text: string): string | undefined {
  const t = text.trim();
  if (!t) return "Write a reply first.";
  const street = findStreetAddress(t);
  if (street) return `Blocked: "${street}" is a street address. Don't post addresses in public replies.`;
  const max = Math.min(platformSpec(platform).maxChars, 8000);
  if (t.length > max) return `${PLATFORM_LABEL[platform]} replies are limited to ${max} characters.`;
  return undefined;
}

/** Payload for POST /api/leads/intake from an inbox message, with attribution. */
export function leadIntakeFromMessage(msg: SocialMessage, post?: Pick<MarketingPost, "id" | "tags">) {
  const attribution: LeadAttribution = {
    platform: msg.platform, messageId: msg.id, postId: post?.id ?? msg.postId, adId: msg.adId,
    campaignId: post?.tags?.campaignId, promotionId: post?.tags?.promotionId, jobId: post?.tags?.jobId, serviceType: post?.tags?.serviceType, location: post?.tags?.location,
  };
  for (const k of Object.keys(attribution) as (keyof LeadAttribution)[]) if (attribution[k] === undefined) delete attribution[k];
  return {
    name: msg.author.name,
    email: msg.author.email,
    phone: msg.author.phone,
    message: msg.text,
    source: `${PLATFORM_LABEL[msg.platform]} ${msg.kind === "dm" ? "message" : msg.kind}`,
    attribution,
  };
}

/* ------------------------------ Ads (21) ------------------------------ */

export const AD_MAX_WITHOUT_REVIEW = 1000;

const dayDiff = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

/** Budget, schedule, audience and creatives, against the platform's own limits. */
export function validateAd(ad: Pick<SocialAdCampaign, "name" | "platform" | "budget" | "schedule" | "audience" | "creatives">, todayIso: string): string[] {
  const s = platformSpec(ad.platform);
  const out: string[] = [];
  if (!ad.name.trim()) out.push("Name the ad campaign.");
  if (!s.ads) out.push(`${s.label} ads aren't available through this connector.`);
  const amt = ad.budget.amount;
  if (!Number.isFinite(amt) || amt <= 0) out.push("Enter a budget greater than $0.");
  else if (Math.round(amt * 100) !== amt * 100) out.push("Budget must be in whole cents.");
  if (!ad.schedule.start) out.push("Choose a start date.");
  else if (ad.schedule.start < todayIso.slice(0, 10)) out.push("The start date is in the past.");
  if (ad.schedule.end && ad.schedule.start && ad.schedule.end <= ad.schedule.start) out.push("The end date must be after the start date.");
  if (ad.budget.type === "lifetime" && !ad.schedule.end) out.push("A lifetime budget needs an end date.");
  if (s.ads && amt > 0) {
    if (ad.budget.type === "daily" && amt < s.minDailyBudget) out.push(`${s.label} needs at least $${s.minDailyBudget} a day.`);
    if (ad.budget.type === "lifetime" && ad.schedule.end && ad.schedule.start) {
      const days = Math.max(1, dayDiff(ad.schedule.start, ad.schedule.end));
      if (amt < s.minDailyBudget * days) out.push(`${s.label} needs at least $${s.minDailyBudget} a day: $${(s.minDailyBudget * days).toFixed(2)} for ${days} days.`);
    }
  }
  if (!ad.audience.locations.length && !ad.audience.audienceId) out.push("Target at least one location or a saved audience.");
  if (ad.audience.locations.some((l) => findStreetAddress(l))) out.push("Target neighbourhoods, cities or ZIP codes — not street addresses.");
  if (ad.audience.ageMin < 18 || ad.audience.ageMax > 65 || ad.audience.ageMin > ad.audience.ageMax) out.push("Age range must be between 18 and 65+.");
  if (!ad.creatives.length) out.push("Add at least one creative.");
  ad.creatives.forEach((c: AdCreative, i) => {
    if (!c.headline.trim() || !c.text.trim()) out.push(`Creative ${i + 1} needs a headline and text.`);
    const street = findStreetAddress(`${c.headline} ${c.text}`);
    if (street) out.push(`Creative ${i + 1} contains a street address ("${street}").`);
    if (c.url && !/^https:\/\//.test(c.url)) out.push(`Creative ${i + 1}: the link must use https.`);
  });
  return out;
}

/** Total spend the approval covers. Daily budgets without an end date are approved per 30 days. */
export function approvedSpend(ad: Pick<SocialAdCampaign, "budget" | "schedule">): number {
  if (ad.budget.type === "lifetime") return ad.budget.amount;
  const days = ad.schedule.end ? Math.max(1, dayDiff(ad.schedule.start, ad.schedule.end)) : 30;
  return Math.round(ad.budget.amount * days * 100) / 100;
}

/** Sandbox ad delivery: deterministic, bounded by the budget. */
export function sandboxAdPerformance(ad: Pick<SocialAdCampaign, "id" | "budget" | "schedule">, todayIso: string) {
  const h = hash(ad.id);
  const days = Math.max(0, Math.min(dayDiff(ad.schedule.start, todayIso.slice(0, 10)) + 1, ad.schedule.end ? dayDiff(ad.schedule.start, ad.schedule.end) : 365));
  const cap = ad.budget.type === "daily" ? ad.budget.amount * days : ad.budget.amount;
  const spend = Math.round(Math.min(cap, ad.budget.amount * (ad.budget.type === "daily" ? days * 0.92 : Math.min(1, days / 14))) * 100) / 100;
  const impressions = Math.round(spend * (90 + (h % 60)));
  const reach = Math.round(impressions * 0.7);
  const clicks = Math.round(impressions * (0.008 + ((h >> 4) % 10) / 1000));
  return { spend, impressions, reach, clicks, leads: Math.round(clicks * 0.06) };
}

/* ------------------------------ Reviews (14) ------------------------------ */

export const REVIEW_REQUEST_COOLDOWN_DAYS = 90;

export function reviewRequestBlocker(input: {
  customer?: { personalDataDeleted?: boolean; email?: string; phone?: string };
  channel: "email" | "sms";
  optedOut?: boolean;
  lastRequestAt?: string;
  nowIso: string;
}): string | undefined {
  const c = input.customer;
  if (!c) return "Customer not found.";
  if (c.personalDataDeleted) return "This customer's personal data was deleted. No contact.";
  if (input.optedOut) return "The property is opted out of outreach.";
  if (input.channel === "email" && !c.email) return "No email on file.";
  if (input.channel === "sms" && !c.phone) return "No mobile number on file.";
  if (input.lastRequestAt && (new Date(input.nowIso).getTime() - new Date(input.lastRequestAt).getTime()) / 86_400_000 < REVIEW_REQUEST_COOLDOWN_DAYS) {
    return `A review was already requested on ${input.lastRequestAt.slice(0, 10)}. Wait ${REVIEW_REQUEST_COOLDOWN_DAYS} days between requests.`;
  }
  return undefined;
}

export function reviewRequestBody(firstName: string, businessName: string, link: string, platform: SocialPlatform): string {
  return `Hi ${firstName}, thank you for choosing ${businessName}. If you were happy with the work, would you leave us a short review on ${PLATFORM_LABEL[platform]}? ${link} Reply STOP to opt out.`;
}
