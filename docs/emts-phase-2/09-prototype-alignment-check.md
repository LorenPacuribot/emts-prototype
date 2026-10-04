# Prototype Alignment Check

Oct 2, 2026 · @Lors

The prototype now matches this doc for tabs 1 to 5 and the 14 v1.0 features. The seven decisions of 2 Oct (D1–D7) are built, and a 30-item spec check against tabs 1, 2, 4 and 9 passes in full (tab 10). What remains is backend work the prototype only simulates, listed under Build health below.

First checked against emts-prototype at commit fbdc747 (1 Oct 2026). Re-checked at f9041e5 (2 Oct 2026), after commits 9f530a6 (D1–D7) and f9041e5 (spec check gaps). The repo also keeps a copy of this doc in docs/emts-phase-2/; this doc is the source of truth.

How to read the status column: **Matches** = code does what the spec says. **Differs** = code does something else; the spec wins unless a decision says otherwise. **Partial** = some of it is built. **Placed differently** = built, but on another screen, on purpose (see tab 7). **Mocked** = works in the prototype only; real backend work needed.

## Decisions (made 2 Oct 2026)

Each row was a place where the spec and the prototype gave different answers. The Decision column is the rule. The spec tabs and the code both follow it now.

| # | Topic | Prototype before | Decision | Spec | Code | Where to see it |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | QuickBooks sync timing | Hourly run, 6 a.m. to 6 p.m. Mon to Sat; manual Retry | Sync on save, around the clock. Auto retry at 1, 5, 30 and 120 min, then Needs Attention | Tab 1 | Done | /accounting/transfer-queue (Sync Log), /accounting/needs-attention |
| D2 | QuickBooks contact matching | Matched only when email AND name match | Matched on email OR exact name. Possible duplicate only on a split or several names | Tab 1 | Done | /settings/accounting › Match your contacts |
| D3 | Who can connect QuickBooks | Office manager only | Paid add-on. Without it: "Add QuickBooks to your plan." With it: Owner and Admin connect | Tab 1 | Done | /settings/accounting; Prototype bar › QuickBooks add-on |
| D4 | Lead form spam limit | 5 per 10 minutes | 5 per hour per address | Tab 2 | Done | /api/website-form |
| D5 | Lead form fields | Free-text address and question; loose limits | Spec fields: name 2–80, US phone, property address, painted dropdown, message 1,000 | Tab 2 | Done | /website-form |
| D6 | Lead sources | Fixed list | Built-in eight plus admin-added sources | Tab 2 | Done | /settings/pipeline-stages › Lead sources |
| D7 | Crew email subject | "Your schedule has changed" | "Schedule update from {Company}: {N} jobs changed" | Tab 4 | Done | /job-scheduling › Unsent changes › Preview |

## Tab 1 — QuickBooks

Everything in tab 1 is built, except the real Intuit connection. Code: features/lib/rules/qbo-sync.ts and qbo-contacts.ts (with tests), features/lib/store/actions/finance.ts, features/components/features/finance/.

| Spec item | Status | Where in prototype | Dev note |
| --- | --- | --- | --- |
| Connect / Disconnect, one company per org (QB-M1) | Mocked | qbo-connection-card.tsx | Disconnect confirmation and Reconnect needed are built. Real Intuit OAuth and token refresh still needed |
| Integrations page with one card per integration | Placed differently | Settings › Accounting | Agreed in tab 7 |
| Sync options and Start sync gate (QB-M2) | Matches | qbo-connection-card.tsx | Needs income, deposit, card method and every tax region; then from a start date or new only |
| Sync on save, retry 1/5/30/120 min, Needs Attention (D1) | Matches | qbo-sync.ts | Moves after the 4th failed retry (5th attempt) |
| Parent first: Customer → Project → Invoice → Payment | Matches | qbo-sync.ts | Child shows "Waiting for parent" |
| No duplicates on resend | Matches | Idempotency key per record version | Keep this key in the real build |
| Contacts and jobs sent when saved | Matches | actions/finance.ts | A person is sent once they have a job or estimate; leads never |
| Invoice amount and date locked once sent | Matches | app/invoices/\[id\] | Disabled "Edit this invoice in QuickBooks" |
| First-connection matching (QB-M3, D2) | Matches | qbo-contacts.ts | Names compared ignoring case and extra spaces |
| Review list for customers made in QuickBooks (QB-C1) | Matches | customer-review.tsx |  |
| Variance and deletion flags (QB-C3) | Matches | actions/finance.ts | Never deletes locally |
| Sync Log | Matches | /accounting/transfer-queue | Filters, 25 a page, newest first, 12 months |
| Needs Attention | Matches | /accounting/needs-attention | Count badge, Retry, Open record, Dismiss |
| QuickBooks badge on records | Matches | QuickBooksContact.tsx, InvoiceRow.tsx, JobFeatures.tsx |  |
| Activity log strings | Matches | qboLogText() in qbo-sync.ts | Word for word |
| Access: add-on plus PAYMENT\_CONFIG (D3) | Matches | features/lib/permissions.ts | Admin is the office manager in the prototype |

## Tab 2 — CRM lead pipelines

Everything in tab 2 is built. The address lookup uses a short local list; the real build needs an address service. Code: features/lib/rules/lead-pipeline.ts and lead-sources.ts, lib/crm.ts, lib/website-form.ts, components/leads/, components/settings/config/.

| Spec item | Status | Where in prototype | Dev note |
| --- | --- | --- | --- |
| Sales and Production boards with a switch (CRM-M1) | Matches | /leads |  |
| Default Production stages | Matches | lib/data/settings-config.ts | Still open for Tim to confirm (Overview) |
| Locked system stages; max 12; names 30 chars, unique | Matches | lead-pipeline.ts |  |
| Delete blocked: "Move the {N} cards in this stage first." | Matches | lead-pipeline.ts |  |
| Sold creates one Production card; Keep / Remove when moved out | Matches | lib/crm.ts, app/leads/page.tsx |  |
| Group by Source; Move to menu; stage history | Matches | KanbanBoard.tsx, LeadCard.tsx, StageHistory.tsx |  |
| Lead capture links with copy, QR, pause | Placed differently | TrackedLinksCard.tsx on /leads | Agreed in tab 7 |
| Source order: link tag, referring site, Website | Matches | leadSourceFor() |  |
| Lead sources list (D6) | Matches | LeadSourcesPanel.tsx, lead-sources.ts | A rename keeps the old name so existing leads keep their source |
| Form fields and validation (D5) | Matches | /website-form | Address lookup is mocked |
| Honeypot; 5 per hour (D4) | Matches | lib/website-form.ts, api route |  |
| Possible duplicate: lead created and marked, with a link | Matches | marketing.ts |  |
| "New lead from {Source}: {Name}." notice | Matches | actions/marketing.ts | Goes to admins and the organisation's default estimator (defaultEstimatorId, new setting) |
| Stages, sources and links editable by Admin Master Data only | Matches | PipelineStagesView.tsx, LeadSourcesPanel.tsx, TrackedLinksCard.tsx | Read-only for everyone else |
| Nothing sent to the customer on card move | Matches |  |  |

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

Everything in tab 4 is built; email delivery is sandboxed. Code: features/lib/rules/schedule-notify.ts (with tests), components/scheduling/NotifyCrew.tsx.

| Spec item | Status | Where in prototype | Dev note |
| --- | --- | --- | --- |
| No crew email on save; snapshot rule (JS-M1) | Matches | schedule-notify.ts |  |
| "Changes not sent" marker; clears when undone (JS-M2) | Matches | NotifyCrew.tsx |  |
| Unsent changes (N) and Notify crew modal (JS-M3) | Matches | NotifyCrew.tsx |  |
| One summary email with New, Changed, Removed from (JS-M4) | Matches | scheduleUpdateMessage() | Old dates crossed through in the preview |
| Subject "Schedule update from {Company}: {N} jobs changed" (D7) | Matches | schedule-notify.ts | English and Spanish |
| Template "Schedule Update (crew)" | Matches | Settings › Automated Messages |  |
| Send Email for one job (JS-C1) | Placed differently | Edit Schedule panel | Disabled with "No changes to send."; toast "Update sent to {N} people." |
| Notify step after Bulk Reschedule (JS-C2) | Matches | NotifyCrew.tsx |  |
| Delivered / Not delivered per person (JS-C4) | Mocked | NotifyCrew.tsx | Real email delivery status needed |
| Text option (JS-C5), Spanish email (JS-C6) | Matches | NotifyCrew.tsx | Spanish depends on EMTS-339 |
| Activity log per person | Matches | scheduleLogText() | Sent, unticked, not delivered |

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

At f9041e5 the prototype installs, typechecks and builds cleanly, and all 733 tests pass.

| Check | Result | Note |
| --- | --- | --- |
| npm run typecheck | Pass |  |
| npm test | 733 of 733 pass | The start-of-month marketing test is fixed |
| npm run build | Pass |  |
| README | Up to date | Test count and D1–D7 notes added |

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
