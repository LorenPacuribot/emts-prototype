/**
 * Feature 34 (part 1) — social platforms and content.
 *
 * New records live here. Optional fields on the existing feature-34 records
 * (MarketingPost, PostPublication, SocialAccount, MediaAsset) are added by
 * interface merging below, so older saved data stays valid and
 * features/types/index.ts only gains the Database collections.
 */
import type { ID, ISODate, SocialPlatform } from "./index";

export type SocialContentType =
  | "text"
  | "image"
  | "video"
  | "project_photos"
  | "before_after"
  | "testimonial"
  | "announcement"
  | "promotion"
  | "educational";

/** What a post is about. campaignId / promotionId come from marketing part 2. */
export interface PostTags {
  campaignId?: ID;
  promotionId?: ID;
  serviceType?: string;
  customerId?: ID;
  propertyId?: ID;
  jobId?: ID;
  /** Neighbourhood or city only — never a street address. */
  location?: string;
  season?: "spring" | "summer" | "autumn" | "winter" | "holiday";
}

/** Per-platform customisation of a post. Media must come from the post's own (approved) media. */
export interface PlatformVariant {
  copy?: string;
  assetIds?: ID[];
  hashtags?: string[];
  /** YouTube / LinkedIn article title. */
  title?: string;
}

export type ConnectionKind = "sandbox" | "live";

export interface TokenHealth {
  state: "healthy" | "expiring" | "expired" | "revoked" | "unknown";
  checkedAt: ISODate;
  /** Scopes the server reports as granted (never the token itself). */
  scopes?: string[];
  error?: string;
}

/** A user-created, reusable post template. `{placeholders}` are filled by the generator. */
export interface SocialTemplate {
  id: ID; // STPL-1
  name: string;
  contentType: SocialContentType;
  body: string;
  hashtags: string[];
  platforms: SocialPlatform[];
  builtIn?: boolean;
  createdBy: ID;
  createdAt: ISODate;
  archivedAt?: ISODate;
}

export interface EngagementMetrics {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  messages: number;
  mentions: number;
  clicks: number;
  views: number;
  reach: number;
  impressions: number;
}

/** Latest engagement for one post on one platform, as reported by the connector. */
export interface SocialMetricSnapshot {
  id: ID; // SMET-1
  postId: ID;
  platform: SocialPlatform;
  externalRef: string;
  at: ISODate;
  /** Deterministic sandbox numbers, labelled as such everywhere. */
  sandbox: boolean;
  metrics: EngagementMetrics;
}

export interface SocialReply {
  at: ISODate;
  by: ID;
  text: string;
  status: "sending" | "sent" | "failed";
  externalRef?: string;
  error?: string;
}

/** Central social inbox: comments, DMs and mentions from every platform. */
export interface SocialMessage {
  id: ID; // SMSG-1
  platform: SocialPlatform;
  accountId?: string;
  kind: "comment" | "dm" | "mention";
  /** Platform's own ID for the message: repeats are ignored. */
  externalId: string;
  threadId?: string;
  /** App post this is on, resolved from the platform reference. */
  postId?: ID;
  externalPostRef?: string;
  adId?: ID;
  author: { name: string; handle?: string; email?: string; phone?: string };
  text: string;
  at: ISODate;
  sandbox: boolean;
  status: "open" | "replied" | "closed";
  replies: SocialReply[];
  /** Staff member working the conversation (patent §34 social inbox). */
  assignedTo?: ID;
  /** Marked done (status "closed") by whom and when. */
  doneAt?: ISODate;
  doneBy?: ID;
  intent?: "quote_request" | "question" | "general";
  customerId?: ID;
  leadId?: ID;
  /** Lead intake requested (POST /api/leads/intake) and what came back. */
  leadRequest?: { at: ISODate; by: ID; via: "intake" | "local"; status: "requested" | "created" | "attached" | "failed"; error?: string };
  attribution?: LeadAttribution;
}

export interface LeadAttribution {
  campaignId?: ID;
  promotionId?: ID;
  postId?: ID;
  platform?: SocialPlatform;
  adId?: ID;
  messageId?: ID;
  jobId?: ID;
  serviceType?: string;
  location?: string;
}

export interface SocialReview {
  id: ID; // SREV-1
  platform: SocialPlatform;
  externalId: string;
  author: string;
  rating: number;
  text: string;
  at: ISODate;
  sandbox: boolean;
  customerId?: ID;
  jobId?: ID;
  response?: { text: string; by: ID; at: ISODate; status: "sending" | "sent" | "failed"; externalRef?: string; error?: string };
  testimonial?: {
    status: "approved" | "rejected";
    by: ID;
    at: ISODate;
    /** Public attribution: first name and initial only. */
    displayName: string;
    quote: string;
  };
}

export interface ReviewRequest {
  id: ID; // RVRQ-1
  customerId: ID;
  jobId?: ID;
  channel: "email" | "sms";
  to: string;
  platform: SocialPlatform;
  link: string;
  body: string;
  by: ID;
  at: ISODate;
  status: "sending" | "sent" | "failed";
  messageRef?: string;
  error?: string;
}

/** Consent for an employee to appear in marketing photos and/or video (35). */
export interface EmployeeMediaConsent {
  id: ID; // EMC-1
  employeeId: ID;
  photo: boolean;
  video: boolean;
  ref: string;
  signedAt: ISODate;
  recordedBy: ID;
  withdrawnAt?: ISODate;
}

export type AdStatus = "draft" | "pending_approval" | "approved" | "active" | "paused" | "completed" | "rejected" | "failed";

export interface AdCreative {
  postId?: ID;
  assetIds: ID[];
  headline: string;
  text: string;
  cta: "learn_more" | "get_quote" | "call_now" | "book_now" | "contact_us";
  url?: string;
}

export interface AdPerformance {
  at: ISODate;
  sandbox: boolean;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
}

export interface SocialAdCampaign {
  id: ID; // SAD-1
  name: string;
  platform: SocialPlatform;
  accountId?: string;
  objective: "awareness" | "traffic" | "leads" | "messages" | "video_views";
  /** Marketing part 2 campaign this ad belongs to. */
  campaignId?: ID;
  promotionId?: ID;
  budget: { type: "daily" | "lifetime"; amount: number; currency: "USD" };
  schedule: { start: string; end?: string };
  audience: { locations: string[]; radiusMiles?: number; ageMin: number; ageMax: number; interests: string[]; audienceId?: ID };
  creatives: AdCreative[];
  status: AdStatus;
  approval?: { by: ID; at: ISODate; budget: number };
  rejection?: { by: ID; at: ISODate; comment: string };
  externalRef?: string;
  sandbox?: boolean;
  error?: string;
  performance?: AdPerformance;
  createdBy: ID;
  createdAt: ISODate;
  history: { at: ISODate; by: ID; note: string }[];
}

/** A customer's permission to use a photo, recorded in the Media Library. */
export interface ReleaseRecord {
  type: "verbal_approval" | "written_approval";
  /** Who gave permission, usually the customer. */
  givenBy: string;
  /** What was said and how: "Said yes on the phone, OK to show the front of the house". */
  note: string;
  by: ID;
  at: ISODate;
}

/* ---------------- Optional fields on existing feature-34 records ---------------- */

declare module "./index" {
  interface MarketingPost {
    contentType?: SocialContentType;
    tags?: PostTags;
    variants?: Partial<Record<SocialPlatform, PlatformVariant>>;
    /** Which connected account to use per platform (several per platform allowed). */
    accountIds?: Partial<Record<SocialPlatform, string>>;
    templateId?: ID;
    testimonialReviewId?: ID;
    /** Set when the copy came from the generator. */
    generated?: { at: ISODate; from: string[] };
  }
  interface PostPublication {
    accountId?: string;
    sandbox?: boolean;
    url?: string;
    /** Sent to the live connector; the outcome is unclear until the server answers. */
    awaitingLive?: boolean;
  }
  interface SocialAccount {
    /** Stable ID so several accounts can exist per platform. Older records use the platform. */
    id?: string;
    handle?: string;
    connection?: ConnectionKind;
    health?: TokenHealth;
    connectedAt?: ISODate;
    connectedBy?: ID;
  }
  interface MediaAsset {
    mediaType?: "image" | "video";
    mimeType?: string;
    durationSec?: number;
    /** Key of the file in the browser's IndexedDB media store. */
    blobKey?: string;
    /**
     * The uploaded photo, resized to a small JPEG and kept on the record so
     * every viewer of the shared demo sees it. Production stores the file in
     * cloud storage and keeps only its address here.
     */
    dataUrl?: string;
    /** The original photo's pixel size: its shape decides how each feed crops it. */
    width?: number;
    height?: number;
    /** Permission recorded by the office after the fact (verbal or written), with the note of what was said. */
    releaseRecord?: ReleaseRecord;
    /** Before / after pairing for job photos. */
    phase?: "before" | "after";
    pairId?: ID;
    /** Owner-approved for marketing use (project photos). */
    approvedForMarketing?: { by: ID; at: ISODate };
    /** Employees who appear in the photo or video. */
    employeeIds?: ID[];
    /** The customer's release explicitly covers video. */
    videoRelease?: boolean;
  }
}
