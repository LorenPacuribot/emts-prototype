/**
 * Feature 34 (part 2) — Marketing campaigns and growth.
 *
 * Campaigns, promotions and referral programmes, trackable links and QR
 * codes, landing pages and forms, marketing contacts and saved segments,
 * email/SMS campaigns, automations, marketing expenses and the attribution
 * records that tie a lead back to the campaign, ad, platform, referral,
 * landing page or offer it came from.
 *
 * Every collection is optional on Database: older saved data gets it from the
 * seed when it loads (lib/store merge).
 */
import type { ID, ISODate } from "./index";

/** Where marketing activity happens. Social platforms are Part 1's; the rest are ours. */
export type MarketingChannel = "facebook" | "instagram" | "google" | "nextdoor" | "email" | "sms" | "website" | "print" | "referral" | "event" | "other";

/** The services the business markets (job types plus specialty work). */
export type MarketingService = "interior_repaint" | "exterior_repaint" | "cabinets" | "deck_fence" | "commercial" | "new_construction" | "mixed";

export type CampaignObjective = "awareness" | "leads" | "bookings" | "reviews" | "referrals" | "reengagement" | "seasonal";
export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export interface MarketingCampaign {
  id: ID; // CMP-1
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  /** Saved audience segment the campaign targets. */
  segmentId?: ID;
  services: MarketingService[];
  /** Towns or ZIP codes. */
  locations: string[];
  channels: MarketingChannel[];
  budget: number;
  startDate: string; // YYYY-MM-DD
  endDate?: string;
  /** Promotions (offers) the campaign runs. */
  offerIds: ID[];
  /** Linked Part 1 social posts and ads, email/SMS campaigns and landing pages. */
  postIds: ID[];
  adIds: ID[];
  messageCampaignIds: ID[];
  landingPageIds: ID[];
  notes?: string;
  /** Owner budget changes (recommendations or by hand). */
  budgetHistory?: { at: ISODate; by: ID; from: number; to: number; reason: string }[];
  /** Copied from a high performer. */
  copiedFrom?: ID;
  createdBy: ID;
  createdAt: ISODate;
  updatedAt?: ISODate;
}

export type PromotionKind = "discount" | "coupon" | "referral" | "seasonal" | "package";

export interface PromoRedemption {
  id: ID; // RED-1
  at: ISODate;
  code: string;
  customerId?: ID;
  leadId?: ID;
  estimateId?: ID;
  jobId?: ID;
  /** Discount actually given, when known. */
  amount?: number;
  source: "landing_page" | "office" | "inbound" | "estimate";
  by?: ID;
}

export interface Promotion {
  id: ID; // PROMO-1
  name: string;
  kind: PromotionKind;
  /** Upper-case unique code customers quote. */
  code: string;
  description?: string;
  discountType: "percent" | "amount";
  value: number;
  validFrom: string; // YYYY-MM-DD
  validTo?: string;
  /** Total redemptions allowed (undefined = unlimited). */
  maxRedemptions?: number;
  /** Redemptions per customer (undefined = unlimited). */
  perCustomerLimit?: number;
  /** Minimum job value before tax. */
  minSpend?: number;
  /** Restrict to these services (empty = any). */
  services?: MarketingService[];
  /** Service package contents (kind "package"). */
  packageItems?: string[];
  /** Referral programme rewards (kind "referral"). */
  referralReward?: { referrerReward: number; refereeReward: number; rewardType: "credit" | "gift_card" | "discount"; qualifyOn: "estimate_accepted" | "job_completed" };
  season?: "spring" | "summer" | "fall" | "winter";
  campaignId?: ID;
  active: boolean;
  redemptions: PromoRedemption[];
  createdBy: ID;
  createdAt: ISODate;
}

export interface ReferralRecord {
  leadId: ID;
  customerId: ID;
  at: ISODate;
  status: "pending" | "qualified" | "rewarded";
  qualifiedAt?: ISODate;
  rewardAmount?: number;
  rewardedAt?: ISODate;
  rewardedBy?: ID;
}

/** A referrer's personal code under a referral programme. */
export interface ReferralCode {
  id: ID; // REF-1
  code: string;
  promotionId: ID;
  /** The referrer: a customer or a marketing contact (partner, agent, manager). */
  referrerCustomerId?: ID;
  referrerContactId?: ID;
  referrerName: string;
  createdAt: ISODate;
  createdBy: ID;
  referrals: ReferralRecord[];
}

export interface LinkClick {
  id: ID; // server event id — never applied twice
  at: ISODate;
  device: "mobile" | "tablet" | "desktop";
  referrer?: string;
  via: "link" | "qr";
}

export interface UtmParams {
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
}

/** Trackable short link served at /r/{code}; the QR code encodes the same URL with via=qr. */
export interface TrackLink {
  id: ID; // LNK-1
  code: string;
  name: string;
  /** Absolute URL or an app path such as /lp/spring-exterior. */
  target: string;
  utm: UtmParams;
  campaignId?: ID;
  promotionId?: ID;
  referralCodeId?: ID;
  landingPageId?: ID;
  platform?: MarketingChannel;
  kind: "link" | "qr";
  active: boolean;
  clicks: LinkClick[];
  createdBy: ID;
  createdAt: ISODate;
}

export type FormKind = "contact" | "quote" | "booking";

export interface FormField {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select" | "date" | "checkbox";
  required: boolean;
  options?: string[];
  /** Maps the answer onto the intake payload. */
  maps?: "name" | "email" | "phone" | "street" | "city" | "state" | "zip" | "message" | "service" | "preferredDate" | "preferredWindow" | "promoCode" | "referralCode";
}

export interface LandingPage {
  id: ID; // LP-1
  slug: string;
  title: string;
  headline: string;
  body: string;
  /** Hero accent colour. */
  accent: string;
  service?: MarketingService;
  location?: string;
  campaignId?: ID;
  promotionId?: ID;
  status: "draft" | "published" | "archived";
  form: { kind: FormKind; fields: FormField[]; submitLabel: string; successMessage: string };
  views: number;
  createdBy: ID;
  createdAt: ISODate;
  publishedAt?: ISODate;
}

/** Attribution as sent to POST /api/leads/intake (shared contract). */
export interface IntakeAttribution {
  campaignId?: ID;
  postId?: ID;
  platform?: string;
  adId?: ID;
  landingPageId?: ID;
  formId?: ID;
  promoCode?: string;
  referralCode?: string;
  utm?: Partial<UtmParams>;
}

export type InboundChannel = "social" | "ad" | "landing_page" | "qr" | "referral" | "promo" | "other";

/** What we know about where a lead came from (one per lead). */
export interface LeadAttributionRecord {
  leadId: ID;
  channel: InboundChannel;
  campaignId?: ID;
  adId?: ID;
  postId?: ID;
  platform?: MarketingChannel;
  referralCodeId?: ID;
  landingPageId?: ID;
  promotionId?: ID;
  /** The code quoted, stored on the lead (and on the estimate through its redemption). */
  promoCode?: string;
  referralCode?: string;
  linkId?: ID;
  utm?: Partial<UtmParams>;
  service?: MarketingService;
  estimateRequested?: boolean;
  at: ISODate;
}

export interface FormSubmission {
  id: ID; // SUB-1
  /** Stable reference of the submission (never applied twice). */
  ref: string;
  at: ISODate;
  channel: InboundChannel;
  landingPageId?: ID;
  formKind: FormKind;
  values: Record<string, string>;
  attribution: IntakeAttribution;
  customerId: ID;
  leadId: ID;
  propertyId?: ID;
  appointmentRequestId?: ID;
  outcome: "new" | "matched";
}

export interface AppointmentRequest {
  id: ID; // APR-1
  at: ISODate;
  customerId: ID;
  leadId: ID;
  propertyId?: ID;
  preferredDate?: string;
  preferredWindow?: string;
  service?: MarketingService;
  status: "requested" | "confirmed" | "declined";
  source: InboundChannel;
  decidedAt?: ISODate;
  decidedBy?: ID;
  scheduledAt?: ISODate;
}

export type ContactGroup = "prospect" | "existing_customer" | "past_customer" | "referral_partner" | "property_manager" | "real_estate" | "other";

export interface MarketingContact {
  id: ID; // MC-1
  name: string;
  email?: string;
  phone?: string;
  group: ContactGroup;
  company?: string;
  customerId?: ID;
  town?: string;
  zip?: string;
  interests: MarketingService[];
  optOutEmail?: boolean;
  optOutSms?: boolean;
  source?: string;
  createdAt: ISODate;
  lastEngagedAt?: ISODate;
}

export type AudienceStatus = "prospect" | "lead" | "active_customer" | "past_customer" | "partner";

export interface SegmentRules {
  groups?: ContactGroup[];
  locations?: string[];
  services?: MarketingService[];
  propertyTypes?: ("single_family" | "multifamily" | "commercial")[];
  statuses?: AudienceStatus[];
  minJobs?: number;
  maxJobs?: number;
  /** Last completed job at least this many days ago. */
  lastJobOlderThanDays?: number;
  interests?: MarketingService[];
  engagement?: "engaged" | "unengaged";
  leadSources?: string[];
  reachableBy?: "email" | "sms";
}

export interface AudienceSegment {
  id: ID; // SEG-1
  name: string;
  description?: string;
  rules: SegmentRules;
  createdBy: ID;
  createdAt: ISODate;
}

export type SendStatus = "sent" | "sandbox" | "failed" | "skipped_opt_out" | "skipped_no_address";

export interface SendLogEntry {
  memberKey: string;
  name: string;
  to?: string;
  status: SendStatus;
  messageId?: string;
  error?: string;
  at: ISODate;
}

export interface MessageCampaign {
  id: ID; // MSG-1
  name: string;
  channel: "email" | "sms";
  segmentId: ID;
  campaignId?: ID;
  subject?: string;
  /** {{first_name}}, {{name}} and {{code}} are filled per recipient. */
  body: string;
  promotionId?: ID;
  status: "draft" | "sent";
  sentAt?: ISODate;
  sentBy?: ID;
  sends: SendLogEntry[];
  createdBy: ID;
  createdAt: ISODate;
}

export type AutomationKind = "estimate_follow_up" | "review_request" | "seasonal_reminder" | "referral_request" | "reengagement";

export interface MarketingAutomation {
  id: ID; // AUTO-1
  name: string;
  kind: AutomationKind;
  active: boolean;
  channel: "email" | "sms";
  /** Days after the trigger event before sending. */
  delayDays: number;
  subject?: string;
  body: string;
  /** Seasonal reminder: send on/after this month and day each year. */
  seasonMonth?: number;
  seasonDay?: number;
  seasonServices?: MarketingService[];
  /** Re-engagement: no job or lead for this many days. */
  inactiveDays?: number;
  lastRunAt?: ISODate;
  createdBy: ID;
  createdAt: ISODate;
}

export interface AutomationRun {
  id: ID; // RUN-1
  at: ISODate;
  automationId: ID;
  /** What triggered it (EST-…, JOB-…, customer+year). Never sent twice. */
  targetKey: string;
  customerId?: ID;
  name: string;
  to?: string;
  status: SendStatus;
  messageId?: string;
  error?: string;
  trigger: "daily" | "manual" | "recommendation";
}

export type ExpenseCategory = "ads" | "promo_materials" | "photography" | "video" | "printing" | "sponsorships" | "software" | "other";

export interface MarketingExpense {
  id: ID; // MEX-1
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  vendor: string;
  description: string;
  amount: number;
  campaignId?: ID;
  platform?: MarketingChannel;
  service?: MarketingService;
  location?: string;
  customerId?: ID;
  jobId?: ID;
  /** The accounting expense record in Finance, when one exists. */
  financeExpenseId?: ID;
  createdBy: ID;
  createdAt: ISODate;
}

/** Communication history across inbound and outbound marketing touches. */
export interface CommEntry {
  id: ID; // COM-1
  at: ISODate;
  customerId?: ID;
  leadId?: ID;
  contactId?: ID;
  channel: "email" | "sms" | "form" | "social" | "ad" | "qr" | "referral" | "call" | "other";
  direction: "inbound" | "outbound";
  subject?: string;
  body: string;
  campaignId?: ID;
  messageCampaignId?: ID;
  automationId?: ID;
  status?: SendStatus;
}

export interface MarketingOptOut {
  address: string; // normalised email or phone
  channel: "email" | "sms";
  at: ISODate;
  source: string;
}

export interface MarketingGrowthSettings {
  /** YYYY-MM-DD of the last daily automation run. */
  lastAutomationDay?: string;
  /** Highest server event sequence applied from /api/marketing/events. */
  eventCursor?: number;
  dismissedAlerts?: string[];
  /** Crew-days a crew can take per week, for the capacity recommendation. */
  crewDaysPerWeek?: number;
}

export interface RecommendationLogEntry {
  id: ID; // REC-1
  key: string;
  at: ISODate;
  by: ID;
  kind: string;
  result: string;
}
