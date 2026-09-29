/**
 * Seed data for client demos.
 *
 * Dates are generated relative to "now" each time the demo is reset, so the
 * story always looks current: a job in production this week, a supplier order
 * waiting on acknowledgment, repaint alerts entering their notice window, etc.
 *
 * The demo story
 * - JOB-2026-1  Korah Singer, exterior repaint, in production. Main colour
 *               card, materials, supplier order and change order demo.
 * - JOB-2026-2  Sam Sample, kitchen cabinets, scheduled. Order sent, not yet
 *               acknowledged (exception clock).
 * - JOB-2026-3  Steven Omodth, exterior, unscheduled. Empty colour card.
 * - JOB-2026-4  Sam Sample, exterior, unscheduled, draft estimate.
 * - JOB-2026-5  Steven Omodth, interior main floor, ready for inspection.
 *               Closeout demo that writes the property paint record.
 * - PROP-1003   Elena Marsh. Rich paint history, QR link, touch-up request,
 *               repaint alert. Future estimate and reorder demo.
 * - PROP-1005   Commercial property. Escalated alert with 9-month notice.
 * - PROP-1006   Sold property. Old QR link revoked ("Record has moved").
 */
import type { Database } from "@/features/types";
import { PRIMER_NONE_SOUND } from "@/features/types";
import { addDays, addMonths } from "@/features/lib/rules/dates";
import { jobDemand, snapshotLines } from "@/features/lib/rules/procurement";
import { addWorkingDays } from "@/features/lib/rules/future-estimate";
import { buildSchedules } from "@/features/lib/rules/alerts";
import { attemptSchedule, recycleDate } from "@/features/lib/rules/follow-up";
import { workforceSeed } from "./seed-workforce";
import { financeSeed } from "./seed-finance";
import { performanceSeed } from "./seed-performance";
import { feedbackSeed } from "./seed-feedback";
import { marketingSeed } from "./seed-marketing";
import type { PerformanceSnapshot } from "@/features/types";
import { presetRange } from "@/features/lib/rules/performance";
import { addDaysToDay, localDay, weekStartOf } from "@/features/lib/rules/payroll";
import { buildRows, jobPerformance } from "@/features/lib/store/actions/performance";
import { hostSeed } from "./seed-hosts";

export function createSeed(nowIso: string): Database {
  const d = (days: number) => addDays(nowIso, days);
  /** A date `years` ago, shifted by `days`. */
  const ago = (years: number, days = 0) => addDays(addMonths(nowIso, -years * 12), days);
  const at = (days: number, hour: number, minute = 0) => {
    const x = new Date(d(days));
    x.setHours(hour, minute, 0, 0);
    return x.toISOString();
  };

  /** Feature 29 attempt plan (days 1, 14, 35) for a qualification date. */
  let atSeq = 10;
  const fuAttempts = (q: string) =>
    attemptSchedule(q).map((x) => ({ id: `AT-${++atSeq}`, plannedDay: x.day, plannedDate: x.planned, movedFrom: x.movedFrom }));

  // Phase 2 seed modules (see each file for the story it tells).
  const { counters: wfCounters, ...workforce } = workforceSeed(nowIso);
  const { counters: finCounters, ...finance } = financeSeed(nowIso);

  const db: Database = {
    seededAt: nowIso,
    ...workforce,
    ...finance,
    completedJobs: performanceSeed(nowIso),
    // Features 30 and 34 fill these in their own seed modules.
    performanceSnapshots: [],
    varianceReasons: [],
    performanceCorrections: [],
    savedFilters: [],
    rateRecords: [],
    evidenceExclusions: [],
    rateDecisions: [],
    mediaAssets: [],
    marketingPosts: [],
    socialAccounts: [],

    users: [
      { id: "U-OWNER", name: "Tim Skelly", role: "owner", email: "tim@estimatemaster.app" },
      { id: "U-OFFICE", name: "Dana Ruiz", role: "office_manager", email: "dana@estimatemaster.app" },
      { id: "U-SENIOR", name: "Marcus Lee", role: "senior_estimator", email: "marcus@estimatemaster.app", area: "Dallas", outOfOffice: true },
      { id: "U-EST", name: "Priya Shah", role: "estimator", email: "priya@estimatemaster.app", area: "Plano" },
      { id: "U-CREW", name: "Luis Ortega", role: "crew_lead", email: "luis@estimatemaster.app" },
      { id: "U-BOOK", name: "Grace Kim", role: "bookkeeper", email: "grace@estimatemaster.app" },
    ],

    customers: [
      { id: "C-KORAH", name: "Korah Singer", email: "korah.singer@example.com", phone: "(214) 555-0148", contactVerified: true, preferredChannel: "email", consentSigned: true, authorisedSigners: ["Daniel Singer (Co-owner)"] },
      { id: "C-SAM", name: "Sam Sample", email: "sam.sample@example.com", phone: "(214) 555-0191", contactVerified: true, preferredChannel: "text", consentSigned: true, authorisedSigners: [] },
      { id: "C-STEVEN", name: "Steven Omodth", email: "steven.omodth@example.com", phone: "(972) 555-0112", contactVerified: false, preferredChannel: "phone", consentSigned: false, authorisedSigners: [] },
      { id: "C-JEREMY", name: "Jeremy Irons", email: "j.irons@example.com", phone: "(972) 555-0177", contactVerified: true, preferredChannel: "email", consentSigned: true, authorisedSigners: [] },
      { id: "C-ELENA", name: "Elena Marsh", email: "elena.marsh@example.com", phone: "(469) 555-0120", contactVerified: true, preferredChannel: "phone", consentSigned: true, authorisedSigners: [] },
      { id: "C-LAKESIDE", name: "Lakeside Property Group", email: "facilities@lakesidepg.example.com", phone: "(214) 555-0100", contactVerified: true, preferredChannel: "email", consentSigned: true, authorisedSigners: ["Rita Owens (Property Manager)"] },
      { id: "C-NINA", name: "Nina Patel", email: "nina.patel@example.com", phone: "(972) 555-0165", contactVerified: false, preferredChannel: "email", consentSigned: false, authorisedSigners: [] },
      { id: "C-MARIA", name: "Maria Chen", email: "maria.chen@example.com", phone: "(469) 555-0133", contactVerified: true, preferredChannel: "phone", consentSigned: true, authorisedSigners: [] },
      // Features 27 / 29 service customers
      { id: "C-OWEN", name: "Owen Brooks", email: "owen.brooks@example.com", phone: "(469) 555-0187", contactVerified: true, preferredChannel: "phone", consentSigned: true, authorisedSigners: [] },
      { id: "C-RUTH", name: "Ruth Alvarez", email: "ruth.alvarez@example.com", phone: "(972) 555-0154", contactVerified: true, preferredChannel: "email", consentSigned: true, authorisedSigners: [] },
      { id: "C-HAROLD", name: "Harold Finch", email: "h.finch@example.com", phone: "(972) 555-0109", contactVerified: false, preferredChannel: "phone", consentSigned: false, authorisedSigners: [] },
      { id: "C-BETH", name: "Beth Carver", email: "beth.carver@example.com", phone: "(214) 555-0162", contactVerified: true, preferredChannel: "email", consentSigned: true, authorisedSigners: [] },
      { id: "C-DEV", name: "Dev Mehta", email: "dev.mehta@example.com", phone: "(469) 555-0171", contactVerified: true, preferredChannel: "phone", consentSigned: true, authorisedSigners: [] },
      { id: "C-TOM", name: "Tom Whitaker", email: "tom.whitaker@example.com", phone: "(214) 555-0139", contactVerified: true, preferredChannel: "phone", consentSigned: true, authorisedSigners: [] },
    ],

    // Filled by hostSeed() at the end.
    estimateHistory: [],
    workOrders: [],

    leads: [
      { id: "LEAD-2026-1", customerId: "C-SAM", propertyId: "PROP-1002", source: "website", stage: "sold", createdAt: d(-105) },
      { id: "LEAD-2026-3", customerId: "C-JEREMY", source: "referral", stage: "contacted", createdAt: d(-168) },
      { id: "LEAD-2026-4", customerId: "C-KORAH", propertyId: "PROP-1001", source: "existing_customer", stage: "sold", createdAt: d(-130) },
      { id: "LEAD-2026-5", customerId: "C-STEVEN", propertyId: "PROP-1004", source: "website", stage: "pending", createdAt: d(-40) },
    ],

    estimates: [
      { id: "EST-2026-1", title: "Standard Exterior Repaint", customerId: "C-KORAH", propertyId: "PROP-1001", leadId: "LEAD-2026-4", status: "ACCEPTED", total: 12480, createdAt: d(-120) },
      { id: "EST-2026-3", title: "Kitchen Cabinet Refinish", customerId: "C-SAM", propertyId: "PROP-1002", leadId: "LEAD-2026-1", status: "ACCEPTED", total: 6850, createdAt: d(-95) },
      { id: "EST-2026-5", title: "Standard Exterior Repaint", customerId: "C-STEVEN", propertyId: "PROP-1004", leadId: "LEAD-2026-5", status: "SENT", total: 9200, createdAt: d(-30) },
      { id: "EST-2026-6", title: "Interior Repaint — Main Floor", customerId: "C-STEVEN", propertyId: "PROP-1004", status: "ACCEPTED", total: 4992.9, createdAt: d(-60) },
      { id: "EST-2026-8", title: "Standard Exterior Repaint", customerId: "C-SAM", propertyId: "PROP-1002", status: "DRAFT", total: 8400, createdAt: d(-12) },
      { id: "EST-2026-9", title: "Commercial Lobby Repaint", customerId: "C-LAKESIDE", propertyId: "PROP-1005", status: "DECLINED", total: 18750, createdAt: d(-400), isRepaint: false },
      // Feature 29: repaint quote from follow-up FU-0999, now sold (closure prompt demo).
      { id: "EST-2026-41", title: "Exterior Repaint — Front Elevation", customerId: "C-BETH", propertyId: "PROP-1024", status: "ACCEPTED", total: 7650, createdAt: d(-40), isRepaint: true },
    ],

    invoices: [
      { id: "INV-2026-1", jobId: "JOB-2026-1", kind: "standard", status: "paid", amount: 4160, createdAt: d(-100) },
      { id: "INV-2026-2", jobId: "JOB-2026-2", kind: "standard", status: "sent", amount: 2283.33, createdAt: d(-20) },
      { id: "INV-2026-3", jobId: "JOB-2026-5", kind: "standard", status: "draft", amount: 4992.9, createdAt: d(-2) },
    ],

    properties: [
      { id: "PROP-1001", address: "1314 Maple Ridge Dr", city: "Dallas", state: "TX", zip: "75214", type: "single_family", optOut: false,
        ownership: [{ id: "OWN-1001-1", customerId: "C-KORAH", start: ago(9), predecessorConsent: "not_requested" }] },
      { id: "PROP-1002", address: "88 Luna St", city: "Dallas", state: "TX", zip: "75206", type: "single_family", optOut: false,
        ownership: [{ id: "OWN-1002-1", customerId: "C-SAM", start: ago(4) }] },
      { id: "PROP-1003", address: "420 Cedar Hollow Ln", city: "Plano", state: "TX", zip: "75024", type: "single_family", optOut: false,
        ownership: [{ id: "OWN-1003-1", customerId: "C-ELENA", start: ago(12) }] },
      { id: "PROP-1004", address: "17 Brookside Ct", city: "Richardson", state: "TX", zip: "75080", type: "single_family", optOut: false,
        ownership: [{ id: "OWN-1004-1", customerId: "C-STEVEN", start: ago(6) }] },
      { id: "PROP-1005", address: "2250 Commerce St, Suite 100", city: "Dallas", state: "TX", zip: "75201", type: "commercial", optOut: false,
        ownership: [{ id: "OWN-1005-1", customerId: "C-LAKESIDE", start: ago(15) }] },
      { id: "PROP-1006", address: "905 Willow Bend Dr", city: "Plano", state: "TX", zip: "75093", type: "single_family", optOut: false,
        ownership: [
          { id: "OWN-1006-1", customerId: "C-JEREMY", start: ago(10), end: d(-45) },
          { id: "OWN-1006-2", customerId: "C-NINA", start: d(-45), predecessorConsent: "not_requested",
            // Two attempts over ten days: the unreachable determination stays blocked (25.Q01).
            consentAttempts: [
              { id: "CAT-1", at: d(-12), channel: "phone", note: "Called Jeremy Irons' mobile. No answer, voicemail left.", by: "U-OFFICE" },
              { id: "CAT-2", at: d(-2), channel: "email", note: "Emailed consent request to j.irons@example.com. No reply yet.", by: "U-OFFICE" },
            ] },
        ] },
      { id: "PROP-1007", address: "3 Oak Glen Ct", city: "Allen", state: "TX", zip: "75013", type: "single_family", optOut: false,
        ownership: [{ id: "OWN-1007-1", customerId: "C-MARIA", start: ago(8) }] },
      // Feature 25: duplicate created by the 2025 website form. Office review, owner-approved merge.
      { id: "PROP-1008", address: "420 Cedar Hollow Lane", city: "Plano", state: "TX", zip: "75024", type: "single_family", optOut: false, mergeCandidateOf: "PROP-1003",
        ownership: [{ id: "OWN-1008-1", customerId: "C-ELENA", start: ago(1) }] },
      // Features 27 / 29 service demo properties
      { id: "PROP-1021", address: "61 Hawthorne Pl", city: "Frisco", state: "TX", zip: "75034", type: "single_family", optOut: true,
        optOutAt: d(-40), optOutBy: "U-OFFICE", optOutSource: "Customer said on the phone: please don't call about future work.",
        ownership: [{ id: "OWN-1021-1", customerId: "C-OWEN", start: ago(11) }] },
      { id: "PROP-1022", address: "2840 Juniper Way", city: "Garland", state: "TX", zip: "75040", type: "single_family", optOut: false,
        ownership: [{ id: "OWN-1022-1", customerId: "C-RUTH", start: ago(9) }] },
      { id: "PROP-1023", address: "118 Stonebridge Rd", city: "Mesquite", state: "TX", zip: "75149", type: "single_family", optOut: false,
        ownership: [{ id: "OWN-1023-1", customerId: "C-HAROLD", start: ago(14) }] },
      { id: "PROP-1024", address: "7 Lantana Ct", city: "Carrollton", state: "TX", zip: "75006", type: "single_family", optOut: false,
        ownership: [{ id: "OWN-1024-1", customerId: "C-BETH", start: ago(10) }] },
      { id: "PROP-1025", address: "455 Brazos Ave", city: "Wylie", state: "TX", zip: "75098", type: "single_family", optOut: false,
        ownership: [{ id: "OWN-1025-1", customerId: "C-DEV", start: ago(7) }] },
      { id: "PROP-1026", address: "39 Cypress Bend", city: "Dallas", state: "TX", zip: "75218", type: "single_family", optOut: false,
        ownership: [{ id: "OWN-1026-1", customerId: "C-TOM", start: ago(8) }] },
    ],

    areas: [
      // PROP-1001 Korah — exterior
      { id: "AR-101", propertyId: "PROP-1001", name: "Front Elevation", kind: "exterior", roomType: "exterior_body", exposure: "north" },
      { id: "AR-102", propertyId: "PROP-1001", name: "South Elevation", kind: "exterior", roomType: "exterior_body", exposure: "south" },
      { id: "AR-103", propertyId: "PROP-1001", name: "West Elevation", kind: "exterior", roomType: "exterior_body", exposure: "west" },
      { id: "AR-104", propertyId: "PROP-1001", name: "Rear Elevation", kind: "exterior", roomType: "exterior_body", exposure: "east" },
      { id: "AR-105", propertyId: "PROP-1001", name: "Trim & Doors", kind: "exterior", roomType: "exterior_trim" },
      // PROP-1002 Sam
      { id: "AR-201", propertyId: "PROP-1002", name: "Kitchen", kind: "interior", roomType: "kitchen" },
      { id: "AR-202", propertyId: "PROP-1002", name: "Front Elevation", kind: "exterior", roomType: "exterior_body", exposure: "east" },
      { id: "AR-203", propertyId: "PROP-1002", name: "Trim", kind: "exterior", roomType: "exterior_trim" },
      // PROP-1003 Elena
      { id: "AR-301", propertyId: "PROP-1003", name: "Living Room", kind: "interior", roomType: "living_room" },
      { id: "AR-302", propertyId: "PROP-1003", name: "Primary Bedroom", kind: "interior", roomType: "bedroom" },
      { id: "AR-303", propertyId: "PROP-1003", name: "Kitchen", kind: "interior", roomType: "kitchen" },
      { id: "AR-304", propertyId: "PROP-1003", name: "Hall & Stairs", kind: "interior", roomType: "hall_stairs" },
      { id: "AR-305", propertyId: "PROP-1003", name: "South Elevation", kind: "exterior", roomType: "exterior_body", exposure: "south" },
      { id: "AR-306", propertyId: "PROP-1003", name: "Exterior Trim", kind: "exterior", roomType: "exterior_trim" },
      // PROP-1004 Steven
      { id: "AR-401", propertyId: "PROP-1004", name: "Living Room", kind: "interior", roomType: "living_room" },
      { id: "AR-402", propertyId: "PROP-1004", name: "Dining Room", kind: "interior", roomType: "living_room" },
      { id: "AR-403", propertyId: "PROP-1004", name: "Hallway", kind: "interior", roomType: "hall_stairs" },
      { id: "AR-404", propertyId: "PROP-1004", name: "Front Elevation", kind: "exterior", roomType: "exterior_body", exposure: "west" },
      // PROP-1005 commercial
      { id: "AR-501", propertyId: "PROP-1005", name: "Lobby", kind: "interior", roomType: "hall_stairs", building: "Main", unit: "Suite 100" },
      { id: "AR-502", propertyId: "PROP-1005", name: "Conference Room", kind: "interior", roomType: "living_room", building: "Main", unit: "Suite 100" },
      // PROP-1006 sold
      { id: "AR-601", propertyId: "PROP-1006", name: "Living Room", kind: "interior", roomType: "living_room" },
      // PROP-1007 Maria
      { id: "AR-701", propertyId: "PROP-1007", name: "Front Elevation", kind: "exterior", roomType: "exterior_body", exposure: "south" },
      { id: "AR-702", propertyId: "PROP-1007", name: "Exterior Trim", kind: "exterior", roomType: "exterior_trim" },
      // Features 27 / 29
      { id: "AR-602", propertyId: "PROP-1006", name: "Front Elevation", kind: "exterior", roomType: "exterior_body", exposure: "west" },
      { id: "AR-2101", propertyId: "PROP-1021", name: "Rear Elevation", kind: "exterior", roomType: "exterior_body", exposure: "west" },
      { id: "AR-2102", propertyId: "PROP-1021", name: "Exterior Trim", kind: "exterior", roomType: "exterior_trim" },
      { id: "AR-2201", propertyId: "PROP-1022", name: "Living Room", kind: "interior", roomType: "living_room" },
      { id: "AR-2301", propertyId: "PROP-1023", name: "Front Elevation", kind: "exterior", roomType: "exterior_body", exposure: "north" },
      { id: "AR-2302", propertyId: "PROP-1023", name: "Kitchen", kind: "interior", roomType: "kitchen" },
      { id: "AR-2401", propertyId: "PROP-1024", name: "Front Elevation", kind: "exterior", roomType: "exterior_body", exposure: "east" },
      { id: "AR-2501", propertyId: "PROP-1025", name: "Front Elevation", kind: "exterior", roomType: "exterior_body", exposure: "south" },
      { id: "AR-2601", propertyId: "PROP-1026", name: "Primary Bedroom", kind: "interior", roomType: "bedroom" },
    ],

    surfaces: [
      { id: "SF-1011", propertyId: "PROP-1001", areaId: "AR-101", name: "Front siding", type: "siding", areaSqft: 620, condition: "sound" },
      { id: "SF-1021", propertyId: "PROP-1001", areaId: "AR-102", name: "South siding", type: "siding", areaSqft: 540, condition: "sound" },
      { id: "SF-1031", propertyId: "PROP-1001", areaId: "AR-103", name: "West siding", type: "siding", areaSqft: 480, condition: "rough" },
      { id: "SF-1041", propertyId: "PROP-1001", areaId: "AR-104", name: "Rear siding", type: "siding", areaSqft: 600, condition: "sound" },
      { id: "SF-1051", propertyId: "PROP-1001", areaId: "AR-105", name: "Fascia & soffit", type: "trim", areaSqft: 310, condition: "sound" },
      { id: "SF-1052", propertyId: "PROP-1001", areaId: "AR-105", name: "Window casings", type: "trim", areaSqft: 180, condition: "sound" },
      { id: "SF-1053", propertyId: "PROP-1001", areaId: "AR-105", name: "Front door (2 sides)", type: "door", areaSqft: 48, condition: "sound" },
      { id: "SF-1054", propertyId: "PROP-1001", areaId: "AR-105", name: "Shutters (8 faces)", type: "trim", areaSqft: 96, condition: "sound" },

      { id: "SF-2011", propertyId: "PROP-1002", areaId: "AR-201", name: "Cabinet boxes & doors", type: "cabinets", areaSqft: 210, condition: "sound" },
      { id: "SF-2021", propertyId: "PROP-1002", areaId: "AR-202", name: "Front siding", type: "siding", areaSqft: 700, condition: "sound" },
      { id: "SF-2031", propertyId: "PROP-1002", areaId: "AR-203", name: "Trim", type: "trim", areaSqft: 260, condition: "sound" },

      { id: "SF-3011", propertyId: "PROP-1003", areaId: "AR-301", name: "Walls", type: "walls", areaSqft: 520, condition: "sound" },
      { id: "SF-3012", propertyId: "PROP-1003", areaId: "AR-301", name: "Ceiling", type: "ceiling", areaSqft: 280, condition: "sound" },
      { id: "SF-3013", propertyId: "PROP-1003", areaId: "AR-301", name: "Baseboard & casing", type: "trim", areaSqft: 64, condition: "sound" },
      { id: "SF-3021", propertyId: "PROP-1003", areaId: "AR-302", name: "Walls", type: "walls", areaSqft: 460, condition: "sound" },
      { id: "SF-3031", propertyId: "PROP-1003", areaId: "AR-303", name: "Walls", type: "walls", areaSqft: 300, condition: "sound" },
      { id: "SF-3041", propertyId: "PROP-1003", areaId: "AR-304", name: "Walls", type: "walls", areaSqft: 410, condition: "sound" },
      { id: "SF-3051", propertyId: "PROP-1003", areaId: "AR-305", name: "South siding", type: "siding", areaSqft: 820, condition: "sound", replacesSurfaceId: "SF-3052" },
      { id: "SF-3052", propertyId: "PROP-1003", areaId: "AR-305", name: "Old cedar siding", type: "siding", areaSqft: 820, condition: "sound", removedAt: ago(3), removedReason: "Cedar siding replaced with fibre-cement board", removedBy: "U-OFFICE" },
      { id: "SF-3061", propertyId: "PROP-1003", areaId: "AR-306", name: "Fascia & trim", type: "trim", areaSqft: 290, condition: "sound" },

      { id: "SF-4011", propertyId: "PROP-1004", areaId: "AR-401", name: "Walls", type: "walls", areaSqft: 480, condition: "sound" },
      { id: "SF-4012", propertyId: "PROP-1004", areaId: "AR-401", name: "Ceiling", type: "ceiling", areaSqft: 260, condition: "sound" },
      { id: "SF-4021", propertyId: "PROP-1004", areaId: "AR-402", name: "Walls", type: "walls", areaSqft: 360, condition: "sound" },
      { id: "SF-4031", propertyId: "PROP-1004", areaId: "AR-403", name: "Walls", type: "walls", areaSqft: 300, condition: "sound" },
      { id: "SF-4032", propertyId: "PROP-1004", areaId: "AR-403", name: "Baseboard & casing", type: "trim", areaSqft: 70, condition: "sound" },
      { id: "SF-4041", propertyId: "PROP-1004", areaId: "AR-404", name: "Front siding", type: "siding", areaSqft: 640, condition: "sound" },

      { id: "SF-5011", propertyId: "PROP-1005", areaId: "AR-501", name: "Lobby walls", type: "walls", areaSqft: 1400, condition: "sound" },
      { id: "SF-5021", propertyId: "PROP-1005", areaId: "AR-502", name: "Conference walls", type: "walls", areaSqft: 680, condition: "sound" },

      { id: "SF-6011", propertyId: "PROP-1006", areaId: "AR-601", name: "Walls", type: "walls", areaSqft: 500, condition: "sound" },

      { id: "SF-7011", propertyId: "PROP-1007", areaId: "AR-701", name: "Front siding", type: "siding", areaSqft: 760, condition: "sound" },
      { id: "SF-7021", propertyId: "PROP-1007", areaId: "AR-702", name: "Fascia & trim", type: "trim", areaSqft: 240, condition: "sound" },
      // Features 27 / 29
      { id: "SF-7031", propertyId: "PROP-1007", areaId: "AR-702", name: "Garage door", type: "door", areaSqft: 112, condition: "sound" },
      { id: "SF-6021", propertyId: "PROP-1006", areaId: "AR-602", name: "Front siding", type: "siding", areaSqft: 680, condition: "sound" },
      { id: "SF-21011", propertyId: "PROP-1021", areaId: "AR-2101", name: "Rear siding", type: "siding", areaSqft: 700, condition: "sound" },
      { id: "SF-21021", propertyId: "PROP-1021", areaId: "AR-2102", name: "Fascia & soffit", type: "trim", areaSqft: 260, condition: "sound" },
      { id: "SF-22011", propertyId: "PROP-1022", areaId: "AR-2201", name: "Walls", type: "walls", areaSqft: 480, condition: "sound" },
      { id: "SF-23011", propertyId: "PROP-1023", areaId: "AR-2301", name: "Front siding", type: "siding", areaSqft: 640, condition: "sound" },
      { id: "SF-23021", propertyId: "PROP-1023", areaId: "AR-2302", name: "Walls", type: "walls", areaSqft: 280, condition: "sound" },
      { id: "SF-24011", propertyId: "PROP-1024", areaId: "AR-2401", name: "Front siding", type: "siding", areaSqft: 720, condition: "sound" },
      { id: "SF-25011", propertyId: "PROP-1025", areaId: "AR-2501", name: "Front siding", type: "siding", areaSqft: 690, condition: "sound" },
      { id: "SF-26011", propertyId: "PROP-1026", areaId: "AR-2601", name: "Walls", type: "walls", areaSqft: 450, condition: "sound" },
    ],

    applications: [
      // PROP-1003 Elena — interior 2019 job, due soon (living 7 yrs, bedroom 7 yrs)
      { id: "APP-3011", propertyId: "PROP-1003", surfaceId: "SF-3011", jobId: "JOB-2019-14", manufacturer: "Sherwin-Williams", colourName: "Agreeable Gray", colourNumber: "SW 7029", hex: "#D1CBC1", product: "Cashmere Interior Acrylic Latex", sheen: "Eggshell", coats: 2, completedAt: ago(7, 60), confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", actualGallons: 3.5, actualHours: 9, tintFormula: "B1 4Y2 / L1 1Y12", photoCount: 3, touchUps: [{ date: ago(3), note: "Scuff touch-up behind sofa" }] },
      { id: "APP-3012", propertyId: "PROP-1003", surfaceId: "SF-3012", jobId: "JOB-2019-14", manufacturer: "Sherwin-Williams", colourName: "Ceiling Bright White", colourNumber: "SW 7007", hex: "#F3F4EF", product: "ProMar 200 Interior", sheen: "Flat", coats: 1, completedAt: ago(7, 60), confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", photoCount: 1, touchUps: [] },
      { id: "APP-3013", propertyId: "PROP-1003", surfaceId: "SF-3013", jobId: "JOB-2019-14", manufacturer: "Sherwin-Williams", colourName: "Extra White", colourNumber: "SW 7006", hex: "#EEEFEA", product: "Emerald Urethane Trim Enamel", sheen: "Semi-Gloss", coats: 2, completedAt: ago(7, 60), confirmedBy: "U-CREW", verification: "confirmed", productTier: "premium", prepQuality: "good", photoCount: 1, touchUps: [] },
      { id: "APP-3021", propertyId: "PROP-1003", surfaceId: "SF-3021", jobId: "JOB-2019-14", manufacturer: "Sherwin-Williams", colourName: "Sea Salt", colourNumber: "SW 6204", hex: "#CDD5C6", product: "Cashmere Interior Acrylic Latex", sheen: "Eggshell", coats: 2, completedAt: ago(7, 75), confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", actualGallons: 3, photoCount: 2, touchUps: [] },
      // 2021 kitchen and hall, 5 yr interval
      { id: "APP-3031", propertyId: "PROP-1003", surfaceId: "SF-3031", jobId: "JOB-2021-33", manufacturer: "Sherwin-Williams", colourName: "Alabaster", colourNumber: "SW 7008", hex: "#EDEAE0", product: "Emerald Interior Acrylic Latex", sheen: "Satin", coats: 2, completedAt: ago(5, 120), confirmedBy: "U-CREW", verification: "confirmed", productTier: "premium", prepQuality: "good", actualGallons: 2, photoCount: 2, touchUps: [] },
      { id: "APP-3041", propertyId: "PROP-1003", surfaceId: "SF-3041", jobId: "JOB-2021-33", manufacturer: "Sherwin-Williams", colourName: "Agreeable Gray", colourNumber: "SW 7029", hex: "#D1CBC1", product: "Cashmere Interior Acrylic Latex", sheen: "Eggshell", coats: 2, completedAt: ago(5, 120), confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", photoCount: 1, touchUps: [] },
      // Exterior — old siding removed (new surface record), new siding painted 3 yrs ago
      { id: "APP-3052", propertyId: "PROP-1003", surfaceId: "SF-3052", jobId: "JOB-2018-07", manufacturer: "Sherwin-Williams", colourName: "Urbane Bronze", colourNumber: "SW 7048", hex: "#54504A", product: "SuperPaint Exterior", sheen: "Satin", coats: 2, completedAt: ago(8), confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", photoCount: 2, touchUps: [] },
      { id: "APP-3051", propertyId: "PROP-1003", surfaceId: "SF-3051", jobId: "JOB-2023-21", manufacturer: "Sherwin-Williams", colourName: "Repose Gray", colourNumber: "SW 7015", hex: "#CCC9C0", product: "Duration Exterior Acrylic Latex", sheen: "Satin", coats: 2, completedAt: ago(3, -10), confirmedBy: "U-CREW", verification: "confirmed", productTier: "premium", prepQuality: "good", actualGallons: 7, actualHours: 22, photoCount: 4, touchUps: [] },
      { id: "APP-3061", propertyId: "PROP-1003", surfaceId: "SF-3061", jobId: "JOB-2023-21", manufacturer: "Sherwin-Williams", colourName: "Extra White", colourNumber: "SW 7006", hex: "#EEEFEA", product: "Duration Exterior Acrylic Latex", sheen: "Semi-Gloss", coats: 2, completedAt: ago(3, -10), confirmedBy: "U-CREW", verification: "confirmed", productTier: "premium", prepQuality: "good", actualGallons: 2.5, photoCount: 2, touchUps: [] },
      // Customer-reported third-party work (unverified)
      { id: "APP-3022", propertyId: "PROP-1003", surfaceId: "SF-3021", manufacturer: "Behr", colourName: "Silver Drop", colourNumber: "790C-2", hex: "#D9D8CF", product: "Behr Ultra (per customer)", sheen: "Eggshell", coats: 1, completedAt: ago(1, 30), verification: "unverified", source: "recorded from customer", photoCount: 0, touchUps: [] },

      // PROP-1004 Steven — older interior, imported (backlog)
      { id: "APP-4011", propertyId: "PROP-1004", surfaceId: "SF-4011", jobId: "JOB-2017-02", manufacturer: "Sherwin-Williams", colourName: "Accessible Beige", colourNumber: "SW 7036", hex: "#D1C7B8", product: "ProMar 200 Interior", sheen: "Eggshell", coats: 2, completedAt: ago(9), verification: "confirmed", source: "PaintScout import", productTier: "standard", prepQuality: "good", photoCount: 0, touchUps: [] },
      { id: "APP-4041", propertyId: "PROP-1004", surfaceId: "SF-4041", jobId: "JOB-2017-02", manufacturer: "Sherwin-Williams", colourName: "Unknown", colourNumber: "Unknown", hex: "#BFB8AA", product: "Unknown", sheen: "Unknown", coats: 2, verification: "confirmed", source: "PaintScout import — completion date not recorded", photoCount: 0, touchUps: [],
        unknowns: [{ field: "colour", kind: "legacy", approvedBy: "U-OWNER", reason: "2017 PaintScout record has no colour; crew sheet lost.", at: ago(1, -20) }] },

      // PROP-1005 commercial
      { id: "APP-5011", propertyId: "PROP-1005", surfaceId: "SF-5011", jobId: "JOB-2021-40", manufacturer: "Sherwin-Williams", colourName: "Pure White", colourNumber: "SW 7005", hex: "#EDECE6", product: "ProMar 200 Interior", sheen: "Eggshell", coats: 2, completedAt: ago(5, 200), confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", photoCount: 3, touchUps: [] },
      { id: "APP-5021", propertyId: "PROP-1005", surfaceId: "SF-5021", jobId: "JOB-2021-40", manufacturer: "Sherwin-Williams", colourName: "Naval", colourNumber: "SW 6244", hex: "#2F3D4C", product: "ProMar 200 Interior", sheen: "Eggshell", coats: 2, completedAt: ago(7, 150), confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", photoCount: 1, touchUps: [] },

      // PROP-1006 sold
      { id: "APP-6011", propertyId: "PROP-1006", surfaceId: "SF-6011", jobId: "JOB-2020-11", manufacturer: "Sherwin-Williams", colourName: "Mindful Gray", colourNumber: "SW 7016", hex: "#BCB7AD", product: "Cashmere Interior Acrylic Latex", sheen: "Eggshell", coats: 2, completedAt: ago(6), confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", photoCount: 2, touchUps: [] },

      // PROP-1007 Maria — exterior, south, poor prep (7 - 1 - 2 = 4 yrs)
      { id: "APP-7011", propertyId: "PROP-1007", surfaceId: "SF-7011", jobId: "JOB-2022-18", manufacturer: "Sherwin-Williams", colourName: "Tricorn Black", colourNumber: "SW 6258", hex: "#2F2F30", product: "SuperPaint Exterior", sheen: "Satin", coats: 2, completedAt: ago(4, 40), confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "poor", photoCount: 2, touchUps: [] },
      { id: "APP-7021", propertyId: "PROP-1007", surfaceId: "SF-7021", jobId: "JOB-2022-18", manufacturer: "Sherwin-Williams", colourName: "Extra White", colourNumber: "SW 7006", hex: "#EEEFEA", product: "SuperPaint Exterior", sheen: "Semi-Gloss", coats: 2, completedAt: ago(4, 40), confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", photoCount: 1, touchUps: [] },
      // Features 27 / 29 service demo history
      { id: "APP-7031", propertyId: "PROP-1007", surfaceId: "SF-7031", jobId: "JOB-2019-09", manufacturer: "Sherwin-Williams", colourName: "Extra White", colourNumber: "SW 7006", hex: "#EEEFEA", product: "SuperPaint Exterior", sheen: "Semi-Gloss", coats: 2, completedAt: ago(7), verification: "confirmed", source: "PaintScout import", productTier: "standard", prepQuality: "good", photoCount: 0, touchUps: [] },
      { id: "APP-6021", propertyId: "PROP-1006", surfaceId: "SF-6021", jobId: "JOB-2020-19", colourName: "Repose Gray", colourNumber: "SW 7015", product: "SuperPaint Exterior", completedAt: ago(6, 170), manufacturer: "Sherwin-Williams", hex: "#CCC9C0", sheen: "Satin", coats: 2, confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", photoCount: 1, touchUps: [] },
      { id: "APP-21011", propertyId: "PROP-1021", surfaceId: "SF-21011", jobId: "JOB-2020-04", colourName: "Repose Gray", colourNumber: "SW 7015", product: "SuperPaint Exterior", completedAt: ago(6, 120), manufacturer: "Sherwin-Williams", hex: "#CCC9C0", sheen: "Satin", coats: 2, confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", photoCount: 1, touchUps: [] },
      { id: "APP-21021", propertyId: "PROP-1021", surfaceId: "SF-21021", jobId: "JOB-2021-12", colourName: "Extra White", colourNumber: "SW 7006", product: "SuperPaint Exterior", completedAt: ago(5, 200), manufacturer: "Sherwin-Williams", hex: "#CCC9C0", sheen: "Satin", coats: 2, confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", photoCount: 1, touchUps: [] },
      { id: "APP-22011", propertyId: "PROP-1022", surfaceId: "SF-22011", jobId: "JOB-2019-22", colourName: "Agreeable Gray", colourNumber: "SW 7029", product: "Cashmere Interior Acrylic Latex", completedAt: ago(7, 20), manufacturer: "Sherwin-Williams", hex: "#CCC9C0", sheen: "Satin", coats: 2, confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", photoCount: 1, touchUps: [] },
      { id: "APP-23011", propertyId: "PROP-1023", surfaceId: "SF-23011", jobId: "JOB-2017-31", colourName: "Accessible Beige", colourNumber: "SW 7036", product: "SuperPaint Exterior", completedAt: ago(9), manufacturer: "Sherwin-Williams", hex: "#D1C7B8", sheen: "Satin", coats: 2, verification: "confirmed", source: "PaintScout import", productTier: "standard", prepQuality: "good", photoCount: 0, touchUps: [] },
      { id: "APP-23021", propertyId: "PROP-1023", surfaceId: "SF-23021", jobId: "JOB-2018-05", colourName: "Alabaster", colourNumber: "SW 7008", product: "ProMar 200 Interior", completedAt: ago(8), manufacturer: "Sherwin-Williams", hex: "#EDEAE0", sheen: "Eggshell", coats: 2, verification: "confirmed", source: "PaintScout import", productTier: "standard", prepQuality: "good", photoCount: 0, touchUps: [] },
      { id: "APP-24011", propertyId: "PROP-1024", surfaceId: "SF-24011", jobId: "JOB-2019-17", colourName: "Repose Gray", colourNumber: "SW 7015", product: "SuperPaint Exterior", completedAt: ago(7, 90), manufacturer: "Sherwin-Williams", hex: "#CCC9C0", sheen: "Satin", coats: 2, confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", photoCount: 1, touchUps: [] },
      { id: "APP-25011", propertyId: "PROP-1025", surfaceId: "SF-25011", jobId: "JOB-2020-08", colourName: "Repose Gray", colourNumber: "SW 7015", product: "SuperPaint Exterior", completedAt: ago(6, 60), manufacturer: "Sherwin-Williams", hex: "#CCC9C0", sheen: "Satin", coats: 2, confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", photoCount: 1, touchUps: [] },
      { id: "APP-26011", propertyId: "PROP-1026", surfaceId: "SF-26011", jobId: "JOB-2019-28", colourName: "Sea Salt", colourNumber: "SW 6204", product: "Cashmere Interior Acrylic Latex", completedAt: ago(7, 40), manufacturer: "Sherwin-Williams", hex: "#CCC9C0", sheen: "Satin", coats: 2, confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", photoCount: 1, touchUps: [] },
      { id: "APP-2021", propertyId: "PROP-1002", surfaceId: "SF-2021", jobId: "JOB-2019-03", colourName: "Repose Gray", colourNumber: "SW 7015", product: "SuperPaint Exterior", completedAt: ago(7, 100), manufacturer: "Sherwin-Williams", hex: "#CCC9C0", sheen: "Satin", coats: 2, confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", photoCount: 1, touchUps: [] },
      { id: "APP-10111", propertyId: "PROP-1001", surfaceId: "SF-1011", jobId: "JOB-2019-02", colourName: "Repose Gray", colourNumber: "SW 7015", product: "SuperPaint Exterior", completedAt: ago(7, 30), manufacturer: "Sherwin-Williams", hex: "#CCC9C0", sheen: "Satin", coats: 2, confirmedBy: "U-CREW", verification: "confirmed", productTier: "standard", prepQuality: "good", photoCount: 1, touchUps: [] },
    ],

    corrections: [
      { id: "COR-1", applicationId: "APP-3013", field: "Sheen", oldValue: "Satin", newValue: "Semi-Gloss", by: "U-OFFICE", at: ago(2), reason: "Crew sheet recorded wrong sheen; confirmed against product receipt.", noticeSent: true },
    ],

    qrLinks: [
      { id: "QR-1", ref: "k7Qm2xP9vR4tLw8e", propertyId: "PROP-1003", ownershipPeriodId: "OWN-1003-1", createdAt: ago(3, -5), createdBy: "U-OFFICE", lastSentAt: ago(3, -4), lastSentTo: "elena.marsh@example.com", lastSentResult: "delivered", lastSentChannel: "email", openCount: 14, lastOpenAt: d(-9),
        opens: [{ at: d(-9), device: "mobile" }, { at: d(-40), device: "desktop" }, { at: d(-120), device: "mobile" }] },
      { id: "QR-2", ref: "Hn3vT8qZc2LmW5yA", propertyId: "PROP-1006", ownershipPeriodId: "OWN-1006-1", createdAt: ago(6), createdBy: "U-OFFICE", revokedAt: d(-44), revokeReason: "Property sold", openCount: 6, lastOpenAt: d(-60) },
      { id: "QR-3", ref: "pB6wR1sK9dXe4Jfu", propertyId: "PROP-1006", ownershipPeriodId: "OWN-1006-2", createdAt: d(-44), createdBy: "U-OFFICE", openCount: 1, lastOpenAt: d(-30) },
    ],

    touchUpRequests: [
      { id: "TU-1", propertyId: "PROP-1003", linkRef: "k7Qm2xP9vR4tLw8e", surfaceId: "SF-3013", colourLabel: "Extra White SW 7006", requesterName: "Elena Marsh", contact: "(469) 555-0120", note: "Dog scratched the living room baseboard. Could I get a quart of the trim paint?", createdAt: d(-1), status: "new" },
    ],

    // Feature 25: JOB-2026-5 closeout in progress. Three wall surfaces confirmed,
    // ceiling not yet confirmed, baseboard saved with the sheen left blank.
    closeouts: [
      {
        jobId: "JOB-2026-5",
        rows: [
          { surfaceId: "SF-4011", specId: "SPEC-6", painted: true, manufacturer: "Sherwin-Williams", colourName: "Agreeable Gray", colourNumber: "SW 7029", hex: "#D1CBC1", product: "Cashmere Interior Acrylic Latex", sheen: "Eggshell", coats: 2, completedAt: d(-4), actualHours: 7.5, actualGallons: 2.5, photoCount: 3, tintFormula: "B1 4Y2 / L1 1Y12", unknowns: [], confirmedBy: "U-CREW", confirmedAt: d(-3), savedBy: "U-CREW", savedAt: d(-3) },
          { surfaceId: "SF-4021", specId: "SPEC-6", painted: true, manufacturer: "Sherwin-Williams", colourName: "Agreeable Gray", colourNumber: "SW 7029", hex: "#D1CBC1", product: "Cashmere Interior Acrylic Latex", sheen: "Eggshell", coats: 2, completedAt: d(-4), photoCount: 2, unknowns: [], confirmedBy: "U-CREW", confirmedAt: d(-3), savedBy: "U-CREW", savedAt: d(-3) },
          { surfaceId: "SF-4031", specId: "SPEC-6", painted: true, manufacturer: "Sherwin-Williams", colourName: "Agreeable Gray", colourNumber: "SW 7029", hex: "#D1CBC1", product: "Cashmere Interior Acrylic Latex", sheen: "Eggshell", coats: 2, completedAt: d(-3), unknowns: [], confirmedBy: "U-CREW", confirmedAt: d(-3), savedBy: "U-CREW", savedAt: d(-3) },
          { surfaceId: "SF-4032", specId: "SPEC-8", painted: true, manufacturer: "Sherwin-Williams", colourName: "Extra White", colourNumber: "SW 7006", hex: "#EEEFEA", product: "Emerald Urethane Trim Enamel", sheen: undefined, coats: 2, completedAt: d(-2), unknowns: [], savedBy: "U-CREW", savedAt: d(-2) },
        ],
      },
    ],

    // Feature 26: job photographs the office can share on the QR record.
    sharedPhotos: [
      { id: "PH-1", propertyId: "PROP-1003", applicationId: "APP-3011", surfaceId: "SF-3011", caption: "Living room walls — Agreeable Gray, after", takenAt: ago(7, 60), identifying: false, selected: true },
      { id: "PH-2", propertyId: "PROP-1003", applicationId: "APP-3013", surfaceId: "SF-3013", caption: "Baseboard close-up — Extra White", takenAt: ago(7, 60), identifying: false, selected: true },
      { id: "PH-3", propertyId: "PROP-1003", applicationId: "APP-3051", surfaceId: "SF-3051", caption: "South elevation — street view with house number", takenAt: ago(3, -10), identifying: true, identifyingReason: "House number visible", selected: true },
      { id: "PH-4", propertyId: "PROP-1003", applicationId: "APP-3061", surfaceId: "SF-3061", caption: "Fascia and trim — Extra White", takenAt: ago(3, -10), identifying: false, selected: false },
      { id: "PH-5", propertyId: "PROP-1003", applicationId: "APP-3031", surfaceId: "SF-3031", caption: "Kitchen walls with homeowner in frame", takenAt: ago(5, 120), identifying: true, identifyingReason: "Face visible", selected: false },
      { id: "PH-6", propertyId: "PROP-1003", applicationId: "APP-3051", surfaceId: "SF-3051", caption: "South siding — detail, Repose Gray", takenAt: ago(3, -10), identifying: false, selected: true },
    ],

    // Feature 25: structure changes that need individual owner approval.
    propertyRequests: [
      { id: "PSR-1", kind: "merge", propertyId: "PROP-1008", targetPropertyId: "PROP-1003", reason: "Same street, postcode and owner. Website form typed \"Lane\" instead of \"Ln\".", requestedBy: "U-OFFICE", requestedAt: d(-6), status: "pending" },
      { id: "PSR-2", kind: "renumber", propertyId: "PROP-1005", oldUnit: "Suite 100", newUnit: "Suite 110", reason: "Building management renumbered the ground-floor suites.", requestedBy: "U-OFFICE", requestedAt: d(-4), status: "pending" },
    ],

    jobs: [
      { id: "JOB-2026-1", name: "Standard Exterior Repaint", propertyId: "PROP-1001", customerId: "C-KORAH", estimateId: "EST-2026-1", leadId: "LEAD-2026-4", status: "in_production", scheduleStart: d(-6), scheduleEnd: d(12), contractSigned: true, contractSignedAt: d(-100), contractValue: 12480, depositsCollected: 4160, markupPct: 45, taxRatePct: 8.25, estimatorId: "U-EST", crewLeadId: "U-CREW", surfaceIds: ["SF-1011", "SF-1021", "SF-1031", "SF-1041", "SF-1051", "SF-1052", "SF-1053", "SF-1054"], cardVersion: 2, cardRowVersion: 7, jobType: "exterior_repaint" },
      { id: "JOB-2026-2", name: "Kitchen Cabinet Refinish", propertyId: "PROP-1002", customerId: "C-SAM", estimateId: "EST-2026-3", leadId: "LEAD-2026-1", status: "scheduled", scheduleStart: d(9), scheduleEnd: d(16), contractSigned: true, contractSignedAt: d(-60), contractValue: 6850, depositsCollected: 0, markupPct: 50, taxRatePct: 8.25, estimatorId: "U-SENIOR", crewLeadId: "U-CREW", surfaceIds: ["SF-2011"], cardVersion: 1, cardRowVersion: 2, jobType: "interior_repaint" },
      { id: "JOB-2026-3", name: "Standard Exterior Repaint", propertyId: "PROP-1004", customerId: "C-STEVEN", estimateId: "EST-2026-5", leadId: "LEAD-2026-5", status: "estimating", contractSigned: false, contractValue: 9200, depositsCollected: 0, markupPct: 45, taxRatePct: 8.25, estimatorId: "U-EST", crewLeadId: "U-CREW", surfaceIds: ["SF-4041"], cardVersion: 1, cardRowVersion: 0, jobType: "exterior_repaint" },
      { id: "JOB-2026-4", name: "Standard Exterior Repaint", propertyId: "PROP-1002", customerId: "C-SAM", estimateId: "EST-2026-8", leadId: "LEAD-2026-1", status: "estimating", contractSigned: false, contractValue: 8400, depositsCollected: 0, markupPct: 45, taxRatePct: 8.25, estimatorId: "U-EST", crewLeadId: "U-CREW", surfaceIds: ["SF-2021", "SF-2031"], cardVersion: 1, cardRowVersion: 0, jobType: "exterior_repaint" },
      { id: "JOB-2026-5", name: "Interior Repaint — Main Floor", propertyId: "PROP-1004", customerId: "C-STEVEN", estimateId: "EST-2026-6", status: "ready_for_inspection", scheduleStart: d(-9), scheduleEnd: d(-2), contractSigned: true, contractSignedAt: d(-50), contractValue: 4992.9, depositsCollected: 1664.3, markupPct: 45, taxRatePct: 8.25, estimatorId: "U-EST", crewLeadId: "U-CREW", surfaceIds: ["SF-4011", "SF-4012", "SF-4021", "SF-4031", "SF-4032"], cardVersion: 1, cardRowVersion: 4, jobType: "interior_repaint" },
    ],

    colours: [
      { id: "COL-1", jobId: "JOB-2026-1", manufacturer: "Sherwin-Williams", name: "Repose Gray", number: "SW 7015", hex: "#CCC9C0", customMatch: false, createdAt: d(-110), createdBy: "U-EST" },
      { id: "COL-2", jobId: "JOB-2026-1", manufacturer: "Sherwin-Williams", name: "Extra White", number: "SW 7006", hex: "#EEEFEA", customMatch: false, createdAt: d(-110), createdBy: "U-EST" },
      { id: "COL-3", jobId: "JOB-2026-1", manufacturer: "Sherwin-Williams", name: "Singer Door Red (custom match)", number: "CM-0412", hex: "#8E2B2B", sampleRef: "Customer's 1998 door chip", customMatch: true, createdAt: d(-20), createdBy: "U-EST" },
      { id: "COL-4", jobId: "JOB-2026-2", manufacturer: "Sherwin-Williams", name: "Pure White", number: "SW 7005", hex: "#EDECE6", customMatch: false, createdAt: d(-58), createdBy: "U-SENIOR" },
      { id: "COL-5", jobId: "JOB-2026-5", manufacturer: "Sherwin-Williams", name: "Agreeable Gray", number: "SW 7029", hex: "#D1CBC1", customMatch: false, createdAt: d(-48), createdBy: "U-EST" },
      { id: "COL-6", jobId: "JOB-2026-5", manufacturer: "Sherwin-Williams", name: "Ceiling Bright White", number: "SW 7007", hex: "#F3F4EF", customMatch: false, createdAt: d(-48), createdBy: "U-EST" },
      { id: "COL-7", jobId: "JOB-2026-5", manufacturer: "Sherwin-Williams", name: "Extra White", number: "SW 7006", hex: "#EEEFEA", customMatch: false, createdAt: d(-48), createdBy: "U-EST" },
      // Feature 18: draft estimate colours, for the preliminary shopping list.
      { id: "COL-J4-1", jobId: "JOB-2026-4", manufacturer: "Sherwin-Williams", name: "Sea Salt", number: "SW 6204", hex: "#CDD5C6", customMatch: false, createdAt: d(-12), createdBy: "U-EST" },
      { id: "COL-J4-2", jobId: "JOB-2026-4", manufacturer: "Sherwin-Williams", name: "Extra White", number: "SW 7006", hex: "#EEEFEA", customMatch: false, createdAt: d(-12), createdBy: "U-EST" },
    ],

    // Feature 3: manufacturer palettes the colour card picks from. Hex values are on-screen approximations.
    palette: [
      ...([
        ["Repose Gray", "SW 7015", "#CCC9C0", "Neutrals"], ["Agreeable Gray", "SW 7029", "#D1CBC1", "Neutrals"], ["Accessible Beige", "SW 7036", "#D1C7B8", "Neutrals"],
        ["Mindful Gray", "SW 7016", "#BCB7AD", "Neutrals"], ["Alabaster", "SW 7008", "#EDEAE0", "Whites"], ["Extra White", "SW 7006", "#EEEFEA", "Whites"],
        ["Pure White", "SW 7005", "#EDECE6", "Whites"], ["Ceiling Bright White", "SW 7007", "#E9EBE7", "Whites"], ["Sea Salt", "SW 6204", "#CDD5C6", "Greens"],
        ["Evergreen Fog", "SW 9130", "#95978A", "Greens"], ["Naval", "SW 6244", "#2F3D4C", "Blues"], ["Iron Ore", "SW 7069", "#434341", "Darks"],
        ["Urbane Bronze", "SW 7048", "#54504A", "Darks"], ["Tricorn Black", "SW 6258", "#2F2F30", "Darks"],
      ].map(([name, number, hex, family], i) => ({ id: `PAL-SW-${i + 1}`, manufacturer: "Sherwin-Williams", name, number, hex, family }))),
      ...([
        ["Chantilly Lace", "OC-65", "#F5F4EE", "Off-White Collection"], ["White Dove", "OC-17", "#F0EFE7", "Off-White Collection"], ["Simply White", "OC-117", "#F3F1E4", "Off-White Collection"],
        ["Pale Oak", "OC-20", "#DDD6CB", "Off-White Collection"], ["Revere Pewter", "HC-172", "#CCC7B9", "Historical Colors"], ["Edgecomb Gray", "HC-173", "#D5CFC1", "Historical Colors"],
        ["Kendall Charcoal", "HC-166", "#686661", "Historical Colors"], ["Hale Navy", "HC-154", "#434B56", "Historical Colors"],
      ].map(([name, number, hex, family], i) => ({ id: `PAL-BM-${i + 1}`, manufacturer: "Benjamin Moore", name, number, hex, family }))),
      ...([
        ["Ultra Pure White", "1850", "#F8F8F4", "Whites"], ["Swiss Coffee", "12", "#EEEBE0", "Whites"], ["Polar Bear", "75", "#EBE8DC", "Whites"],
        ["Blank Canvas", "DC-003", "#F0EAD9", "Designer Collection"], ["Silver Drop", "790C-2", "#DCDAD1", "Neutrals"], ["Cracked Pepper", "PPU18-01", "#4F5152", "Darks"],
      ].map(([name, number, hex, family], i) => ({ id: `PAL-BH-${i + 1}`, manufacturer: "Behr", name, number, hex, family }))),
      ...([
        ["Delicate White", "PPG1001-1", "#F1F2EE", "Whites"], ["Olive Sprig", "PPG1125-4", "#ACAA8F", "Greens"], ["Night Watch", "PPG1145-7", "#3C4A40", "Greens"],
        ["Chinese Porcelain", "PPG1160-6", "#3A4B67", "Blues"],
      ].map(([name, number, hex, family], i) => ({ id: `PAL-PPG-${i + 1}`, manufacturer: "PPG", name, number, hex, family }))),
    ],

    specs: [
      // JOB-2026-1 body: approved + orderable
      { id: "SPEC-1", jobId: "JOB-2026-1", colourId: "COL-1", sheen: "Satin", coats: 2, primer: "Spot prime bare wood — Exterior Latex Wood Primer", coatSequence: ["Spot prime bare wood", "Finish coat 1", "Finish coat 2"], surfaceIds: ["SF-1011", "SF-1021", "SF-1031", "SF-1041"], lifespanYears: 7, lifespanLocked: false, productLine: "Duration", product: "Duration Exterior Acrylic Latex", tintBase: "Extra White base", state: "approved", approvedVersion: 1, referencedBy: ["material_calc", "work_order"], createdAt: d(-110), updatedAt: d(-95) },
      // Trim: approved but product line missing -> not orderable
      { id: "SPEC-2", jobId: "JOB-2026-1", colourId: "COL-2", sheen: "Semi-Gloss", coats: 2, primer: PRIMER_NONE_SOUND, coatSequence: ["Finish coat 1", "Finish coat 2"], surfaceIds: ["SF-1051", "SF-1052"], lifespanYears: 5, lifespanLocked: false, state: "approved", approvedVersion: 1, referencedBy: [], createdAt: d(-110), updatedAt: d(-95) },
      // Shutters: draft, primer blank -> blocks approval
      { id: "SPEC-3", jobId: "JOB-2026-1", colourId: "COL-2", sheen: "Satin", coats: 2, primer: undefined, coatSequence: ["Finish coat 1", "Finish coat 2"], surfaceIds: ["SF-1054"], lifespanYears: 5, lifespanLocked: false, productLine: "Duration", product: "Duration Exterior Acrylic Latex", tintBase: "Extra White base", state: "draft", referencedBy: [], createdAt: d(-15), updatedAt: d(-15) },
      // Custom door red: pending sample
      { id: "SPEC-4", jobId: "JOB-2026-1", colourId: "COL-3", sheen: "Gloss", coats: 2, primer: "Bonding primer — Extreme Bond", coatSequence: ["Bonding primer", "Finish coat 1", "Finish coat 2"], surfaceIds: ["SF-1053"], lifespanYears: 5, lifespanLocked: true, productLine: "Emerald", product: "Emerald Urethane Trim Enamel", tintBase: "Deep base", state: "pending_sample", referencedBy: [], createdAt: d(-20), updatedAt: d(-5) },

      // JOB-2026-2 cabinets: sent for approval
      { id: "SPEC-5", jobId: "JOB-2026-2", colourId: "COL-4", sheen: "Satin", coats: 2, primer: "Bonding primer — Extreme Bond", coatSequence: ["Degloss & clean", "Bonding primer", "Finish coat 1", "Finish coat 2"], surfaceIds: ["SF-2011"], lifespanYears: 5, lifespanLocked: false, productLine: "Emerald", product: "Emerald Urethane Trim Enamel", tintBase: "Extra White base", state: "sent", referencedBy: ["material_calc"], createdAt: d(-58), updatedAt: d(-21) },

      // JOB-2026-5 interior: all approved (closeout demo)
      { id: "SPEC-6", jobId: "JOB-2026-5", colourId: "COL-5", sheen: "Eggshell", coats: 2, primer: PRIMER_NONE_SOUND, coatSequence: ["Patch & sand", "Finish coat 1", "Finish coat 2"], surfaceIds: ["SF-4011", "SF-4021", "SF-4031"], lifespanYears: 7, lifespanLocked: false, productLine: "Cashmere", product: "Cashmere Interior Acrylic Latex", tintBase: "Extra White base", state: "approved", approvedVersion: 1, referencedBy: ["material_calc", "work_order"], createdAt: d(-48), updatedAt: d(-45) },
      { id: "SPEC-7", jobId: "JOB-2026-5", colourId: "COL-6", sheen: "Flat", coats: 1, primer: PRIMER_NONE_SOUND, coatSequence: ["Finish coat 1"], surfaceIds: ["SF-4012"], lifespanYears: 10, lifespanLocked: false, productLine: "ProMar 200", product: "ProMar 200 Interior", tintBase: "Extra White base", state: "approved", approvedVersion: 1, referencedBy: ["material_calc"], createdAt: d(-48), updatedAt: d(-45) },
      // Feature 18: JOB-2026-4 is a draft estimate — preliminary list only.
      { id: "SPEC-J4-1", jobId: "JOB-2026-4", colourId: "COL-J4-1", sheen: "Satin", coats: 2, primer: PRIMER_NONE_SOUND, coatSequence: ["Finish coat 1", "Finish coat 2"], surfaceIds: ["SF-2021"], lifespanYears: 7, lifespanLocked: false, productLine: "Duration", product: "Duration Exterior Acrylic Latex", tintBase: "Extra White base", state: "draft", referencedBy: [], createdAt: d(-12), updatedAt: d(-12) },
      { id: "SPEC-J4-2", jobId: "JOB-2026-4", colourId: "COL-J4-2", sheen: "Semi-Gloss", coats: 2, primer: PRIMER_NONE_SOUND, coatSequence: ["Finish coat 1", "Finish coat 2"], surfaceIds: ["SF-2031"], lifespanYears: 5, lifespanLocked: false, productLine: "Emerald", product: "Emerald Urethane Trim Enamel", tintBase: "Extra White base", state: "draft", referencedBy: [], createdAt: d(-12), updatedAt: d(-12) },
      { id: "SPEC-8", jobId: "JOB-2026-5", colourId: "COL-7", sheen: "Semi-Gloss", coats: 2, primer: PRIMER_NONE_SOUND, coatSequence: ["Finish coat 1", "Finish coat 2"], surfaceIds: ["SF-4032"], lifespanYears: 5, lifespanLocked: false, productLine: "Emerald", product: "Emerald Urethane Trim Enamel", tintBase: "Extra White base", state: "approved", approvedVersion: 1, referencedBy: ["material_calc"], createdAt: d(-48), updatedAt: d(-45) },
    ],

    sampleRounds: [
      { id: "SR-1", colourId: "COL-3", round: 1, date: d(-18), deliveredBy: "U-EST", outcome: "rejected", note: "Too orange next to the brick." },
      { id: "SR-2", colourId: "COL-3", round: 2, date: d(-5), deliveredBy: "U-EST" },
    ],

    colourApprovals: [
      { id: "CA-1", jobId: "JOB-2026-1", cardVersion: 1, specIds: ["SPEC-1", "SPEC-2"], channel: "estimate_pdf", sentAt: d(-102), sentBy: "U-EST", status: "approved", signer: "Korah Singer", approvedAt: d(-100), senderAddress: "korah.singer@example.com" },
      { id: "CA-2", jobId: "JOB-2026-2", cardVersion: 1, specIds: ["SPEC-5"], channel: "email", sentAt: d(-21), sentBy: "U-SENIOR", status: "sent" },
      { id: "CA-3", jobId: "JOB-2026-5", cardVersion: 1, specIds: ["SPEC-6", "SPEC-7", "SPEC-8"], channel: "portal", sentAt: d(-47), sentBy: "U-EST", status: "approved", signer: "Steven Omodth", approvedAt: d(-45), senderAddress: "steven.omodth@example.com" },
    ],

    cardSnapshots: [],

    commitmentFlags: [],

    catalog: [
      { id: "PRD-DUR-EXT", manufacturer: "Sherwin-Williams", productLine: "Duration", product: "Duration Exterior Acrylic Latex", spreadRate: 350, fieldRate: 325, tier: "premium", cost: { qt: 28.5, gal: 82, "5gal": 385 }, available: ["qt", "gal", "5gal"], itemCode: "K33W00151", conditionRates: { rough: 250 } },
      { id: "PRD-SUP-EXT", manufacturer: "Sherwin-Williams", productLine: "SuperPaint", product: "SuperPaint Exterior", spreadRate: 350, tier: "standard", cost: { gal: 62, "5gal": 290 }, available: ["gal", "5gal"], itemCode: "A89W00151", discontinued: true },
      // Feature 28: manufacturer-published direct successor of SuperPaint Exterior (same line, within 10% cost).
      { id: "PRD-SUP-EXT2", manufacturer: "Sherwin-Williams", productLine: "SuperPaint", product: "SuperPaint Exterior Advanced", spreadRate: 350, tier: "standard", cost: { gal: 66, "5gal": 305 }, available: ["gal", "5gal"], itemCode: "A89W00251", successorOf: "PRD-SUP-EXT" },
      { id: "PRD-EMR-TRIM", manufacturer: "Sherwin-Williams", productLine: "Emerald", product: "Emerald Urethane Trim Enamel", spreadRate: 400, tier: "premium", cost: { qt: 31, gal: 95 }, available: ["qt", "gal"], itemCode: "K38W00151" },
      { id: "PRD-EMR-INT", manufacturer: "Sherwin-Williams", productLine: "Emerald", product: "Emerald Interior Acrylic Latex", spreadRate: 400, tier: "premium", cost: { qt: 27, gal: 78, "5gal": 365 }, available: ["qt", "gal", "5gal"], itemCode: "K37W00351" },
      { id: "PRD-CSH-INT", manufacturer: "Sherwin-Williams", productLine: "Cashmere", product: "Cashmere Interior Acrylic Latex", spreadRate: 400, fieldRate: 380, tier: "standard", cost: { qt: 21, gal: 58, "5gal": 270 }, available: ["qt", "gal", "5gal"], itemCode: "C31W00151" },
      { id: "PRD-PM200", manufacturer: "Sherwin-Williams", productLine: "ProMar 200", product: "ProMar 200 Interior", spreadRate: 400, tier: "standard", cost: { gal: 38, "5gal": 175 }, available: ["gal", "5gal"], itemCode: "B30W02651" },
      { id: "PRD-BM-REGAL", manufacturer: "Benjamin Moore", productLine: "Regal Select", product: "Regal Select Exterior", spreadRate: 400, tier: "premium", cost: { gal: 79, "5gal": 370 }, available: ["gal", "5gal"] },
    ],

    // Feature 18: an estimator adjustment above 10% waiting for the office.
    demandAdjustments: [
      { id: "ADJ-1", jobId: "JOB-2026-5", specId: "SPEC-6", baselineGal: 6.3, proposedGal: 7.25, pct: 0.1508, note: "Dining room feature wall is deep red today. Expect a third coat on that wall.", by: "U-EST", at: d(-1), status: "pending_approval" },
    ],

    shelfStock: [
      { id: "SH-1", product: "Duration Exterior Acrylic Latex", colourName: "Repose Gray", colourNumber: "SW 7015", sheen: "Satin", containerSize: "gal", sealed: true, tintDate: d(-240), purchaseDate: d(-240) },
      { id: "SH-2", product: "Emerald Urethane Trim Enamel", colourName: "Extra White", colourNumber: "SW 7006", sheen: "Semi-Gloss", containerSize: "qt", sealed: true, tintDate: d(-900), purchaseDate: d(-900) },
      { id: "SH-3", product: "Emerald Urethane Trim Enamel", colourName: "Pure White", colourNumber: "SW 7005", sheen: "Satin", containerSize: "gal", sealed: true, tintDate: d(-70), purchaseDate: d(-70), measuredGal: 1, confirmedBy: "U-OFFICE", checkDate: d(-40), reservedJobId: "JOB-2026-2" },
      { id: "SH-4", product: "Duration Exterior Acrylic Latex", colourName: "Repose Gray", colourNumber: "SW 7015", sheen: "Satin", containerSize: "gal", sealed: false, tintDate: d(-120), purchaseDate: d(-120) },
      // Feature 18: confirmed and reserved to another job, so JOB-2026-1 sees it as unavailable.
      { id: "SH-5", product: "Duration Exterior Acrylic Latex", colourName: "Repose Gray", colourNumber: "SW 7015", sheen: "Satin", containerSize: "5gal", sealed: true, tintDate: d(-150), purchaseDate: d(-150), measuredGal: 4.5, confirmedBy: "U-CREW", checkDate: d(-6), reservedJobId: "JOB-2026-3", reservedAt: d(-6), unitCostPerGal: 77, source: "Left over from JOB-2025-88" },
      { id: "SH-6", product: "Cashmere Interior Acrylic Latex", colourName: "Agreeable Gray", colourNumber: "SW 7029", sheen: "Eggshell", containerSize: "gal", sealed: true, purchaseDate: d(-300), unitCostPerGal: 58, source: "Left over from JOB-2025-61" },
    ],

    suppliers: [
      // Feature 19: SW is wired to the sandbox connector; no real supplier is contacted and no secret is stored.
      { id: "SUP-SW", name: "Sherwin-Williams", launchPhase: "Launch", connection: { type: "api_edi", endpointLabel: "SW PRO ordering API", sandbox: true, credentialsOnFile: true, credentialsUpdatedAt: d(-30), credentialsUpdatedBy: "U-OFFICE", health: "healthy", lastCheckedAt: d(-1) } },
      { id: "SUP-BM", name: "Benjamin Moore (Phase 1.1)", launchPhase: "Phase 1.1", connection: { type: "manual", health: "not_configured" } },
    ],

    branches: [
      { id: "BR-7132", supplierId: "SUP-SW", name: "Lower Greenville", storeNumber: "7132", accountNumber: "4455-1180-22", phone: "(214) 555-0132" },
      { id: "BR-7248", supplierId: "SUP-SW", name: "Plano Parkway", storeNumber: "7248", accountNumber: "4455-1180-37", phone: "(972) 555-0248" },
      // Feature 19: imported before setup rules; store number missing, so it can't receive orders.
      { id: "BR-BM-1", supplierId: "SUP-BM", name: "Richardson (Phase 1.1)", storeNumber: "", accountNumber: "BM-22871", phone: "(972) 555-0310" },
    ],

    purchaseOrders: [
      {
        id: "JOB-2026-1-PO-01", jobId: "JOB-2026-1", supplierId: "SUP-SW", branchId: "BR-7132", phase: "Phase 1 — Body", deliveryDate: d(-7), originalDeliveryDate: d(-7),
        status: "partially_filled", createdAt: d(-12), createdBy: "U-OFFICE", approvedBy: "U-OFFICE", destinationConfirmed: true,
        sendMethod: "email", sentAt: at(-11, 9, 15), sentBy: "U-OFFICE", sentEvidence: "Sent message + delivery receipt stored (orders@7132.sw.example)",
        ackAt: at(-11, 11, 2), ackRef: "SW-7132-88410",
        lines: [
          { id: "L1", specId: "SPEC-1", description: "Body — Repose Gray SW 7015", product: "Duration Exterior Acrylic Latex", colourLabel: "Repose Gray SW 7015", sheen: "Satin", packs: [{ size: "5gal", count: 2 }], gallons: 10, unitCostPerGal: 77, status: "picked_up", receivedGal: 10, cancelledGal: 0, returnedGal: 0, creditAmount: 0 },
          { id: "L2", specId: "SPEC-1", description: "Body — Repose Gray SW 7015 (top-up)", product: "Duration Exterior Acrylic Latex", colourLabel: "Repose Gray SW 7015", sheen: "Satin", packs: [{ size: "gal", count: 2 }], gallons: 2, unitCostPerGal: 82, status: "partially_filled", receivedGal: 1, cancelledGal: 0, returnedGal: 0, creditAmount: 0, supplierStatusText: "BO - TINT MACH DOWN / ETA 2D" },
          { id: "L3", description: "Spot primer — untinted", product: "Exterior Latex Wood Primer", colourLabel: "Untinted (white)", sheen: "Flat", packs: [{ size: "gal", count: 2 }], gallons: 2, unitCostPerGal: 36, status: "picked_up", receivedGal: 2, cancelledGal: 0, returnedGal: 1, creditAmount: 36, tinted: false },
        ],
        fulfilment: "pickup", pickupContact: "Luis Ortega", pickupPhone: "(214) 555-0199", approvedTotal: 1006, ackBy: "Marco (paint desk)", ackMethod: "confirmation_number",
        events: [
          { at: d(-12), by: "U-OFFICE", text: "Order generated from approved demand." },
          { at: at(-11, 9, 15), by: "U-OFFICE", text: "Sent by email to branch 7132. Delivery receipt stored." },
          { at: at(-11, 11, 2), by: "U-OFFICE", text: "Acknowledged. Confirmation SW-7132-88410." },
          { at: d(-7), by: "U-CREW", text: "Line L1 picked up (10 gal). Line L2: 1 of 2 gal. Supplier note retained verbatim." },
          { at: d(-4), by: "U-OFFICE", text: "1 gal untinted primer returned. Credit $36.00 confirmed by branch." },
        ],
      },
      {
        id: "JOB-2026-2-PO-01", jobId: "JOB-2026-2", supplierId: "SUP-SW", branchId: "BR-7248", phase: "Full job", deliveryDate: d(7), originalDeliveryDate: d(7),
        status: "sent", createdAt: d(-3), createdBy: "U-OFFICE", approvedBy: "U-OFFICE", destinationConfirmed: true,
        sendMethod: "phone", sentAt: at(-2, 9, 0), sentBy: "U-OFFICE", sentEvidence: "Called branch, spoke with Ray (counter), 9:00 a.m.",
        lines: [
          { id: "L1", specId: "SPEC-5", description: "Cabinets — Pure White SW 7005", product: "Emerald Urethane Trim Enamel", colourLabel: "Pure White SW 7005", sheen: "Satin", packs: [{ size: "gal", count: 2 }], gallons: 2, unitCostPerGal: 95, status: "sent", receivedGal: 0, cancelledGal: 0, returnedGal: 0, creditAmount: 0 },
        ],
        events: [
          { at: d(-3), by: "U-OFFICE", text: "Order generated from approved demand." },
          { at: at(-2, 9, 0), by: "U-OFFICE", text: "Phoned in. Spoke with Ray at the counter." },
        ],
        fulfilment: "delivery", pickupContact: "Luis Ortega", pickupPhone: "(214) 555-0199", approvedTotal: 190,
      },
      // Feature 19: emailed this morning, clock still running.
      {
        id: "JOB-2026-5-PO-01", jobId: "JOB-2026-5", supplierId: "SUP-SW", branchId: "BR-7248", phase: "Touch-up & punch list", deliveryDate: d(1), originalDeliveryDate: d(1),
        status: "sent", createdAt: at(0, 8, 10), createdBy: "U-OFFICE", approvedBy: "U-OFFICE", destinationConfirmed: true, destinationConfirmedAt: at(0, 8, 25), destinationConfirmedBy: "U-OFFICE",
        sendMethod: "email", sentAt: at(0, 8, 30), sentBy: "U-OFFICE", sentEvidence: "Sent message MSG-20488 stored; delivery receipt DR-20488 (orders@7248.sw.example)",
        lines: [
          { id: "L1", specId: "SPEC-7", description: "Ceilings — Ceiling Bright White SW 7007", product: "ProMar 200 Interior", colourLabel: "Ceiling Bright White SW 7007", sheen: "Flat", packs: [{ size: "gal", count: 1 }], gallons: 1, unitCostPerGal: 38, approvedCostPerGal: 38, status: "sent", receivedGal: 0, cancelledGal: 0, returnedGal: 0, creditAmount: 0 },
        ],
        events: [
          { at: at(0, 8, 10), by: "U-OFFICE", text: "Order generated from approved demand." },
          { at: at(0, 8, 30), by: "U-OFFICE", text: "Sent by email to branch 7248. Delivery receipt stored." },
        ],
        fulfilment: "pickup", pickupContact: "Luis Ortega", pickupPhone: "(214) 555-0199", approvedTotal: 38,
      },
      // Feature 19: generated, waiting for the buyer to confirm destination and send.
      {
        id: "JOB-2026-5-PO-02", jobId: "JOB-2026-5", supplierId: "SUP-SW", branchId: "BR-7248", phase: "Touch-up & punch list", deliveryDate: d(2), originalDeliveryDate: d(2),
        status: "issued", createdAt: at(-1, 14, 0), createdBy: "U-OFFICE", approvedBy: "U-OFFICE", destinationConfirmed: false,
        lines: [
          { id: "L1", specId: "SPEC-8", description: "Trim — Extra White SW 7006", product: "Emerald Urethane Trim Enamel", colourLabel: "Extra White SW 7006", sheen: "Semi-Gloss", packs: [{ size: "qt", count: 2 }], gallons: 0.5, unitCostPerGal: 124, approvedCostPerGal: 124, status: "open", receivedGal: 0, cancelledGal: 0, returnedGal: 0, creditAmount: 0, tintFormula: "B1 2Y / W1 4" },
        ],
        events: [{ at: at(-1, 14, 0), by: "U-OFFICE", text: "Order generated from approved demand." }],
        fulfilment: "pickup", pickupContact: "Luis Ortega", pickupPhone: "(214) 555-0199", approvedTotal: 62,
      },
    ],

    // Feature 18: an estimator's supplemental request waiting for the office to generate.
    orderRequests: [
      { id: "REQ-1", jobId: "JOB-2026-1", supplierId: "SUP-SW", branchId: "BR-7132", phase: "Phase 2 — Body top-up", deliveryDate: d(3), fulfilment: "pickup",
        lines: [{ specId: "SPEC-1", gallons: 5, packs: [{ size: "5gal", count: 1 }] }],
        requestedBy: "U-EST", requestedAt: d(-1), note: "West elevation took more than planned. Crew needs it by Friday.",
        limit: { orderValue: 385, windowTotal: 385, lifetimeTotal: 1355, estimatorPass: true, needs: "none", checkedAt: d(-1) }, status: "requested" },
    ],
    receipts: [
      { id: "RCPT-1", poId: "JOB-2026-1-PO-01", lineId: "L1", jobId: "JOB-2026-1", qtyGal: 10, orderedGal: 10, at: d(-7), by: "U-CREW", overGal: 0, toJobCostGal: 0, toShelfGal: 0, status: "recorded" },
      { id: "RCPT-2", poId: "JOB-2026-1-PO-01", lineId: "L2", jobId: "JOB-2026-1", qtyGal: 1, orderedGal: 2, at: d(-7), by: "U-CREW", overGal: 0, toJobCostGal: 0, toShelfGal: 0, status: "recorded" },
      { id: "RCPT-3", poId: "JOB-2026-1-PO-01", lineId: "L3", jobId: "JOB-2026-1", qtyGal: 2, orderedGal: 2, at: d(-7), by: "U-CREW", overGal: 0, toJobCostGal: 0, toShelfGal: 0, status: "recorded" },
    ],
    returns: [
      { id: "RET-1", poId: "JOB-2026-1-PO-01", lineId: "L3", jobId: "JOB-2026-1", qtyGal: 1, credit: 36, confirmed: true, reason: "Spot priming used less than planned. Unopened gallon.", at: d(-4), by: "U-OFFICE" },
    ],
    equipmentRentals: [
      { id: "RENT-1", jobId: "JOB-2026-1", description: "40 ft articulating boom lift", vendor: "Sunbelt Rentals — Garland", days: 3, cost: 780, addedBy: "U-OFFICE", addedAt: d(-8) },
      { id: "RENT-2", jobId: "JOB-2026-1", description: "Airless sprayer (Graco 695)", vendor: "Sherwin-Williams 7132", days: 2, cost: 190, addedBy: "U-EST", addedAt: d(-8) },
    ],
    materialOverrides: [],
    estimateBases: [
      { jobId: "JOB-2026-1", approvedAt: d(-100), lines: [{ specId: "SPEC-1", rate: 350, costPerGal: 78 }] },
      { jobId: "JOB-2026-5", approvedAt: d(-50), lines: [{ specId: "SPEC-6", rate: 380, costPerGal: 58 }, { specId: "SPEC-7", rate: 400, costPerGal: 38 }, { specId: "SPEC-8", rate: 400, costPerGal: 95 }] },
    ],
    productMappings: [
      { id: "MAP-1", supplierId: "SUP-SW", catalogId: "PRD-DUR-EXT", packSize: "qt", unit: "quart", itemCode: "K33W00154", updatedAt: d(-200), updatedBy: "U-OFFICE" },
      { id: "MAP-2", supplierId: "SUP-SW", catalogId: "PRD-DUR-EXT", packSize: "gal", unit: "gallon", itemCode: "K33W00151", updatedAt: d(-200), updatedBy: "U-OFFICE" },
      { id: "MAP-3", supplierId: "SUP-SW", catalogId: "PRD-DUR-EXT", packSize: "5gal", unit: "5-gallon pail", itemCode: "K33W00155", colourNumber: "SW 7015", tintFormula: "B1 3Y18 / L1 1Y4", updatedAt: d(-120), updatedBy: "U-OFFICE" },
      { id: "MAP-4", supplierId: "SUP-SW", catalogId: "PRD-EMR-TRIM", packSize: "qt", unit: "quart", itemCode: "K38W00154", updatedAt: d(-200), updatedBy: "U-OFFICE" },
      { id: "MAP-5", supplierId: "SUP-SW", catalogId: "PRD-EMR-TRIM", packSize: "gal", unit: "gallon", itemCode: "K38W00151", updatedAt: d(-200), updatedBy: "U-OFFICE" },
      { id: "MAP-6", supplierId: "SUP-SW", catalogId: "PRD-CSH-INT", packSize: "gal", unit: "gallon", itemCode: "C31W00151", updatedAt: d(-200), updatedBy: "U-OFFICE" },
      { id: "MAP-7", supplierId: "SUP-SW", catalogId: "PRD-CSH-INT", packSize: "5gal", unit: "5-gallon pail", itemCode: "C31W00155", updatedAt: d(-200), updatedBy: "U-OFFICE" },
      { id: "MAP-8", supplierId: "SUP-SW", branchId: "BR-7248", catalogId: "PRD-PM200", packSize: "gal", unit: "gallon", itemCode: "B30W02651", updatedAt: d(-90), updatedBy: "U-OFFICE" },
    ],
    procurementSettings: { packingStrategy: "least_leftover" },

    changeOrders: [
      {
        id: "CO-2026-1-01", jobId: "JOB-2026-1", type: "addition", title: "Add detached garage body and trim", status: "approved",
        lines: [
          { id: "L1", kind: "add", description: "Detached garage — siding, 2 coats Repose Gray", sqft: 420, cost: 780 },
          { id: "L2", kind: "add", description: "Garage trim and overhead door, 2 coats Extra White", sqft: 140, cost: 220 },
        ],
        markupPct: 45, taxRatePct: 8.25, taxDate: d(-30), createdAt: d(-32), createdBy: "U-EST", recipient: "korah.singer@example.com", recipientVerified: true,
        channel: "portal", sentAt: d(-30), linkExpiresAt: d(0), signer: "Korah Singer", decidedAt: d(-28),
        appliedAt: d(-28), appliedBy: "U-OFFICE",
        downstream: { work_order: "done", materials: "done", scheduler: "done", billing: "failed" },
        // Feature 24 detail
        version: 1, recipientName: "Korah Singer", submittedAt: d(-31),
        links: [{ id: "LNK-9001", version: 1, recipientName: "Korah Singer", recipient: "korah.singer@example.com", channel: "portal", sentAt: d(-30), sentBy: "U-OFFICE", expiresAt: d(0), delivery: "delivered" }],
        evidence: { version: 1, signer: "Korah Singer", channel: "portal", ref: "Portal signature PS-40418 (IP 73.12.x.x)", at: d(-28), recordedBy: "U-OFFICE" },
        downstreamMeta: {
          work_order: { at: d(-28), by: "U-OFFICE", ref: "Work order JOB-2026-1-WO revised to scope v2 (approved scope only)" },
          materials: { at: d(-28), by: "U-OFFICE", ref: "Demand revised for +560 sq ft — Materials tab" },
          scheduler: { at: d(-28), by: "U-OFFICE", ref: "Task for the scheduler (labour +560 sq ft)" },
          billing: { at: d(-28), error: "Accounting sync failed: QuickBooks returned 503 Service Unavailable" },
        },
      },
      {
        id: "CO-2026-1-02", jobId: "JOB-2026-1", type: "credit", title: "Remove shutters from scope", status: "draft",
        lines: [{ id: "L1", kind: "remove", description: "Shutters (8 faces) — customer replacing with vinyl", sqft: 96, cost: 190 }],
        markupPct: 45, taxRatePct: 8.5, taxDate: d(0), createdAt: d(-1), createdBy: "U-EST", recipientVerified: false, version: 1,
        downstream: { work_order: "not_started", materials: "not_started", scheduler: "not_started", billing: "not_started" },
      },
      // Sent, awaiting signature. v1 link superseded by v2. Triggers deposit review (31.6% of original).
      {
        id: "CO-2026-1-03", jobId: "JOB-2026-1", type: "addition", title: "Add back porch ceiling and railings", status: "sent",
        lines: [
          { id: "L1", kind: "add", description: "Back porch ceiling — beadboard, prime + 2 coats Extra White", sqft: 210, cost: 640, product: "Duration Exterior Acrylic Latex", colour: "Extra White SW 7006" },
          { id: "L2", kind: "add", description: "Porch railings and balusters (46 lf), 2 coats Extra White", sqft: 280, cost: 1080, product: "Emerald Urethane Trim Enamel", colour: "Extra White SW 7006" },
        ],
        markupPct: 45, taxRatePct: 8.25, taxDate: d(-10), createdAt: d(-10), createdBy: "U-EST", version: 2,
        ownerApprovedBy: "U-OWNER", ownerApprovedAt: d(-7), submittedAt: d(-8),
        recipient: "korah.singer@example.com", recipientName: "Korah Singer", recipientVerified: true, channel: "portal", sentAt: d(-6), linkExpiresAt: d(24),
        depositReview: { cumulativeNet: 3944, pct: 3944 / 12480, target: 5474.67, collected: 4160, due: 1314.67, at: d(-8) },
        links: [
          { id: "LNK-9002", version: 1, recipientName: "Korah Singer", recipient: "korah.singer@example.com", channel: "portal", sentAt: d(-9), sentBy: "U-OFFICE", expiresAt: d(21), delivery: "delivered", supersededAt: d(-6), supersededReason: "Replaced by version 2: railing length corrected from 38 lf to 46 lf" },
          { id: "LNK-9003", version: 2, recipientName: "Korah Singer", recipient: "korah.singer@example.com", channel: "portal", sentAt: d(-6), sentBy: "U-OFFICE", expiresAt: d(24), delivery: "delivered" },
        ],
        downstream: { work_order: "not_started", materials: "not_started", scheduler: "not_started", billing: "not_started" },
      },
      // Emergency: verbal authorisation this morning, written confirmation due in two working days.
      {
        id: "CO-2026-1-04", jobId: "JOB-2026-1", type: "addition", title: "Replace rotted fascia section (found during prep)", status: "approved",
        lines: [{ id: "L1", kind: "add", description: "Replace 12 lf rotted fascia board, prime and paint to match", sqft: 12, cost: 280, colour: "Extra White SW 7006" }],
        markupPct: 45, taxRatePct: 8.5, taxDate: addDays(nowIso, -0.1), createdAt: addDays(nowIso, -0.1), createdBy: "U-EST", version: 1,
        recipient: "korah.singer@example.com", recipientName: "Korah Singer", recipientVerified: true, signer: "Korah Singer", decidedAt: addDays(nowIso, -0.1),
        ownerApprovedBy: "U-OWNER", ownerApprovedAt: addDays(nowIso, -0.1),
        emergency: { authoriser: "U-OWNER", verbalAt: addDays(nowIso, -0.1), findings: "Fascia above garage door soft for 12 lf; water entering soffit. Cannot prime over it.", photos: 3, customerMessageRef: "Text from Korah Singer: \"Yes, go ahead and replace the fascia\"", amount: 440.51 },
        evidence: { version: 1, signer: "Korah Singer", channel: "verbal", ref: "Text from Korah Singer: \"Yes, go ahead and replace the fascia\"", at: addDays(nowIso, -0.1), recordedBy: "U-EST" },
        appliedAt: addDays(nowIso, -0.1), appliedBy: "U-OFFICE",
        downstream: { work_order: "done", materials: "done", scheduler: "done", billing: "not_started" },
        downstreamMeta: {
          work_order: { at: addDays(nowIso, -0.1), by: "U-EST", ref: "Work order JOB-2026-1-WO revised (approved scope only)" },
          materials: { at: addDays(nowIso, -0.1), by: "U-EST", ref: "Demand revised for +12 sq ft — Materials tab" },
          scheduler: { at: addDays(nowIso, -0.1), by: "U-EST", ref: "Task for the scheduler" },
          billing: { at: addDays(nowIso, -0.1), ref: "Deferred until written confirmation is received" },
        },
      },
      // Child of CO-2026-1-03, drafted while the parent is pending.
      {
        id: "CO-2026-1-05", jobId: "JOB-2026-1", type: "addition", title: "Stain porch floor and steps", status: "draft", parentId: "CO-2026-1-03",
        lines: [{ id: "L1", kind: "add", description: "Porch floor and 4 steps — 2 coats solid deck stain", sqft: 180, cost: 360, colour: "Repose Gray SW 7015" }],
        markupPct: 45, taxRatePct: 8.5, taxDate: d(-2), createdAt: d(-2), createdBy: "U-EST", recipientVerified: false, version: 1,
        downstream: { work_order: "not_started", materials: "not_started", scheduler: "not_started", billing: "not_started" },
      },
      // Sent by email, bounced: flagged to the office, escalated to the owner after two working days.
      {
        id: "CO-2026-2-01", jobId: "JOB-2026-2", type: "addition", title: "Add pantry door and interior shelves", status: "sent",
        lines: [{ id: "L1", kind: "add", description: "Pantry door (2 sides) and 5 interior shelves, match cabinets", sqft: 64, cost: 300, colour: "Pure White SW 7005" }],
        markupPct: 50, taxRatePct: 8.25, taxDate: d(-6), createdAt: d(-6), createdBy: "U-SENIOR", version: 1, submittedAt: d(-6),
        recipient: "sam.sample@exmaple.com", recipientName: "Sam Sample", recipientVerified: true, channel: "email", sentAt: d(-5), linkExpiresAt: d(25),
        links: [{ id: "LNK-9004", version: 1, recipientName: "Sam Sample", recipient: "sam.sample@exmaple.com", channel: "email", sentAt: d(-5), sentBy: "U-OFFICE", expiresAt: d(25), delivery: "undeliverable", deliveryFailedAt: d(-5), deliveryError: "550 No such domain (exmaple.com)" }],
        downstream: { work_order: "not_started", materials: "not_started", scheduler: "not_started", billing: "not_started" },
      },
      // Rejected before work began.
      {
        id: "CO-2026-2-02", jobId: "JOB-2026-2", type: "product_substitution", title: "Two-tone island in Naval SW 6244", status: "rejected",
        lines: [
          { id: "L1", kind: "remove", description: "Island — Pure White SW 7005, Emerald Urethane Satin", sqft: 48, cost: 0, colour: "Pure White SW 7005" },
          { id: "L2", kind: "add", description: "Island — Naval SW 6244, Emerald Urethane Satin (deep base, extra coat)", sqft: 48, cost: 400, colour: "Naval SW 6244" },
        ],
        markupPct: 50, taxRatePct: 8.25, taxDate: d(-16), createdAt: d(-16), createdBy: "U-SENIOR", version: 1,
        recipient: "sam.sample@example.com", recipientName: "Sam Sample", recipientVerified: true, channel: "portal", sentAt: d(-15), linkExpiresAt: d(15), decidedAt: d(-12),
        links: [{ id: "LNK-9005", version: 1, recipientName: "Sam Sample", recipient: "sam.sample@example.com", channel: "portal", sentAt: d(-15), sentBy: "U-OFFICE", expiresAt: d(15), delivery: "delivered" }],
        rejection: { signer: "Sam Sample", reason: "Decided to keep the island white to match the rest.", at: d(-12), by: "U-OFFICE" },
        downstream: { work_order: "not_started", materials: "not_started", scheduler: "not_started", billing: "not_started" },
      },
      // Emergency authorised by the office manager (owner unreachable); written confirmation overdue.
      {
        id: "CO-2026-5-01", jobId: "JOB-2026-5", type: "addition", title: "Repair water-stained dining room ceiling", status: "approved",
        lines: [{ id: "L1", kind: "add", description: "Stain-block and repaint 60 sq ft water-stained ceiling area", sqft: 60, cost: 250, colour: "Ceiling Bright White SW 7007" }],
        markupPct: 45, taxRatePct: 8.25, taxDate: d(-8), createdAt: d(-8), createdBy: "U-EST", version: 1, signer: "Steven Omodth", decidedAt: d(-8),
        recipientVerified: false, ownerApprovedBy: "U-OFFICE", ownerApprovedAt: d(-8),
        emergency: { authoriser: "U-OFFICE", ownerUnreachable: true, verbalAt: d(-8), findings: "Old roof-leak stain bleeding through the first coat. Needs stain-blocking primer before finish.", photos: 2, customerMessageRef: "Email from Steven Omodth: \"OK to fix the stain\"", amount: 392.41 },
        evidence: { version: 1, signer: "Steven Omodth", channel: "verbal", ref: "Email from Steven Omodth: \"OK to fix the stain\"", at: d(-8), recordedBy: "U-EST" },
        appliedAt: d(-8), appliedBy: "U-OFFICE",
        downstream: { work_order: "done", materials: "done", scheduler: "done", billing: "not_started" },
        downstreamMeta: {
          work_order: { at: d(-8), by: "U-EST", ref: "Work order JOB-2026-5-WO revised (approved scope only)" },
          materials: { at: d(-8), by: "U-EST", ref: "Demand revised for +60 sq ft — Materials tab" },
          scheduler: { at: d(-8), by: "U-EST", ref: "Task for the scheduler" },
          billing: { at: d(-8), ref: "Deferred until written confirmation is received" },
        },
      },
      // Approved and billed; customer now refuses to pay for performed work.
      {
        id: "CO-2026-5-02", jobId: "JOB-2026-5", type: "addition", title: "Paint hall closet interior", status: "disputed",
        lines: [{ id: "L1", kind: "add", description: "Hall closet walls, shelf and door interior, 2 coats Agreeable Gray", sqft: 140, cost: 320, colour: "Agreeable Gray SW 7029" }],
        markupPct: 45, taxRatePct: 8.25, taxDate: d(-20), createdAt: d(-20), createdBy: "U-EST", version: 1, submittedAt: d(-20),
        recipient: "steven.omodth@example.com", recipientName: "Steven Omodth", recipientVerified: true, channel: "email", sentAt: d(-19), linkExpiresAt: d(11), signer: "Steven Omodth", decidedAt: d(-18),
        links: [{ id: "LNK-9006", version: 1, recipientName: "Steven Omodth", recipient: "steven.omodth@example.com", channel: "email", sentAt: d(-19), sentBy: "U-OFFICE", expiresAt: d(11), delivery: "delivered" }],
        evidence: { version: 1, signer: "Steven Omodth", channel: "email", ref: "Email reply \"Approved, go ahead\" from steven.omodth@example.com", at: d(-18), recordedBy: "U-OFFICE" },
        dispute: { note: "Customer says the closet was included in the original quote and won't pay the change order.", at: d(-1), by: "U-OFFICE" },
        appliedAt: d(-18), appliedBy: "U-OFFICE",
        downstream: { work_order: "done", materials: "done", scheduler: "done", billing: "done" },
        billing: { mode: "draft_update", docId: "INV-2026-3", amount: 502.28 },
        downstreamMeta: {
          work_order: { at: d(-18), by: "U-OFFICE", ref: "Work order JOB-2026-5-WO revised (approved scope only)" },
          materials: { at: d(-18), by: "U-OFFICE", ref: "Demand revised for +140 sq ft — Materials tab" },
          scheduler: { at: d(-18), by: "U-OFFICE", ref: "Task for the scheduler" },
          billing: { at: d(-18), by: "U-OFFICE", ref: "INV-2026-3 (draft updated in place)" },
        },
      },
    ],

    // Feature 24: TAX_RATES by effective date. The rate changed last week.
    taxRates: [
      { id: "TX-1", region: "Dallas County, TX", ratePct: 8.25, effectiveFrom: ago(6) },
      { id: "TX-2", region: "Dallas County, TX", ratePct: 8.5, effectiveFrom: d(-7) },
    ],

    lifespanLibrary: {
      version: 3, updatedAt: d(-200), updatedBy: "U-OWNER", southWestDeduction: 1, premiumBonus: 1, poorPrepDeduction: 2,
      defaults: [
        { roomType: "bedroom", years: 7 },
        { roomType: "living_room", years: 7 },
        { roomType: "hall_stairs", years: 5 },
        { roomType: "kitchen", years: 5 },
        { roomType: "bathroom", years: 5 },
        { roomType: "exterior_body", years: 7 },
        { roomType: "exterior_trim", years: 5 },
      ],
      surfaceDefaults: [{ surfaceType: "ceiling", years: 10 }],
      productDefaults: [{ manufacturer: "Sherwin-Williams", productLine: "Duration", years: 8 }],
      note: "Ceilings split out from the room default at 10 years. Duration line set to 8 years.",
    },
    lifespanHistory: [
      { version: 1, updatedAt: d(-900), updatedBy: "U-OWNER", southWestDeduction: 1, premiumBonus: 1, poorPrepDeduction: 2, note: "Initial library from the client requirements.",
        defaults: [{ roomType: "bedroom", years: 7 }, { roomType: "living_room", years: 7 }, { roomType: "hall_stairs", years: 5 }, { roomType: "kitchen", years: 5 }, { roomType: "bathroom", years: 5 }, { roomType: "exterior_body", years: 8 }, { roomType: "exterior_trim", years: 5 }] },
      { version: 2, updatedAt: d(-400), updatedBy: "U-OWNER", southWestDeduction: 1, premiumBonus: 1, poorPrepDeduction: 2, note: "Exterior body shortened to 7 years after two early failures.",
        defaults: [{ roomType: "bedroom", years: 7 }, { roomType: "living_room", years: 7 }, { roomType: "hall_stairs", years: 5 }, { roomType: "kitchen", years: 5 }, { roomType: "bathroom", years: 5 }, { roomType: "exterior_body", years: 7 }, { roomType: "exterior_trim", years: 5 }] },
    ],
    recalculations: [],

    // Alerts are seeded here to show each queue state. The nightly run
    // (Service > Run Log > Run now) creates new ones from the applications.
    repaintAlerts: [
      { id: "RA-1001", propertyId: "PROP-1003", createdAt: d(-5), noticeBasis: "interior", outcome: "open", backlog: false,
        earliestDue: addMonths(ago(7, 60), 84), windowEnd: addMonths(addMonths(ago(7, 60), 84), 12),
        surfaces: [
          { surfaceId: "SF-3011", applicationId: "APP-3011", dueDate: addMonths(ago(7, 60), 84), noticeDate: addMonths(ago(7, 60), 81), basis: ["Living room default 7 yrs"], ruleVersion: 3 },
          { surfaceId: "SF-3021", applicationId: "APP-3021", dueDate: addMonths(ago(7, 75), 84), noticeDate: addMonths(ago(7, 75), 81), basis: ["Bedroom default 7 yrs"], ruleVersion: 3 },
        ] },
      { id: "RA-1002", propertyId: "PROP-1005", createdAt: d(-16), noticeBasis: "commercial", outcome: "open", backlog: false, escalatedAt: at(-2, 2, 0), ownerId: "U-OWNER",
        earliestDue: addMonths(ago(7, 150), 84), windowEnd: addMonths(addMonths(ago(7, 150), 84), 12),
        surfaces: [
          { surfaceId: "SF-5021", applicationId: "APP-5021", dueDate: addMonths(ago(7, 150), 84), noticeDate: addMonths(ago(7, 150), 75), basis: ["Living room default 7 yrs"], ruleVersion: 3 },
          { surfaceId: "SF-5011", applicationId: "APP-5011", dueDate: addMonths(ago(5, 200), 60), noticeDate: addMonths(ago(5, 200), 51), basis: ["Halls & stairs default 5 yrs"], ruleVersion: 3 },
        ] },
      { id: "RA-1003", propertyId: "PROP-1004", createdAt: d(-3), noticeBasis: "interior", outcome: "open", backlog: true,
        earliestDue: addMonths(ago(9), 84), windowEnd: addMonths(addMonths(ago(9), 84), 12),
        surfaces: [
          { surfaceId: "SF-4011", applicationId: "APP-4011", dueDate: addMonths(ago(9), 84), noticeDate: addMonths(ago(9), 81), basis: ["Living room default 7 yrs", "Imported overdue record"], ruleVersion: 3 },
        ] },
      { id: "RA-0990", propertyId: "PROP-1007", createdAt: d(-26), noticeBasis: "exterior", outcome: "converted", outcomeAt: d(-20), outcomeBy: "U-OFFICE", backlog: false, ownerId: "U-OFFICE",
        qualification: { decision: "accepted", reason: "Owner confirmed on file; south siding failing early (poor prep recorded).", checks: ["address", "owner", "opportunity"], by: "U-OFFICE", at: d(-20), followUpId: "FU-1001" },
        earliestDue: addMonths(ago(4, 40), 48), windowEnd: addMonths(addMonths(ago(4, 40), 48), 12),
        surfaces: [
          { surfaceId: "SF-7011", applicationId: "APP-7011", dueDate: addMonths(ago(4, 40), 48), noticeDate: addMonths(ago(4, 40), 42), basis: ["Exterior body default 7 yrs", "−1 yr south-facing exposure", "−2 yrs poor preparation"], ruleVersion: 3 },
        ] },
      // Opted-out property: internal alert stays, contact controls are blocked.
      { id: "RA-1004", propertyId: "PROP-1021", createdAt: d(-4), noticeBasis: "exterior", outcome: "open", backlog: false, ownerId: "U-OFFICE",
        earliestDue: addMonths(ago(6, 120), 72), windowEnd: addMonths(addMonths(ago(6, 120), 72), 12),
        surfaces: [ { surfaceId: "SF-21011", applicationId: "APP-21011", dueDate: addMonths(ago(6, 120), 72), noticeDate: addMonths(ago(6, 120), 66), basis: ["Exterior body default 7 yrs", "−1 yr west-facing exposure"], ruleVersion: 3 } ] },
      // Active job at the property: suppressed, shown with its reason.
      { id: "RA-1005", propertyId: "PROP-1002", createdAt: d(-6), noticeBasis: "exterior", outcome: "open", backlog: false, ownerId: "U-OFFICE",
        earliestDue: addMonths(ago(7, 100), 84), windowEnd: addMonths(addMonths(ago(7, 100), 84), 12),
        surfaces: [ { surfaceId: "SF-2021", applicationId: "APP-2021", dueDate: addMonths(ago(7, 100), 84), noticeDate: addMonths(ago(7, 100), 78), basis: ["Exterior body default 7 yrs"], ruleVersion: 3 } ] },
      // Snoozed: customer asked to be called after the holidays.
      { id: "RA-0998", propertyId: "PROP-1022", createdAt: d(-50), noticeBasis: "interior", outcome: "snoozed", outcomeAt: d(-10), outcomeBy: "U-OFFICE", backlog: false, ownerId: "U-OFFICE",
        snoozeUntil: addMonths(d(-10), 3), snoozeReason: "Customer deferred", outcomeReason: "Ruth asked us to call back after the holidays.",
        earliestDue: addMonths(ago(7, 20), 84), windowEnd: addMonths(addMonths(ago(7, 20), 84), 12),
        surfaces: [ { surfaceId: "SF-22011", applicationId: "APP-22011", dueDate: addMonths(ago(7, 20), 84), noticeDate: addMonths(ago(7, 20), 81), basis: ["Living room default 7 yrs"], ruleVersion: 3 } ],
        history: [{ at: d(-10), by: "U-OFFICE", text: "Snoozed 3 months — Customer deferred." }] },
      // Imported overdue backlog (not in the live queue).
      { id: "RA-1007", propertyId: "PROP-1023", createdAt: d(-3), noticeBasis: "exterior", outcome: "open", backlog: true, ownerId: "U-OFFICE",
        earliestDue: addMonths(ago(8), 60), windowEnd: addMonths(addMonths(ago(8), 60), 12),
        surfaces: [
          { surfaceId: "SF-23021", applicationId: "APP-23021", dueDate: addMonths(ago(8), 60), noticeDate: addMonths(ago(8), 57), basis: ["Kitchen default 5 yrs", "Imported record"], ruleVersion: 3 },
          { surfaceId: "SF-23011", applicationId: "APP-23011", dueDate: addMonths(ago(9), 84), noticeDate: addMonths(ago(9), 78), basis: ["Exterior body default 7 yrs", "Imported record"], ruleVersion: 3 },
        ] },
      // Backlog record at a property that already has an open follow-up (FU-1001): skipped in a batch.
      { id: "RA-1008", propertyId: "PROP-1007", createdAt: d(-3), noticeBasis: "exterior", outcome: "open", backlog: true, ownerId: "U-OFFICE",
        earliestDue: addMonths(ago(7), 60), windowEnd: addMonths(addMonths(ago(7), 60), 12),
        surfaces: [ { surfaceId: "SF-7031", applicationId: "APP-7031", dueDate: addMonths(ago(7), 60), noticeDate: addMonths(ago(7), 54), basis: ["Exterior trim default 5 yrs", "Imported record"], ruleVersion: 3 } ] },
      // Converted alerts behind the seeded follow-ups.
      { id: "RA-0994", propertyId: "PROP-1026", createdAt: d(-12), noticeBasis: "interior", outcome: "converted", outcomeAt: d(-8), outcomeBy: "U-OFFICE", backlog: false, ownerId: "U-OFFICE",
        qualification: { decision: "accepted", reason: "Owner confirmed; bedroom walls due next month.", checks: ["address", "owner", "opportunity"], by: "U-OFFICE", at: d(-8), followUpId: "FU-0997" },
        earliestDue: addMonths(ago(7, 40), 84), windowEnd: addMonths(addMonths(ago(7, 40), 84), 12),
        surfaces: [ { surfaceId: "SF-26011", applicationId: "APP-26011", dueDate: addMonths(ago(7, 40), 84), noticeDate: addMonths(ago(7, 40), 81), basis: ["Bedroom default 7 yrs"], ruleVersion: 3 } ] },
      { id: "RA-0985", propertyId: "PROP-1024", createdAt: d(-62), noticeBasis: "exterior", outcome: "converted", outcomeAt: d(-58), outcomeBy: "U-OFFICE", backlog: false, ownerId: "U-OFFICE",
        qualification: { decision: "accepted", reason: "Address and owner confirmed; front siding chalking.", checks: ["address", "owner", "opportunity"], by: "U-OFFICE", at: d(-58), followUpId: "FU-0999" },
        earliestDue: addMonths(ago(7, 90), 84), windowEnd: addMonths(addMonths(ago(7, 90), 84), 12),
        surfaces: [ { surfaceId: "SF-24011", applicationId: "APP-24011", dueDate: addMonths(ago(7, 90), 84), noticeDate: addMonths(ago(7, 90), 78), basis: ["Exterior body default 7 yrs"], ruleVersion: 3 } ] },
      { id: "RA-0975", propertyId: "PROP-1025", createdAt: d(-76), noticeBasis: "exterior", outcome: "converted", outcomeAt: d(-72), outcomeBy: "U-OFFICE", backlog: false, ownerId: "U-OFFICE",
        qualification: { decision: "accepted", reason: "Owner on file; south elevation fading.", checks: ["address", "owner", "opportunity"], by: "U-OFFICE", at: d(-72), followUpId: "FU-0996" },
        earliestDue: addMonths(ago(6, 60), 72), windowEnd: addMonths(addMonths(ago(6, 60), 72), 12),
        surfaces: [ { surfaceId: "SF-25011", applicationId: "APP-25011", dueDate: addMonths(ago(6, 60), 72), noticeDate: addMonths(ago(6, 60), 66), basis: ["Exterior body default 7 yrs", "−1 yr south-facing exposure"], ruleVersion: 3 } ] },
      { id: "RA-0970", propertyId: "PROP-1001", createdAt: d(-150), noticeBasis: "exterior", outcome: "converted", outcomeAt: d(-148), outcomeBy: "U-OFFICE", backlog: false, ownerId: "U-OFFICE",
        qualification: { decision: "accepted", reason: "Long-standing customer; north siding due.", checks: ["address", "owner", "opportunity"], by: "U-OFFICE", at: d(-148), followUpId: "FU-0990" },
        earliestDue: addMonths(ago(7, 30), 84), windowEnd: addMonths(addMonths(ago(7, 30), 84), 12),
        surfaces: [ { surfaceId: "SF-1011", applicationId: "APP-10111", dueDate: addMonths(ago(7, 30), 84), noticeDate: addMonths(ago(7, 30), 78), basis: ["Exterior body default 7 yrs"], ruleVersion: 3 } ] },
    ],

    runLog: [
      { id: "RUN-3", ranAt: at(-1, 2, 0), created: 0, skipped: 3, failed: false, note: "No new surfaces entered a notice window.", catchUpOf: ["RUN-2"], catchUpResult: "Caught up RUN-2: no missed records, no duplicates." },
      { id: "RUN-2", ranAt: at(-2, 2, 0), created: 0, skipped: 0, failed: true, failures: 1, note: "Run failed: database timeout. Caught up by next run.", resolvedAt: at(-1, 8, 15), resolvedBy: "U-OFFICE" },
      { id: "RUN-1", ranAt: at(-5, 2, 0), created: 1, skipped: 2, failed: false, note: "Created RA-1001 (PROP-1003)." },
    ],

    followUps: [
      {
        id: "FU-1001", alertId: "RA-0990", propertyId: "PROP-1007", status: "contacted", qualifiedAt: d(-20), qualifiedBy: "U-OFFICE",
        qualifyReason: "Owner confirmed on file; south siding failing early (poor prep recorded).", assigneeId: "U-EST", assignedAt: d(-19),
        attempts: [
          { id: "AT-1", plannedDay: 1, plannedDate: d(-20), actualAt: d(-19), contactName: "Maria Chen", note: "Interested for spring. Wants a price first.", outcome: "reached", nextActionDate: d(-6), by: "U-EST" },
          { id: "AT-2", plannedDay: 14, plannedDate: d(-7) },
          { id: "AT-3", plannedDay: 35, plannedDate: d(14) },
        ],
        history: [
          { status: "qualified", at: d(-20), by: "U-OFFICE" },
          { status: "assigned", at: d(-19), by: "U-OFFICE", note: "Assigned to Priya Shah (Plano area)" },
          { status: "contacted", at: d(-19), by: "U-EST" },
        ],
      },
      // Qualified, assigned to Marcus, returned to the queue when he went out of office.
      {
        id: "FU-0997", alertId: "RA-0994", propertyId: "PROP-1026", status: "qualified", qualifiedAt: d(-8), qualifiedBy: "U-OFFICE",
        qualifyReason: "Owner confirmed; bedroom walls due next month.", attempts: fuAttempts(d(-8)), returnedAt: d(-1),
        history: [
          { status: "qualified", at: d(-8), by: "U-OFFICE" },
          { status: "assigned", at: d(-7), by: "U-OFFICE", note: "Assigned to Marcus Lee (Dallas area)" },
          { status: "reassigned", at: d(-1), by: "U-OFFICE", note: "Returned to queue: Marcus Lee is out of office. Escalation clocks unchanged." },
        ],
      },
      // Estimate sent and now sold: the drawer prompts a person to close as Won.
      {
        id: "FU-0999", alertId: "RA-0985", propertyId: "PROP-1024", status: "estimate_sent", qualifiedAt: d(-58), qualifiedBy: "U-OFFICE",
        qualifyReason: "Address and owner confirmed; front siding chalking.", assigneeId: "U-EST", assignedAt: d(-57), estimateId: "EST-2026-41",
        quoteRequest: { id: "QRQ-1", at: d(-56), via: "call", by: "U-EST" },
        attempts: fuAttempts(d(-58)).map((a, i) => (i === 0 ? { ...a, actualAt: d(-56), contactName: "Beth Carver", note: "Keen to repaint before spring. Asked for a quote.", outcome: "wants_quote" as const, nextActionDate: d(-45), by: "U-EST", channel: "call" as const } : a)),
        history: [
          { status: "qualified", at: d(-58), by: "U-OFFICE" },
          { status: "assigned", at: d(-57), by: "U-OFFICE", note: "Assigned to Priya Shah" },
          { status: "estimate_requested", at: d(-56), by: "U-EST", note: "Quote requested by call (QRQ-1)" },
          { status: "estimate_sent", at: d(-40), by: "U-EST", note: "EST-2026-41 issued" },
        ],
      },
      // Three unanswered attempts: recycled to next season.
      {
        id: "FU-0996", alertId: "RA-0975", propertyId: "PROP-1025", status: "deferred", qualifiedAt: d(-72), qualifiedBy: "U-OFFICE",
        qualifyReason: "Owner on file; south elevation fading.", assigneeId: "U-EST", assignedAt: d(-72), recycleDate: recycleDate(d(-72), ["exterior"]),
        closedAt: fuAttempts(d(-72))[2].plannedDate, closedReason: "No response after three attempts — recycled for next season",
        attempts: fuAttempts(d(-72)).map((a, i) => ({ ...a, actualAt: a.plannedDate, contactName: "Dev Mehta", channel: "call" as const, by: "U-EST",
          outcome: (["no_answer", "left_message", "no_answer"] as const)[i], note: ["No answer.", "Voicemail left with callback number.", "No answer."][i], nextActionDate: fuAttempts(d(-72))[Math.min(i + 1, 2)].plannedDate })),
        history: [
          { status: "qualified", at: d(-72), by: "U-OFFICE" },
          { status: "assigned", at: d(-72), by: "U-OFFICE", note: "Assigned to Priya Shah" },
          { status: "deferred", at: fuAttempts(d(-72))[2].plannedDate, by: "U-EST", note: "Recycled after three attempts" },
        ],
      },
      // Won: contract signed. Dollars won = original contract value, excluding tax and later change orders.
      {
        id: "FU-0990", alertId: "RA-0970", propertyId: "PROP-1001", status: "won", qualifiedAt: d(-148), qualifiedBy: "U-OFFICE",
        qualifyReason: "Long-standing customer; north siding due.", assigneeId: "U-EST", assignedAt: d(-147), estimateId: "EST-2026-1",
        quoteRequest: { id: "QRQ-0", at: d(-147), via: "call", by: "U-EST" }, wonValue: 12480, wonSignedAt: d(-100), closedAt: d(-99), closedReason: "Contract signed",
        attempts: fuAttempts(d(-148)).map((a, i) => (i === 0 ? { ...a, actualAt: d(-147), contactName: "Korah Singer", note: "Wants the full exterior done this year.", outcome: "wants_quote" as const, nextActionDate: d(-130), by: "U-EST", channel: "call" as const } : a)),
        history: [
          { status: "qualified", at: d(-148), by: "U-OFFICE" },
          { status: "assigned", at: d(-147), by: "U-OFFICE", note: "Assigned to Priya Shah" },
          { status: "estimate_requested", at: d(-147), by: "U-EST" },
          { status: "estimate_sent", at: d(-120), by: "U-EST" },
          { status: "won", at: d(-99), by: "U-OFFICE", note: "Closed as Won. Linked estimate EST-2026-1" },
        ],
      },
    ],

    // Feature 28. REP-2026-1: Maria Chen's exterior repeat estimate, drafted
    // from JOB-2022-18. No site visit yet, so Issue Quote is blocked. Its
    // SuperPaint lines use a discontinued product that needs a replacement.
    repeatEstimates: [
      {
        id: "REP-2026-1", propertyId: "PROP-1007", status: "draft", createdAt: d(-3), createdBy: "U-EST", updatedAt: d(-1), title: "Exterior Repaint — from JOB-2022-18",
        ownershipPeriodId: "OWN-1007-1", useHistoricalProductivity: false, clauseIncluded: false,
        lines: [
          { id: "REP-2026-1-L1", surfaceId: "SF-7011", sourceJobId: "JOB-2022-18", sourceApplicationId: "APP-7011", sqft: 760, colourLabel: "Tricorn Black SW 6258", colourNumber: "SW 6258", hex: "#2F2F30", manufacturer: "Sherwin-Williams", productLine: "SuperPaint", product: "SuperPaint Exterior", sheen: "Satin", coats: 2, unverified: false, newQtyGal: 5, prep: "extra_scrape", reconfirmed: false },
          { id: "REP-2026-1-L2", surfaceId: "SF-7021", sourceJobId: "JOB-2022-18", sourceApplicationId: "APP-7021", sqft: 240, colourLabel: "Extra White SW 7006", colourNumber: "SW 7006", hex: "#EEEFEA", manufacturer: "Sherwin-Williams", productLine: "SuperPaint", product: "SuperPaint Exterior", sheen: "Semi-Gloss", coats: 2, unverified: false, reconfirmed: false },
        ],
      },
    ],
    touchUpReorders: [
      // Approved, waiting to be filled: shows the "pending reorder" warning on PROP-1003.
      { id: "TUR-2026-1", propertyId: "PROP-1003", applicationId: "APP-3051", purpose: "touch_up", requestedGal: 1, packs: [{ size: "gal", count: 1 }], gallons: 1, excessGal: 0,
        payment: "prepaid_cleared", paymentMethod: "Card (Stripe)", paymentSource: "Stripe payment cleared, receipt ch_3Q8…41 (office verified)", supply: "new_order",
        status: "approved", createdAt: d(-2), createdBy: "U-OFFICE", approvedBy: "U-OFFICE", approvedAt: d(-2), note: "South siding touch-up after hail. Customer applying herself." },
      // Fulfilled on account: paint sale only, no application history created.
      { id: "TUR-2026-2", propertyId: "PROP-1007", applicationId: "APP-7021", purpose: "touch_up", requestedGal: 0.25, packs: [{ size: "gal", count: 1 }], gallons: 1, excessGal: 0.75,
        payment: "on_account", paymentSource: "Grace Kim (Bookkeeper) receivables report — account current, no balance over 30 days", supply: "new_order",
        status: "fulfilled", createdAt: d(-24), createdBy: "U-OFFICE", approvedBy: "U-OFFICE", approvedAt: d(-24), fulfilledAt: d(-21) },
      // Cancelled prepaid order: refund due within five working days.
      { id: "TUR-2026-3", propertyId: "PROP-1004", applicationId: "APP-4011", purpose: "touch_up", requestedGal: 1, packs: [{ size: "gal", count: 1 }], gallons: 1, excessGal: 0,
        payment: "prepaid_cleared", paymentMethod: "Check #2231", paymentSource: "Check deposited and cleared (bank feed)", supply: "new_order",
        status: "cancelled", cancelReason: "unfillable", cancelledAt: d(-2), refundDueAt: addWorkingDays(d(-2), 5),
        createdAt: d(-6), createdBy: "U-OFFICE", approvedBy: "U-OFFICE", approvedAt: d(-6), note: "Store could not match the imported colour record." },
    ],
    productivityPolicies: [
      { id: "PP-1", propertyType: "commercial", approvedBy: "U-OWNER", approvedAt: d(-150), note: "Commercial repaints: crew rates are consistent across visits." },
    ],
    historicalJobs: [
      { id: "JOB-2019-14", propertyId: "PROP-1003", name: "Interior Repaint — Living & Primary Bedroom", completedAt: ago(7, 60), linePrices: { "SF-3011": 1180, "SF-3012": 520, "SF-3013": 410, "SF-3021": 960 }, discountPct: 5, discountNote: "Repeat-customer loyalty discount" },
      { id: "JOB-2021-33", propertyId: "PROP-1003", name: "Kitchen & Hall Repaint", completedAt: ago(5, 120), linePrices: { "SF-3031": 740, "SF-3041": 890 } },
      { id: "JOB-2023-21", propertyId: "PROP-1003", name: "Exterior Repaint — New Siding & Trim", completedAt: ago(3, -10), linePrices: { "SF-3051": 2650, "SF-3061": 980 }, discountPct: 10, discountNote: "Spring booking promotion" },
      { id: "JOB-2018-07", propertyId: "PROP-1003", name: "Exterior Repaint (cedar siding)", completedAt: ago(8), linePrices: { "SF-3052": 2100 } },
      { id: "JOB-2022-18", propertyId: "PROP-1007", name: "Exterior Repaint", completedAt: ago(4, 40), linePrices: { "SF-7011": 2280, "SF-7021": 760 } },
      { id: "JOB-2021-40", propertyId: "PROP-1005", name: "Lobby & Conference Repaint", completedAt: ago(5, 200), linePrices: { "SF-5011": 3900, "SF-5021": 1850 } },
      { id: "JOB-2020-11", propertyId: "PROP-1006", name: "Living Room Repaint", completedAt: ago(6), linePrices: { "SF-6011": 1150 } },
    ],

    activity: [
      { id: "ACT-1", at: d(-1), userId: "U-EST", module: "Change Orders", message: "Change order CO-2026-1-02 drafted for JOB-2026-1 (credit)." },
      { id: "ACT-2", at: d(-1), userId: "U-OFFICE", module: "QR Record", message: "Touch-up request TU-1 received from PROP-1003 link." },
      { id: "ACT-3", at: d(-2), userId: "U-OFFICE", module: "Supplier Orders", message: "Purchase Order JOB-2026-2-PO-01 phoned in to branch 7248." },
      { id: "ACT-4", at: d(-5), userId: "U-EST", module: "Colour Card", message: "Colour Card: Job JOB-2026-1 – Custom sample \"Round 2\" recorded, delivered by Priya Shah." },
    ],

    notifications: [],

    tasks: [
      { id: "T-1", title: "Call SW 7132 about backordered Repose Gray", done: false, createdAt: d(-1) },
      { id: "T-2", title: "Verify Steven Omodth's email", done: false, createdAt: d(-3) },
    ],

    counters: {
      colour: 7, spec: 8, sample: 2, approval: 3, flag: 0, adj: 0, co: 2, app: 0, corr: 1, qr: 3, tu: 1,
      alert: 1008, run: 3, fu: 1001, sch: 0, ext: 1, rcl: 0, qrq: 1, batch: 0, cust: 0, rep: 1, tur: 3, act: 4, task: 2, event: 0, invoice: 3, lead: 5, estimate: 9, attempt: 60,
      ...wfCounters,
      ...finCounters,
    },
  };

  // Feature 18: the last accepted calculation matches today's figures.
  db.materialCalcs = ["JOB-2026-1", "JOB-2026-2", "JOB-2026-5"].map((jobId) => ({
    jobId, calculatedAt: d(-8), calculatedBy: "U-EST", lines: snapshotLines(jobDemand(db, jobId)),
  }));

  // Feature 27: stored schedules, one per surface clock, plus a pending inspection extension.
  db.repaintSchedules = buildSchedules(db, nowIso);
  db.counters.sch = db.repaintSchedules.length;
  const pending = db.repaintSchedules.find((x) => x.applicationId === "APP-3021");
  if (pending) {
    pending.extension = {
      id: "EXT-1", proposedDate: addMonths(pending.dueDate, 12), reason: "Walls inspected: no fading or cracking, low-traffic guest room.", photoId: "PH-3021-01",
      photoName: "bedroom-walls.jpg", photoDate: d(-2), proposedBy: "U-EST", proposedAt: d(-2), status: "pending",
    };
  }
  // Feature 21: reasons, a correction waiting for the owner, a saved filter and issued snapshots.
  const example = (s: string) => db.completedJobs.find((j) => j.name.includes(s))!;
  db.varianceReasons = [
    { jobId: example("40 → 50").id, code: "Hidden damage or rot", note: "Rotted sill under the family-room window found during prep.", by: "U-EST", at: d(-2) },
    { jobId: example("+10.1%").id, code: "Rework", note: "Second coat redone after a roller-mark complaint.", by: "U-OFFICE", at: d(-1) },
  ];
  db.performanceCorrections = [{
    id: "PCR-1", jobId: example("(under budget)").id, field: "material", oldValue: 2810, newValue: 2870, code: "Customer change",
    note: "Late supplier invoice for extra primer found after close.", requestedBy: "U-OFFICE", requestedAt: d(-1), requires: ["office_manager", "owner"],
    approvals: [{ role: "office_manager", by: "U-OFFICE", at: d(-1) }], status: "pending",
  }];
  db.savedFilters = [{ id: "SF-1", userId: "U-OWNER", name: "Exterior jobs, last 90 days", preset: "last_90", ...presetRange("last_90", nowIso), dimension: "kind", baseline: "revised", measure: "cost", createdRole: "owner" }];
  const monday = weekStartOf(localDay(new Date(nowIso)));
  const weeklyAt = new Date(`${monday}T07:00:00`) <= new Date(nowIso) ? new Date(`${monday}T07:00:00`).toISOString() : new Date(`${addDaysToDay(monday, -7)}T07:00:00`).toISOString();
  const weeklyMonday = localDay(new Date(weeklyAt));
  const lastMonth = presetRange("last_month", nowIso);
  const n = new Date(nowIso);
  const archivedFrom = localDay(new Date(n.getFullYear(), n.getMonth() - 4, 1));
  const archivedTo = localDay(new Date(n.getFullYear(), n.getMonth() - 3, 0));
  const snap = (id: string, kind: "manual" | "weekly", issuedAt: string, range: { from: string; to: string }, extra: Partial<PerformanceSnapshot> = {}): PerformanceSnapshot => ({
    id, issuedAt, issuedBy: kind === "weekly" ? "U-OWNER" : "U-OFFICE", kind, period: range, dimension: "job", baseline: "revised", measure: "cost",
    timezone: db.payrollSettings.timezone, rows: buildRows(db, jobPerformance(db, range), "job", "cost"),
    recipients: kind === "weekly" ? ["tim@estimatemaster.app", "dana@estimatemaster.app", "marcus@estimatemaster.app"] : undefined, ...extra,
  });
  db.performanceSnapshots = [
    snap("SNAP-3", "weekly", weeklyAt, { from: addDaysToDay(weeklyMonday, -7), to: addDaysToDay(weeklyMonday, -1) }),
    snap("SNAP-2", "manual", new Date(`${localDay(new Date(n.getFullYear(), n.getMonth(), 1))}T09:00:00`).toISOString(), lastMonth),
    snap("SNAP-1", "manual", d(-118), { from: archivedFrom, to: archivedTo }, { archivedAt: d(-28) }),
  ];
  Object.assign(db.counters, { snap: 3, pcr: 1, sf: 1 });

  // Feature 30: rate records, the estimating manager's exclusion and earlier decisions.
  const feedback = feedbackSeed(db.completedJobs, nowIso);
  db.rateRecords = feedback.rateRecords;
  db.rateDecisions = feedback.rateDecisions;
  db.evidenceExclusions = feedback.evidenceExclusions;
  Object.assign(db.counters, feedback.counters);

  // Feature 34: job media and releases, a month of posts, the test accounts and website leads.
  const marketing = marketingSeed(nowIso);
  db.mediaAssets = marketing.mediaAssets;
  db.marketingPosts = marketing.marketingPosts;
  db.socialAccounts = marketing.socialAccounts;
  db.customers.push(...marketing.customers);
  db.leads.unshift(...marketing.leads);
  Object.assign(db.counters, marketing.counters);

  // Live host screens: work orders, estimate history, one lead per estimate.
  hostSeed(db, nowIso);
  return db;
}
