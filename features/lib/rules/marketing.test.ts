/**
 * Feature 34 — Social Media And Marketing Management. Each test names the
 * acceptance criterion it checks.
 */
import { describe, expect, it } from "vitest";
import type { ActionResult, MediaAsset, User } from "@/features/types";
const val = <T,>(r: ActionResult<T>) => (r.ok ? r.value : undefined);
import { createSeed } from "@/features/data/seed";
import { now } from "@/features/lib/clock";
import {
  approvePost, checkOutcome, copyToPlatform, createCrop, createPost, postChecks, publishPost, retryFailed, runScheduler, schedulePost, sendForApproval, submitWebsiteForm, updatePost,
  uploadMedia, withdrawMedia, monthlyReport, simulateAccountIssue, removeAccess,
} from "@/features/lib/store/actions/marketing";
import {
  addressDetail, approvalReasons, consentCheck, dstDates, findStreetAddress, lateness, localLabel, localParts, matchLead, materialEdit, missingLeadFields, resolveLocal, validateUpload,
} from "./marketing";

const asset = (x: Partial<MediaAsset> = {}): MediaAsset => ({
  id: "MED-X", label: "", jobId: "JOB-2026-1", kind: "customer_property", identifying: false, release: "none", sizeMb: 3, takenAt: "2026-09-01T12:00:00.000Z", uploadedBy: "U-OFFICE", hex: "#999", ...x,
});

describe("Feature 34 — consent", () => {
  it("blocks a customer's house with no signed release and names the missing release", () => {
    const r = consentCheck([asset()]);
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toMatch(/no signed release on JOB-2026-1/);
  });
  it("allows a released house photo but still requires owner approval as customer-property content", () => {
    const a = asset({ release: "signed_contract", releaseRef: "Contract photo release" });
    expect(consentCheck([a]).ok).toBe(true);
    expect(approvalReasons({ template: "finished_job", flags: { customerProperty: false, testimonial: false, namedCrew: false } }, [a])).toContain("CustomerProperty");
  });
  it("allows surface images without a release", () => {
    expect(consentCheck([asset({ kind: "surface_detail" })]).ok).toBe(true);
  });
  it("never allows withdrawn media", () => {
    expect(consentCheck([asset({ release: "signed_contract", withdrawnAt: "2026-09-20T12:00:00.000Z" })]).failures[0]).toMatch(/withdrawn on 2026-09-20/);
  });
  it("needs no owner approval for a seasonal reminder with no identifiers", () => {
    expect(approvalReasons({ template: "seasonal", flags: { customerProperty: false, testimonial: false, namedCrew: false } }, [asset({ kind: "seasonal" })])).toEqual([]);
  });
  it("flags visible house numbers before scheduling", () => {
    expect(addressDetail(asset({ identifyingNote: "House number visible on the porch post" }))).toBe(true);
  });
});

describe("Feature 34 — location check", () => {
  it("blocks a street address and permits a neighbourhood", () => {
    expect(findStreetAddress("Fresh coat at 1314 Maple Ridge Dr this week")).toBe("1314 Maple Ridge Dr");
    expect(findStreetAddress("Another Lakewood exterior finished — two coats of Duration")).toBeNull();
  });
});

describe("Feature 34 — uploads", () => {
  it("rejects 9 MB with the 8 MB limit named, and rejects video", () => {
    expect(validateUpload({ sizeMb: 9, type: "image/jpeg" }).error).toMatch(/under 8 MB/);
    expect(validateUpload({ sizeMb: 2, type: "video/mp4" }).error).toMatch(/Video is not supported/);
    expect(validateUpload({ sizeMb: 7.9, type: "image/jpeg" }).ok).toBe(true);
  });
});

describe("Feature 34 — material edits", () => {
  const base = { copy: "Two coats of Duration on a Lakewood ranch — looking sharp.", assetIds: ["MED-1"] };
  it("replacing the image needs renewed approval", () => {
    expect(materialEdit(base, { ...base, assetIds: ["MED-2"] })).toBe("Image");
  });
  it("fixing a spelling mistake does not", () => {
    expect(materialEdit({ ...base, copy: "Two coats of Duration on a Lakewood ranch — lookng sharp." }, base)).toBeNull();
  });
  it("changing a claim or identifying text does", () => {
    expect(materialEdit(base, { ...base, copy: "Two coats of Duration on a Lakewood ranch — guaranteed 10 years." })).toBe("Claim");
    expect(materialEdit(base, { ...base, copy: "Two coats of Duration on the Singer family ranch — looking sharp." })).toBe("IdentifyingText");
  });
});

describe("Feature 34 — scheduling and daylight saving (34.Q01)", () => {
  it("moves a nonexistent 2:30 a.m. spring-forward time to the first valid time after the gap", () => {
    const { springForward } = dstDates(2027);
    expect(springForward).toBe("2027-03-14");
    const r = resolveLocal(springForward, "02:30");
    expect(r.adjustment).toBe("moved_to_first_valid");
    expect(r.resolvedLocal).toBe("2027-03-14 03:00");
    expect(r.utc).toBe("2027-03-14T08:00:00.000Z");
  });
  it("uses the first occurrence of a repeated 1:30 a.m. autumn time", () => {
    const { fallBack } = dstDates(2026);
    expect(fallBack).toBe("2026-11-01");
    const r = resolveLocal(fallBack, "01:30");
    expect(r.adjustment).toBe("first_occurrence");
    expect(r.utc).toBe("2026-11-01T06:30:00.000Z"); // CDT, UTC−5
  });
  it("needs no adjustment on an ordinary day", () => {
    expect(resolveLocal("2026-10-06", "09:00")).toMatchObject({ adjustment: "none", utc: "2026-10-06T14:00:00.000Z" });
    expect(localLabel("2026-10-06T14:00:00.000Z")).toMatch(/9:00/);
  });
  it("waits for the office manager at 10 and 20 minutes late; 45 minutes late is missed", () => {
    const at = "2026-09-25T15:00:00.000Z";
    expect(lateness(at, "2026-09-25T15:10:00.000Z").state).toBe("waiting");
    expect(lateness(at, "2026-09-25T15:20:00.000Z").state).toBe("waiting");
    expect(lateness(at, "2026-09-25T15:45:00.000Z").state).toBe("missed");
    expect(lateness(at, "2026-09-25T14:59:00.000Z").state).toBe("not_due");
  });
});

describe("Feature 34 — lead matching (34.Q02)", () => {
  const NOW = "2026-09-25T12:00:00.000Z";
  const leads = [
    { id: "L-30", phone: "(214) 555-0101", email: "a@example.com", lastActivityAt: "2026-08-26T12:00:00.000Z" },
    { id: "L-120", phone: "(214) 555-0202", email: "b@example.com", lastActivityAt: "2026-05-28T12:00:00.000Z" },
    { id: "L-E", phone: "(469) 555-0303", email: "c@example.com", lastActivityAt: "2026-09-01T12:00:00.000Z" },
  ];
  it("attaches a phone match whose last activity was 30 days ago", () => {
    expect(matchLead(leads, { phone: "214-555-0101", email: "new@example.com" }, NOW)).toEqual({ kind: "attach", leadId: "L-30", on: "phone" });
  });
  it("creates a new lead when the phone's lead was last active 120 days ago", () => {
    expect(matchLead(leads, { phone: "2145550202" }, NOW).kind).toBe("new");
  });
  it("puts a phone-one, email-another match on the review list", () => {
    expect(matchLead(leads, { phone: "214 555 0101", email: "C@example.com" }, NOW)).toEqual({ kind: "review", phoneLeadId: "L-30", emailLeadId: "L-E" });
  });
  it("falls back to email when there is no phone match", () => {
    expect(matchLead(leads, { email: "c@example.com" }, NOW)).toEqual({ kind: "attach", leadId: "L-E", on: "email" });
  });
  it("names a missing phone number among the mandatory fields", () => {
    expect(missingLeadFields({ name: "A", email: "a@x.com", town: "Plano", message: "Quote?" })).toEqual(["phone"]);
  });
});

describe("Feature 34 — seeded posts and actions", () => {
  const fresh = () => createSeed(now());
  const as = (db: ReturnType<typeof fresh>, id: string) => db.users.find((u) => u.id === id) as User;
  const post = (db: ReturnType<typeof fresh>, id: string) => db.marketingPosts.find((p) => p.id === id)!;
  const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  it("blocks scheduling a house photo with no release and names it", () => {
    const db = fresh();
    const r = schedulePost(db, as(db, "U-OFFICE"), "POST-14", tomorrow(), "10:00");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/MED-4: Surface images only/);
  });

  it("blocks saving copy with a street address", () => {
    const db = fresh();
    const r = createPost(db, as(db, "U-OFFICE"), { title: "x", template: "finished_job", copy: "Done at 1314 Maple Ridge Dr!", assetIds: [], platforms: ["facebook"], flags: { customerProperty: false, testimonial: false, namedCrew: false } });
    expect(!r.ok && r.error).toMatch(/street address/);
  });

  it("a post awaiting approval can't be scheduled; once the owner approves, it can", () => {
    const db = fresh();
    expect(schedulePost(db, as(db, "U-OFFICE"), "POST-13", tomorrow(), "10:00").ok).toBe(false);
    expect(approvePost(db, as(db, "U-OFFICE"), "POST-13").ok).toBe(false);
    expect(approvePost(db, as(db, "U-OWNER"), "POST-13").ok).toBe(true);
    expect(schedulePost(db, as(db, "U-OFFICE"), "POST-13", tomorrow(), "10:00").ok).toBe(true);
  });

  it("a routine seasonal post needs no owner approval", () => {
    const db = fresh();
    expect(sendForApproval(db, as(db, "U-OFFICE"), "POST-15").ok && post(db, "POST-15").state).toBe("approved");
  });

  it("a claim edit voids the approval; a typo fix keeps it", () => {
    const db = fresh();
    const p = post(db, "POST-10");
    const input = { title: p.title, template: p.template, copy: p.copy.replace("finished", "finishd"), assetIds: p.assetIds, platforms: p.platforms, flags: p.flags };
    expect(updatePost(db, as(db, "U-OFFICE"), "POST-10", input).ok).toBe(true);
    expect(postChecks(db, post(db, "POST-10")).approved).toBe(true);
    updatePost(db, as(db, "U-OFFICE"), "POST-10", { ...input, copy: "Lakewood exterior finished — guaranteed for 10 years." });
    expect(postChecks(db, post(db, "POST-10")).approved).toBe(false);
    expect(post(db, "POST-10").state).toBe("draft");
  });

  it("copying an approved post to the other platform re-evaluates approval", () => {
    const db = fresh();
    const r = copyToPlatform(db, as(db, "U-OFFICE"), "POST-10", "instagram");
    const copy = post(db, val(r)!);
    expect(postChecks(db, copy).needsApproval).toBe(true);
    expect(postChecks(db, copy).approved).toBe(false);
  });

  it("rejects a 9 MB upload and video; a crop keeps the original unchanged", () => {
    const db = fresh();
    expect(uploadMedia(db, as(db, "U-OFFICE"), { label: "big", sizeMb: 9, type: "image/jpeg", kind: "surface_detail" }).ok).toBe(false);
    expect(uploadMedia(db, as(db, "U-OFFICE"), { label: "clip", sizeMb: 3, type: "video/mp4", kind: "surface_detail" }).ok).toBe(false);
    const before = JSON.stringify(db.mediaAssets.find((a) => a.id === "MED-1"));
    const c = createCrop(db, as(db, "U-OFFICE"), "MED-1", "vertical", "finished_job");
    expect(JSON.stringify(db.mediaAssets.find((a) => a.id === "MED-1"))).toBe(before);
    expect(db.mediaAssets.find((a) => a.id === val(c))?.identifying).toBe(false);
  });

  it("a late post is never published by the scheduler: 10 minutes waits, over 30 is missed", () => {
    const db = fresh();
    const r = runScheduler(db, as(db, "U-OFFICE"));
    expect(r.ok && r.value).toEqual({ missed: 0, waiting: 1 });
    expect(post(db, "POST-11").state).toBe("scheduled");
    post(db, "POST-11").schedule!.utc = new Date(Date.now() - 45 * 60_000).toISOString();
    runScheduler(db, as(db, "U-OFFICE"));
    expect(post(db, "POST-11").state).toBe("missed");
    expect(publishPost(db, as(db, "U-OFFICE"), "POST-11", "manual").ok).toBe(false);
  });

  it("retries only the failed platform, and blocks retry while an outcome is unclear", () => {
    const db = fresh();
    const fbRef = post(db, "POST-7").publications[0].externalRef;
    expect(retryFailed(db, as(db, "U-OFFICE"), "POST-7").ok).toBe(true);
    expect(post(db, "POST-7").publications[0].externalRef).toBe(fbRef);
    expect(post(db, "POST-7").state).toBe("published");
    const r = retryFailed(db, as(db, "U-OFFICE"), "POST-8");
    expect(!r.ok && r.error).toMatch(/outcome unclear/);
    checkOutcome(db, as(db, "U-OFFICE"), "POST-8", "instagram", true);
    expect(post(db, "POST-8").state).toBe("published");
  });

  it("withdrawal removes media from scheduled posts at once and puts published posts on the takedown list", () => {
    const db = fresh();
    const r = withdrawMedia(db, as(db, "U-OFFICE"), "MED-1", "Customer phoned to withdraw.");
    expect(r.ok && r.value).toBe(1); // POST-10 uses the crop MED-2
    expect(post(db, "POST-10").assetIds).toEqual([]);
    expect(post(db, "POST-1").takedown?.doneAt).toBeUndefined();
    expect(post(db, "POST-1").takedown?.reason).toMatch(/MED-1/);
  });

  it("an expired account flags the affected scheduled posts; departure keeps history", () => {
    const db = fresh();
    expect(val(simulateAccountIssue(db, as(db, "U-OFFICE"), "instagram", "expired"))).toBeGreaterThan(0);
    expect(postChecks(db, post(db, "POST-10")).accountIssues[0]).toMatch(/Instagram access expired/);
    const count = db.marketingPosts.length;
    expect(removeAccess(db, as(db, "U-OWNER"), "U-EST").ok).toBe(true);
    expect(db.marketingPosts.length).toBe(count);
  });

  it("website events: attach within 90 days, new after 120, review on conflict, one lead per event", () => {
    const db = fresh();
    const u = as(db, "U-OFFICE");
    const base = { name: "Aisha Roberts", town: "Lakewood", message: "Also the garage door." };
    const a = submitWebsiteForm(db, u, { ...base, ref: "WF-T1", phone: "214-555-0161", email: "aisha.roberts@example.com" });
    expect(val(a)).toMatchObject({ leadId: "LEAD-2026-6", outcome: "attached", on: "phone" });
    const b = submitWebsiteForm(db, u, { ...base, name: "Tom Becker", ref: "WF-T2", phone: "(972) 555-0182", email: "tom.becker@example.com" });
    expect(val(b)?.outcome).toBe("new");
    const c = submitWebsiteForm(db, u, { ...base, ref: "WF-T3", phone: "(214) 555-0161", email: "wen.li@example.com" });
    expect(val(c)?.outcome).toBe("review");
    const leads = db.leads.length;
    const d = submitWebsiteForm(db, u, { ...base, ref: "WF-T3", phone: "(214) 555-0161", email: "wen.li@example.com" });
    expect(val(d)?.outcome).toBe("duplicate");
    expect(db.leads.length).toBe(leads);
  });

  it("the monthly report counts posts and leads by source, and leaves engagement Unavailable", () => {
    const db = fresh();
    const r = monthlyReport(db, localParts(now()).date.slice(0, 7));
    expect(r.published).toBeGreaterThan(0);
    expect(r.unavailable).toContain("Engagement");
  });
});
