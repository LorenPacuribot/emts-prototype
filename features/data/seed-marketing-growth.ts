/**
 * Feature 34 part 2 seed (patent §34 campaigns and growth).
 *
 * - CMP-1 "Spring exterior push" (completed): Korah Singer's lead became
 *   JOB-2026-1, so the campaign shows revenue, spend, CAC and ROI.
 * - CMP-2 "Fall interior refresh" (active): three open leads, Instagram ad
 *   spend, photography and door hangers, a bio link and a door-hanger QR code
 *   with clicks, the FALL10 offer and a draft email to Dallas homeowners.
 * - CMP-3 "Cabinet refinishing — winter" (draft) has no activity yet.
 * - REFER150: referral programme; Korah's code KORAH150 referred Jeremy Irons.
 * - Reviews: one waiting for a response, one approved as a testimonial.
 * - Social inbox: Maya Chen's quote request from the Instagram ad SAD-1 and
 *   Ron Patel's question on POST-8 need replies; one answered, one done.
 * - Ads: SAD-1 running on CMP-2 (sandbox results, no leads yet), SAD-2 on
 *   CMP-3 waiting for owner approval.
 * - Landing pages: /lp/fall-interior live with FALL10; /lp/cabinet-booking draft.
 * - Automations: all five kinds; estimate follow-up and review request on.
 *
 * Every collection is optional on Database, so data saved before this
 * release gets these from the seed when it loads (lib/store merge).
 */
import type { AudienceSegment, LeadAttributionRecord, MarketingCampaign, MarketingExpense, MessageCampaign, Promotion, ReferralCode, TrackLink } from "@/features/types/marketing-growth";
import type { ReviewRequest, SocialAdCampaign, SocialMessage, SocialReview } from "@/features/types/marketing-social";
import type { AutomationRun, CommEntry, LandingPage, MarketingAutomation } from "@/features/types/marketing-growth";
import { addDays } from "@/features/lib/rules/dates";
import { defaultFields } from "@/features/lib/rules/marketing-growth";

export function marketingGrowthSeed(nowIso: string) {
  const d = (days: number) => addDays(nowIso, days);
  const day = (days: number) => d(days).slice(0, 10);
  const base = { createdBy: "U-OFFICE" };

  const mktCampaigns: MarketingCampaign[] = [
    {
      id: "CMP-3", name: "Cabinet refinishing — winter", objective: "bookings", status: "draft", services: ["cabinets"], locations: ["Dallas", "Plano"], channels: ["facebook", "instagram", "email"],
      budget: 1200, startDate: day(20), endDate: day(80), offerIds: [], postIds: [], adIds: ["SAD-2"], messageCampaignIds: [], landingPageIds: ["LP-2"], notes: "Kitchens before the holidays.", ...base, createdAt: d(-2),
    },
    {
      id: "CMP-2", name: "Fall interior refresh", objective: "leads", status: "active", segmentId: "SEG-2", services: ["interior_repaint", "cabinets"], locations: ["Dallas", "Lakewood", "Frisco", "Richardson"],
      channels: ["instagram", "facebook", "email", "print"], budget: 1800, startDate: day(-50), endDate: day(40), offerIds: ["PROMO-1"], postIds: ["POST-15", "POST-8"], adIds: ["SAD-1"], messageCampaignIds: ["MSG-1"],
      landingPageIds: ["LP-1"], ...base, createdAt: d(-52), budgetHistory: [{ at: d(-20), by: "U-OWNER", from: 1500, to: 1800, reason: "Instagram leads coming in — extra $300 for the last month" }],
    },
    {
      id: "CMP-1", name: "Spring exterior push", objective: "leads", status: "completed", services: ["exterior_repaint"], locations: ["Dallas", "Plano"], channels: ["print", "facebook", "nextdoor"],
      budget: 1500, startDate: day(-140), endDate: day(-95), offerIds: [], postIds: [], adIds: [], messageCampaignIds: [], landingPageIds: [], ...base, createdAt: d(-145),
    },
  ];

  const mktAttributions: LeadAttributionRecord[] = [
    { leadId: "LEAD-2026-4", channel: "other", campaignId: "CMP-1", platform: "print", at: d(-130) },
    { leadId: "LEAD-2026-7", channel: "social", campaignId: "CMP-1", platform: "facebook", at: d(-130) },
    { leadId: "LEAD-2026-6", channel: "qr", campaignId: "CMP-2", platform: "print", linkId: "LNK-2", at: d(-40) },
    { leadId: "LEAD-2026-5", channel: "social", campaignId: "CMP-2", platform: "instagram", linkId: "LNK-1", at: d(-40) },
    { leadId: "LEAD-2026-8", channel: "promo", campaignId: "CMP-2", promotionId: "PROMO-1", promoCode: "FALL10", at: d(-3) },
    { leadId: "LEAD-2026-3", channel: "referral", referralCodeId: "REF-1", referralCode: "KORAH150", promotionId: "PROMO-2", at: d(-168) },
  ];

  const mktExpenses: MarketingExpense[] = [
    { id: "MEX-5", date: day(-10), category: "printing", vendor: "Lone Star Print Co.", description: "500 door hangers with QR code", amount: 185, campaignId: "CMP-2", platform: "print", location: "Lakewood", ...base, createdAt: d(-10) },
    { id: "MEX-4", date: day(-14), category: "ads", vendor: "Meta Platforms", description: "Instagram ads, first two weeks", amount: 320.5, campaignId: "CMP-2", platform: "instagram", service: "interior_repaint", ...base, createdAt: d(-14) },
    { id: "MEX-3", date: day(-35), category: "photography", vendor: "Ana Ruiz Photography", description: "Interior portfolio shoot — three finished homes", amount: 275, campaignId: "CMP-2", service: "interior_repaint", ...base, createdAt: d(-35) },
    { id: "MEX-2", date: day(-120), category: "ads", vendor: "Meta Platforms", description: "Facebook boosted posts", amount: 450, campaignId: "CMP-1", platform: "facebook", service: "exterior_repaint", ...base, createdAt: d(-120) },
    { id: "MEX-1", date: day(-138), category: "printing", vendor: "Lone Star Print Co.", description: "2,000 exterior postcards — Dallas and Plano", amount: 640, campaignId: "CMP-1", platform: "print", service: "exterior_repaint", location: "Dallas", ...base, createdAt: d(-138) },
  ];

  const clicks = (prefix: string, n: number, via: "link" | "qr", fromDays: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i + 1}`, at: d(fromDays + Math.floor((i * -fromDays) / n)), device: (i % 3 === 0 ? "desktop" : "mobile") as "desktop" | "mobile", via }));
  const mktLinks: TrackLink[] = [
    {
      id: "LNK-2", code: "FALL-DOOR-QR", name: "Door hanger QR — Lakewood", target: "/website-form", utm: { source: "print", medium: "qr", campaign: "fall-interior-refresh", content: "door-hanger" },
      campaignId: "CMP-2", promotionId: "PROMO-1", platform: "print", kind: "qr", active: true, clicks: clicks("CLK-Q", 9, "qr", -9), ...base, createdAt: d(-10),
    },
    {
      id: "LNK-1", code: "FALL-IG", name: "Instagram bio link", target: "/website-form", utm: { source: "instagram", medium: "social", campaign: "fall-interior-refresh" },
      campaignId: "CMP-2", platform: "instagram", kind: "link", active: true, clicks: clicks("CLK-L", 23, "link", -45), ...base, createdAt: d(-48),
    },
  ];

  const mktPromotions: Promotion[] = [
    {
      id: "PROMO-2", name: "Refer a neighbour", kind: "referral", code: "REFER150", description: "The friend gets $150 off; the referrer gets a $100 gift card when the job is finished.", discountType: "amount", value: 150,
      validFrom: day(-365), referralReward: { referrerReward: 100, refereeReward: 150, rewardType: "gift_card", qualifyOn: "job_completed" }, active: true, redemptions: [], ...base, createdAt: d(-365),
    },
    {
      id: "PROMO-1", name: "Fall interior 10% off", kind: "seasonal", code: "FALL10", description: "10% off interior painting booked before the campaign ends.", discountType: "percent", value: 10,
      validFrom: day(-50), validTo: day(40), maxRedemptions: 25, perCustomerLimit: 1, minSpend: 1500, services: ["interior_repaint", "cabinets"], season: "fall", campaignId: "CMP-2", active: true,
      redemptions: [{ id: "RED-1", at: d(-3), code: "FALL10", customerId: "C-NEW-3", leadId: "LEAD-2026-8", source: "inbound" }], ...base, createdAt: d(-50),
    },
  ];

  const mktReferralCodes: ReferralCode[] = [
    {
      id: "REF-1", code: "KORAH150", promotionId: "PROMO-2", referrerCustomerId: "C-KORAH", referrerName: "Korah Singer", createdAt: d(-200), createdBy: "U-OFFICE",
      referrals: [{ leadId: "LEAD-2026-3", customerId: "C-JEREMY", at: d(-168), status: "pending" }],
    },
  ];

  const mktSegments: AudienceSegment[] = [
    { id: "SEG-1", name: "Past exterior customers", description: "Had an exterior repaint with us.", rules: { services: ["exterior_repaint"] }, ...base, createdAt: d(-200) },
    { id: "SEG-2", name: "Dallas-area homeowners by email", description: "Everyone in Dallas, Lakewood or Richardson we can email.", rules: { locations: ["Dallas", "Lakewood", "Richardson"], reachableBy: "email" }, ...base, createdAt: d(-52) },
    { id: "SEG-3", name: "Open leads", description: "Leads not yet won or lost.", rules: { statuses: ["lead"] }, ...base, createdAt: d(-30) },
  ];

  const mktMessageCampaigns: MessageCampaign[] = [
    {
      id: "MSG-1", name: "Fall interior refresh — 10% off", channel: "email", segmentId: "SEG-2", campaignId: "CMP-2", promotionId: "PROMO-1", subject: "{{first_name}}, fresh walls before the holidays",
      body: "Hi {{first_name}},\n\nOur fall calendar is filling up. Book an interior repaint or cabinet refinish before the campaign ends and quote {{code}} for 10% off.\n\nReply to this email or call (214) 555-0100 for a free estimate.\n\nEstimate Master Painting\nTo stop marketing emails, reply UNSUBSCRIBE.",
      status: "draft", sends: [], ...base, createdAt: d(-6),
    },
  ];

  const socialReviews: SocialReview[] = [
    { id: "SREV-3", platform: "google_business", externalId: "MANUAL-SREV-3", author: "Steven Omodth", rating: 3, text: "Good work on the living room, but the crew started a day later than we agreed.", at: d(-2), sandbox: false, customerId: "C-STEVEN", jobId: "JOB-2026-5" },
    {
      id: "SREV-2", platform: "facebook", externalId: "MANUAL-SREV-2", author: "Sam Sample", rating: 5, text: "Dana and the team were great from the first call. The estimate was clear and they answered every question.", at: d(-12), sandbox: false, customerId: "C-SAM",
      response: { text: "Thank you, Sam! We can't wait to start on the cabinets.", by: "U-OFFICE", at: d(-11), status: "sent", externalRef: "SBX-RESP-SREV-2" },
    },
    {
      id: "SREV-1", platform: "google_business", externalId: "MANUAL-SREV-1", author: "Korah Singer", rating: 5, text: "Tidy, on time, and the custom door colour matched our 1998 chip exactly. Highly recommend.", at: d(-40), sandbox: false, customerId: "C-KORAH",
      response: { text: "Thanks Korah — that door red was a fun match!", by: "U-OFFICE", at: d(-39), status: "sent", externalRef: "SBX-RESP-SREV-1" },
      testimonial: { status: "approved", by: "U-OWNER", at: d(-38), displayName: "Korah S.", quote: "Tidy, on time, and the custom door colour matched our 1998 chip exactly." },
    },
  ];

  const reviewRequests: ReviewRequest[] = [];
  const mktCommunications: CommEntry[] = [];

  // Social inbox (sandbox connector): a quote request from the Instagram ad, a question on a post, one answered, one done.
  const socialMessages: SocialMessage[] = [
    {
      id: "SMSG-4", platform: "instagram", kind: "mention", externalId: "IG-M-SEED-4", author: { name: "Rosa Delgado", handle: "@rosa.d" }, text: "So happy with our new front door colour from @estimatemaster.test!",
      at: d(-6), sandbox: true, status: "closed", replies: [{ at: d(-6), by: "U-OFFICE", text: "Thank you Rosa! Enjoy it.", status: "sent", externalRef: "SBX-RPL-SMSG-4-1" }], intent: "general", doneAt: d(-6), doneBy: "U-OFFICE",
    },
    {
      id: "SMSG-3", platform: "facebook", kind: "dm", externalId: "FB-DM-SEED-3", threadId: "FB-T-SEED-3", author: { name: "Linda Park" }, text: "Thanks for explaining the prep work on the phone. Do you work weekends?",
      at: d(-2), sandbox: true, status: "replied", replies: [{ at: d(-2), by: "U-OFFICE", text: "We work Monday to Saturday. Saturday slots go fast in the fall!", status: "sent", externalRef: "SBX-RPL-SMSG-3-1" }], intent: "question", assignedTo: "U-OFFICE",
    },
    {
      id: "SMSG-2", platform: "facebook", kind: "comment", externalId: "FB-C-SEED-2", postId: "POST-8", externalPostRef: "SBX-FB-POST-8", author: { name: "Ron Patel" }, text: "Do you paint fences too? Ours is looking rough.",
      at: d(-0.5), sandbox: true, status: "open", replies: [], intent: "question",
    },
    {
      id: "SMSG-1", platform: "instagram", kind: "dm", externalId: "IG-DM-SEED-1", threadId: "IG-T-SEED-1", adId: "SAD-1", author: { name: "Maya Chen", handle: "@mayac.designs", phone: "(214) 555-0143", email: "maya.chen@example.com" },
      text: "Hi! Saw your ad. How much would it cost to repaint our living room and kitchen in Lakewood?", at: d(-0.2), sandbox: true, status: "open", replies: [], intent: "quote_request",
    },
  ];

  // Ads: one running on the fall campaign (sandbox results), one waiting for the owner.
  const socialAds: SocialAdCampaign[] = [
    {
      id: "SAD-2", name: "Cabinet refinishing — Facebook", platform: "facebook", objective: "leads", campaignId: "CMP-3", budget: { type: "lifetime", amount: 600, currency: "USD" },
      schedule: { start: day(20), end: day(80) }, audience: { locations: ["Dallas", "Plano"], radiusMiles: 10, ageMin: 30, ageMax: 65, interests: ["Kitchen remodeling", "Home improvement"] },
      creatives: [{ assetIds: ["MED-3"], headline: "Kitchen cabinets like new before the holidays", text: "Refinished in place, satin or semi-gloss, in about a week. Get a free quote.", cta: "get_quote", url: "https://estimatemaster.example/lp/cabinet-booking" }],
      status: "pending_approval", sandbox: true, ...base, createdAt: d(-1), history: [{ at: d(-1), by: "U-OFFICE", note: "Created as a draft." }, { at: d(-1), by: "U-OFFICE", note: "Submitted for approval ($600.00 total)." }],
    },
    {
      id: "SAD-1", name: "Fall interior — Instagram leads", platform: "instagram", objective: "leads", campaignId: "CMP-2", promotionId: "PROMO-1", budget: { type: "daily", amount: 15, currency: "USD" },
      schedule: { start: day(-12), end: day(40) }, audience: { locations: ["Dallas", "Lakewood", "Richardson"], radiusMiles: 8, ageMin: 28, ageMax: 65, interests: ["Interior design", "Home improvement"] },
      creatives: [{ assetIds: ["MED-7"], headline: "Fresh walls before the holidays", text: "Book an interior repaint this fall and quote FALL10 for 10% off.", cta: "get_quote", url: "https://estimatemaster.example/lp/fall-interior" }],
      status: "active", approval: { by: "U-OWNER", at: d(-13), budget: 780 }, sandbox: true, externalRef: "SBX-AD-SAD-1",
      performance: { at: d(-0.1), sandbox: true, spend: 142.6, impressions: 15420, reach: 10794, clicks: 131, leads: 0 },
      ...base, createdAt: d(-14), history: [{ at: d(-14), by: "U-OFFICE", note: "Created as a draft." }, { at: d(-13), by: "U-OWNER", note: "Approved for up to $780.00. Sandbox: not sent to Instagram (no platform keys)." }],
    },
  ];

  // Landing pages: the fall offer page is live; the cabinet booking page is a draft.
  const mktLandingPages: LandingPage[] = [
    {
      id: "LP-2", slug: "cabinet-booking", title: "Cabinet refinishing — book a visit", headline: "Kitchen cabinets like new, in about a week", body: "Pick a date that suits you and we'll come out, measure and give you a fixed price on the spot.",
      accent: "#2563eb", service: "cabinets", location: "Dallas", campaignId: "CMP-3", status: "draft",
      form: { kind: "booking", fields: defaultFields("booking"), submitLabel: "Request my visit", successMessage: "Thanks! We'll confirm your visit by phone within one business day." }, views: 0, ...base, createdAt: d(-2),
    },
    {
      id: "LP-1", slug: "fall-interior", title: "Fall interior refresh", headline: "Fresh walls before the holidays — 10% off", body: "Interior repaints and cabinet refinishing across Dallas, Lakewood and Richardson. Tell us about the rooms and we'll arrange a free estimate.",
      accent: "#2563eb", service: "interior_repaint", location: "Dallas", campaignId: "CMP-2", promotionId: "PROMO-1", status: "published",
      form: { kind: "quote", fields: defaultFields("quote"), submitLabel: "Get my free estimate", successMessage: "Thanks! We'll call you within one business day to arrange your free estimate." }, views: 64, ...base, createdAt: d(-46), publishedAt: d(-45),
    },
  ];

  // Automations: estimate follow-up and review requests are on; the rest are ready to switch on.
  const auto = (a: Omit<MarketingAutomation, "createdBy" | "createdAt">): MarketingAutomation => ({ ...a, createdBy: "U-OWNER", createdAt: d(-90) });
  const mktAutomations: MarketingAutomation[] = [
    auto({ id: "AUTO-1", name: "Estimate follow-up", kind: "estimate_follow_up", active: true, channel: "email", delayDays: 3, subject: "{{first_name}}, any questions about your estimate?", body: "Hi {{first_name}},\n\nJust checking in on estimate {{estimate}}. Happy to walk through it or adjust anything.\n\nEstimate Master Painting\nReply UNSUBSCRIBE to stop these emails.", lastRunAt: d(-1) }),
    auto({ id: "AUTO-2", name: "Review request after the job", kind: "review_request", active: true, channel: "sms", delayDays: 2, body: "Hi {{first_name}}, thanks for choosing Estimate Master Painting for {{job}}. Would you leave us a quick review? https://reviews.example.com/estimate-master Reply STOP to opt out.", lastRunAt: d(-1) }),
    auto({ id: "AUTO-3", name: "Spring exterior reminder", kind: "seasonal_reminder", active: false, channel: "email", delayDays: 0, seasonMonth: 3, seasonDay: 1, seasonServices: ["exterior_repaint", "deck_fence"], subject: "Spring is exterior season, {{first_name}}", body: "Hi {{first_name}},\n\nSpring dates for exterior painting book up quickly. Reply to get on the calendar early.\n\nReply UNSUBSCRIBE to stop these emails." }),
    auto({ id: "AUTO-4", name: "Referral request", kind: "referral_request", active: false, channel: "email", delayDays: 14, subject: "Know someone who needs a painter?", body: "Hi {{first_name}},\n\nIf a friend books with us and quotes {{code}}, they get $150 off and you get a $100 gift card.\n\nReply UNSUBSCRIBE to stop these emails." }),
    auto({ id: "AUTO-5", name: "Win back past customers", kind: "reengagement", active: false, channel: "email", delayDays: 0, inactiveDays: 540, subject: "It's been a while, {{first_name}}", body: "Hi {{first_name}},\n\nPaint usually needs a refresh every 5–7 years. Want us to take a look?\n\nReply UNSUBSCRIBE to stop these emails." }),
  ];
  const mktAutomationRuns: AutomationRun[] = [
    { id: "RUN-2", at: d(-1), automationId: "AUTO-2", targetKey: "JOB:JOB-2025-OLD:review", name: "Jeremy Irons", status: "skipped_opt_out", trigger: "daily" },
    { id: "RUN-1", at: d(-1), automationId: "AUTO-1", targetKey: "EST:EST-2025-OLD", customerId: "C-SAM", name: "Sam Sample", to: "sam.sample@example.com", status: "sandbox", messageId: "SBX-RUN-1", trigger: "daily" },
  ];

  return {
    mktCampaigns, mktAttributions, mktExpenses, mktLinks, mktPromotions, mktReferralCodes, mktSegments, mktMessageCampaigns, socialReviews, reviewRequests, mktCommunications,
    socialMessages, socialAds, mktLandingPages, mktAutomations, mktAutomationRuns,
    counters: {
      mktcmp: 3, mktmex: 5, mktlnk: 2, mktpromo: 2, mktref: 1, mktseg: 3, mktmsg: 1, mktrev: 3, mktrvrq: 0, mktcom: 0,
      mktsmsg: 4, mktad: 2, mktlp: 2, mktauto: 5, mktrun: 2, mktred: 1, mktsub: 0, mktapr: 0, mktrec: 0,
    },
  };
}
