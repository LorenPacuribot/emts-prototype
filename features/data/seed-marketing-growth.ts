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
 *
 * Every collection is optional on Database, so data saved before this
 * release gets these from the seed when it loads (lib/store merge).
 */
import type { AudienceSegment, LeadAttributionRecord, MarketingCampaign, MarketingExpense, MessageCampaign, Promotion, ReferralCode, TrackLink } from "@/features/types/marketing-growth";
import type { ReviewRequest, SocialReview } from "@/features/types/marketing-social";
import type { CommEntry } from "@/features/types/marketing-growth";
import { addDays } from "@/features/lib/rules/dates";

export function marketingGrowthSeed(nowIso: string) {
  const d = (days: number) => addDays(nowIso, days);
  const day = (days: number) => d(days).slice(0, 10);
  const base = { createdBy: "U-OFFICE" };

  const mktCampaigns: MarketingCampaign[] = [
    {
      id: "CMP-3", name: "Cabinet refinishing — winter", objective: "bookings", status: "draft", services: ["cabinets"], locations: ["Dallas", "Plano"], channels: ["facebook", "instagram", "email"],
      budget: 1200, startDate: day(20), endDate: day(80), offerIds: [], postIds: [], adIds: [], messageCampaignIds: [], landingPageIds: [], notes: "Kitchens before the holidays.", ...base, createdAt: d(-2),
    },
    {
      id: "CMP-2", name: "Fall interior refresh", objective: "leads", status: "active", segmentId: "SEG-2", services: ["interior_repaint", "cabinets"], locations: ["Dallas", "Lakewood", "Frisco", "Richardson"],
      channels: ["instagram", "facebook", "email", "print"], budget: 1800, startDate: day(-50), endDate: day(40), offerIds: ["PROMO-1"], postIds: ["POST-15", "POST-8"], adIds: [], messageCampaignIds: ["MSG-1"],
      landingPageIds: [], ...base, createdAt: d(-52), budgetHistory: [{ at: d(-20), by: "U-OWNER", from: 1500, to: 1800, reason: "Instagram leads coming in — extra $300 for the last month" }],
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

  return {
    mktCampaigns, mktAttributions, mktExpenses, mktLinks, mktPromotions, mktReferralCodes, mktSegments, mktMessageCampaigns, socialReviews, reviewRequests, mktCommunications,
    counters: { mktcmp: 3, mktmex: 5, mktlnk: 2, mktpromo: 2, mktref: 1, mktseg: 3, mktmsg: 1, mktrev: 3, mktrvrq: 0, mktcom: 0 },
  };
}
