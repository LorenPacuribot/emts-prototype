/**
 * One short tour per new feature (New Features panel order).
 *
 * The fourteen patent features are core modules: built and delivered as one
 * package, with no Minimal / Complete split. The five 30 Sep call features
 * tag each step with the version it belongs to. Every action step says how it
 * was done before (`before`), what you do (`body`) and where the result shows
 * (`shows`). Each stop opens a seeded record that already shows its scenario
 * (see data/seed.ts).
 *
 * "Before" for the 30 Sep features is taken from their specs
 * (docs/emts-phase-2). For the core modules it describes the live app with
 * the feature switched off, and needs the client's confirmation.
 */
import type { FeatureKey } from "@/features/lib/feature-registry";
import type { FeatureTour } from "./tour-steps";

const ELENA = "/contacts/C-ELENA";

export const FEATURE_TOURS: Record<FeatureKey, FeatureTour> = {
  /* ------------------------------ Core modules ------------------------------ */

  f3: {
    key: "f3",
    role: "office_manager",
    solves: "Every paint color, product and sheen for a job sits on one versioned color card that the customer approves, so the crew paints and the office orders exactly what was agreed.",
    benefits: [
      "No repaints caused by a wrong color or sheen.",
      "A line can't be ordered until its color is approved and its product details are complete.",
      "The customer's approval is stored with the exact card version they saw.",
    ],
    before: "The live estimate has no paint color section. Colors, products and sheens are agreed and kept outside Estimate Master, with no record on the job of what the customer approved.",
    pages: [{
      href: "/estimates/EST-2026-1",
      steps: [
        {
          target: "colour-add", kind: "add", title: "Add a color",
          before: "Colors were written in notes or line descriptions.",
          body: "Press Add Paint Color, pick from the manufacturer's palette or enter a custom match. Then add a specification for each surface it goes on: product, sheen, coats, primer and tint base.",
          shows: "As a row in the color card table, and as a color number on each surface line of the estimate.",
          tryIt: "Press Add Paint Color.",
        },
        {
          target: "colour-card-tools", kind: "view", title: "Approval progress and card versions",
          body: "This contract is signed, but not every color is settled. The count shows approved specifications, not colors. The version picker opens earlier card versions; a new version never inherits the customer's signature.",
        },
        {
          target: "colour-table", kind: "view", title: "Approved, but not orderable",
          body: "Open a color's specifications with the arrow beside it. The trim is approved for application, but its product line, product and tint base are blank. A line becomes orderable only when it's approved and all three ordering fields are filled.",
          shows: "Materials and Supplier Orders only pick up lines marked orderable.",
          tryIt: "Press the arrow beside the Trim color, then hover 'Not orderable'.",
        },
        {
          target: "spec-lines", kind: "update", title: "Fix a line, then send it for approval",
          before: "A missing primer was found on site, after the paint was bought.",
          body: "Primer and coat sequence need a deliberate value. 'No primer, existing coating sound' is valid; a blank is not, so it blocks approval.",
          shows: "The line's status on the card, and the approval request in the approval panel.",
          tryIt: "Open a line's menu › Edit, set Primer to 'No primer, existing coating sound', save, then Send for approval.",
          absentNote: "Open a color's specifications first (the arrow beside the color), then come back to this step.",
        },
        {
          target: "sample-panel", kind: "update", title: "Record a custom color sample",
          body: "The door red is a custom match, so it stays in Pending sample until a round is accepted. Round 1 was rejected ('too orange next to the brick') and is kept permanently.",
          shows: "In the sample rounds list, and on the line's status once a round is accepted.",
          tryIt: "Record the outcome of round 2.",
          absentNote: "Open the door red color's specifications (the arrow beside it) to see its sample rounds.",
        },
        {
          target: "approval-panel", kind: "approve", title: "What the customer approved",
          before: "Approval was a phone call or an email that was hard to find later.",
          body: "Each approval stores the exact card version, the specifications sent, the channel, the timestamp and the sender address. A new card version never inherits the signature, and verbal approval isn't offered.",
          shows: "Here, on the estimate, for anyone checking later.",
        },
        {
          target: "colour-card-tools", kind: "view", title: "Print for the crew and the customer",
          body: "Print offers two cards. The crew card is grouped by room and shows the coat sequence. The customer card shows swatch, name, sheen and location only. Unapproved lines print with a Draft watermark.",
          tryIt: "Press Print › Customer card.",
        },
      ],
    }],
  },

  f18: {
    key: "f18",
    role: "office_manager",
    solves: "Works out the paint and materials a job needs from the measured estimate, with coverage, waste and container sizes, and builds the order from it.",
    benefits: [
      "Fewer emergency store runs and less leftover paint.",
      "Leftover shelf stock is offered before anything new is bought.",
      "Estimators approve quantities without seeing prices.",
    ],
    before: "Quantities were worked out by hand from the estimate and ordered separately, so jobs ran short or left extra stock.",
    pages: [{
      href: "/work-orders/WO-2026-1",
      steps: [
        {
          target: "stat-strip", kind: "view", title: "The inputs behind the number",
          body: "The strip names the coverage source in use (project override, then field rate, then manufacturer rate) and the waste allowance. Only the highest matching allowance applies (5, 10 or 15 percent); allowances are never added together.",
        },
        {
          target: "demand-table", kind: "view", title: "Coverage, then waste, then packing",
          before: "Gallons were estimated by eye, rounded up a few times along the way.",
          body: "Each line runs in that order at full precision. Only the adjusted need is rounded, once, then packed into the containers the office has marked available. Required volume, packs and excess are shown separately.",
          tryIt: "Expand a line to see measured area, coats and deductions.",
        },
        {
          target: "materials-approvals", kind: "approve", title: "Approve the demand and generate the order",
          body: "Estimators approve demand and request submission. Priya's top-up request for the west elevation is waiting here for the office manager or owner to generate the priced order.",
          shows: "The generated order appears in Supplier Orders, ready to send.",
        },
        {
          target: "quantity-panel", kind: "view", title: "One formula for every balance",
          body: "Outstanding demand = calculated demand − reserved shelf stock − net acknowledged quantity. 'Orderable now' also subtracts quantities sent but not yet acknowledged, so nothing already on its way is ordered twice.",
        },
        {
          target: "shelf-panel", kind: "update", title: "Use leftover shelf stock first",
          body: "Stock is proposed only when product, color and sheen match, and it's sealed and under two years old. An unconfirmed proposal doesn't reduce the purchase need. The 5-gallon Repose Gray is reserved to another job, so it shows as unavailable here.",
          shows: "A confirmed reservation lowers the outstanding demand above.",
        },
        {
          target: "demand-table", role: "estimator", kind: "view", title: "Estimators never see prices",
          body: "As an Estimator, every unit price, discount and order total is removed from the screen and from the CSV export. They're absent, not masked. The limit check still shows pass or fail.",
        },
      ],
    }],
  },

  f19: {
    key: "f19",
    role: "office_manager",
    action: "pin_clock",
    solves: "Sends purchase orders to supplier branches and tracks each one to acknowledgment, pickup and returns, with a person owning every exception.",
    benefits: [
      "Sent is never confused with acknowledged.",
      "Late acknowledgments are escalated in branch working hours, not forgotten.",
      "Every status the supplier returns is kept word for word.",
    ],
    before: "Orders went to the store by phone, text or someone's own email, with no shared record of whether the branch had acknowledged them.",
    pages: [{
      href: "/supplier-orders",
      steps: [
        {
          target: "page-actions", kind: "add", title: "Start a new order",
          body: "New Submission starts a purchase order for a job and a branch from the job's orderable lines.",
          shows: "On the order board below, starting as Generated.",
        },
        {
          target: "stat-strip", kind: "view", title: "Where every order stands",
          body: "The strip counts orders waiting to be sent, waiting for acknowledgment, overdue past four working hours, and partly filled.",
        },
        {
          target: "po-board", kind: "send", title: "Send an order, with evidence",
          before: "Nobody could say whether an order had actually gone out.",
          body: "Each seeded order shows a different part of the process.",
          bullets: [
            "JOB-2026-5-PO-01 was emailed this morning. Its acknowledgment clock counts branch working hours only (Monday to Friday, 7 a.m. to 4 p.m.).",
            "JOB-2026-5-PO-02 is generated but not sent. The buyer must confirm the branch and destination first.",
            "JOB-2026-1-PO-01 is partly filled. The supplier's status text is kept word for word.",
          ],
          shows: "The order moves to Sent, and its acknowledgment clock starts on the board.",
          tryIt: "Open PO-02 and try to mark it Sent without evidence. It's blocked until the channel's evidence is recorded.",
        },
        {
          target: "pill-tabs", kind: "view", title: "Exceptions are owned by a person",
          body: "The Exception list shows orders past four working hours, who owns the branch call, and the escalation step (sender, then office manager, then owner). Nothing is retried automatically.",
        },
        {
          target: "subnav", kind: "update", title: "Branch setup and product mapping",
          body: "Under Suppliers and Branches, the Benjamin Moore Richardson branch has no store number, so it can't receive orders. Product Mapping links products and pack sizes to store item codes.",
        },
        {
          target: "page-actions", role: "crew_lead", kind: "view", title: "Crew leads can't submit orders",
          body: "As a Crew Lead, New Submission disappears. Crew leads can still record receipts and line status.",
        },
      ],
    }],
  },

  f21: {
    key: "f21",
    role: "owner",
    solves: "Compares each job's estimated cost and hours with what it really used, by job, estimator, crew lead or job type.",
    benefits: [
      "See which jobs made or lost money, and why, while it still matters.",
      "Issued reports never change, so everyone argues from the same numbers.",
      "Crew leads see hours only; estimators see only their own jobs.",
    ],
    before: "Comparing an estimate with the timesheets and receipts was a spreadsheet job, usually done long after the job closed, if at all.",
    pages: [{
      href: "/reports?tab=job_performance",
      steps: [
        {
          target: "perf-filters", kind: "view", title: "Choose the period and the baseline",
          body: "Periods run by work date. Compare against the revised estimate (with approved change orders) or the original one, by job, estimator, crew lead or interior and exterior.",
        },
        {
          target: "perf-grid", kind: "view", title: "Four columns, then the variance in words",
          body: "Original approved, approved change contribution, revised approved and actual. Highlights start strictly above 10 percent or $500. A zero estimate reads Not applicable, and a missing actual is shown as missing, never zero.",
          tryIt: "Open the family-room job (40 → 50 hours) to see its reason code.",
        },
        {
          target: "perf-snapshots", kind: "send", title: "Issue a report that never changes",
          before: "A report re-run next week showed different numbers.",
          body: "Issue a snapshot, or run the Monday 7 a.m. weekly issue. A correction reissues a new snapshot; old ones are archived and retrieved on request.",
          shows: "In the snapshot list here.",
        },
        {
          target: "perf-grid", role: "crew_lead", kind: "view", title: "Crew leads see hours only",
          body: "As a Crew Lead, every cost is gone from the screen and the export. Estimators see only their own jobs, at category level.",
        },
      ],
    }],
  },

  f22: {
    key: "f22",
    role: "office_manager",
    solves: "Crews clock in and out on their phones by job and activity; the office approves the week, settles disputes and sends approved hours to payroll.",
    benefits: [
      "Hours arrive tied to the job, so job costs are real.",
      "Overtime, missing time and disputes are flagged before payroll, not after.",
      "Payroll gets approved hours only, in Gusto's format.",
    ],
    before: "Crew hours came in on paper or by text and were typed into payroll by hand, with no link to the job they were worked on.",
    pages: [
      {
        href: "/time/clock",
        role: "crew_lead",
        steps: [{
          target: "clock-roster", kind: "add", title: "Clock in, change job, work offline",
          before: "Hours were written down at the end of the day, or the week.",
          body: "Two crew members are on the clock now. One punch was made with no signal and is still queued on this phone. It syncs with its original time and location, and a clash with an online punch goes to the crew lead to resolve.",
          shows: "In the office's weekly review under Time, and on the job's work order time log.",
          tryIt: "Sync the queued punch, then change a crew member's job.",
        }],
      },
      {
        href: "/time",
        steps: [
          {
            target: "timesheet-grid", kind: "approve", title: "Review and approve the week",
            body: "Hours arrive by job and activity. Last week's entries each show a rule.",
            bullets: [
              "Overtime over 40 hours, and travel between two jobs on one day.",
              "A rained-out morning booked to overhead, and a no-lunch flag waiting for the office.",
              "An open dispute, an unattested day and missing Monday time.",
              "An offline punch that conflicts with an online one. It blocks approval until the crew lead picks the right record.",
            ],
            shows: "Approved hours feed Export Batches, the job's cost card and Estimated vs Actual.",
            tryIt: "Open an entry to see its segments, daily rounding and flags.",
          },
          {
            target: "subnav", kind: "view", title: "The rest of Time",
            body: "Mobile Clock is the crew's phone screen. Export Batches builds the Gusto CSV from approved hours only. Labor Cost is where the bookkeeper enters each pay period's cost, split across jobs by approved hours. Mileage and Employees complete the set.",
          },
        ],
      },
      {
        href: "/time/batches",
        steps: [{
          target: "batch-list", kind: "send", title: "Send approved hours to payroll",
          before: "Payroll was re-keyed from timesheets.",
          body: "Two weeks ago, PB-1 was imported and Gusto rejected one line. PB-2 corrects only that line, and a small next-paycheck adjustment is kept apart. Last week has no batch yet: it's created once every entry is approved.",
          shows: "In this batch list, with Gusto's result for each line.",
        }],
      },
    ],
  },

  f24: {
    key: "f24",
    role: "office_manager",
    solves: "Adds, removes or credits work on a signed estimate through priced change orders the customer signs, with the deposit reviewed when the contract grows.",
    benefits: [
      "No surprise on the final invoice: every change is priced and signed.",
      "Only the difference is priced, at the original markup.",
      "Big additions and every credit go to the owner first.",
    ],
    before: "Extra work was agreed on site and added to the invoice later, often without a signature, so the final bill could surprise the customer.",
    pages: [{
      href: "/estimates/EST-2026-1",
      steps: [
        {
          target: "estimate-menu", kind: "add", title: "Create a change order",
          body: "On a signed estimate, Create Change Order is in this ⋮ menu. It prices only the difference from the last approved scope, at the original markup and the tax rate on the change-order date. Owner approval is needed for gross additions over $2,000 and for every credit.",
          tryIt: "Open ⋮ › Create Change Order.",
          shows: "In the change order list on this estimate, then on the work order, the invoice and the job history once signed.",
        },
        {
          target: "stat-strip", kind: "view", title: "The contract, before and after",
          body: "Original contract, approved net changes, the revised total and the cumulative change. When signed net changes (including proposed ones) pass 25 percent of the original contract, a deposit review is triggered.",
        },
        {
          target: "deposit-banner", kind: "approve", title: "Deposit review",
          body: "The revised deposit target is one-third of the new contract total, less deposits already collected. It needs the owner's approval and the customer's signature.",
        },
        {
          target: "co-list", kind: "send", title: "Send for signature, one rule per change order",
          before: "Changes were agreed verbally, with nothing for the customer to sign.",
          body: "Each seeded change order shows a different rule.",
          bullets: [
            "Sent and awaiting signature: the version 1 link was superseded when version 2 was sent.",
            "Emergency under $500: verbal approval this morning, written confirmation due in two working days.",
            "Emergency overdue: work on that change has stopped and the owner has been escalated.",
            "Child change order: drafted while its parent is pending, so it can't be sent.",
            "Bounced email, rejected before work, and disputed after work are all separate states.",
          ],
          shows: "The customer signs from their estimate link; the status updates here.",
          tryIt: "Open the child change order and try to send it. It's blocked until its parent is resolved.",
        },
      ],
    }],
  },

  f25: {
    key: "f25",
    role: "office_manager",
    solves: "Keeps every past job and every paint applied at an address, by room or elevation and surface, and who owns the property now.",
    benefits: [
      "The next quote at an address starts from what is really on the walls.",
      "Unknown or unverified values are labelled, never guessed.",
      "History follows the property, not the customer record.",
    ],
    before: "Once a job closed, what was painted with which product and color sat in old estimates and paperwork, so the next job at that address started from scratch.",
    pages: [
      {
        href: "/work-orders/WO-2026-5",
        steps: [
          {
            target: "mark-complete", kind: "update", title: "The crew confirms what was applied",
            before: "What was actually applied was never written down.",
            body: "Mark Complete opens the closeout checklist. Every surface in the approved scope is listed, and color, sheen and completion date are required for each. Here the ceiling isn't confirmed and the baseboard has no sheen. Missing hours or gallons never block closeout; they show as Not recorded.",
            shows: "Confirmed values go into the application record with the crew lead's name; the header chip counts confirmed surfaces.",
            tryIt: "Press Mark Complete, confirm the ceiling, then edit the baseboard and set its sheen. The tour waits while the drawer is open.",
          },
          {
            target: "mark-complete", kind: "approve", title: "Close the job",
            body: "Once every surface is complete, the office manager or owner presses Close job in the same drawer. That writes the applications into the property record. Pressed early, it names the surfaces still missing.",
            shows: "In the property's Paint History, next; the success banner links straight to it.",
          },
        ],
      },
      {
        href: `${ELENA}?tab=paint-history`,
        steps: [
          {
            target: "property-header", kind: "view", title: "History belongs to the property",
            body: "A stable identifier sits behind the address, so fixing an address typo never detaches earlier jobs. PROP-1008 ('420 Cedar Hollow Lane') is a possible duplicate of this property; a merge needs the owner's individual approval.",
          },
          {
            target: "surface-tree", kind: "delete", title: "Removed surfaces stay on record",
            body: "Property, then room or elevation, then surface. Surfaces are never deleted: the old siding is marked Removed (struck through) with its date. Its replacement is a new surface record, and the old applications stay openable.",
          },
          {
            target: "app-timeline", kind: "view", title: "Confirmed versus unverified",
            body: "Applications appear newest first with the crew lead who confirmed them. Work the customer reported from another contractor is labelled Unverified with its source, and kept separate.",
            tryIt: "Pick an exterior surface in the tree to see both kinds.",
          },
          {
            target: "gaps", kind: "update", title: "Correct a record after close",
            body: "Unknown values (owner-approved, for legacy or subcontractor work) and Not recorded actuals are listed here. A correction after close keeps the old and new values, the author and the reason.",
            shows: "Alongside the original value in the timeline.",
          },
          {
            target: "subnav", kind: "view", title: "Ownership, QR links and more",
            body: "Ownership holds sale history and seller consent. PROP-1006 shows an unreachable-seller determination that stays blocked after only two contact attempts.",
          },
        ],
      },
    ],
  },

  f26: {
    key: "f26",
    role: "office_manager",
    solves: "Gives the customer a QR link to their own paint record (colors, products and dates) with no login, and a way to request touch-ups.",
    benefits: [
      "Customers find their colors themselves instead of calling the office.",
      "Only safe fields are shown: no prices, costs or paint life.",
      "A sold house's old code stops showing the new owner's work.",
    ],
    before: "Customers had no way to look up their paint; they called the office, and someone searched old files.",
    pages: [{
      href: `${ELENA}?tab=paint-history&view=qr`,
      steps: [
        {
          target: "qr-current", kind: "view", title: "The customer's link",
          body: "One link per ownership period. There's no login: anyone holding the link can read it, so it only shows safe fields. The reference is random and isn't derived from the address.",
          shows: "On the public page the customer opens from the code.",
          tryIt: "Press Open customer page to see what the customer sees, including the touch-up request form.",
        },
        {
          target: "page-actions", kind: "send", title: "Print or send the code",
          body: "Two print formats: a 3.5 × 2 in business card and a 2 × 2 in sticker. Sending needs a verified contact.",
        },
        {
          target: "qr-history", kind: "delete", title: "Revoke a link",
          body: "Revoking is instant: the old code then shows 'Record has moved' and the phone number, with no history. Revoked links stay listed here with their reason.",
          tryIt: "Use 'See what the old code shows' on a revoked link.",
        },
        {
          target: "touchup-panel", kind: "view", title: "Touch-up requests",
          body: "Requests from the public page arrive here and in the office inbox. Their acknowledgment is the only customer message the system sends automatically.",
        },
        {
          target: "page-actions", role: "estimator", kind: "view", title: "Estimators can't revoke",
          body: "As an Estimator, you can still generate, send and print, but Revoke, Regenerate and Replace disappear.",
        },
      ],
    }],
  },

  f27: {
    key: "f27",
    role: "office_manager",
    solves: "Flags past customers whose paint is due for renewal, from a lifespan library, in an internal queue for staff.",
    benefits: [
      "Repaint work no longer depends on the customer calling back.",
      "One opportunity per property, not one per surface.",
      "No alert ever contacts a customer on its own.",
    ],
    before: "Nobody tracked when a past customer's paint was due for renewal.",
    pages: [{
      href: "/repaint-alerts",
      steps: [
        {
          target: "stat-strip", kind: "view", title: "An internal queue, not a mailer",
          body: "The strip shows open alerts, escalated ones (14 days with no recorded outcome), snoozed ones, the imported backlog and the last nightly run.",
        },
        {
          target: "pill-tabs", kind: "view", title: "Each queue state has an example",
          body: "Switch between the tabs to see each state.",
          bullets: [
            "Suppressed: a property with an active job shows its reason instead of disappearing.",
            "Opted out: the internal alert stays, but contact is blocked.",
            "Snoozed: the customer asked to be called after the holidays.",
            "Backlog: imported overdue records, qualified in batches of up to 25.",
          ],
        },
        {
          target: "alerts-table", kind: "update", title: "Open an alert and act on it",
          body: "Surfaces due within 12 months of the earliest due date are grouped into one alert. Open it to see each surface's due date and how it was worked out, then qualify, snooze or close it.",
          shows: "A qualified alert moves to Follow-ups for an estimator.",
        },
        {
          target: "page-actions", kind: "update", title: "Run log and lifespan library",
          body: "Run now starts the nightly job by hand. Run it twice and you'll see no duplicate alerts. The Lifespan Library holds the default intervals, and only the owner can change them.",
        },
      ],
    }],
  },

  f28: {
    key: "f28",
    role: "office_manager",
    solves: "Builds a new estimate for a returning customer from the surfaces painted before, and re-orders the same touch-up paint.",
    benefits: [
      "Requotes start from real history, rechecked line by line.",
      "No quote without a current inspection.",
      "Touch-up sales never reset the repaint clock.",
    ],
    before: "A repeat customer's new quote started from a blank estimate, and touch-up paint was reordered by guessing what was used last time.",
    pages: [
      {
        href: `${ELENA}?tab=paint-history`,
        steps: [
          {
            target: "paint-history-tab", kind: "view", title: "Check before quoting",
            body: "Every surface painted at this address, with its color, product and date. When the address already has an open repaint estimate or a touch-up reorder waiting, the builder warns you and links to it.",
          },
          {
            target: "new-estimate-from-history", kind: "add", title: "Start an estimate from history",
            body: "Nothing is preselected, and there's no 'select all latest'. Removed surfaces are shown but can't be picked. Each copied line keeps its source job and application.",
            shows: "A new draft estimate, linked to the lead you pick, in Estimates.",
            tryIt: "Press New Estimate from History, tick a couple of surfaces and press Next: lead.",
          },
        ],
      },
      {
        href: "/estimates/EST-2026-10",
        steps: [
          {
            target: "stat-strip", kind: "view", title: "Maria Chen's exterior requote",
            body: "Copied from JOB-2022-18. This strip tracks the reconfirmed lines, the inspection gate, the quote total at today's prices and the 30-day validity.",
          },
          {
            target: "copied-lines", kind: "update", title: "Recheck every copied line",
            body: "Quantity, preparation, current condition and price must each be reconfirmed. Prior usage is shown for reference only and never fills the new quantity. The SuperPaint lines use a discontinued product; propose its published successor.",
          },
          {
            target: "inspection-panel", kind: "add", title: "Record the inspection",
            body: "Exterior work needs a saved site visit with a measurement date and at least one photo. A small interior (one room, or up to 400 sq ft) can use photos plus a phone call instead.",
          },
          {
            target: "send-estimate", kind: "send", title: "Issue the quote",
            body: "The estimate's Send issues the quote once the blockers listed in From history are cleared: the inspection, every reconfirmed line and the customer clause. Comparison View, in the From history header, shows the difference from the old job for staff only.",
            shows: "The customer receives the quote; Quote PDF in From history prints it.",
          },
        ],
      },
      {
        href: `${ELENA}?tab=paint-history&view=reorders`,
        steps: [
          {
            target: "stat-strip", kind: "view", title: "A paint sale isn't painting work",
            body: "A touch-up reorder is up to two gallons and needs cleared prepayment or On account status. It never creates an application or resets the repaint clock.",
          },
          {
            target: "reorders-list", kind: "view", title: "Reorder states",
            body: "This property's reorder is approved and waiting to be filled. It's the one the estimate builder warned about.",
            bullets: [
              "PROP-1007 has one fulfilled on account.",
              "PROP-1004 has a cancelled prepaid order, with a refund to the original payment method due within five working days.",
            ],
          },
        ],
      },
    ],
  },

  f29: {
    key: "f29",
    role: "office_manager",
    action: "pin_clock",
    solves: "Turns qualified repaint alerts into assigned follow-ups with attempts, outcomes and clocks that make lateness visible.",
    benefits: [
      "Every repaint lead has an owner and a next step.",
      "Calls are only logged inside the allowed contact hours.",
      "Monthly measures count real conversations and signed work.",
    ],
    before: "Repaint leads were followed up from memory or a spreadsheet, with no record of who called whom, or when.",
    pages: [{
      href: "/repaint-alerts/follow-ups",
      steps: [
        {
          target: "stat-strip", kind: "view", title: "From alert to conversation",
          body: "An alert never starts contact on its own. The office qualifies it with a reason, then assigns the area estimator. Three clocks make lateness visible: 3 days unassigned, 7 days assigned with no outcome, 14 days unqualified.",
        },
        {
          target: "pill-tabs", kind: "approve", title: "Qualify an alert",
          body: "Unqualified alerts wait at the gate, each with a countdown to owner escalation.",
          shows: "A qualified alert becomes a follow-up in the list below.",
          tryIt: "Open Unqualified and qualify an alert with a reason.",
        },
        {
          target: "followups-table", kind: "update", title: "Log a call or an outcome",
          before: "Calls weren't recorded, so the same customer could be called twice, or not at all.",
          body: "The seeded follow-ups each show a rule.",
          bullets: [
            "FU-0999: its estimate has sold. The drawer prompts a person to close it as Won; it never closes itself.",
            "One follow-up went back to the queue when Marcus went out of office. No clock was reset.",
            "One was recycled after three unanswered attempts (days 1, 14 and 35) and waits for next season.",
          ],
          shows: "On the follow-up's history, and in the monthly measures.",
          tryIt: "Open a follow-up and try to log a call. Before 8 a.m., after 7 p.m., on Sundays and on holidays it's blocked.",
        },
        {
          target: "team-availability", kind: "update", title: "Mark someone out of office",
          body: "Marking an estimator out of office returns their open follow-ups to the queue at once. No clock is paused or reset.",
        },
        {
          target: "page-actions", kind: "view", title: "Monthly measures",
          body: "Contacts count real conversations only; unsuccessful calls count as attempts. Dollars won is the signed contract value, excluding tax and later change orders, counted in the month it was signed.",
        },
      ],
    }],
  },

  f30: {
    key: "f30",
    role: "owner",
    solves: "Shows where crews are faster or slower than the estimating rates, and how far paint really goes, so the owner can update two rates with evidence.",
    benefits: [
      "Rates improve from real jobs, not guesses.",
      "Every suggestion shows the jobs behind it and the arithmetic.",
      "Markup and selling price are never touched.",
    ],
    before: "Production and coverage rates were set once and rarely revisited; nobody could show whether estimates ran over or under.",
    pages: [{
      href: "/reports?tab=estimating_feedback",
      steps: [
        {
          target: "feedback-list", kind: "view", title: "Suggestions for two rates only",
          body: "How fast crews cover an area, and how far a gallon goes. Each row shows the current and observed rate, the deviation and how much evidence stands behind it.",
          bullets: [
            "Interior walls: crews are about 20 percent faster than the rate.",
            "Trim: 7 of 8 jobs, so Insufficient evidence.",
            "Ceilings: rejected 45 days ago and still suppressed.",
          ],
        },
        {
          target: "feedback-evidence", kind: "view", title: "Every included job, and why others aren't",
          body: "Only verified, single-combination jobs of at least 400 sq ft from the last 18 months count. The 399 sq ft room, the 19-month-old job and the mixed job are listed with the check each failed.",
        },
        {
          target: "feedback-calc", kind: "view", title: "The arithmetic, with real numbers",
          body: "Productivity pools area and application hours; coverage divides each job's gallons by its own waste allowance. The formula is written out so the owner can check it by hand.",
        },
        {
          target: "feedback-preview", kind: "view", title: "Preview the effect first",
          body: "The impact preview replays the last ten eligible jobs. A productivity change moves labor only; a coverage change moves material only. Nothing stored changes.",
          tryIt: "Run the preview.",
        },
        {
          target: "feedback-approval", kind: "approve", title: "Approve one rate record",
          body: "The exact record is named before approval. An approval creates a new version, and the open draft estimate is flagged for an estimator to refresh. Sent estimates don't change.",
          shows: "In Settings › Surface Rates as a new rate version, with Version History to roll back.",
          tryIt: "Approve RATE-P-A, then roll it back from Version History.",
        },
        {
          target: "feedback-approval", role: "senior_estimator", kind: "view", title: "The estimating manager curates",
          body: "As the Senior Estimator, Approve is unavailable. You exclude evidence with a reason, reopen a rejected suggestion after three new jobs, and do the day-90 review.",
        },
      ],
    }],
  },

  f33: {
    key: "f33",
    role: "bookkeeper",
    solves: "Exchanges invoices, payments, supplier bills and receipts with QuickBooks Online and keeps job costs straight, with every problem waiting for a person.",
    benefits: [
      "No retyping invoices and bills into QuickBooks.",
      "Anything sent is locked; corrections are new versions.",
      "Every cost lands on a job or on overhead.",
    ],
    before: "Invoices, supplier bills and receipts were typed into QuickBooks by hand, and job costs were pieced together at month end.",
    pages: [
      {
        href: "/accounting",
        steps: [
          {
            target: "qbo-strip", kind: "view", title: "QuickBooks owns the ledger",
            body: "Estimate Master owns the job; QuickBooks Online owns the accounting. The strip shows the connection, the next scheduled exchange run and anything waiting. Nothing here moves money.",
          },
          {
            target: "finance-records", kind: "view", title: "What came back from QuickBooks",
            body: "INV-2026-2 was edited in QuickBooks after it was sent, so it carries a variance flag for the office manager. A deleted check, a deposit held as a liability and a correction posted out of a closed month are each listed.",
            tryIt: "Open INV-2026-2 to see the sent and current amounts side by side.",
          },
        ],
      },
      {
        href: "/accounting/transfer-queue",
        steps: [{
          target: "transfer-queue", kind: "send", title: "Send to QuickBooks: sent means locked",
          body: "Queued items can still be edited; anything already sent can only be corrected with a new version. The change order's supplemental invoice was rejected twice by QuickBooks and has been escalated to the bookkeeper.",
          shows: "In QuickBooks, and as Sent here with its QuickBooks reference.",
          tryIt: "Run the exchange, then try to edit an amount that was just sent.",
        }],
      },
      {
        href: "/accounting/bills",
        steps: [{
          target: "bill-matching", kind: "update", title: "Match a bill to what arrived",
          before: "Bills were paid without checking them against what was received.",
          body: "The Sherwin-Williams bill for JOB-2026-1-PO-01 charges for a gallon that hasn't been received. Matching it against the order and the receipts flags the $82 difference before anyone pays.",
          tryIt: "Match the bill.",
        }],
      },
      {
        href: "/accounting/unallocated",
        steps: [{
          target: "unallocated-list", kind: "update", title: "Give every cost a job, or overhead",
          body: "Two QuickBooks receipts arrived with no job. Allocate one to a job, or split it across several: the odd cent goes to the largest share, then the lowest job number. Fuel stays in overhead.",
          shows: "On each job's cost card and in Job Margin.",
        }],
      },
      {
        href: "/accounting/reimbursements",
        role: "office_manager",
        steps: [{
          target: "reimbursement-list", kind: "approve", title: "Approve a reimbursement",
          body: "Every claim needs a receipt photo. Hourly crew claims go to the crew lead, then the office. Office staff claims need the owner at any value. A claim that repeats an expense already charged to the job is flagged as a possible duplicate.",
        }],
      },
    ],
  },

  f34: {
    key: "f34",
    role: "office_manager",
    solves: "Plans, approves and publishes Facebook and Instagram posts from real job photos, with the customer's permission recorded for every photo.",
    benefits: [
      "Nothing goes out without the right permission and, where needed, the owner's approval.",
      "Everyone sees what a post will look like before it is published.",
      "Website and social leads are tracked back to their source.",
    ],
    before: "Posts were made straight from someone's phone, with no approval step, no record of the customer's permission to use photos of their house, and no link between posts and the leads they brought in.",
    pages: [
      {
        href: "/marketing",
        steps: [
          {
            target: "marketing-accounts", kind: "view", title: "Two channels, one test account each",
            body: "Facebook and Instagram publishing only, tested on a test page and account first. The Instagram access expires in five days, so it's flagged here before it breaks anything.",
            shows: "Accounts are managed in Settings › Social Accounts.",
          },
          {
            target: "marketing-calendar", kind: "view", title: "Every post on the calendar",
            body: "Drafts, posts awaiting the owner, scheduled, published, missed and partly failed. Clicking a post shows how it will look on Facebook or Instagram; Open post goes to the composer.",
            tryIt: "Click any post on the calendar.",
          },
        ],
      },
      {
        href: "/marketing/media",
        steps: [
          {
            target: "marketing-upload", kind: "add", title: "Upload photos",
            before: "A simulated upload: you typed a label and a size, and no picture was stored.",
            body: "Drag photos in or choose several at once. Each gets a thumbnail and a label before upload, and is checked: JPG, PNG or WebP, under 8 MB, no video.",
            shows: "In the Media Library grid, the composer's Media card and the post preview.",
            tryIt: "Press Upload photos and pick a photo from your computer.",
          },
          {
            target: "marketing-permission", kind: "update", title: "Record a customer's OK, even verbal",
            before: "A photo with no release stayed locked unless it came from a job with a signed contract.",
            body: "Record how permission was given (verbally or in writing), who gave it, and a note of what they agreed to. The photo and its crops unlock. The owner still approves every post that shows their property.",
            shows: "Under the photo as its release, and in the activity log.",
            tryIt: "Press Record permission on the highlighted photo (MED-4, the kitchen shot).",
          },
          {
            target: "marketing-withdrawals", kind: "delete", title: "Withdraw a photo instead of deleting it",
            body: "Photos aren't deleted, so the history is kept. Withdrawing permission takes a photo out of every future post at once, and puts published posts on the takedown list for a person to confirm.",
            shows: "In this Withdrawals and takedowns list.",
          },
        ],
      },
      {
        href: "/marketing/compose?id=POST-14",
        steps: [
          {
            target: "marketing-composer", kind: "update", title: "Write the post",
            body: "Copy containing a street address is blocked when saved; only the neighbourhood may be shown. A changed image, identifying text or claim voids an approval; a typo fix doesn't.",
            tryIt: "Type \"1314 Maple Ridge Dr\" into the copy and save.",
          },
          {
            target: "marketing-preview", kind: "view", title: "See the post before it goes out",
            before: "Only the text box and small photo tiles; nobody could see what the post would look like.",
            body: "The preview draws the post as the feed shows it: page name, the caption cut off at \"more\", hashtags, and the photos at the feed's shape. It updates as you type.",
          },
          {
            target: "marketing-checks", kind: "view", title: "Why this post can't be scheduled",
            body: "The consent check names the missing release. The checklist covers house numbers, faces, licence plates and the neighbouring property.",
          },
          {
            target: "marketing-approval", kind: "approve", title: "The owner approves what they see",
            body: "Posts with customer property, identifiable people, testimonials or named crew go to the owner. Preview saved v1 shows exactly the saved version being approved.",
            shows: "The approval is recorded on the version history, and the post can then be scheduled.",
            tryIt: "Press Preview saved v1.",
          },
        ],
      },
      {
        href: "/leads?view=website",
        steps: [
          {
            target: "marketing-website-form", kind: "add", title: "One lead per website event",
            body: "Each event has a stable reference, so a retry never duplicates a lead. Matching is phone first, then email, within 90 days of the lead's last activity.",
            shows: "On the Lead Pipeline as a new lead, or on the matching lead.",
            tryIt: "Send each scenario, then Retry last event.",
          },
          {
            target: "marketing-leads", kind: "view", title: "Gaps stay visible",
            body: "A missing phone number is shown as Missing, never filled in. When the phone matches one lead and the email another, the new lead goes to Lead review for a person; there's no merge button.",
          },
        ],
      },
    ],
  },

  /* ------------------------------ 30 Sep call features ------------------------------ */

  qb: {
    key: "qb",
    role: "owner",
    solves: "Each subscriber connects their own QuickBooks Online, so contacts, jobs, invoices and payments created in Estimate Master reach QuickBooks without retyping, and payment status comes back.",
    benefits: [
      "No double entry between Estimate Master and QuickBooks.",
      "Existing QuickBooks customers are matched, not duplicated.",
      "Every field has one owner: Estimate Master owns the work, QuickBooks owns the books.",
    ],
    before: "The live app has no QuickBooks connection. A subscriber moving from Paint Scout, which syncs to QuickBooks, would have to type every contact, invoice and payment in twice.",
    pages: [
      {
        href: "/settings/accounting",
        steps: [
          {
            target: "qb-destination", kind: "update", version: "minimal", title: "Choose where the books are kept",
            body: "None, QuickBooks Online, or Estimate Master Books. Choosing Books asks you to confirm that QuickBooks will be disconnected.",
            shows: "It decides which Accounting mode opens by default.",
          },
          {
            target: "qb-connection", kind: "add", version: "minimal", title: "Connect QuickBooks",
            before: "No connection: everything was re-keyed in QuickBooks.",
            body: "The owner or an admin presses Connect and signs in to QuickBooks. QuickBooks is a paid add-on; without it the card says so and has no Connect button.",
            shows: "The card turns Connected, with the company name, who connected it and the last sync.",
          },
          {
            target: "qb-sync-options", kind: "update", version: "minimal", title: "Set the sync options, then start sync",
            body: "Map the income account, deposit account, card payment method and every tax region. Start sync stays disabled until they're all mapped, then asks: send contacts and jobs from a start date, or new records only.",
            shows: "After that, records are sent as they're saved; results go to the Sync Log.",
          },
          {
            target: "qb-match", kind: "update", version: "minimal", title: "Match your contacts",
            before: "Connecting would have created duplicate customers in QuickBooks.",
            body: "QuickBooks customers are compared with your contacts: Matched, Will be created in QuickBooks, and Possible duplicates. Each duplicate needs a choice: link to the suggested contact, or create a new one.",
            shows: "Linked contacts show a QuickBooks link on the contact and its invoices.",
          },
          {
            target: "qb-connection", kind: "delete", version: "minimal", title: "Disconnect",
            body: "Disconnect asks for confirmation. Nothing is sent until QuickBooks is connected again, and records already sent stay in QuickBooks.",
          },
        ],
      },
      {
        href: "/invoices/INV-2026-1",
        steps: [{
          target: "invoice-qbo", kind: "view", version: "minimal", title: "QuickBooks status on an invoice",
          body: "Each synced invoice shows its QuickBooks status and link. Once sent, the amount is locked here; payment status comes back from QuickBooks.",
        }],
      },
      {
        href: "/accounting/unallocated",
        steps: [{
          target: "qb-review-tab", kind: "update", version: "complete", title: "Review customers created in QuickBooks",
          body: "Customers someone made in QuickBooks (not sent from Estimate Master) wait under Customer Review. Link each to a contact, create it as a contact, or ignore it. They never go straight into Leads.",
          shows: "A linked or created customer appears in Contacts with its QuickBooks link.",
          tryIt: "Open the Customer Review tab.",
        }],
      },
      {
        href: ELENA,
        steps: [{
          target: "qb-contact", kind: "view", version: "complete", title: "QuickBooks card on a contact",
          body: "Balance, status and a link to open the customer in QuickBooks, without leaving Estimate Master. Name, phone, email and address edits made in QuickBooks flow back, and the latest edit wins.",
        }],
      },
    ],
  },

  crm: {
    key: "crm",
    role: "owner",
    solves: "Separate Sales and Production boards with your own stages, and leads that arrive from tracked links with their source set automatically.",
    benefits: [
      "Leads from forms land on the board by themselves.",
      "Sold work moves to its own Production board.",
      "You see which source brings in the leads, without asking the customer.",
    ],
    before: "The live app has one board with seven fixed stages: New, Contacted, Scheduled, Pending, Sold, Lost, Archived. Settings › Pipeline Stages only lets an admin rename them. Lead sources are picked by hand.",
    pages: [
      {
        href: "/leads",
        steps: [
          {
            target: "crm-pipelines", kind: "view", version: "minimal", title: "Sales and Production boards",
            body: "Switch between the Sales board and the Production board. Sales holds leads until they're sold; Production tracks the sold work.",
          },
          {
            target: "crm-board", kind: "update", version: "minimal", title: "Move a card; Sold creates the Production card",
            before: "Sold was the end of the road on the one board.",
            body: "Drag a card between stages. Moving a lead to Sold creates its card on the Production board automatically. Moving it out of Sold asks whether to keep the Production card.",
            shows: "On the Production board, and in the lead's stage history.",
          },
          {
            target: "crm-source", kind: "view", version: "minimal", title: "Filter by source",
            body: "Each card shows its source as a badge. Filter the board to one source, for example Facebook.",
          },
          {
            target: "crm-groupby", kind: "view", version: "complete", title: "Group by source",
            body: "Group the Sales board by source instead of stage, to see the Facebook leads, Website leads and so on as columns.",
          },
          {
            target: "crm-pipelines", kind: "add", version: "complete", title: "Add a pipeline",
            body: "Add pipeline creates another board, for example Marketing. It starts with a New stage and a Done stage.",
            shows: "As a new tab beside Sales and Production, and in Settings › Pipeline Stages.",
          },
        ],
      },
      {
        href: "/leads?view=website",
        steps: [
          {
            target: "crm-links", kind: "add", version: "minimal", title: "Make a tracked link",
            before: "The customer was asked where they heard about you, or the source was picked by hand.",
            body: "Add a link per place you share the request-an-estimate form (Facebook page, Instagram bio, website), each with its source. Copy the link or print its QR code.",
            shows: "Leads from that link arrive on the Sales board in New, with the source already set.",
          },
          {
            target: "crm-fb-ads", kind: "add", version: "complete", title: "Connect Facebook Lead Ads",
            body: "Leads from Facebook Lead Ads and Instagram lead forms arrive directly, with the source set to Facebook or Instagram.",
          },
        ],
      },
      {
        href: "/settings/pipeline-stages",
        steps: [
          {
            target: "crm-stages", kind: "update", version: "minimal", title: "Add or rename stages",
            before: "An admin could only rename the seven fixed stages.",
            body: "Add stage, rename and recolour stages on each board, then Save Changes. New, Sold, Lost and Complete are system stages: they can be renamed and recoloured, not moved or deleted.",
            shows: "On the board at once.",
          },
          {
            target: "crm-stages", kind: "delete", version: "minimal", title: "Delete a stage",
            body: "The bin button deletes a stage you added. A stage with cards can't be deleted until its cards are moved, and system stages can't be deleted at all.",
          },
        ],
      },
      {
        href: "/leads/LEAD-2026-10",
        steps: [
          {
            target: "crm-history", kind: "view", version: "minimal", title: "Stage history on the lead",
            body: "Every move between stages and boards, with who moved it and when.",
          },
          {
            target: "crm-journey", kind: "view", version: "complete", title: "Journey bar",
            body: "Where the lead is on each board at a glance, from Sales through Production.",
          },
        ],
      },
      {
        href: "/marketing/automations",
        steps: [{
          target: "crm-automation-views", kind: "approve", version: "complete", title: "Stage emails, rules and approval",
          body: "Rules send a template when a card reaches a stage. Flow shows the rules as a diagram. Messages to customers wait in Waiting for approval until someone approves them or the rule itself is approved.",
        }],
      },
    ],
  },

  js: {
    key: "js",
    role: "office_manager",
    solves: "Saving a schedule no longer emails the crew. Changes collect until you send one summary email per person, when you choose.",
    benefits: [
      "Crews get one clear update instead of a flood of emails.",
      "You choose who is told, and when.",
      "You can see which jobs have changes the crew hasn't been told about.",
    ],
    before: "Today an assignment email fires on every create or edit. After adjusting eight to ten jobs on 23 Sep, Tim's crew received 23 emails, so crews stop reading them and Tim avoids adjusting the schedule.",
    pages: [
      {
        href: "/job-scheduling",
        steps: [
          {
            target: "js-board", kind: "update", version: "minimal", title: "Change a shift: nothing is sent",
            before: "Every save emailed the crew straight away.",
            body: "Open a job and move or edit its shift, then Apply. A message says the crew hasn't been told, with Notify now.",
            shows: "The job's bar shows Changes not sent.",
            tryIt: "Click a job on the board, change a shift and press Apply.",
          },
          {
            target: "js-unsent", kind: "send", version: "minimal", title: "Send the updates",
            body: "Unsent changes (N) appears once a change is saved. It lists each person with changes waiting; tick who to tell, preview the email, then Send updates. Each person gets one Schedule Update email.",
            shows: "The Changes not sent marks clear, and each send is logged.",
            absentNote: "Unsent changes appears at the top right once a shift change has been applied. Go back a step, change a shift, then come back.",
          },
          {
            target: "js-board", kind: "send", version: "complete", title: "Send from the job, or after Bulk Reschedule",
            body: "Send Email in a job's schedule panel tells that job's crew only. After a Bulk Reschedule, the notify window opens straight away. Results show Delivered or Not delivered per person, with Email and Text, in English or Español.",
          },
        ],
      },
      {
        href: "/settings/automated-messages",
        steps: [{
          target: "js-mode", kind: "update", version: "complete", title: "Automatic or Manual",
          body: "Per template, Automatic sends when the trigger happens and Manual waits for someone to send it.",
          tryIt: "Open a scheduling template and switch its mode.",
        }],
      },
    ],
  },

  rp: {
    key: "rp",
    role: "owner",
    solves: "When an approved estimate is amended, only the difference counts as a sale, in the month it is re-approved, so monthly sales can be trusted.",
    benefits: [
      "Past months stay closed and correct.",
      "A price drop shows as a negative entry, not a rewrite.",
      "Each amendment's change can be seen line by line.",
    ],
    before: "Today the whole estimate moves to the month of the latest approval. Tim's August estimate of about $6,463, amended by $1,495 in September, showed about $7,900 sold in September and nothing in August.",
    pages: [
      {
        href: "/reports?tab=estimates",
        steps: [
          {
            kind: "update", version: "minimal", title: "Where entries come from",
            body: "Amend an approved estimate and send it for re-approval as usual. When the customer re-approves, the change in value (and hours) becomes a new sales entry dated on the re-approval. No change in value or hours makes no entry.",
            shows: "In the Estimates Log and Jobs Sold reports, and the dashboard's sales figures.",
          },
          {
            target: "rp-log", kind: "view", version: "minimal", title: "One row per entry",
            body: "The original sale and each amendment are separate rows, each in its own month, with the amendment's difference as its value.",
          },
          {
            target: "rp-log", kind: "view", version: "complete", title: "What changed, and a flag when it doesn't add up",
            body: "Expand an amendment row to see what changed, line by line. If the entries don't add up to the estimate's current total, the row is flagged.",
          },
        ],
      },
      {
        href: "/reports?tab=jobs_sold",
        steps: [{
          target: "rp-sales", kind: "view", version: "minimal", title: "New sales, amendments and the total",
          body: "Sales in this period splits new sales from amendments, then gives the total. Counts of estimates and jobs don't change: an amendment isn't a new sale.",
        }],
      },
      {
        href: "/reports?tab=sales_estimator",
        steps: [{
          target: "rp-estimator", kind: "view", version: "complete", title: "Sales by Estimator",
          body: "The same entries, totalled per estimator. Change orders count as entries too.",
        }],
      },
    ],
  },

  bk: {
    key: "bk",
    role: "owner",
    solves: "Keeps the full books inside Estimate Master: chart of accounts, journal, bank reconciliation and the Balance Sheet, as a mode of Accounting.",
    benefits: [
      "Subscribers without QuickBooks can keep their books in one place.",
      "Every invoice, payment and bill posts itself to the journal.",
      "Entries are never deleted; mistakes are reversed.",
    ],
    before: "The live app keeps no books. Subscribers use QuickBooks or another tool, or hand records to a bookkeeper.",
    pages: [
      {
        href: "/settings/accounting",
        steps: [{
          target: "bk-chart", kind: "add", version: "minimal", title: "Set up the chart of accounts",
          body: "Books starts with a standard chart of accounts. Add account creates your own, for example a second bank account.",
          shows: "In the journal's account picker and on the reports.",
        }],
      },
      {
        href: "/accounting?mode=books",
        steps: [
          {
            target: "bk-mode", kind: "view", version: "minimal", title: "Books is a mode of Accounting",
            body: "Switch between QuickBooks and Books. Both stay visible in the prototype for comparison.",
          },
          {
            target: "bk-deposit", kind: "update", version: "minimal", title: "Record card payments reaching the bank",
            body: "Card payments reach the bank in daily batches, minus fees. Payments to deposit holds them until you record the deposit and the fee, so the bank lines match.",
            shows: "In the journal, and ready to tick off when you reconcile.",
          },
        ],
      },
      {
        href: "/accounting/journal",
        steps: [
          {
            target: "bk-journal", kind: "view", version: "minimal", title: "The journal",
            body: "Every invoice, payment and bill posts here automatically as a balanced entry. Export the general ledger and trial balance as CSV or Excel for the accountant.",
          },
          {
            target: "bk-journal", kind: "delete", version: "minimal", title: "Reverse an entry instead of deleting it",
            body: "Nothing is ever deleted. Reverse posts a new, equal and opposite entry with your reason; the original stays and shows Reversed. A date in a closed month posts on the 1st of the next open month, with a note.",
            shows: "Both entries in the journal, and the corrected balances on the reports.",
            tryIt: "Press Reverse on an entry and give a reason.",
          },
        ],
      },
      {
        href: "/accounting/checkbook",
        steps: [{
          target: "bk-reconcile", kind: "update", version: "minimal", title: "Reconcile the bank",
          body: "Tick what is on the bank statement. Finish when the difference is $0.00.",
          shows: "Reconciled lines are marked in the checkbook, and the balance carries to the Balance Sheet.",
        }],
      },
      {
        href: "/reports?tab=balance_sheet",
        steps: [{
          target: "bk-balance", kind: "view", version: "minimal", title: "Balance Sheet",
          body: "Assets, liabilities and equity at today's date, on a cash or accrual basis. The badge says whether it balances.",
        }],
      },
    ],
  },
};
