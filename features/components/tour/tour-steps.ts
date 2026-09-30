/**
 * Product tour script.
 *
 * One stop per screen, in the order of a job's paint lifecycle: sell it, buy
 * the paint, change the contract, close it out, hand the record to the
 * customer, and win the repaint years later. Phase 2 then follows the back
 * office: the crew's hours, the money, estimated versus actual, what that
 * teaches the estimating rates, and the marketing that brings the next lead.
 * Every stop opens a seeded record that already shows its scenario (see
 * data/seed.ts).
 *
 * A step's `target` names a `data-tour="..."` anchor on the page. If the
 * anchor isn't rendered (another role, or the data has changed), the callout
 * shows centred instead of pointing at nothing.
 */
import type { Role } from "@/features/types";

export interface TourStep {
  target?: string;
  title: string;
  body: string;
  bullets?: string[];
  /** A concrete thing to click, shown as "Try it". */
  tryIt?: string;
  /** Role that shows this step best. The callout offers a switch button. */
  role?: Role;
  /** One-click setup offered on the step. */
  action?: "pin_clock";
}

export interface TourStop {
  id: string;
  /** Feature number from the design document, when the stop covers one. */
  feature?: string;
  title: string;
  href: string;
  /** Default role for the stop's steps. */
  role?: Role;
  steps: TourStep[];
}

export const TOUR: TourStop[] = [
  {
    id: "welcome",
    title: "Welcome",
    href: "/dashboard",
    steps: [
      {
        target: "walkthrough",
        title: "Fourteen new features, one job's story",
        body: "This tour follows a job's paint lifecycle: sell it, buy the paint, change the contract, close it out, hand the record to the customer, and win the repaint years later. Then it follows the back office: hours and payroll, finance, estimated versus actual, estimating feedback and marketing. Each stop opens a demo record that already shows the scenario.",
        tryIt: "You can click around the page at any point. Use Next when you're ready to move on.",
      },
      {
        target: "rail-new",
        title: "New sections",
        body: "Procurement, Properties, Service, Finance and Marketing are new in this prototype, and Workforce and Reports now work (all marked with a green dot). Jobs also gets four new tabs: Color Card, Materials, Change Orders and Closeout. Finance is hidden from estimators; Marketing is for the office and the owner.",
      },
      {
        target: "demo-bar",
        title: "Prototype controls",
        body: "This bar is for the demo only.",
        bullets: [
          "Viewing as: many access rules only show when you switch roles. When a step needs a different role, the tour offers a button.",
          "Clock: pin it to 10:30 a.m. on a weekday so the supplier acknowledgment clock and the 8 a.m.–7 p.m. contact window behave the same at any hour.",
          "Reset demo data: brings the clean story back if you've changed things along the way.",
        ],
        action: "pin_clock",
      },
    ],
  },
  {
    id: "color-card",
    feature: "3",
    title: "Color card",
    href: "/estimates/EST-2026-1",
    role: "office_manager",
    steps: [
      {
        target: "stat-strip",
        title: "Approval is tracked per specification",
        body: "This contract is signed, but not every color is settled. Approval progress counts specifications, not colors. 'Blocked from ordering' counts lines that can't be bought yet.",
      },
      {
        target: "spec-SPEC-2",
        title: "Approved, but not orderable",
        body: "The trim is approved for application, but its product line, product and tint base are blank. A line becomes orderable only when it's approved and all three ordering fields are filled.",
        tryIt: "Hover 'Not orderable' to see the missing fields.",
      },
      {
        target: "spec-SPEC-3",
        title: "A blank primer blocks approval",
        body: "Primer and coat sequence need a deliberate value. 'No primer, existing coating sound' is valid. A blank is not.",
        tryIt: "Open this row's menu › Edit, set Primer to 'No primer, existing coating sound', save, then Send for approval.",
      },
      {
        target: "sample-panel",
        title: "Custom color match",
        body: "The door red is a custom match, so it stays in Pending sample until a round is accepted. Round 1 was rejected ('too orange next to the brick') and is kept permanently.",
        tryIt: "Record the outcome of round 2.",
      },
      {
        target: "approval-panel",
        title: "What the customer approved",
        body: "Each approval stores the exact card version, the specifications sent, the channel, the timestamp and the sender address. A new card version never inherits the signature, and verbal approval isn't offered.",
      },
      {
        target: "page-actions",
        title: "Outputs for the crew and the customer",
        body: "The crew card is grouped by room and shows the coat sequence. The customer card shows swatch, name, sheen and location only, with no lifespan or data sheets. Unapproved lines print with a Draft watermark.",
      },
    ],
  },
  {
    id: "materials",
    feature: "18",
    title: "Materials and orders",
    href: "/work-orders/WO-2026-1",
    role: "office_manager",
    steps: [
      {
        target: "stat-strip",
        title: "The inputs behind the number",
        body: "The strip names the coverage source in use (project override, then field rate, then manufacturer rate) and the waste allowance. Only the highest matching allowance applies (5, 10 or 15 percent); allowances are never added together.",
      },
      {
        target: "demand-table",
        title: "Coverage, then waste, then packing",
        body: "Each line runs in that order at full precision. Only the adjusted need is rounded, once, to three decimals, then packed into the containers the office has marked available. Required volume, packs and excess are shown separately.",
        tryIt: "Expand a line to see measured area, coats and deductions.",
      },
      {
        target: "materials-approvals",
        title: "Waiting for the office",
        body: "Estimators approve demand and request submission. Priya's top-up request for the west elevation is waiting here for the office manager or owner to generate the priced order.",
      },
      {
        target: "quantity-panel",
        title: "One formula for every balance",
        body: "Outstanding demand = calculated demand − reserved shelf stock − net acknowledged quantity. 'Orderable now' also subtracts quantities sent but not yet acknowledged, so nothing already on its way is ordered twice.",
      },
      {
        target: "shelf-panel",
        title: "Leftover shelf stock",
        body: "Stock is proposed only when product, color and sheen match, and it's sealed and under two years old. An unconfirmed proposal doesn't reduce the purchase need. The 5-gallon Repose Gray is reserved to another job, so it shows as unavailable here.",
      },
      {
        target: "demand-table",
        role: "estimator",
        title: "Estimators never see prices",
        body: "As an Estimator, every unit price, discount and order total is removed from the screen and from the CSV export. They're absent, not masked. The limit check still shows pass or fail.",
      },
    ],
  },
  {
    id: "procurement",
    feature: "19",
    title: "Supplier orders",
    href: "/supplier-orders",
    role: "office_manager",
    steps: [
      {
        target: "stat-strip",
        title: "Where every order stands",
        body: "Sent isn't the same as acknowledged. The strip counts orders waiting to be sent, waiting for acknowledgment, overdue past four working hours, and partly filled.",
      },
      {
        target: "po-board",
        title: "Three orders worth opening",
        body: "Each seeded order shows a different part of the process.",
        bullets: [
          "JOB-2026-5-PO-01 was emailed this morning. Its acknowledgment clock counts branch working hours only (Monday to Friday, 7 a.m. to 4 p.m.).",
          "JOB-2026-5-PO-02 is generated but not sent. The buyer must confirm the branch and destination first.",
          "JOB-2026-1-PO-01 is partly filled. The supplier's status text is kept word for word for a person to review.",
        ],
        tryIt: "Open PO-02 and try to mark it Sent without evidence. It's blocked until the channel's evidence is recorded.",
      },
      {
        target: "pill-tabs",
        title: "Exceptions are owned by a person",
        body: "The Exception list shows orders past four working hours, who owns the branch call, and the escalation step (sender, then office manager, then owner). Nothing is retried automatically, and opening an exception doesn't clear it.",
      },
      {
        target: "subnav",
        title: "Branch setup and product mapping",
        body: "Under Suppliers and Branches, the Benjamin Moore Richardson branch has no store number, so it can't receive orders. Product Mapping links products and pack sizes to store item codes.",
      },
      {
        target: "page-actions",
        role: "crew_lead",
        title: "Crew leads can't submit orders",
        body: "As a Crew Lead, New Submission disappears. Crew leads can still record receipts and line status.",
      },
    ],
  },
  {
    id: "change-orders",
    feature: "24",
    title: "Change orders",
    href: "/estimates/EST-2026-1",
    role: "office_manager",
    steps: [
      {
        target: "stat-strip",
        title: "The contract, before and after",
        body: "Original contract, approved net changes, the revised total and the cumulative change. When signed net changes (including proposed ones) pass 25 percent of the original contract, a deposit review is triggered.",
      },
      {
        target: "deposit-banner",
        title: "Deposit review",
        body: "The revised deposit target is one-third of the new contract total, less deposits already collected. It needs the owner's approval and the customer's signature.",
      },
      {
        target: "co-list",
        title: "One change order per rule",
        body: "Each seeded change order shows a different rule.",
        bullets: [
          "Sent and awaiting signature: the version 1 link was superseded when version 2 was sent.",
          "Emergency under $500: verbal approval this morning, written confirmation due in two working days.",
          "Emergency overdue: work on that change has stopped and the owner has been escalated.",
          "Child change order: drafted while its parent is pending, so it can't be sent.",
          "Bounced email, rejected before work, and disputed after work are all separate states.",
        ],
        tryIt: "Open the child change order and try to send it. It's blocked until its parent is resolved.",
      },
      {
        target: "page-actions",
        title: "Pricing and the daily exception list",
        body: "New Change Order prices only the difference from the last approved scope, at the original markup and the tax rate on the change-order date. Owner approval is needed for gross additions over $2,000 and for every credit. The Exception List shows failed downstream updates, and only the failed action can be retried.",
      },
    ],
  },
  {
    id: "closeout",
    feature: "25",
    title: "Closeout",
    href: "/work-orders/WO-2026-5",
    role: "office_manager",
    steps: [
      {
        target: "closeout-status",
        title: "Why this job can't close yet",
        body: "Color, sheen and completion date are required for every painted surface. The ceiling isn't confirmed and the baseboard has no sheen. Missing hours or gallons never block closeout; they show as Not recorded.",
      },
      {
        target: "closeout-checklist",
        title: "The crew confirms what was applied",
        body: "Every surface in the approved scope is listed, so nothing is silently skipped. Confirmed values are copied into the application record with the crew lead's name.",
        tryIt: "Confirm the ceiling, then edit the baseboard and set its sheen.",
      },
      {
        target: "page-actions",
        title: "Close the job",
        body: "Once every surface is complete, the office manager or owner presses Close job, which writes the applications into the property record. The success banner links straight to it.",
        tryIt: "Press Close job before fixing the surfaces to see the blocked message name them.",
      },
    ],
  },
  {
    id: "property-record",
    feature: "25",
    title: "Property paint record",
    href: "/contacts/C-ELENA?tab=paint-history",
    role: "office_manager",
    steps: [
      {
        target: "property-header",
        title: "History belongs to the property",
        body: "A stable identifier sits behind the address, so fixing an address typo never detaches earlier jobs. PROP-1008 ('420 Cedar Hollow Lane') is a possible duplicate of this property; a merge needs the owner's individual approval.",
      },
      {
        target: "surface-tree",
        title: "Every painted surface has a place",
        body: "Property, then room or elevation, then surface. The old siding is marked Removed (struck through) with its date. Its replacement is a new surface record, and the old applications stay openable.",
      },
      {
        target: "app-timeline",
        title: "Confirmed versus unverified",
        body: "Applications appear newest first with the crew lead who confirmed them. Work the customer reported from another contractor is labelled Unverified with its source, and kept separate.",
        tryIt: "Pick an exterior surface in the tree to see both kinds.",
      },
      {
        target: "gaps",
        title: "Gaps are labelled, never guessed",
        body: "Unknown values (owner-approved, for legacy or subcontractor work) and Not recorded actuals are listed here. Corrections after close, alongside, keep the old and new values, the author and the reason.",
      },
      {
        target: "subnav",
        title: "Ownership, QR links and more",
        body: "Ownership holds sale history and seller consent. For an example, PROP-1006 shows an unreachable-seller determination that stays blocked after only two contact attempts. QR Links is the next stop.",
      },
    ],
  },
  {
    id: "qr",
    feature: "26",
    title: "Customer QR record",
    href: "/contacts/C-ELENA?tab=paint-history&view=qr",
    role: "office_manager",
    steps: [
      {
        target: "qr-current",
        title: "One link per ownership period",
        body: "There's no login: anyone holding the link can read it, so it only shows safe fields (no prices, costs or paint life). The reference is random and isn't derived from the address.",
        tryIt: "Press Open customer page to see what the customer sees, including the touch-up request form.",
      },
      {
        target: "page-actions",
        title: "Print, send and revoke",
        body: "Two print formats: a 3.5 × 2 in business card and a 2 × 2 in sticker. Sending needs a verified contact. Revoking is instant: the old code then shows 'Record has moved' and the phone number, with no history.",
      },
      {
        target: "qr-history",
        title: "What an old code shows",
        body: "Revoked links stay listed with their reason. Use 'See what the old code shows' to confirm a sold property's card no longer shows the new owner's work.",
      },
      {
        target: "touchup-panel",
        title: "Touch-up requests",
        body: "Requests from the public page arrive here and in the office inbox. Their acknowledgment is the only customer message the system sends automatically.",
      },
      {
        target: "page-actions",
        role: "estimator",
        title: "Estimators can't revoke",
        body: "As an Estimator, you can still generate, send and print, but Revoke, Regenerate and Replace disappear.",
      },
    ],
  },
  {
    id: "alerts",
    feature: "27",
    title: "Repaint alerts",
    href: "/repaint-alerts",
    role: "office_manager",
    steps: [
      {
        target: "stat-strip",
        title: "An internal queue, not a mailer",
        body: "Alerts are for staff only; no alert ever emails a customer. The strip shows open alerts, escalated ones (14 days with no recorded outcome), snoozed ones, the imported backlog and the last nightly run.",
      },
      {
        target: "pill-tabs",
        title: "Each queue state has an example",
        body: "Switch between the tabs to see each state.",
        bullets: [
          "Suppressed: a property with an active job shows its reason instead of disappearing.",
          "Opted out: the internal alert stays, but contact is blocked.",
          "Snoozed: the customer asked to be called after the holidays.",
          "Backlog: imported overdue records, qualified in batches of up to 25.",
        ],
      },
      {
        target: "alerts-table",
        title: "One opportunity per property",
        body: "Surfaces due within 12 months of the earliest due date are grouped into one alert, so the customer isn't contacted once per surface.",
        tryIt: "Open an alert to see each surface's due date and how it was worked out (interval, adjustments and rule version).",
      },
      {
        target: "page-actions",
        title: "Run log and lifespan library",
        body: "Run now starts the nightly job by hand. Run it twice and you'll see no duplicate alerts. The Lifespan Library holds the default intervals, and only the owner can change them.",
      },
    ],
  },
  {
    id: "follow-ups",
    feature: "29",
    title: "Follow-ups",
    href: "/repaint-alerts/follow-ups",
    role: "office_manager",
    steps: [
      {
        target: "stat-strip",
        title: "From alert to conversation",
        body: "An alert never starts contact on its own. The office qualifies it with a reason, then assigns the area estimator. Three clocks make lateness visible: 3 days unassigned, 7 days assigned with no outcome, 14 days unqualified.",
      },
      {
        target: "pill-tabs",
        title: "Qualify first",
        body: "Unqualified alerts wait at the gate, each with a countdown to owner escalation.",
        tryIt: "Open Unqualified and qualify an alert with a reason.",
      },
      {
        target: "followups-table",
        title: "Conversations already in progress",
        body: "The seeded follow-ups each show a rule.",
        bullets: [
          "FU-0999: its estimate has sold. The drawer prompts a person to close it as Won; it never closes itself.",
          "One follow-up went back to the queue when Marcus went out of office. No clock was reset.",
          "One was recycled after three unanswered attempts (days 1, 14 and 35) and waits for next season.",
        ],
        tryIt: "Open a follow-up and try to log a call. Before 8 a.m., after 7 p.m., on Sundays and on holidays it's blocked.",
      },
      {
        target: "team-availability",
        title: "Absence hands work back",
        body: "Marking an estimator out of office returns their open follow-ups to the queue at once. No clock is paused or reset.",
      },
      {
        target: "page-actions",
        title: "Monthly measures",
        body: "Contacts count real conversations only; unsuccessful calls count as attempts. Dollars won is the signed contract value, excluding tax and later change orders, counted in the month it was signed.",
      },
    ],
  },
  {
    id: "estimate-history",
    feature: "28",
    title: "Estimate from history",
    href: "/contacts/C-ELENA?tab=paint-history",
    role: "office_manager",
    steps: [
      {
        target: "paint-history-tab",
        title: "Check before quoting",
        body: "Every surface painted at this address, with its color, product and date. When the address already has an open repaint estimate or a touch-up reorder waiting to be filled, the builder warns you and links to it, so a competing record can't be created without you knowing.",
      },
      {
        target: "new-estimate-from-history",
        title: "You choose the surfaces",
        body: "Nothing is preselected, and there's no 'select all latest'. Removed surfaces are shown but can't be picked. Each copied line keeps its source job and application.",
        tryIt: "Press New Estimate from History, tick a couple of surfaces and press Next: lead.",
      },
    ],
  },
  {
    id: "repeat-builder",
    feature: "28",
    title: "Repeat quote builder",
    href: "/estimates/EST-2026-10",
    role: "office_manager",
    steps: [
      {
        target: "stat-strip",
        title: "Maria Chen's exterior requote",
        body: "Copied from JOB-2022-18. This strip tracks the reconfirmed lines, the inspection gate, the quote total at today's prices and the 30-day validity.",
      },
      {
        target: "copied-lines",
        title: "Every line is rechecked",
        body: "Quantity, preparation, current condition and price must each be reconfirmed. Prior usage is shown for reference only and never fills the new quantity. The SuperPaint lines use a discontinued product; propose its published successor as the replacement.",
      },
      {
        target: "inspection-panel",
        title: "No quote without an inspection",
        body: "Exterior work needs a saved site visit with a measurement date and at least one photo. A small interior (one room, or up to 400 sq ft) can use photos plus a phone call instead.",
      },
      {
        target: "page-actions",
        title: "Issue Quote is blocked",
        body: "Hover Issue Quote to see why. Comparison View shows the difference from the old job for staff only; the customer never sees it.",
        tryIt: "Record an inspection, reconfirm the lines and include the clause, then issue the quote.",
      },
    ],
  },
  {
    id: "reorders",
    feature: "28",
    title: "Touch-up reorders",
    href: "/contacts/C-ELENA?tab=paint-history&view=reorders",
    role: "office_manager",
    steps: [
      {
        target: "stat-strip",
        title: "A paint sale isn't painting work",
        body: "A touch-up reorder is up to two gallons and needs cleared prepayment or On account status. It never creates an application or resets the repaint clock.",
      },
      {
        target: "reorders-list",
        title: "Reorder states",
        body: "This property's reorder is approved and waiting to be filled. It's the one the estimate builder warned about.",
        bullets: [
          "PROP-1007 has one fulfilled on account.",
          "PROP-1004 has a cancelled prepaid order, with a refund to the original payment method due within five working days.",
        ],
      },
    ],
  },

  /* ------------------------------ Phase 2 ------------------------------ */
  {
    id: "timesheets",
    feature: "22",
    title: "Hours and approval",
    href: "/time",
    role: "office_manager",
    steps: [
      {
        target: "timesheet-grid",
        title: "Last week, waiting for review",
        body: "Hours arrive by job and activity from the crew's phones. Last week's entries each show a rule.",
        bullets: [
          "Overtime over 40 hours, and travel between two jobs on one day.",
          "A rained-out morning booked to overhead, and a no-lunch flag waiting for the office.",
          "An open dispute, an unattested day and missing Monday time.",
          "An offline punch that conflicts with an online one. It blocks approval until the crew lead picks the right record.",
        ],
        tryIt: "Open an entry to see its segments, daily rounding and flags.",
      },
      {
        target: "subnav",
        title: "The rest of Workforce",
        body: "Mobile Clock is the crew's phone screen. Export Batches builds the Gusto CSV from approved hours only. Labor Cost is where the bookkeeper enters each pay period's cost, which is split across jobs by approved hours. Mileage and Employees complete the set.",
      },
    ],
  },
  {
    id: "clock",
    feature: "22",
    title: "Crew clock",
    href: "/time/clock",
    role: "crew_lead",
    steps: [
      {
        target: "clock-roster",
        title: "Clock in, change job, work offline",
        body: "Two crew members are on the clock now. One punch was made with no signal and is still queued on this phone. It syncs with its original time and location, and a clash with an online punch goes to the crew lead to resolve.",
        tryIt: "Sync the queued punch, then change a crew member's job.",
      },
    ],
  },
  {
    id: "batches",
    feature: "22",
    title: "Export batches",
    href: "/time/batches",
    role: "office_manager",
    steps: [
      {
        target: "batch-list",
        title: "Gusto keeps the pay run",
        body: "Two weeks ago, PB-1 was imported and Gusto rejected one line. PB-2 corrects only that line, and a small next-paycheck adjustment is kept apart. Last week has no batch yet: it's created once every entry is approved.",
      },
    ],
  },
  {
    id: "finance",
    feature: "33",
    title: "Finance and QuickBooks",
    href: "/accounting",
    role: "bookkeeper",
    steps: [
      {
        target: "qbo-strip",
        title: "QuickBooks owns the ledger",
        body: "Estimate Master owns the job; QuickBooks Online owns the accounting. The strip shows the connection, the next scheduled exchange run and anything waiting. Nothing here moves money.",
      },
      {
        target: "finance-records",
        title: "What came back from QuickBooks",
        body: "INV-2026-2 was edited in QuickBooks after it was sent, so it carries a variance flag for the office manager. A deleted check, a deposit held as a liability and a correction posted out of a closed month are each listed.",
        tryIt: "Open INV-2026-2 to see the sent and current amounts side by side.",
      },
    ],
  },
  {
    id: "transfer-queue",
    feature: "33",
    title: "Transfer queue",
    href: "/accounting/transfer-queue",
    role: "bookkeeper",
    steps: [
      {
        target: "transfer-queue",
        title: "Sent means locked",
        body: "Queued items can still be edited; anything already sent can only be corrected with a new version. The change order's supplemental invoice was rejected twice by QuickBooks and has been escalated to the bookkeeper.",
        tryIt: "Run the exchange, then try to edit an amount that was just sent.",
      },
    ],
  },
  {
    id: "bills",
    feature: "33",
    title: "Supplier bills",
    href: "/accounting/bills",
    role: "bookkeeper",
    steps: [
      {
        target: "bill-matching",
        title: "Match the bill to what arrived",
        body: "The Sherwin-Williams bill for JOB-2026-1-PO-01 charges for a gallon that hasn't been received. Matching it against the order and the receipts flags the $82 difference before anyone pays.",
        tryIt: "Match the bill.",
      },
    ],
  },
  {
    id: "unallocated",
    feature: "33",
    title: "Costs with no job",
    href: "/accounting/unallocated",
    role: "bookkeeper",
    steps: [
      {
        target: "unallocated-list",
        title: "Every cost finds its job, or overhead",
        body: "Two QuickBooks receipts arrived with no job. Allocate one to a job, or split it across several: the odd cent goes to the largest share, then the lowest job number. Fuel stays in overhead.",
      },
    ],
  },
  {
    id: "reimbursements",
    feature: "33",
    title: "Reimbursements",
    href: "/accounting/reimbursements",
    role: "office_manager",
    steps: [
      {
        target: "reimbursement-list",
        title: "One claim at each step",
        body: "Every claim needs a receipt photo. Hourly crew claims go to the crew lead, then the office. Office staff claims need the owner at any value. A claim that repeats an expense already charged to the job is flagged as a possible duplicate rather than paid twice.",
      },
    ],
  },
  {
    id: "job-performance",
    feature: "21",
    title: "Estimated versus actual",
    href: "/reports?tab=job_performance",
    role: "owner",
    steps: [
      {
        target: "perf-filters",
        title: "Choose the period and the baseline",
        body: "Periods run by work date. Compare against the revised estimate (with approved change orders) or the original one, by job, estimator, crew lead or interior and exterior.",
      },
      {
        target: "perf-grid",
        title: "Four columns, then the variance in words",
        body: "Original approved, approved change contribution, revised approved and actual. Highlights start strictly above 10 percent or $500. A zero estimate reads Not applicable, and a missing actual is shown as missing, never zero.",
        tryIt: "Open the family-room job (40 → 50 hours) to see its reason code.",
      },
      {
        target: "perf-snapshots",
        title: "Issued reports never change",
        body: "Issue a snapshot, or run the Monday 7 a.m. weekly issue. A correction reissues a new snapshot; old ones are archived and retrieved on request.",
      },
      {
        target: "perf-grid",
        role: "crew_lead",
        title: "Crew leads see hours only",
        body: "As a Crew Lead, every cost is gone from the screen and the export. Estimators see only their own jobs, at category level.",
      },
    ],
  },
  {
    id: "estimating-feedback",
    feature: "30",
    title: "Estimating feedback",
    href: "/reports?tab=estimating_feedback",
    role: "owner",
    steps: [
      {
        target: "feedback-list",
        title: "Suggestions for two rates only",
        body: "How fast crews cover an area, and how far a gallon goes. Never markup or selling price. Each row shows the current and observed rate, the deviation and how much evidence stands behind it.",
        bullets: [
          "Interior walls: crews are about 20 percent faster than the rate, so the evidence is shown prominently.",
          "Trim: 7 of 8 jobs — Insufficient evidence.",
          "Ceilings: rejected 45 days ago and still suppressed.",
        ],
      },
      {
        target: "feedback-evidence",
        title: "Every included job, and why others aren't",
        body: "Only verified, single-combination jobs of at least 400 sq ft from the last 18 months count. The 399 sq ft room, the 19-month-old job and the mixed job are listed with the check each failed.",
      },
      {
        target: "feedback-calc",
        title: "The arithmetic, with real numbers",
        body: "Productivity pools area and application hours; coverage divides each job's gallons by its own waste allowance. The formula is written out so the owner can check it by hand.",
      },
      {
        target: "feedback-preview",
        title: "One variable at a time",
        body: "The impact preview replays the last ten eligible jobs. A productivity change moves labor only; a coverage change moves material only. Nothing stored changes.",
        tryIt: "Run the preview.",
      },
      {
        target: "feedback-approval",
        title: "The owner approves one rate record",
        body: "The exact record is named before approval. An approval creates a new version, and the open draft estimate is flagged for an estimator to refresh. Sent estimates don't change.",
        tryIt: "Approve RATE-P-A, then roll it back from Version History.",
      },
      {
        target: "feedback-approval",
        role: "senior_estimator",
        title: "The estimating manager curates",
        body: "As the Senior Estimator, Approve is unavailable. You exclude evidence with a reason, reopen a rejected suggestion after three new jobs, and do the day-90 review below.",
      },
    ],
  },
  {
    id: "marketing",
    feature: "34",
    title: "Content calendar",
    href: "/marketing",
    role: "office_manager",
    steps: [
      {
        target: "marketing-accounts",
        title: "Two channels, one test account each",
        body: "Facebook and Instagram publishing only, tested on a test page and account first. The Instagram access expires in five days, so it's flagged here before it breaks anything.",
      },
      {
        target: "marketing-calendar",
        title: "A month of posts in every state",
        body: "Drafts, posts awaiting the owner, scheduled, published, missed and partially failed. The clocks-go-back post uses the first 1:30 a.m. of that night.",
      },
      {
        target: "marketing-attention",
        title: "Nothing late publishes on its own",
        body: "A post ten minutes past its time waits for the office manager. Over 30 minutes, it's missed and must be rescheduled. A partial failure retries only the failed platform, and an unclear outcome must be checked first.",
        tryIt: "Press Run scheduler.",
      },
    ],
  },
  {
    id: "composer",
    feature: "34",
    title: "Post composer",
    href: "/marketing/compose?id=POST-14",
    role: "office_manager",
    steps: [
      {
        target: "marketing-media",
        title: "Consent comes first",
        body: "Each photo shows its release state. The kitchen shot with the homeowner in frame has no release, so it's locked: surface images only. Withdrawn media can't be picked at all.",
      },
      {
        target: "marketing-checks",
        title: "Why this post can't be scheduled",
        body: "The consent check names the missing release. The checklist covers house numbers, faces, licence plates and the neighbouring property.",
      },
      {
        target: "marketing-composer",
        title: "Neighbourhood, never the street",
        body: "Copy containing a street address is blocked when saved. A changed image, identifying text or claim voids an approval; a typo fix doesn't.",
        tryIt: "Type \"1314 Maple Ridge Dr\" into the copy.",
      },
    ],
  },
  {
    id: "marketing-leads",
    feature: "34",
    title: "Website leads",
    href: "/leads?view=website",
    role: "office_manager",
    steps: [
      {
        target: "marketing-website-form",
        title: "One lead per website event",
        body: "Each event has a stable reference, so a retry never duplicates a lead. Matching is phone first, then email, within 90 days of the lead's last activity.",
        tryIt: "Send each scenario, then Retry last event.",
      },
      {
        target: "marketing-leads",
        title: "Gaps stay visible",
        body: "A missing phone number is shown as Missing, never filled in. When the phone matches one lead and the email another, the new lead goes to Lead review for a person — there's no merge button.",
      },
    ],
  },
];

/** Split a stop href into the parts the tour matches on. */
export function parseHref(href: string) {
  const [path, query = ""] = href.split("?");
  const q = new URLSearchParams(query);
  return { path: normalisePath(path), id: q.get("id") ?? undefined, rep: q.get("rep") ?? undefined };
}

export function normalisePath(p: string) {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}
