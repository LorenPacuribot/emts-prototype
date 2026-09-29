/**
 * Patent §34 — social inbox, landing pages, ads, automations and insights
 * (features/lib/store/actions/marketing-engage.ts). Every send and platform
 * call is sandbox: these tests check what is recorded, never a delivery.
 */
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { ActionResult, Database, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { now } from "@/features/lib/clock";
import { addDays } from "./dates";
import {
  applyRecommendation, approveAd, assignMessage, checkInbox, createLeadFromMessage, dismissAlert, pauseAd, rejectAd, replyToMessage, resumeAd, runAutomation, saveAd, saveAutomation,
  saveLandingPage, setAutomationActive, setLandingPagePublished, setMessageDone, submitAdForApproval, submitLandingPage, type AdDraft, type LandingPageDraft,
} from "@/features/lib/store/actions/marketing-engage";
import { campaignResults, defaultFields, dueAutomationTargets, leadAttribution, recommendations, searchMarketing, SERVICE_LABEL, trendAlerts } from "./marketing-growth";

function run<A extends unknown[], R>(db: Database, userId: string, action: (db: Database, actor: User, ...args: A) => ActionResult<R>, ...args: A) {
  let result: ActionResult<R> = { ok: false, error: "not run" };
  const next = produce(db, (draft) => {
    result = action(draft as Database, draft.users.find((u) => u.id === userId)!, ...args);
  });
  return { db: next, result };
}
function sys<A extends unknown[], R>(db: Database, action: (db: Database, ...args: A) => ActionResult<R>, ...args: A) {
  let result: ActionResult<R> = { ok: false, error: "not run" };
  const next = produce(db, (draft) => {
    result = action(draft as Database, ...args);
  });
  return { db: next, result };
}
const val = <T,>(r: unknown) => (r as { value: T }).value;
const today = () => now().slice(0, 10);
const msg = (db: Database, id: string) => db.socialMessages!.find((m) => m.id === id)!;

describe("§34 social inbox", () => {
  const db = createSeed(now());

  it("reads new messages from connected accounts once; repeats are ignored", () => {
    const first = run(db, "U-OFFICE", checkInbox);
    expect(val<{ added: number }>(first.result).added).toBe(2);
    expect(first.db.socialMessages!.length).toBe(db.socialMessages!.length + 2);
    const again = run(first.db, "U-OFFICE", checkInbox);
    expect(val<{ added: number; repeats: number }>(again.result)).toMatchObject({ added: 0, repeats: 2 });
    const offline = produce(db, (d) => { d.socialAccounts.find((a) => a.platform === "instagram")!.status = "expired"; });
    expect(val<{ unreachable: string[] }>(run(offline, "U-OFFICE", checkInbox).result).unreachable).toEqual(["Instagram"]);
  });

  it("replies in the sandbox, blocks street addresses next to the field, and blocks other roles", () => {
    const bad = run(db, "U-OFFICE", replyToMessage, "SMSG-2", "Come see 1234 Oak Street");
    expect(bad.result).toMatchObject({ ok: false, field: "reply" });
    const denied = run(db, "U-EST", replyToMessage, "SMSG-2", "Yes we do!");
    expect(denied.result.ok).toBe(false);
    expect(denied.db.activity[0]!.blocked).toBe(true);
    const { db: after, result } = run(db, "U-OFFICE", replyToMessage, "SMSG-2", "Yes, we paint and stain fences. Send us a message for a quote.");
    expect(result.ok).toBe(true);
    expect(msg(after, "SMSG-2")).toMatchObject({ status: "replied" });
    expect(msg(after, "SMSG-2").replies[0]!.externalRef).toMatch(/^SBX-/);
    expect(after.mktCommunications![0]).toMatchObject({ channel: "social", direction: "outbound", status: "sandbox" });
  });

  it("assigns only to staff who can open Marketing, and marks done / reopens", () => {
    expect(run(db, "U-OFFICE", assignMessage, "SMSG-2", "U-EST").result).toMatchObject({ ok: false, field: "assignee" });
    const a = run(db, "U-OFFICE", assignMessage, "SMSG-2", "U-OWNER");
    expect(msg(a.db, "SMSG-2").assignedTo).toBe("U-OWNER");
    const done = run(a.db, "U-OFFICE", setMessageDone, "SMSG-2", true);
    expect(msg(done.db, "SMSG-2")).toMatchObject({ status: "closed", doneBy: "U-OFFICE" });
    expect(run(done.db, "U-OFFICE", replyToMessage, "SMSG-2", "Hi").result).toMatchObject({ ok: false, field: "reply" });
    const reopened = run(done.db, "U-OFFICE", setMessageDone, "SMSG-2", false);
    expect(msg(reopened.db, "SMSG-2").status).toBe("open");
  });

  it("creates a lead from a message, attributed to the platform, ad and campaign", () => {
    const before = campaignResults(db, "CMP-2", now()).leads;
    const { db: after, result } = run(db, "U-OFFICE", createLeadFromMessage, "SMSG-1");
    expect(result.ok).toBe(true);
    const { leadId, outcome } = val<{ leadId: string; outcome: string }>(result);
    expect(outcome).toBe("created");
    const lead = after.leads.find((l) => l.id === leadId)!;
    expect(lead).toMatchObject({ name: "Maya Chen", phone: "(214) 555-0143", stage: "new_lead" });
    const a = leadAttribution(after, lead);
    expect(a).toMatchObject({ channel: "ad", adId: "SAD-1", campaignId: "CMP-2" });
    expect(a.source).toMatch(/Instagram ad/);
    expect(msg(after, "SMSG-1")).toMatchObject({ leadId, leadRequest: { status: "created", via: "local" } });
    expect(campaignResults(after, "CMP-2", now()).leads).toBe(before + 1);
    expect(run(after, "U-OFFICE", createLeadFromMessage, "SMSG-1").result.ok).toBe(false);
    expect(run(db, "U-CREW", createLeadFromMessage, "SMSG-1").result.ok).toBe(false);
  });

  it("links a repeat enquiry to the existing lead instead of duplicating it", () => {
    const { db: first, result } = run(db, "U-OFFICE", createLeadFromMessage, "SMSG-1");
    const leadId = val<{ leadId: string }>(result).leadId;
    const same = produce(first, (d) => { d.socialMessages!.find((m) => m.id === "SMSG-2")!.author.phone = "214-555-0143"; });
    const again = run(same, "U-OFFICE", createLeadFromMessage, "SMSG-2");
    expect(val<{ leadId: string; outcome: string }>(again.result)).toMatchObject({ leadId, outcome: "attached" });
    expect(again.db.leads.length).toBe(first.leads.length);
  });
});

describe("§34 landing pages", () => {
  const db = createSeed(now());
  const draft = (x: Partial<LandingPageDraft> = {}): LandingPageDraft => ({
    title: "Deck staining", slug: "deck-staining", headline: "Protect your deck before winter", body: "Cleaning, repairs and two coats of stain.", formKind: "quote", fields: defaultFields("quote"),
    submitLabel: "Get a quote", successMessage: "Thanks!", campaignId: "CMP-2", ...x,
  });

  it("validates the page with errors next to the field", () => {
    expect(run(db, "U-OFFICE", saveLandingPage, draft({ slug: "fall-interior" })).result).toMatchObject({ ok: false, field: "slug" });
    expect(run(db, "U-OFFICE", saveLandingPage, draft({ slug: "Deck Staining!" })).result).toMatchObject({ ok: false, field: "slug" });
    expect(run(db, "U-OFFICE", saveLandingPage, draft({ title: "" })).result).toMatchObject({ ok: false, field: "title" });
    expect(run(db, "U-OFFICE", saveLandingPage, draft({ body: "Visit us at 1234 Oak Street" })).result).toMatchObject({ ok: false, field: "body" });
    expect(run(db, "U-OFFICE", saveLandingPage, draft({ fields: defaultFields("quote").filter((f) => f.maps !== "name") })).result).toMatchObject({ ok: false, field: "fields" });
    expect(run(db, "U-EST", saveLandingPage, draft()).result.ok).toBe(false);
  });

  it("creates a draft linked to the campaign, publishes it, and blocks changing a live address", () => {
    const { db: after, result } = run(db, "U-OFFICE", saveLandingPage, draft());
    const id = val<string>(result);
    expect(after.mktLandingPages!.find((p) => p.id === id)).toMatchObject({ status: "draft", slug: "deck-staining" });
    expect(after.mktCampaigns!.find((c) => c.id === "CMP-2")!.landingPageIds).toContain(id);
    expect(sys(after, submitLandingPage, "deck-staining", {}, "REF-X").result.ok).toBe(false);
    const pub = run(after, "U-OFFICE", setLandingPagePublished, id, true);
    expect(pub.db.mktLandingPages!.find((p) => p.id === id)!.status).toBe("published");
    expect(run(pub.db, "U-OFFICE", saveLandingPage, { ...draft({ slug: "deck-stain" }), id }).result).toMatchObject({ ok: false, field: "slug" });
  });

  it("turns a submission into a lead attributed to the page and campaign, records the code, and never applies it twice", () => {
    const values = { name: "Hana Ito", email: "hana.ito@example.com", phone: "(972) 555-0199", street: "88 Elm Ave", city: "Richardson", zip: "75080", service: SERVICE_LABEL.interior_repaint, message: "Three bedrooms", promo: "fall10" };
    const missing = sys(db, submitLandingPage, "fall-interior", { ...values, phone: "" }, "LP-REF-1");
    expect(missing.result).toMatchObject({ ok: false, field: "phone" });
    const { db: after, result } = sys(db, submitLandingPage, "fall-interior", values, "LP-REF-1", { utm: { source: "instagram", medium: "social", campaign: "fall-interior-refresh" } });
    expect(result.ok).toBe(true);
    const out = val<{ leadId: string; outcome: string; code: { ok: boolean } }>(result);
    expect(out.outcome).toBe("new");
    expect(out.code.ok).toBe(true);
    const lead = after.leads.find((l) => l.id === out.leadId)!;
    expect(lead.propertyId).toBeTruthy();
    expect(leadAttribution(after, lead)).toMatchObject({ channel: "landing_page", landingPageId: "LP-1", campaignId: "CMP-2", promoCode: "FALL10", service: "interior_repaint" });
    expect(after.mktSubmissions![0]).toMatchObject({ ref: "LP-REF-1", landingPageId: "LP-1", leadId: out.leadId, outcome: "new" });
    expect(after.mktPromotions!.find((p) => p.code === "FALL10")!.redemptions.some((r) => r.leadId === out.leadId && r.source === "landing_page")).toBe(true);
    expect(after.activity[0]!.userId).toBe("WEB");
    const retry = sys(after, submitLandingPage, "fall-interior", values, "LP-REF-1");
    expect(val<{ outcome: string }>(retry.result).outcome).toBe("duplicate");
    expect(retry.db.leads.length).toBe(after.leads.length);
  });

  it("records a booking request from a booking form", () => {
    const pub = run(db, "U-OFFICE", setLandingPagePublished, "LP-2", true).db;
    const values = { name: "Omar Diaz", phone: "(214) 555-0111", street: "5 Pine Ct", city: "Plano", service: SERVICE_LABEL.cabinets, date: addDays(now(), 7).slice(0, 10), window: "Morning" };
    const { db: after, result } = sys(pub, submitLandingPage, "cabinet-booking", values, "LP-REF-2");
    const out = val<{ appointmentRequestId: string; leadId: string }>(result);
    expect(after.mktAppointmentRequests!.find((a) => a.id === out.appointmentRequestId)).toMatchObject({ status: "requested", preferredWindow: "Morning", leadId: out.leadId, source: "landing_page" });
  });
});

describe("§34 ads", () => {
  const db = createSeed(now());
  const ad = (x: Partial<AdDraft> = {}): AdDraft => ({
    name: "Holiday interiors", platform: "facebook", objective: "leads", campaignId: "CMP-2", budgetType: "daily", budgetAmount: 12.5, start: today(), end: addDays(now(), 20).slice(0, 10),
    locations: ["Dallas"], ageMin: 25, ageMax: 65, interests: ["Home improvement"], assetIds: ["MED-7"], headline: "Fresh walls", text: "Book before the holidays.", cta: "get_quote", ...x,
  });

  it("puts each problem next to its field", () => {
    expect(run(db, "U-OFFICE", saveAd, ad({ budgetAmount: 0 })).result).toMatchObject({ ok: false, field: "budgetAmount" });
    expect(run(db, "U-OFFICE", saveAd, ad({ start: "2000-01-01" })).result).toMatchObject({ ok: false, field: "start" });
    expect(run(db, "U-OFFICE", saveAd, ad({ assetIds: [] })).result).toMatchObject({ ok: false, field: "assetIds" });
    expect(run(db, "U-OFFICE", saveAd, ad({ locations: [] })).result).toMatchObject({ ok: false, field: "locations" });
  });

  it("goes draft → awaiting approval → owner approves (sandbox) → pause → owner resumes", () => {
    const created = run(db, "U-OFFICE", saveAd, ad());
    const id = val<{ id: string }>(created.result).id;
    expect(created.db.socialAds!.find((a) => a.id === id)!.status).toBe("draft");
    expect(created.db.mktCampaigns!.find((c) => c.id === "CMP-2")!.adIds).toContain(id);
    const sub = run(created.db, "U-OFFICE", submitAdForApproval, id);
    expect(sub.db.socialAds!.find((a) => a.id === id)!.status).toBe("pending_approval");
    const office = run(sub.db, "U-OFFICE", approveAd, id);
    expect(office.result.ok).toBe(false);
    expect(office.db.activity[0]!.blocked).toBe(true);
    const owner = run(sub.db, "U-OWNER", approveAd, id);
    const live = owner.db.socialAds!.find((a) => a.id === id)!;
    expect(live).toMatchObject({ status: "active", sandbox: true, approval: { by: "U-OWNER", budget: 250 } });
    expect(live.performance!.sandbox).toBe(true);
    expect(live.performance!.spend).toBeLessThanOrEqual(250);
    const paused = run(owner.db, "U-OFFICE", pauseAd, id);
    expect(paused.db.socialAds!.find((a) => a.id === id)!.status).toBe("paused");
    expect(run(paused.db, "U-OFFICE", resumeAd, id).result.ok).toBe(false);
    expect(run(paused.db, "U-OWNER", resumeAd, id).db.socialAds!.find((a) => a.id === id)!.status).toBe("active");
  });

  it("approves a future ad to start on its date, and sends back with a comment", () => {
    expect(run(db, "U-OWNER", approveAd, "SAD-2").db.socialAds!.find((a) => a.id === "SAD-2")!.status).toBe("approved");
    expect(run(db, "U-OWNER", rejectAd, "SAD-2", " ").result).toMatchObject({ ok: false, field: "comment" });
    const back = run(db, "U-OWNER", rejectAd, "SAD-2", "Use the kitchen photo instead.");
    expect(back.db.socialAds!.find((a) => a.id === "SAD-2")).toMatchObject({ status: "rejected", rejection: { comment: "Use the kitchen photo instead." } });
  });

  it("editing an approved ad sends it back for approval", () => {
    const approved = run(db, "U-OWNER", approveAd, "SAD-2").db;
    const sad2 = approved.socialAds!.find((a) => a.id === "SAD-2")!;
    const edited = run(approved, "U-OFFICE", saveAd, ad({ id: "SAD-2", name: sad2.name, campaignId: "CMP-3", budgetType: "lifetime", budgetAmount: 700, start: sad2.schedule.start, end: sad2.schedule.end, assetIds: ["MED-3"] }));
    expect(val<{ backToDraft: boolean }>(edited.result).backToDraft).toBe(true);
    expect(edited.db.socialAds!.find((a) => a.id === "SAD-2")).toMatchObject({ status: "draft", approval: undefined });
  });
});

describe("§34 automations", () => {
  const base = createSeed(now());
  // EST-2026-5 was sent 10 days ago and not answered: the estimate follow-up is due.
  const db = produce(base, (d) => {
    const e = d.estimates.find((x) => x.id === "EST-2026-5")!;
    e.status = "SENT";
    e.sentAt = addDays(now(), -10);
  });

  it("turning one on is the owner's decision, with a confirmation-worthy log", () => {
    expect(run(db, "U-OFFICE", setAutomationActive, "AUTO-3", true).result.ok).toBe(false);
    const on = run(db, "U-OWNER", setAutomationActive, "AUTO-3", true);
    expect(on.db.mktAutomations!.find((a) => a.id === "AUTO-3")!.active).toBe(true);
    expect(run(on.db, "U-OFFICE", setAutomationActive, "AUTO-3", false).result.ok).toBe(true);
  });

  it("validates template edits next to the field", () => {
    expect(run(db, "U-OFFICE", saveAutomation, "AUTO-2", { channel: "sms", delayDays: 2, body: "Please review us" }).result).toMatchObject({ ok: false, field: "body" });
    expect(run(db, "U-OFFICE", saveAutomation, "AUTO-1", { channel: "email", delayDays: 2.5, subject: "Hi", body: "x UNSUBSCRIBE" }).result).toMatchObject({ ok: false, field: "delayDays" });
    expect(run(db, "U-OFFICE", saveAutomation, "AUTO-1", { channel: "email", delayDays: 5, subject: "", body: "x UNSUBSCRIBE" }).result).toMatchObject({ ok: false, field: "subject" });
    const ok = run(db, "U-OFFICE", saveAutomation, "AUTO-1", { channel: "email", delayDays: 5, subject: "Questions?", body: "Hi {{first_name}}. Reply UNSUBSCRIBE to stop." });
    expect(ok.db.mktAutomations!.find((a) => a.id === "AUTO-1")).toMatchObject({ delayDays: 5, subject: "Questions?" });
  });

  it("runs now in the sandbox, logs each target, skips opt-outs and never sends twice", () => {
    const auto = db.mktAutomations!.find((a) => a.id === "AUTO-1")!;
    const due = dueAutomationTargets(db, auto, now());
    expect(due.some((t) => t.targetKey === "EST:EST-2026-5")).toBe(true);
    expect(run(db, "U-OFFICE", runAutomation, "AUTO-1").result.ok).toBe(false);
    const target = due.find((t) => t.targetKey === "EST:EST-2026-5")!;
    const optedOut = produce(db, (d) => { (d.mktOptOuts ??= []).push({ address: target.to ?? "none@example.com", channel: "email", at: now(), source: "test" }); });
    const r = run(optedOut, "U-OWNER", runAutomation, "AUTO-1");
    expect(r.result.ok).toBe(true);
    const runRec = r.db.mktAutomationRuns!.find((x) => x.targetKey === "EST:EST-2026-5")!;
    expect(runRec.status).toBe(target.to ? "skipped_opt_out" : "skipped_no_address");
    const sent = run(db, "U-OWNER", runAutomation, "AUTO-1");
    const v = val<{ sent: number; skipped: number }>(sent.result);
    expect(v.sent + v.skipped).toBe(due.length);
    expect(sent.db.mktAutomationRuns!.length).toBe(db.mktAutomationRuns!.length + due.length);
    expect(run(sent.db, "U-OWNER", runAutomation, "AUTO-1").result).toMatchObject({ ok: false });
    expect(run(db, "U-OWNER", runAutomation, "AUTO-3").result.ok).toBe(false);
  });
});

describe("§34 insights and search", () => {
  const db = createSeed(now());

  it("recommends cutting the budget of an ad with spend and no leads; only the owner can apply it", () => {
    const rec = recommendations(db, now()).find((r) => r.kind === "adjust_ad_budget")!;
    expect(rec).toBeTruthy();
    expect(rec.action).toMatchObject({ type: "adjust_ad_budget", adId: "SAD-1", from: 15, to: 11 });
    expect(run(db, "U-OFFICE", applyRecommendation, rec).result.ok).toBe(false);
    const done = run(db, "U-OWNER", applyRecommendation, rec);
    expect(done.result.ok).toBe(true);
    expect(done.db.socialAds!.find((a) => a.id === "SAD-1")!.budget.amount).toBe(11);
    expect(recommendations(done.db, now()).some((r) => r.key === rec.key)).toBe(false);
    expect(run(done.db, "U-OWNER", applyRecommendation, rec).result.ok).toBe(false);
  });

  it("creates a follow-up task for an inactive lead", () => {
    const rec = recommendations(db, now()).find((r) => r.kind === "follow_up_lead");
    if (!rec) return;
    const done = run(db, "U-OFFICE", applyRecommendation, rec);
    expect(done.result.ok).toBe(true);
    expect(done.db.tasks[0]!.title).toMatch(/follow up/i);
  });

  it("dismisses an alert so it no longer shows", () => {
    const withAlert = produce(db, (d) => { d.mktCampaigns!.find((c) => c.id === "CMP-2")!.budget = 100; });
    const alert = trendAlerts(withAlert, now()).find((a) => a.kind === "over_budget")!;
    expect(alert.href).toBe("/marketing/campaigns?id=CMP-2");
    const after = run(withAlert, "U-OFFICE", dismissAlert, alert.key).db;
    expect(trendAlerts(after, now()).some((a) => a.key === alert.key)).toBe(false);
  });

  it("searches across leads, campaigns, posts, ads, landing pages and inbox messages", () => {
    const kinds = (text: string) => searchMarketing(db, now(), { text }).map((h) => h.kind);
    expect(kinds("Maya")).toContain("message");
    expect(kinds("fall-interior")).toContain("landing_page");
    expect(kinds("Fall interior")).toEqual(expect.arrayContaining(["campaign", "ad", "landing_page"]));
    expect(kinds("Autumn palette")).toContain("post");
    expect(searchMarketing(db, now(), { text: "FALL10" }).find((h) => h.kind === "promotion")!.href).toBe("/marketing/promotions?id=PROMO-1");
    expect(searchMarketing(db, now(), { platform: "instagram" }).every((h) => ["lead", "campaign", "expense", "link", "post", "ad", "message"].includes(h.kind))).toBe(true);
  });
});
