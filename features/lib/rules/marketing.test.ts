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
  recordRelease, uploadMedia, withdrawMedia, monthlyReport, simulateAccountIssue, removeAccess,
} from "@/features/lib/store/actions/marketing";
import {
  addressDetail, approvalReasons, assetImage, consentCheck, PHOTO_STORE_BUDGET_CHARS, dstDates, findStreetAddress, lateness, localLabel, localParts, matchLead, materialEdit, missingLeadFields, resolveLocal, usable, validateUpload,
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

describe("Feature 34 — lead matching (2 Oct 2026, D5)", () => {
  const NOW = "2026-09-25T12:00:00.000Z";
  const leads = [
    { id: "L-30", phone: "(214) 555-0101", email: "a@example.com", lastActivityAt: "2026-08-26T12:00:00.000Z" },
    { id: "L-120", phone: "(214) 555-0202", email: "b@example.com", lastActivityAt: "2026-05-28T12:00:00.000Z" },
    { id: "L-E", phone: "(469) 555-0303", email: "c@example.com", lastActivityAt: "2026-09-01T12:00:00.000Z" },
    { id: "L-LOST", phone: "(469) 555-0404", email: "d@example.com", lastActivityAt: "2026-09-10T12:00:00.000Z", open: false },
  ];
  it("marks a phone match to an open lead as a possible duplicate", () => {
    expect(matchLead(leads, { phone: "214-555-0101", email: "new@example.com" }, NOW)).toEqual({ kind: "possible_duplicate", leadId: "L-30", on: "phone" });
  });
  it("still matches an open lead whose last activity was 120 days ago", () => {
    expect(matchLead(leads, { phone: "2145550202" }, NOW)).toEqual({ kind: "possible_duplicate", leadId: "L-120", on: "phone" });
  });
  it("ignores leads that are sold, lost or archived", () => {
    expect(matchLead(leads, { phone: "469-555-0404", email: "d@example.com" }, NOW)).toEqual({ kind: "new" });
  });
  it("puts a phone-one, email-another match on the review list", () => {
    expect(matchLead(leads, { phone: "214 555 0101", email: "C@example.com" }, NOW)).toEqual({ kind: "review", phoneLeadId: "L-30", emailLeadId: "L-E" });
  });
  it("falls back to email when there is no phone match", () => {
    expect(matchLead(leads, { email: "C@example.com" }, NOW)).toEqual({ kind: "possible_duplicate", leadId: "L-E", on: "email" });
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

  it("rejects formats the browser can't turn into a JPEG, such as iPhone HEIC", () => {
    expect(validateUpload({ sizeMb: 2, type: "image/heic" }).error).toMatch(/JPG, PNG or WebP/);
    expect(validateUpload({ sizeMb: 2, type: "image/png" }).ok).toBe(true);
  });

  it("an uploaded photo is stored on its record; a crop shows the original's photo without a second copy", () => {
    const db = fresh();
    const id = val(uploadMedia(db, as(db, "U-OFFICE"), { label: "Trim", sizeMb: 2, type: "image/jpeg", kind: "surface_detail", dataUrl: "data:image/jpeg;base64,AAAA", width: 3000, height: 4000 }))!;
    const up = db.mediaAssets.find((a) => a.id === id)!;
    expect(up).toMatchObject({ dataUrl: "data:image/jpeg;base64,AAAA", width: 3000, height: 4000, mediaType: "image" });
    const cropId = val(createCrop(db, as(db, "U-OFFICE"), id, "square", "finished_job"));
    const crop = db.mediaAssets.find((a) => a.id === cropId)!;
    expect(crop.dataUrl).toBeUndefined();
    expect(assetImage(db.mediaAssets, crop)).toBe(up.dataUrl);
  });

  it("caps the photos stored in the shared demo record", () => {
    const db = fresh();
    const big = `data:image/jpeg;base64,${"A".repeat(PHOTO_STORE_BUDGET_CHARS - 100)}`;
    expect(uploadMedia(db, as(db, "U-OFFICE"), { label: "a", sizeMb: 2, type: "image/jpeg", kind: "surface_detail", dataUrl: big }).ok).toBe(true);
    const r = uploadMedia(db, as(db, "U-OFFICE"), { label: "b", sizeMb: 2, type: "image/jpeg", kind: "surface_detail", dataUrl: "data:image/jpeg;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" });
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toMatch(/photo storage is full/);
  });

  it("recording a customer's verbal permission unlocks a house photo and its crops, with the note kept", () => {
    const db = fresh();
    const id = val(uploadMedia(db, as(db, "U-OFFICE"), { label: "Front of house", sizeMb: 2, type: "image/jpeg", kind: "customer_property", jobId: "JOB-2026-1" }))!;
    const cropId = val(createCrop(db, as(db, "U-OFFICE"), id, "vertical", "finished_job"))!;
    const get = (x: string) => db.mediaAssets.find((a) => a.id === x)!;
    expect(usable(get(id)).ok).toBe(false);
    expect(recordRelease(db, as(db, "U-OFFICE"), id, { type: "verbal_approval", givenBy: "Korah Singer", note: "" }).ok).toBe(false);
    const r = recordRelease(db, as(db, "U-OFFICE"), id, { type: "verbal_approval", givenBy: "Korah Singer", note: "Said yes on the phone, 5 Oct" });
    expect(val(r)).toBe(2);
    for (const x of [id, cropId]) {
      expect(usable(get(x)).ok).toBe(true);
      expect(get(x).releaseRecord).toMatchObject({ type: "verbal_approval", givenBy: "Korah Singer", note: "Said yes on the phone, 5 Oct", by: "U-OFFICE" });
      expect(get(x).releaseRef).toMatch(/Verbal permission from Korah Singer.*Said yes on the phone/);
    }
    expect(recordRelease(db, as(db, "U-OFFICE"), id, { type: "written_approval", givenBy: "K", note: "again" }).ok).toBe(false);
  });

  it("permission given at upload is recorded on the new photo; a missing note stops the upload", () => {
    const db = fresh();
    const base = { label: "Porch", sizeMb: 2, type: "image/jpeg", kind: "customer_property" as const };
    expect(uploadMedia(db, as(db, "U-OFFICE"), { ...base, release: { type: "written_approval", givenBy: "Wen Li", note: " " } }).ok).toBe(false);
    const id = val(uploadMedia(db, as(db, "U-OFFICE"), { ...base, release: { type: "written_approval", givenBy: "Wen Li", note: "Texted OK" } }))!;
    expect(db.mediaAssets.find((a) => a.id === id)).toMatchObject({ release: "written_approval", releaseRecord: { givenBy: "Wen Li" } });
  });

  it("a withdrawn photo can't be given permission again from the library", () => {
    const db = fresh();
    const id = val(uploadMedia(db, as(db, "U-OFFICE"), { label: "Porch", sizeMb: 2, type: "image/jpeg", kind: "customer_property" }))!;
    withdrawMedia(db, as(db, "U-OFFICE"), id, "Customer changed their mind");
    expect(recordRelease(db, as(db, "U-OFFICE"), id, { type: "verbal_approval", givenBy: "K", note: "yes" }).ok).toBe(false);
  });

  it("a personal-data deletion removes the stored photo", () => {
    const db = fresh();
    const id = val(uploadMedia(db, as(db, "U-OFFICE"), { label: "Porch", sizeMb: 2, type: "image/jpeg", kind: "surface_detail", dataUrl: "data:image/jpeg;base64,AAAA" }))!;
    withdrawMedia(db, as(db, "U-OWNER"), id, "Customer emailed", true);
    expect(db.mediaAssets.find((a) => a.id === id)?.dataUrl).toBeUndefined();
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

  it("website events (D5): a match to an open lead is still a new lead, marked Possible duplicate; review on conflict; one lead per event", () => {
    const db = fresh();
    const u = as(db, "U-OFFICE");
    const base = { name: "Aisha Roberts", town: "Lakewood", message: "Also the garage door." };
    const before = db.leads.length;
    const a = submitWebsiteForm(db, u, { ...base, ref: "WF-T1", phone: "214-555-0161", email: "aisha.roberts@example.com", address: "12 Elm St, Lakewood", paintType: "Exterior" });
    const av = val(a)!;
    expect(av).toMatchObject({ outcome: "possible_duplicate", on: "phone" });
    expect(av.leadId).not.toBe("LEAD-2026-6");
    expect(db.leads.length).toBe(before + 1);
    expect(db.leads.find((l) => l.id === av.leadId)).toMatchObject({ possibleDuplicateOf: "LEAD-2026-6", address: "12 Elm St, Lakewood", paintType: "Exterior" });
    // Tom Becker's lead is still open (Contacted), however old: also a possible duplicate.
    const b = submitWebsiteForm(db, u, { ...base, name: "Tom Becker", ref: "WF-T2", phone: "(972) 555-0182", email: "tom.becker@example.com" });
    expect(val(b)?.outcome).toBe("possible_duplicate");
    // A brand-new person is a plain new lead.
    const n = submitWebsiteForm(db, u, { ...base, name: "Pia Grant", ref: "WF-T4", phone: "(469) 555-0999", email: "pia.grant@example.com", sourceLabel: "Nextdoor" });
    expect(val(n)?.outcome).toBe("new");
    // Tab 2: admins and the default estimator are told "New lead from {Source}: {Name}.", and the lead is theirs.
    const told = (db.notifications ?? []).filter((x) => x.kind === "new_lead" && x.title === "New lead from Nextdoor: Pia Grant.").map((x) => x.userId).sort();
    expect(told).toEqual(["U-EST", "U-OFFICE", "U-OWNER"]);
    expect(db.leads.find((l) => l.id === val(n)!.leadId)?.assignedUserId).toBe("U-EST");
    const c = submitWebsiteForm(db, u, { ...base, ref: "WF-T3", phone: "(214) 555-0161", email: "wen.li@example.com" });
    expect(val(c)?.outcome).toBe("review");
    const leads = db.leads.length;
    const d = submitWebsiteForm(db, u, { ...base, ref: "WF-T3", phone: "(214) 555-0161", email: "wen.li@example.com" });
    expect(val(d)?.outcome).toBe("duplicate");
    expect(db.leads.length).toBe(leads);
  });

  it("the monthly report counts posts and leads by source, and leaves engagement Unavailable", () => {
    const db = fresh();
    // On the first days of a month the seeded posts all fall in last month: publish one now, so the test holds on any date.
    const p = db.marketingPosts[0]!;
    p.publications = [...p.publications, { ...p.publications[0]!, platform: "facebook", status: "published", at: now() }];
    const r = monthlyReport(db, localParts(now()).date.slice(0, 7));
    expect(r.published).toBeGreaterThan(0);
    expect(r.unavailable).toContain("Engagement");
  });
});
