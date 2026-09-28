/**
 * Feature 34 seed: job media with release evidence, a month of posts in
 * every state, the test Facebook page and Instagram account, and website
 * leads that exercise matching (34.Q02).
 *
 * - MED-1 Korah Singer's front elevation (JOB-2026-1): released, but the house
 *   number is visible — MED-2 is the square crop with it cropped out.
 * - MED-4 Sam Sample's kitchen with the homeowner in frame: no release, locked.
 * - MED-8 JOB-2026-5 living room: permission withdrawn two days ago; POST-6,
 *   already published, is on the takedown list.
 * - POST-9 is scheduled for 1:30 a.m. on the autumn fall-back date (first
 *   occurrence used); POST-11 is ten minutes late and waiting for the office.
 */
import type { Customer, Lead, MarketingPost, MediaAsset, PostPublication, SocialAccount, SocialPlatform } from "@/features/types";
import { addDays } from "@/features/lib/rules/dates";
import { dstDates, localParts, resolveLocal } from "@/features/lib/rules/marketing";

export function marketingSeed(nowIso: string) {
  const d = (days: number) => addDays(nowIso, days);
  const mins = (m: number) => new Date(new Date(nowIso).getTime() + m * 60_000).toISOString();
  let ref = 0;
  const pub = (platform: SocialPlatform, at: string, status: PostPublication["status"] = "published", error?: string): PostPublication =>
    status === "published" ? { platform, status, at, externalRef: `${platform === "facebook" ? "fb" : "ig"}_${1789000 + ++ref}` } : { platform, status, at, error };
  const noChecks = { houseNumbers: false, faces: false, plates: false, neighbouring: false };
  const checked = { houseNumbers: true, faces: true, plates: true, neighbouring: true };
  const none = { customerProperty: false, testimonial: false, namedCrew: false };

  const mediaAssets: MediaAsset[] = [
    { id: "MED-1", label: "Front elevation — finished", jobId: "JOB-2026-1", propertyId: "PROP-1001", neighbourhood: "Lakewood", kind: "customer_property", identifying: true, identifyingNote: "House number visible on the porch column",
      release: "signed_contract", releaseRef: "Contract photo release (clause 14), signed by Korah Singer", sizeMb: 5.8, takenAt: d(-9), uploadedBy: "U-CREW", hex: "#6b7f99" },
    { id: "MED-2", label: "Front elevation — finished — square crop", jobId: "JOB-2026-1", propertyId: "PROP-1001", neighbourhood: "Lakewood", kind: "customer_property", identifying: false, identifyingNote: "Address detail cropped out",
      release: "signed_contract", releaseRef: "Contract photo release (clause 14), signed by Korah Singer", sizeMb: 2.1, takenAt: d(-9), uploadedBy: "U-OFFICE", hex: "#6b7f99", cropOf: "MED-1", crop: { format: "square", template: "Finished job" } },
    { id: "MED-3", label: "Cabinet door — satin finish detail", jobId: "JOB-2026-2", propertyId: "PROP-1002", neighbourhood: "Knox-Henderson", kind: "surface_detail", identifying: false, release: "none", sizeMb: 3.4, takenAt: d(-12), uploadedBy: "U-CREW", hex: "#e8e4da" },
    { id: "MED-4", label: "Kitchen wide shot with homeowner", jobId: "JOB-2026-2", propertyId: "PROP-1002", neighbourhood: "Knox-Henderson", kind: "customer_property", identifying: true, identifyingNote: "Homeowner's face in frame",
      release: "none", sizeMb: 6.2, takenAt: d(-12), uploadedBy: "U-CREW", hex: "#d6cfc2" },
    { id: "MED-5", label: "Siding before and after", jobId: "JOB-2026-3", propertyId: "PROP-1004", neighbourhood: "Canyon Creek", kind: "customer_property", identifying: false,
      release: "written_approval", releaseRef: "Text from Steven Omodth: \"Happy for you to post the before and after\"", sizeMb: 4.9, takenAt: d(-15), uploadedBy: "U-CREW", hex: "#8a9a86" },
    { id: "MED-6", label: "Luis and the crew on the scaffold", jobId: "JOB-2026-1", kind: "crew", identifying: true, identifyingNote: "Crew faces", release: "hiring_release", releaseRef: "Employee hiring release", sizeMb: 4.2, takenAt: d(-20), uploadedBy: "U-OFFICE", hex: "#c98d4f" },
    { id: "MED-7", label: "Autumn palette swatch card", kind: "seasonal", identifying: false, release: "none", sizeMb: 1.2, takenAt: d(-30), uploadedBy: "U-OFFICE", hex: "#b5562f" },
    { id: "MED-8", label: "Living room — main floor finished", jobId: "JOB-2026-5", propertyId: "PROP-1004", neighbourhood: "Canyon Creek", kind: "customer_property", identifying: false,
      release: "signed_contract", releaseRef: "Contract photo release (clause 14), signed by Steven Omodth", sizeMb: 5.1, takenAt: d(-25), uploadedBy: "U-CREW", hex: "#cbbfa8",
      withdrawnAt: d(-2), withdrawnBy: "U-OFFICE", withdrawReason: "Customer emailed asking us to stop using photos of the inside of the house." },
  ];

  const post = (p: Partial<MarketingPost> & Pick<MarketingPost, "id" | "title" | "template" | "copy" | "assetIds" | "platforms" | "state">, created: number): MarketingPost => ({
    flags: none, checklist: checked, version: 1, versions: [{ version: 1, at: d(created), by: "U-OFFICE", copy: p.copy, assetIds: p.assetIds, note: "Drafted" }], publications: [],
    createdBy: "U-OFFICE", createdAt: d(created), ...p,
  });
  const at = (utc: string) => ({ ...localParts(utc), utc });
  const sched = (utc: string, adjustment: "none" | "first_occurrence" = "none") => {
    const l = at(utc);
    return { localDate: l.date, localTime: l.time, utc, adjustment };
  };
  const approved = (days: number) => ({ approval: { version: 1, by: "U-OWNER", at: d(days) } });
  const both: SocialPlatform[] = ["facebook", "instagram"];

  // The next autumn fall-back date in the configured zone, 1:30 a.m. local (occurs twice).
  const y = new Date(nowIso).getUTCFullYear();
  const fb = dstDates(y).fallBack > nowIso.slice(0, 10) ? dstDates(y).fallBack : dstDates(y + 1).fallBack;
  const fallBack = resolveLocal(fb, "01:30");

  const marketingPosts: MarketingPost[] = [
    post({ id: "POST-16", title: "Cabinet refinish reveal", template: "finished_job", copy: "Cabinets refinished in Knox-Henderson — satin white, two coats, no brush marks.", assetIds: ["MED-3"], platforms: both, state: "draft", flags: { ...none, customerProperty: true },
      version: 2, approval: { version: 1, by: "U-OWNER", at: d(-2) }, approvalVoided: { at: d(-1), reason: "Image" },
      versions: [{ version: 1, at: d(-3), by: "U-OFFICE", copy: "Cabinets refinished in Knox-Henderson — satin white, two coats, no brush marks.", assetIds: ["MED-4"], note: "Drafted" },
        { version: 2, at: d(-1), by: "U-OFFICE", copy: "Cabinets refinished in Knox-Henderson — satin white, two coats, no brush marks.", assetIds: ["MED-3"], note: "Material edit (Image)" }] }, -3),
    post({ id: "POST-15", title: "Autumn colour ideas", template: "seasonal", copy: "Thinking about a new front door colour before the holidays? Our autumn palette is here.", assetIds: ["MED-7"], platforms: both, state: "draft", checklist: noChecks }, -1),
    post({ id: "POST-14", title: "Kitchen transformation", template: "finished_job", copy: "What a difference! Kitchen cabinets refinished in Knox-Henderson.", assetIds: ["MED-4"], platforms: ["instagram"], state: "draft", checklist: noChecks }, -1),
    post({ id: "POST-13", title: "Siding before and after", template: "before_after", copy: "Before and after in Canyon Creek. \"The house looks brand new\" — our customer.", assetIds: ["MED-5"], platforms: both, state: "awaiting_approval", flags: { customerProperty: true, testimonial: true, namedCrew: false } }, -1),
    post({ id: "POST-12", title: "Exterior prep tips", template: "seasonal", copy: "Five things we check before we paint an exterior.", assetIds: ["MED-7"], platforms: ["facebook"], state: "missed", schedule: sched(d(-1)), missedAt: addDays(d(-1), 0.03), publications: [{ platform: "facebook", status: "pending" }] }, -4),
    post({ id: "POST-11", title: "Weekend reminder", template: "seasonal", copy: "Dry weekend ahead — a great time to book an exterior estimate.", assetIds: ["MED-7"], platforms: both, state: "scheduled", schedule: sched(mins(-10)), publications: both.map((platform) => ({ platform, status: "pending" as const })) }, -2),
    post({ id: "POST-10", title: "Lakewood exterior finished", template: "finished_job", copy: "Another Lakewood exterior finished — body, trim and door in two coats of Duration.", assetIds: ["MED-2"], platforms: both, state: "scheduled", flags: { ...none, customerProperty: true }, ...approved(-1),
      schedule: sched(resolveLocal(localParts(d(2)).date, "09:00").utc), publications: both.map((platform) => ({ platform, status: "pending" as const })) }, -2),
    post({ id: "POST-9", title: "Clocks go back — daylight reminder (DST example)", template: "seasonal", copy: "Clocks go back this weekend. Shorter days are coming — book your exterior before the cold sets in.", assetIds: ["MED-7"], platforms: ["facebook"], state: "scheduled",
      schedule: { localDate: fb, localTime: "01:30", utc: fallBack.utc, adjustment: "first_occurrence" }, publications: [{ platform: "facebook", status: "pending" }] }, -2),
    post({ id: "POST-8", title: "Autumn palette", template: "seasonal", copy: "Our autumn palette: rust, olive and warm white.", assetIds: ["MED-7"], platforms: both, state: "partially_failed", schedule: sched(d(-2)),
      publications: [pub("facebook", d(-2)), pub("instagram", d(-2), "uncertain", "Timed out waiting for the platform's response.")] }, -5),
    post({ id: "POST-7", title: "Satin finish close-up", template: "finished_job", copy: "Up close with a satin cabinet finish. No brush marks.", assetIds: ["MED-3"], platforms: both, state: "partially_failed", schedule: sched(d(-1)),
      publications: [pub("facebook", d(-1)), pub("instagram", d(-1), "failed", "The platform rejected the request (media processing error).")] }, -4),
    post({ id: "POST-6", title: "Main floor refresh", template: "finished_job", copy: "Main floor repainted in Canyon Creek — warm white walls, crisp trim.", assetIds: ["MED-8"], platforms: both, state: "published", flags: { ...none, customerProperty: true }, ...approved(-21),
      schedule: sched(d(-20)), publications: [pub("facebook", d(-20)), pub("instagram", d(-20))], takedown: { requiredAt: d(-2), reason: "MED-8 permission withdrawn: Customer emailed asking us to stop using photos of the inside of the house." } }, -22),
    post({ id: "POST-5", title: "Cabinet satin detail", template: "finished_job", copy: "The detail matters: sanded, primed, two coats of satin.", assetIds: ["MED-3"], platforms: ["facebook"], state: "published", schedule: sched(d(-17)), publications: [pub("facebook", d(-17))] }, -18),
    post({ id: "POST-4", title: "Crew spotlight — Luis", template: "crew_spotlight", copy: "Meet Luis, our crew lead for eleven years. Ask him about ladders.", assetIds: ["MED-6"], platforms: both, state: "published", flags: { ...none, namedCrew: true }, ...approved(-14),
      schedule: sched(d(-13)), publications: [pub("facebook", d(-13)), pub("instagram", d(-13))] }, -15),
    post({ id: "POST-3", title: "Canyon Creek before and after", template: "before_after", copy: "Siding before and after in Canyon Creek.", assetIds: ["MED-5"], platforms: both, state: "published", flags: { ...none, customerProperty: true }, ...approved(-11),
      schedule: sched(d(-10)), publications: [pub("facebook", d(-10)), pub("instagram", d(-10))] }, -12),
    post({ id: "POST-2", title: "Autumn is painting season", template: "seasonal", copy: "Mild days, low humidity — autumn is the best time for an exterior.", assetIds: ["MED-7"], platforms: both, state: "published", schedule: sched(d(-6)), publications: [pub("facebook", d(-6)), pub("instagram", d(-6))] }, -7),
    post({ id: "POST-1", title: "Lakewood front elevation", template: "finished_job", copy: "Fresh exterior in Lakewood. Body in Repose Gray, trim in Pure White.", assetIds: ["MED-2"], platforms: both, state: "published", flags: { ...none, customerProperty: true }, ...approved(-4),
      schedule: sched(d(-3)), publications: [pub("facebook", d(-3)), pub("instagram", d(-3))] }, -5),
  ];

  const socialAccounts: SocialAccount[] = [
    { platform: "facebook", accountId: "104882213551920", name: "Estimate Master Painting — TEST page", status: "connected", expiresAt: d(40), test: true, mode: "publish", access: ["U-OWNER", "U-OFFICE", "U-EST"] },
    { platform: "instagram", accountId: "17841400009921", name: "@estimatemaster.test", status: "connected", expiresAt: d(5), test: true, mode: "publish", access: ["U-OWNER", "U-OFFICE"] },
  ];

  const customers: Customer[] = [
    { id: "C-NEW-1", name: "Aisha Roberts", phone: "(214) 555-0161", email: "aisha.roberts@example.com", contactVerified: false, preferredChannel: "phone", consentSigned: false, authorisedSigners: [] },
    { id: "C-NEW-2", name: "Tom Becker", phone: "(972) 555-0182", email: "tom.becker@example.com", contactVerified: false, preferredChannel: "email", consentSigned: false, authorisedSigners: [] },
    { id: "C-NEW-3", name: "Wen Li", email: "wen.li@example.com", contactVerified: false, preferredChannel: "email", consentSigned: false, authorisedSigners: [] },
    { id: "C-NEW-4", name: "Jordan Irons", phone: "(972) 555-0177", email: "sam.sample@example.com", contactVerified: false, preferredChannel: "phone", consentSigned: false, authorisedSigners: [] },
  ];
  const lead = (id: string, customerId: string, created: number, last: number, x: Partial<Lead>): Lead => ({
    id, customerId, source: "website", stage: "new_lead", createdAt: d(created), lastActivityAt: d(last), eventRef: `WF-${id.slice(-1)}0${-created}`, ...x,
    events: [{ ref: `WF-${id.slice(-1)}0${-created}`, at: d(created), message: x.message ?? "" }, ...(x.events ?? [])],
  });
  const leads: Lead[] = [
    lead("LEAD-2026-9", "C-NEW-4", -1, -1, { name: "Jordan Irons", phone: "(972) 555-0177", email: "sam.sample@example.com", town: "Dallas", message: "Quote for the back fence and deck, please.",
      review: { phoneMatchLeadId: "LEAD-2026-3", emailMatchLeadId: "LEAD-2026-1", status: "open" } }),
    lead("LEAD-2026-8", "C-NEW-3", -3, -3, { name: "Wen Li", phone: "", email: "wen.li@example.com", town: "Frisco", message: "Two bedrooms and a hallway — roughly when could you start?", missingFields: ["phone"] }),
    lead("LEAD-2026-7", "C-NEW-2", -130, -120, { stage: "contacted", name: "Tom Becker", phone: "(972) 555-0182", email: "tom.becker@example.com", town: "Plano", message: "Interested in an exterior repaint next spring." }),
    lead("LEAD-2026-6", "C-NEW-1", -40, -30, { stage: "contacted", name: "Aisha Roberts", phone: "(214) 555-0161", email: "aisha.roberts@example.com", town: "Lakewood", message: "Front door and shutters — can you colour match?",
      events: [{ ref: "WF-6031", at: d(-30), message: "Following up — could you do Saturday?", matchedOn: "phone" }] }),
  ];

  return { mediaAssets, marketingPosts, socialAccounts, customers, leads, counters: { post: 16, med: 8, lead: 9, cust: 4, pubref: ref } };
}
