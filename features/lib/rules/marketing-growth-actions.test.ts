/**
 * Patent §34 — campaigns and growth store actions: campaigns (status, leads,
 * posts, spend, tracked links, results), promotions and referral codes,
 * reviews and testimonials, segments and sandbox email/SMS campaigns.
 */
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { ActionResult, Database, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { now } from "@/features/lib/clock";
import {
  attachLeadToCampaign, createReferralCode, createTrackLink, deleteMarketingExpense, detachLeadFromCampaign, logMarketingExpense, markReferralRewarded, recordLinkClick, recordReferral,
  recordReview, requestReview, respondToReview, saveCampaign, saveMessageCampaign, savePromotion, saveSegment, sendMessageCampaign, setCampaignPost, setCampaignStatus, setPromotionActive,
  setTestimonial, type CampaignDraft,
} from "@/features/lib/store/actions/marketing-growth";
import { campaignRecipients, campaignResults, leadAttribution, revenueByCampaignReport, trackedUrl, validatePromoCode } from "./marketing-growth";

function run<A extends unknown[], R>(db: Database, userId: string, action: (db: Database, actor: User, ...args: A) => ActionResult<R>, ...args: A) {
  let result: ActionResult<R> = { ok: false, error: "not run" };
  const next = produce(db, (draft) => {
    result = action(draft as Database, draft.users.find((u) => u.id === userId)!, ...args);
  });
  return { db: next, result };
}

const today = () => now().slice(0, 10);
const val = <T,>(r: unknown) => (r as { value: T }).value;
const draft = (x: Partial<CampaignDraft> = {}): CampaignDraft => ({
  name: "Holiday exterior touch-ups", objective: "leads", services: ["exterior_repaint"], locations: ["Dallas"], channels: ["facebook"], budget: 900, startDate: today(), ...x,
});

describe("§34 campaigns", () => {
  const db = createSeed(now());

  it("seeds campaigns whose results come from attached leads and spend", () => {
    const r = campaignResults(db, "CMP-1", now());
    expect(r.leads).toBe(2);
    expect(r.jobs).toBe(1);
    expect(r.revenue).toBe(12480);
    expect(r.spend).toBe(1090);
    expect(r.cac).toBe(1090);
    expect(r.roi).toBeCloseTo((12480 - 1090) / 1090, 2);
    const row = revenueByCampaignReport(db, now()).rows.find((x) => x[0] === "Spring exterior push")!;
    expect(row[1]).toBe("Completed");
    expect(row[7]).toBe("$1,090.00");
  });

  it("creates a draft campaign, keeps field errors next to the field, and blocks other roles", () => {
    const bad = run(db, "U-OFFICE", saveCampaign, draft({ name: " " }));
    expect(bad.result).toMatchObject({ ok: false, field: "name" });
    const end = run(db, "U-OFFICE", saveCampaign, draft({ endDate: "2000-01-01" }));
    expect(end.result).toMatchObject({ ok: false, field: "endDate" });
    const est = run(db, "U-EST", saveCampaign, draft());
    expect(est.result.ok).toBe(false);
    expect(est.db.activity[0]!.blocked).toBe(true);
    const { db: after, result } = run(db, "U-OFFICE", saveCampaign, draft());
    expect(result.ok).toBe(true);
    const c = after.mktCampaigns!.find((x) => x.id === val<string>(result))!;
    expect(c).toMatchObject({ status: "draft", budget: 900, createdBy: "U-OFFICE" });
    expect(c.id).toBe("CMP-4");
  });

  it("records budget edits and refuses to edit a completed campaign", () => {
    const { db: after } = run(db, "U-OFFICE", saveCampaign, { ...draft({ name: "Fall interior refresh", budget: 2000 }), id: "CMP-2" });
    const c = after.mktCampaigns!.find((x) => x.id === "CMP-2")!;
    expect(c.budget).toBe(2000);
    expect(c.budgetHistory!.at(-1)).toMatchObject({ from: 1800, to: 2000 });
    expect(run(db, "U-OFFICE", saveCampaign, { ...draft(), id: "CMP-1" }).result.ok).toBe(false);
  });

  it("moves status only along draft → active ⇄ paused → completed", () => {
    let d = run(db, "U-OFFICE", setCampaignStatus, "CMP-3", "paused");
    expect(d.result.ok).toBe(false);
    d = run(db, "U-OFFICE", setCampaignStatus, "CMP-3", "active");
    expect(d.result.ok).toBe(true);
    d = run(d.db, "U-OFFICE", setCampaignStatus, "CMP-3", "paused");
    expect(d.result.ok).toBe(true);
    d = run(d.db, "U-OFFICE", setCampaignStatus, "CMP-3", "completed");
    expect(d.db.mktCampaigns!.find((c) => c.id === "CMP-3")!.status).toBe("completed");
    expect(run(d.db, "U-OFFICE", setCampaignStatus, "CMP-3", "active").result.ok).toBe(false);
  });

  it("attaches a lead (moving it from another campaign) and can remove a hand-attached lead", () => {
    const lead = db.leads.find((l) => !leadAttribution(db, l).campaignId)!;
    const a = run(db, "U-OFFICE", attachLeadToCampaign, "CMP-3", lead.id);
    expect(a.result.ok).toBe(true);
    expect(leadAttribution(a.db, a.db.leads.find((l) => l.id === lead.id)!).campaignId).toBe("CMP-3");
    expect(campaignResults(a.db, "CMP-3", now()).leads).toBe(1);
    expect(run(a.db, "U-OFFICE", attachLeadToCampaign, "CMP-3", lead.id).result.ok).toBe(false);
    const moved = run(db, "U-OFFICE", attachLeadToCampaign, "CMP-3", "LEAD-2026-6");
    expect(moved.result).toMatchObject({ ok: true, value: { previous: "Fall interior refresh" } });
    const off = run(a.db, "U-OFFICE", detachLeadFromCampaign, "CMP-3", lead.id);
    expect(off.result.ok).toBe(true);
    expect(campaignResults(off.db, "CMP-3", now()).leads).toBe(0);
  });

  it("links and unlinks a post", () => {
    const on = run(db, "U-OFFICE", setCampaignPost, "CMP-3", "POST-16", true);
    expect(on.db.mktCampaigns!.find((c) => c.id === "CMP-3")!.postIds).toContain("POST-16");
    expect(on.db.marketingPosts.find((p) => p.id === "POST-16")!.tags?.campaignId).toBe("CMP-3");
    const off = run(on.db, "U-OFFICE", setCampaignPost, "CMP-3", "POST-16", false);
    expect(off.db.mktCampaigns!.find((c) => c.id === "CMP-3")!.postIds).not.toContain("POST-16");
    expect(off.db.marketingPosts.find((p) => p.id === "POST-16")!.tags?.campaignId).toBeUndefined();
  });

  it("logs a marketing expense against a campaign, counts it in spend, and flags going over budget", () => {
    const bad = run(db, "U-OFFICE", logMarketingExpense, { date: today(), category: "ads", vendor: "Meta", description: "Ads", amount: 0, campaignId: "CMP-2" });
    expect(bad.result).toMatchObject({ ok: false, field: "amount" });
    const { db: after, result } = run(db, "U-OFFICE", logMarketingExpense, { date: today(), category: "ads", vendor: "Meta", description: "Ads", amount: 1200, campaignId: "CMP-2" });
    expect(result).toMatchObject({ ok: true, value: { overBudget: true } });
    expect(campaignResults(after, "CMP-2", now()).spend).toBeCloseTo(185 + 320.5 + 275 + 1200, 2);
    const id = val<{ id: string }>(result).id;
    const del = run(after, "U-OFFICE", deleteMarketingExpense, id);
    expect(campaignResults(del.db, "CMP-2", now()).spend).toBeCloseTo(780.5, 2);
  });

  it("creates a tracked link / QR code with UTM tags and counts each click once", () => {
    expect(run(db, "U-OFFICE", createTrackLink, { name: "x", target: "javascript:alert(1)", kind: "link" }).result).toMatchObject({ ok: false, field: "target" });
    expect(run(db, "U-OFFICE", createTrackLink, { name: "x", target: "/website-form", kind: "link", code: "FALL-IG" }).result).toMatchObject({ ok: false, field: "code" });
    const { db: after, result } = run(db, "U-OFFICE", createTrackLink, { name: "Yard sign", target: "/website-form", kind: "qr", platform: "print", campaignId: "CMP-3" });
    expect(result.ok).toBe(true);
    const link = after.mktLinks!.find((l) => l.id === val<{ id: string }>(result).id)!;
    expect(link.utm).toMatchObject({ source: "print", medium: "print", campaign: "cabinet-refinishing-winter" });
    expect(trackedUrl(link.target, link.utm)).toContain("utm_campaign=cabinet-refinishing-winter");
    let d = produce(after, (x) => { recordLinkClick(x as Database, link.code, "qr", "mobile", "EV-1"); });
    d = produce(d, (x) => { recordLinkClick(x as Database, link.code, "qr", "mobile", "EV-1"); });
    expect(d.mktLinks!.find((l) => l.id === link.id)!.clicks).toHaveLength(1);
    expect(campaignResults(d, "CMP-3", now()).clicks).toBe(1);
  });
});

describe("§34 promotions and referral codes", () => {
  const db = createSeed(now());

  it("creates a promotion, validates it, and pausing stops the code working", () => {
    const dup = run(db, "U-OFFICE", savePromotion, { name: "Dup", kind: "coupon", code: "fall10", discountType: "amount", value: 50, validFrom: today() });
    expect(dup.result).toMatchObject({ ok: false, field: "code" });
    const pct = run(db, "U-OFFICE", savePromotion, { name: "Big", kind: "discount", code: "BIG200", discountType: "percent", value: 200, validFrom: today() });
    expect(pct.result).toMatchObject({ ok: false, field: "value" });
    const { db: after, result } = run(db, "U-OFFICE", savePromotion, { name: "Winter cabinets $250 off", kind: "coupon", code: "cab250", discountType: "amount", value: 250, validFrom: today(), campaignId: "CMP-3" });
    expect(result.ok).toBe(true);
    expect(after.mktCampaigns!.find((c) => c.id === "CMP-3")!.offerIds).toContain(val<string>(result));
    expect(validatePromoCode(after, "CAB250", { at: now(), amount: 3000 })).toMatchObject({ ok: true, discount: 250 });
    const paused = run(after, "U-OFFICE", setPromotionActive, val<string>(result), false);
    expect(validatePromoCode(paused.db, "CAB250", { at: now() }).ok).toBe(false);
  });

  it("gives a referrer a unique code, records referrals, and only rewards qualified ones", () => {
    const self = run(db, "U-OFFICE", recordReferral, "REF-1", "LEAD-2026-4");
    expect(self.result.ok).toBe(false);
    const again = run(db, "U-OFFICE", recordReferral, "REF-1", "LEAD-2026-3");
    expect(again.result.ok).toBe(false);
    const code = run(db, "U-OFFICE", createReferralCode, { promotionId: "PROMO-2", referrerCustomerId: "C-SAM", referrerName: "" });
    expect(code.result).toMatchObject({ ok: true, value: { code: "SAM150" } });
    expect(run(code.db, "U-OFFICE", createReferralCode, { promotionId: "PROMO-2", referrerCustomerId: "C-SAM", referrerName: "" }).result.ok).toBe(false);
    const early = run(db, "U-OFFICE", markReferralRewarded, "REF-1", "LEAD-2026-3");
    expect(early.result.ok).toBe(false);
    const done = produce(db, (x) => { x.mktReferralCodes!.find((r) => r.id === "REF-1")!.referrals[0]!.status = "qualified"; });
    const paid = run(done, "U-OFFICE", markReferralRewarded, "REF-1", "LEAD-2026-3");
    expect(paid.result.ok).toBe(true);
    expect(paid.db.mktReferralCodes!.find((r) => r.id === "REF-1")!.referrals[0]).toMatchObject({ status: "rewarded", rewardAmount: 100 });
  });
});

describe("§34 reviews and testimonials", () => {
  const db = createSeed(now());

  it("records a review, responds once, and only the owner approves a testimonial", () => {
    expect(run(db, "U-OFFICE", recordReview, { platform: "facebook", author: "Ann", rating: 6, text: "" }).result).toMatchObject({ ok: false, field: "rating" });
    const { db: after, result } = run(db, "U-OFFICE", recordReview, { platform: "facebook", author: "Ruth Alvarez", rating: 5, text: "Lovely job on the porch." });
    const id = val<string>(result);
    expect(run(after, "U-OFFICE", respondToReview, id, "Thanks! We live at 12 Oak Street").result).toMatchObject({ ok: false, field: "response" });
    const replied = run(after, "U-OFFICE", respondToReview, id, "Thank you, Ruth!");
    expect(replied.db.socialReviews!.find((r) => r.id === id)!.response?.status).toBe("sent");
    expect(run(replied.db, "U-OFFICE", respondToReview, id, "Again").result.ok).toBe(false);
    expect(run(after, "U-OFFICE", setTestimonial, id, "approved").result.ok).toBe(false);
    const ok = run(after, "U-OWNER", setTestimonial, id, "approved");
    expect(ok.db.socialReviews!.find((r) => r.id === id)!.testimonial).toMatchObject({ status: "approved", displayName: "Ruth A." });
  });

  it("sends a review request (sandbox) and blocks a second one within 90 days", () => {
    const first = run(db, "U-OFFICE", requestReview, { customerId: "C-BETH", channel: "email", platform: "google_business" });
    expect(first.result.ok).toBe(true);
    expect(first.db.reviewRequests![0]).toMatchObject({ customerId: "C-BETH", status: "sent", to: "beth.carver@example.com" });
    expect(first.db.mktCommunications![0]).toMatchObject({ direction: "outbound", status: "sandbox" });
    expect(run(first.db, "U-OFFICE", requestReview, { customerId: "C-BETH", channel: "email", platform: "google_business" }).result).toMatchObject({ ok: false, field: "customerId" });
  });
});

describe("§34 segments and email/SMS campaigns", () => {
  const db = createSeed(now());

  it("saves a segment and validates its rules", () => {
    expect(run(db, "U-OFFICE", saveSegment, { name: "Open leads", rules: {} }).result).toMatchObject({ ok: false, field: "name" });
    expect(run(db, "U-OFFICE", saveSegment, { name: "X", rules: { minJobs: 3, maxJobs: 1 } }).result.ok).toBe(false);
    expect(run(db, "U-OFFICE", saveSegment, { name: "Plano", rules: { locations: ["Plano"] } }).result.ok).toBe(true);
  });

  it("requires an opt-out line on SMS and a subject on email", () => {
    expect(run(db, "U-OFFICE", saveMessageCampaign, { name: "t", channel: "sms", segmentId: "SEG-3", body: "Hi {{first_name}}" }).result).toMatchObject({ ok: false, field: "body" });
    expect(run(db, "U-OFFICE", saveMessageCampaign, { name: "t", channel: "email", segmentId: "SEG-3", body: "Hi" }).result).toMatchObject({ ok: false, field: "subject" });
  });

  it("only the owner sends; the send log records every recipient and skip; it never sends twice", () => {
    expect(run(db, "U-OFFICE", sendMessageCampaign, "MSG-1").result.ok).toBe(false);
    const expected = campaignRecipients(db, db.mktMessageCampaigns!.find((m) => m.id === "MSG-1")!, now());
    expect(expected.send.length).toBeGreaterThan(0);
    const { db: after, result } = run(db, "U-OWNER", sendMessageCampaign, "MSG-1");
    expect(result).toMatchObject({ ok: true, value: { sent: expected.send.length, skipped: expected.skipped.length } });
    const m = after.mktMessageCampaigns!.find((x) => x.id === "MSG-1")!;
    expect(m.status).toBe("sent");
    expect(m.sends.filter((s) => s.status === "sandbox")).toHaveLength(expected.send.length);
    const comm = after.mktCommunications!.find((c) => c.messageCampaignId === "MSG-1")!;
    expect(comm.body).toContain("FALL10");
    expect(comm.body).not.toContain("{{");
    expect(run(after, "U-OWNER", sendMessageCampaign, "MSG-1").result.ok).toBe(false);
    expect(run(after, "U-OFFICE", saveMessageCampaign, { id: "MSG-1", name: "x", channel: "email", segmentId: "SEG-2", subject: "s", body: "b" }).result.ok).toBe(false);
  });
});
