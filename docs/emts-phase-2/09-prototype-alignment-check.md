# Prototype Alignment Check

Oct 2, 2026 · @Lors

The prototype matches this doc closely, but not everywhere. Business rules for amended estimates, CRM stages, crew emails, Books and the 14 v1.0 features match the spec. QuickBooks sync timing, contact matching and permissions follow the older Feature 33 design instead of tab 1, and the lead form differs in several small rules. All seven decisions below were made on 2 Oct 2026 and written into tabs 1, 2 and 4. The code still has to be changed to match.

Checked against emts-prototype at commit fbdc747 (1 Oct 2026). Where the spec and the code disagree, this tab says which one the dev should follow, or that someone must decide.

How to read the status column: **Matches** = code does what the spec says. **Differs** = code does something else; the spec wins unless a decision says otherwise. **Partial** = some of it is built. **Placed differently** = built, but on another screen, on purpose (see tab 7). **Mocked** = works in the prototype only; real backend work needed.

## Decisions (made 2 Oct 2026)

Each row was a place where the spec and the prototype gave different answers. The Decision column is now the rule. The spec tabs are updated; the prototype code is not yet.

| # | Topic | Prototype does today | Decision | Spec updated | Code |
| --- | --- | --- | --- | --- | --- |
| D1 | QuickBooks sync timing | Hourly run, 6 a.m. to 6 p.m. Mon to Sat; manual Retry; escalates after 2 failures | Automatic sync on save, around the clock. Auto retry at 1, 5, 30 and 120 min; Needs Attention after 4 failures | Tab 1, System behaviour | To change |
| D2 | QuickBooks contact matching | Matched only when email AND name match | Matched when either the email or the exact name matches. Possible duplicate only when email and name point to different contacts, or the name fits several | Tab 1, Component 2 | To change |
| D3 | Who can connect QuickBooks | Office manager only | QuickBooks is a paid add-on. Only organisations subscribed to it can connect; others see "Add QuickBooks to your plan" | Tab 1, Access validations | To change |
| D4 | Lead form spam limit | 5 per 10 minutes | 5 per hour per address | Already in tab 2 | To change |
| D5 | Lead form fields | Free-text address and painted question; name up to 120; phone 7+ digits; message 2,000 | Use the spec fields: name 2 to 80; US phone 10 digits; property address; "What would you like painted?" dropdown; message up to 1,000 | Already in tab 2 | To change |
| D6 | Lead sources | Fixed list plus Nextdoor, Thumbtack, Angi, Yard Sign | Dynamic: built-in sources plus any platform the admin adds, on a Lead sources tab in Settings › Pipeline Stages | Tab 2, System validations | To change |
| D7 | Crew email subject | "Your schedule has changed" | "Schedule update from {Company}: {N} jobs changed" | Already in tab 4 | To change |

## Tab 1 — QuickBooks

The data rules are built and tested. The timing and the screen host are not as tab 1 describes. Code: features/lib/store/actions/finance.ts, features/lib/rules/qbo-contacts.ts, features/components/features/finance/.

| Spec item | Status | Where in prototype | Dev note |
| --- | --- | --- | --- |
| Connect / Disconnect, one company per org (QB-M1) | Mocked | Settings › Accounting (setup-screen, destination-card) | Intuit OAuth pop-up is simulated. Real OAuth, token refresh and Reconnect needed |
| Integrations page with one card per integration | Placed differently | Settings › Accounting, not Settings › Integrations | Agreed in tab 7 and the build plan. Update tab 1 (see Doc fixes) |
| Sync options: income, deposit, tax mapping, card method (QB-M2) | Partial | setup-screen.tsx | Mappings exist. No Start sync gate yet: add "Map every tax region first" and the send-existing-records choice (from a start date, or new only) |
| Sync on save, retry 1/5/30/120 min, Needs Attention after 4 | Differs | runExchange() in actions/finance.ts | See D1 |
| Parent before child: Customer → Project → Invoice → Payment | Partial | Exchange queue | Order exists for records sent together; add an explicit "waits for parent" check |
| No duplicates on resend (stored QuickBooks ID) | Matches | idempotencyKey per record version | Keep this key in the real build |
| Invoice amount and date locked once sent | Differs (wording) | editRecordAmount() | Blocks the edit. Message reads "This record is in QuickBooks. Change the amount in QuickBooks…" Spec: "Edit this invoice in QuickBooks" |
| First-connection matching, three groups (QB-M3) | Differs | match-contacts.tsx | Groups match. Rule differs, see D2 |
| Review list for customers made in QuickBooks (QB-C1) | Matches | customer-review.tsx | Link, Create as contact, Ignore |
| Variance and deletion flags (QB-C3) | Matches | actions/finance.ts (variance, deletedInQbo) | Never deletes locally, as specified |
| Sync Log and Needs Attention screens | Partial | queue-screen.tsx (one queue table with attempts) | Split into Sync Log (filters, 25 rows, 12 months) and Needs Attention (count badge on menu) |
| QuickBooks badge on contacts, jobs, invoices | Matches | QuickBooksContact.tsx, InvoiceRow.tsx, JobFeatures.tsx |  |
| Leads never sent | Matches | Only contacts and records sync |  |
| Activity log strings | Differs (wording) | log() calls in actions/finance.ts | Rewrite to the exact strings in tab 1 |
| Access (PAYMENT\_CONFIG) | Differs | features/lib/permissions.ts | See D3 |

## Tab 2 — CRM lead pipelines

Stages, boards and the handover match the spec. The lead form is where the gaps are. Code: features/lib/rules/lead-pipeline.ts, lib/crm.ts, components/leads/, components/settings/config/PipelineStagesView.tsx, lib/website-form.ts.

| Spec item | Status | Where in prototype | Dev note |
| --- | --- | --- | --- |
| Sales and Production boards with a switch (CRM-M1) | Matches | /leads (PipelineBoards.tsx) |  |
| Default Production stages: Pick Colours, Ready to Schedule, Scheduled, In Progress, Touch-ups, Complete | Matches | lib/data/settings-config.ts | Still open for Tim to confirm (Overview) |
| Locked system stages: New, Sold, Lost, Complete | Matches | lead-pipeline.ts | Archived is also a hidden system state, as the spec allows |
| Max 12 stages; names required, 30 chars, unique | Matches | MAX\_STAGES = 12; stage name check | Message is "Keep it under 30 characters." |
| Delete blocked: "Move the {N} cards in this stage first." | Matches | lead-pipeline.ts |  |
| Sold creates one Production card; never a second one | Matches | productionCardsToCreate(); lib/crm.ts |  |
| Moving out of Sold asks Keep / Remove from Production | Matches | app/leads/page.tsx |  |
| iPad Move to menu on cards | Matches | LeadCard.tsx |  |
| Group by Source, no drag between source columns (CRM-C1) | Matches | KanbanBoard.tsx |  |
| Stage history: stage, moved by, moved at (CRM-M7) | Matches | StageHistory.tsx |  |
| Lead capture links with copy, QR, pause | Placed differently | TrackedLinksCard.tsx on /leads, not Settings › Lead Capture | Agreed in tab 7. Add the "leads in last 30 days" count if missing |
| Source order: link tag, then referring site, then Website | Matches | leadSourceFor() in lib/website-form.ts |  |
| Source list | Differs | lib/website-form.ts | See D6 |
| Form fields and validation | Differs | app/website-form/page.tsx, checkSubmission() | See D5 |
| Honeypot | Matches | HONEYPOT\_FIELD; also a 2.5 s minimum fill time |  |
| Rate limit | Differs | app/api/website-form/route.ts | See D4 |
| Possible duplicate on new leads | Differs | Website form rule returns "duplicate" and creates no lead | Spec: create the lead AND mark it "Possible duplicate" with a link to the other one |
| Nothing sent to the customer on card move | Matches | No sends on move |  |
| Access: ADMIN\_MASTER\_DATA for stage edits | Check | Prototype roles in PipelineStagesView.tsx | Map to the live app's permission codes |

## Tab 3 — Amended estimates in reports

The entry rule matches the spec, including Tim's $6,463 + $1,495 case. Code: features/lib/rules/sales-entries.ts (with tests), components/reports/data.ts.

| Spec item | Status | Where in prototype | Dev note |
| --- | --- | --- | --- |
| Original entry on first approval; amendment = difference (RP-M1) | Matches | salesEntries() |  |
| No change in value or hours → no entry | Matches | salesEntries() |  |
| Negative entry in the month of the change (RP-M2) | Matches | salesEntries() |  |
| Values exclude sales tax | Matches | versionValue() | Older versions without a pre-tax total are back-calculated from the tax rate |
| Entry date = date the estimate reached Accepted | Check | Uses the accepted version's date | Make sure the real build stores the signature or manual approval date on the version (EMTS-414) |
| Estimate Log: one row per entry, Original / Amendment N (RP-M3) | Matches | reports data.ts |  |
| Jobs Sold, Sales Goals, Monthly Goal, Revenue add entries by date (RP-M4) | Matches | reports data.ts | Jobs Sold counts originals only, so the job count does not rise |
| Dashboard counts unchanged (RP-M5) | Matches |  |  |
| Backfill of past amendments (RP-M6) | Partial | Older versions give 0 hours difference | Real backfill must read estimate history (preAmendmentTotal, grandTotal). Open question for Tanmoy |
| Nightly check that entries add up (RP-C4) | Matches | entriesAddUp() flag | Real build: a scheduled job |
| Change orders as sales entries (RP-C3) | Matches | features/lib/sales-entries.ts |  |
| Activity log strings | Check |  | Use the exact strings in tab 3 |

## Tab 4 — Job scheduling emails

The Minimal behaviour matches: nothing sends on save, one email per person, markers clear when a change is undone. Code: features/lib/rules/schedule-notify.ts (with tests), components/scheduling/NotifyCrew.tsx.

| Spec item | Status | Where in prototype | Dev note |
| --- | --- | --- | --- |
| No crew email on save; snapshot rule (JS-M1) | Matches | schedule-notify.ts |  |
| "Changes not sent" marker; clears when undone (JS-M2) | Matches | NotifyCrew.tsx |  |
| Unsent changes (N) button and Notify crew modal (JS-M3) | Matches | NotifyCrew.tsx | Select all, Clear all, Not now, Send updates, "No email on file" all present |
| One summary email: New jobs, Changed jobs, Removed from; empty sections left out (JS-M4) | Matches | scheduleUpdateMessage() | Old dates show as "was …". Spec asks for them crossed through in the email |
| Email subject | Differs | schedule-notify.ts | See D7 |
| Template in Automated Messages as "Schedule Update (crew)" | Check |  | Confirm the template name in Settings › Automated Messages |
| Send Email for one job (JS-C1) | Placed differently | Edit Schedule panel (ShiftSchedulePanel.tsx) | Spec puts it in the Edit Shift popup footer, left of Assign shift. Add the "No changes to send" disabled state |
| Notify step after Bulk Reschedule (JS-C2) | Matches | NotifyCrew.tsx |  |
| Delivered / Not delivered per person (JS-C4) | Mocked | NotifyCrew.tsx | Sandbox only. Real email delivery status needed |
| Text message option (JS-C5), Spanish email (JS-C6) | Matches | NotifyCrew.tsx | Spanish depends on EMTS-339 |

## Tab 5 — Estimate Master Books

The accounting rules match tab 5, including the accountant-review fixes. Books lives inside Accounting, as tab 7 recommended, not as its own sidebar item. Code: features/lib/rules/ledger.ts (with tests), features/components/features/finance/books-\*.tsx, /accounting.

| Spec item | Status | Where in prototype | Dev note |
| --- | --- | --- | --- |
| Books menu item in the main sidebar | Placed differently | A mode of /accounting | Agreed in tab 7. Update tab 5 |
| Switch destination; QuickBooks disconnected | Matches | destination-card.tsx |  |
| Preset chart of accounts, all 24 accounts and numbers | Matches | ledger.ts | Chase Card 2300 is a liability, as fixed |
| Posting rules table, incl. deposits to income on final invoice | Matches | postingsFor() | Worked check: JOB-2026-37 comes to $7,958.00 |
| Card batches via 1050 with fee to 6200 (BK-M10) | Matches | ledger.ts |  |
| Write-offs and customer credits (BK-M11) | Matches | ledger.ts (6900) |  |
| Sales tax payment (BK-M12) | Matches | salesTaxSummary() |  |
| Cash / Accrual toggle; year-end roll to 3900 (BK-M13) | Matches | balances(basis), year\_end |  |
| Closed month posts on the 1st of the next open month with a note | Matches | postingDate() | Note wording differs slightly from "Original date 30 Aug" |
| Debits = credits; no Delete, only Reverse | Matches | isBalanced() |  |
| Bank CSV import and reconciliation | Mocked | Bank and Card Feeds screens | Real bank import needed |
| Access: Owner closes and reopens months; Admin cannot | Check | features/lib/permissions.ts | Map to the live app's roles |
| CPA sign-off of posting rules | Open |  | Needed before real customer books go live |

## The 14 features in tab 8 (Final Design v1.0)

All 14 features are built in the prototype engine (features/), ported from the original prototype that was built from v1.0. They are not re-checked line by line here. The six cross-feature rules were spot-checked in code:

| Rule | Status | Where in prototype |
| --- | --- | --- |
| Rule 1 — signed-scope change rule, 10% office-only limit | Matches | features/lib/rules/change-rule.ts |
| Rule 2 — outstanding demand formula | Matches | features/lib/rules/demand.ts |
| Rule 3 — labour cost from the bookkeeper, allocated by approved hours | Matches | features/lib/rules/labour-cost.ts |
| Rule 4 — closed list of customer messages, sent by a person | Matches | Sends are sandboxed and logged |
| Rule 5 — residual to largest, then lowest job number | Matches | features/lib/rules/allocation.ts |
| Rule 6 — money half-up to cents; quantities rounded once | Matches | features/lib/rules/rounding.ts |

Feature 33 is partly overridden by tabs 1 and 5: where they disagree (QuickBooks timing, see D1), tabs 1 and 5 are newer and win.

## Build health and prototype-only parts

The prototype installs, typechecks and builds cleanly. One test fails, and only at the start of a month.

| Check | Result | Note |
| --- | --- | --- |
| npm ci | Pass | 0 vulnerabilities |
| npm run typecheck | Pass |  |
| npm test | 682 of 683 pass | features/lib/rules/marketing.test.ts, "monthly report counts posts": no seeded posts fall in the current month on 1 Oct. Date-dependent test; pin the clock |
| npm run build | Pass |  |
| README | Out of date | Says 346 tests; there are 683 |

What the dev must replace, not copy:

- **Data storage.** Records live in browser localStorage, optionally shared through one Supabase app\_state row. Real tables are listed in each tab's "Tables to use".
- **Integrations.** QuickBooks, Authorize.Net, suppliers, bank feeds, Gusto, Facebook and Instagram, email and SMS are simulated. Sends are sandboxed and logged.
- **Demo scaffolding.** NEW badges, MINIMAL / COMPLETE badges, FeatureGate, the New Features panel, the Prototype bar and the demo user switch are for client review only. Use FeatureGate's item IDs as the list of real feature flags, if tiers need them.
- **Roles.** The prototype uses its own roles (owner, office manager, bookkeeper and others). Map each permission to the live app's codes (PAYMENT\_CONFIG, ADMIN\_MASTER\_DATA, REPORT\_VIEW, JOB\_VIEW\_FINANCIALS).
- **Keep.** The pure rules in features/lib/rules/ and their tests carry the business logic. Port them as they are.

## Fixes this doc needs

These spec lines describe a design that tab 7 later changed. Update them so the dev reads one story.

- [ ] Tab 1: replace Settings › Integrations with Settings › Accounting (screen host, menu, wireframe).
- [x] Tab 1: write in the outcome of D1, D2 and D3.
- [ ] Tab 2: replace Settings › Lead Capture with the Tracked links card on Lead Pipeline.
- [x] Tab 2: write in the outcome of D4, D5 and D6.
- [ ] Tab 4: Send Email sits in the Edit Schedule panel, or move it to the Edit Shift popup as specified. Pick one.
- [ ] Tab 5: Books is a mode of Accounting, not a new sidebar item; the switch lives in Settings › Accounting.
- [ ] Scope tab: mark items already built as "Exists in prototype", as tab 7 recommends.
