# Scope of Work — Minimal vs Complete

Each feature from the 30 Sep call has two versions for Tim to choose from. Minimal is the smallest build that fully solves his problem today. Complete adds his expanded ideas on top. Complete never replaces or rewrites anything in Minimal.

## How this works

### The build-up rule

- Every Complete item names the Minimal item it adds to.
- Minimal lays down the full data model from day one, even where its screens use only part of it. Complete then adds screens and logic, not new foundations.
- Nothing built for Minimal is thrown away or redone.
- Complete still takes extra build time for the extra features. What it avoids is rework time.

Example: Minimal ships only Sales and Production pipelines, but the database stores pipelines as a list. Complete's "Add pipeline" button is then a new screen on the same table, not a database change.

### Item IDs

Every item has an ID, so the design doc, Figma and the prototype prompt can all point to the same thing.

- QB = QuickBooks, CRM = CRM pipelines, JS = Job Scheduler emails, RP = Reports, BK = Estimate Master Books (new module), X = shared.
- M = Minimal, C = Complete. For example, CRM-M3 is the third Minimal CRM item.

### Markers in the prototype

| Marker | Looks like | Means |
| --- | --- | --- |
| Version switch | "Version: Minimal / Complete" toggle in the prototype header | Minimal hides every Complete-only element. Complete shows everything. |
| Minimal badge | Small blue pill "MINIMAL" | Part of the first release |
| Complete badge | Small purple pill "COMPLETE" | Only in the Complete version |
| Item ID | Grey text beside the badge, for example "CRM-C4" | Links the element to this scope list |
| New module badge | Small orange pill "NEW MODULE" | Part of Estimate Master Books, the built-in accounting module. Shown with its own Minimal or Complete badge beside it. |

Badges sit on the top-right corner of the element they describe: a whole screen, a panel, a button or a column. A Minimal screen that gains Complete parts keeps its blue badge, and each added part gets its own purple one.

"Exists in prototype" in a Version column means the emts-prototype repo already has that item (see tab 7). The dev team estimates only the gap to production, and the prototype adds only the marker.

## QuickBooks

Minimal gives the Paint Scout customer what Paint Scout gave him: contacts, jobs, invoices and payments flowing into QuickBooks. Complete adds two-way contacts, the in-app QuickBooks view Amlan offered, and more record types.

| ID | Version | Item | Adds to |
| --- | --- | --- | --- |
| QB-M1 | Minimal · Exists in prototype | Integrations page in Settings, with a QuickBooks card: connect, reconnect, disconnect | — |
| QB-M2 | Minimal | Sync options: income account, deposit account, tax mapping, card payment method | — |
| QB-M3 | Minimal | First-connection matching of existing contacts to QuickBooks Customers | — |
| QB-M4 | Minimal · Exists in prototype | Send contacts, jobs, invoices and payments to QuickBooks on save | X-M3 |
| QB-M5 | Minimal · Exists in prototype | Payment status back from QuickBooks; invoice amount locked after sending | — |
| QB-M6 | Minimal · Exists in prototype | Sync Log, Needs Attention list, retry queue, Sync now | — |
| QB-M7 | Minimal · Exists in prototype | "QuickBooks" badge and link on synced records | — |
| QB-C1 | Complete | Review list for customers created in QuickBooks: link, create or ignore | QB-M3 |
| QB-C2 | Complete | Two-way contact details: name, phone, email and address edits in QuickBooks flow back, latest edit wins | QB-M4 |
| QB-C3 | Complete · Exists in prototype | Variance flags (amount changed in QuickBooks) and deletion flags | QB-M5, QB-M6 |
| QB-C4 | Complete | In-app QuickBooks panel on contacts, jobs and invoices: balance, status, open in QuickBooks | QB-M7 |
| QB-C5 | Complete | More record types: supplier bills, receipts, credits, refunds (Feature 33) | QB-M4 |
| QB-C6 | Complete · Exists in prototype | Job margin report using QuickBooks costs | QB-C5 |

What Minimal lays down so Complete needs no rework:

- One links table that stores any record type with its QuickBooks ID and a direction setting. Complete adds types and directions, not tables.
- A sync queue that can hold incoming and outgoing jobs from day one, even though Minimal only uses incoming for payment status.
- The Integrations page as a grid of cards, so future integrations (Google, Stripe) are just more cards.

Replacing QuickBooks is not part of this feature. It is its own new module, Estimate Master Books, in the next section.

## Estimate Master Books (new module)

Yes, a QuickBooks replica is possible. It works as a new module called Estimate Master Books that plugs into the jobs, invoices and payments the system already has. It is the biggest item in this doc, a full accounting system, so it should come after QuickBooks Minimal and be designed with an accountant.

Books replaces QuickBooks completely. An organisation on Books has no QuickBooks account, no QuickBooks connection and no QuickBooks subscription. Nothing in Books calls or depends on QuickBooks.

In the prototype, every Books screen carries the orange NEW MODULE badge, plus its own Minimal or Complete badge. Item IDs start with BK.

### What makes it harder than the sync

- Double-entry bookkeeping. Every money movement is recorded twice, once where it came from and once where it went, so the books always balance. The system must never let them go out of balance.
- Tax. Owners need sales tax reports and year-end figures their accountant can use.
- Payroll. Running payroll means filing payroll taxes in every state the business works in. The practical route is to keep Gusto and bring in its totals, not to build payroll.
- Trust. Once a contractor's books live here, a mistake is expensive. Closed months must be locked, and entries corrected only by reversing them, never by deleting them.
- Accountants. Many expect QuickBooks, so Books must export in a format they can work with.

### How it plugs in without rework

- Estimate Master turns invoices, payments, deposits and refunds into accounting events inside the system (X-M3). This layer belongs to Estimate Master, not to QuickBooks.
- The QuickBooks sync is one user of those events: it sends them out to QuickBooks. Books is another user: it records them in its own ledger. Both reuse the same events, so neither needs rework.
- Each organisation picks one accounting destination (X-M2): None, QuickBooks Online, or Estimate Master Books. Choosing Books switches QuickBooks off for that organisation. The two never run together.
- Existing screens for invoices, payments and jobs do not change. Books adds its own "Books" menu item.
- A business moving from QuickBooks to Books can import its history once (BK-C5). After the import, the QuickBooks connection is removed and never used again.

### Scope

| ID | Version | Item | Adds to |
| --- | --- | --- | --- |
| BK-M1 | Minimal | Books menu item, switched on by choosing Estimate Master Books as the accounting destination | X-M2 |
| BK-M2 | Minimal | Chart of accounts, preset for painting contractors, editable by the owner | — |
| BK-M3 | Minimal | Automatic double-entry postings from invoices, payments, deposits and refunds | X-M3 |
| BK-M4 | Minimal · Exists in prototype | Bills and expenses: enter supplier bills, record payment, attach a receipt photo | BK-M2 |
| BK-M5 | Minimal · Exists in prototype | Bank and card accounts, with CSV statement import and reconciliation | BK-M2 |
| BK-M6 | Minimal | Reports: Profit and Loss, Balance Sheet, money owed to you, money you owe, sales tax summary | BK-M3, BK-M4 |
| BK-M7 | Minimal · Exists in prototype | Month close: lock a month so nothing can change it | BK-M3 |
| BK-M8 | Minimal | Accountant export: general ledger and trial balance as CSV and Excel | BK-M3 |
| BK-M9 | Minimal | Audit trail: every entry logged with who and when; corrections by reversal only | BK-M3 |
| BK-M10 | Minimal | Card payment settlement: card payments wait in "Payments to deposit" until the Authorize.Net batch reaches the bank, with the processing fee recorded | BK-M3, BK-M5 |
| BK-M11 | Minimal | Write-offs and customer credits: write off an unpaid invoice as bad debt; hold an overpayment as a credit for the customer | BK-M3 |
| BK-M12 | Minimal | Sales tax payment: record paying the state from the sales tax summary | BK-M6 |
| BK-M13 | Minimal | Cash or accrual view on every report, and automatic year-end roll of profit into retained earnings | BK-M6, BK-M7 |
| BK-C1 | Complete · Partly in prototype | Live bank feeds, so Chase transactions arrive without a CSV | BK-M5 |
| BK-C2 | Complete | Gusto payroll totals imported as a journal entry each pay run | BK-M3 |
| BK-C3 | Complete | Job costing: profit per job from Books entries | BK-M3, BK-M4, RP-M1 |
| BK-C4 | Complete | Supplier bills matched to purchase orders from Supplier Orders | BK-M4 |
| BK-C5 | Complete | Move from QuickBooks: import customers, open invoices and opening balances | X-M2 (one-time import, then QuickBooks is disconnected) |
| BK-C6 | Complete | 1099 contractor report, and budget versus actual | BK-M6 |
| BK-C7 | Complete · Exists in prototype | Accountant role: read everything, post adjusting entries, nothing else | BK-M9 |
| BK-C8 | Complete · Exists in prototype | Recurring bills and recurring journal entries | BK-M4 |

Not in either version: running payroll and filing payroll or income taxes. Those stay with Gusto and the accountant.

BK-M10 to BK-M13 were added after an accountant-style review of the design (see tab 5). Before real customer books go live, a licensed CPA signs off the chart of accounts and posting rules, and Amlan estimates Books separately from the QuickBooks sync.

## CRM

Minimal delivers what Tim called the main part: outside forms dropping leads into the board, and separate Sales and Production pipelines. Complete adds everything he showed from Paint Scout's paid version: more pipelines, stage emails, and automations.

| ID | Version | Item | Adds to |
| --- | --- | --- | --- |
| CRM-M1 | Minimal | Sales and Production boards with a switch at the top | — |
| CRM-M2 | Minimal | Pipeline Stages settings: add, rename, reorder, delete, colour, per pipeline; New, Sold, Lost, Complete locked | — |
| CRM-M3 | Minimal | Sold creates a Production card automatically | CRM-M1 |
| CRM-M4 | Minimal · Exists in prototype | Hosted lead capture form, one per organisation | — |
| CRM-M5 | Minimal | Tracked links per channel (Website, Facebook, Instagram) with Copy link and QR code; source set automatically | CRM-M4 |
| CRM-M6 | Minimal | Source badge on cards and Source filter | CRM-M5 |
| CRM-M7 | Minimal | Stage history on each lead and job | CRM-M1 |
| CRM-C1 | Complete | Group by source view, giving Tim his "Facebook leads" columns | CRM-M6 |
| CRM-C2 | Complete | Add pipeline: Marketing and any custom pipeline, each with its own stages | CRM-M1, CRM-M2 |
| CRM-C3 | Complete | Stage emails: choose a message template for a stage or outcome (estimate accepted, declined, no-show) | CRM-M7 |
| CRM-C4 | Complete | Automations list: "When {trigger}, if {condition}, then {action}", with on/off per rule | CRM-M7, CRM-C3 |
| CRM-C5 | Complete | Visual flow builder (GoHighLevel style): the same automations drawn as a flowchart, with branches such as Approved / Declined / No reply | CRM-C4 |
| CRM-C6 | Complete | Direct Facebook Lead Ads and Instagram lead form connections | CRM-M5 |
| CRM-C7 | Complete | Customer journey bar on the contact page showing stage across all pipelines | CRM-M7, CRM-C2 |

What Minimal lays down so Complete needs no rework:

- Pipelines are stored as a list from day one, with Sales and Production as the first two rows. CRM-C2 adds a button, not a table.
- Every stage change is saved as an event (CRM-M7). Stage emails and automations simply listen for those events, so the board never has to change.
- Automations are stored as trigger, condition and action steps linked to each other. The list view (CRM-C4) and the flowchart (CRM-C5) are two ways of showing the same data, so building the flowchart later does not replace the list.
- Sources are a system list from day one, so Facebook Lead Ads (CRM-C6) is just a new way to fill the same field.

How customer messages are controlled (decided 1 Oct): every stage email and automation starts in "Ask me first" mode, where each message waits in the approval queue (S-CRM9) for one click. When a user with Owner or Admin rights clicks "Approve automation" on a rule, that rule can send on its own. The approval records who approved it and when. Any edit to the rule's trigger, conditions or message removes the approval, and it goes back to "Ask me first".

## Job Scheduler emails

Minimal stops the flood: nothing sends on save, and one Notify crew step sends each person a single summary email. Complete adds more ways to send, and a settings page where Tim picks which emails stay automatic.

| ID | Version | Item | Adds to |
| --- | --- | --- | --- |
| JS-M1 | Minimal | Schedule changes no longer email the crew on save | — |
| JS-M2 | Minimal | "Changes not sent" marker on job bars | JS-M1 |
| JS-M3 | Minimal | Unsent changes (N) button in the scheduler header, opening the Notify crew modal: people listed and ticked, untick to skip | JS-M2 |
| JS-M4 | Minimal | One Schedule Update summary email per person: new jobs, changed jobs, removed from | JS-M3 |
| JS-C1 | Complete | Send Email button in the Edit Shift popup, for one job | JS-M3 |
| JS-C2 | Complete | Notify crew modal opens straight after Bulk Reschedule | JS-M3 |
| JS-C3 | Complete | Email Events settings page: every automated email from Tanmoy's list, each set to Automatic or Manual | JS-M1 |
| JS-C4 | Complete | Delivery status per person (Delivered, Not delivered) | JS-M4 |
| JS-C5 | Complete | Text message option alongside email | JS-M4 |
| JS-C6 | Complete | Summary email in Spanish for Spanish-language employees | JS-M4 |

What Minimal lays down so Complete needs no rework:

- A snapshot of what each person was last told. The per-job button (JS-C1) and the bulk step (JS-C2) are the same modal, filtered to fewer jobs.
- Each email type is stored with an Automatic / Manual setting from day one. Minimal just sets the crew schedule email to Manual; JS-C3 is the screen that shows these settings.
- The summary email is a template with a job list slot, so a text version (JS-C5) or a translation (JS-C6) fills the same slot.

JS-C5 is blocked until the bookkeeper confirms state texting rules.

## Reports

Minimal fixes the numbers: an amendment only counts its difference, in the month the customer re-approves it. Complete adds ways to see and explain those differences.

| ID | Version | Item | Adds to |
| --- | --- | --- | --- |
| RP-M1 | Minimal | Sales entries: original approval plus one entry per re-approval, for the difference in value and hours | — |
| RP-M2 | Minimal | No change in value or hours creates no entry; a price drop creates a negative entry | RP-M1 |
| RP-M3 | Minimal | Estimate Log shows one row per entry (Original, Amendment 1, 2…) under the same estimate number | RP-M1 |
| RP-M4 | Minimal | Jobs Sold, Sales Goals, Monthly Goal and Revenue add up entries by date | RP-M1 |
| RP-M5 | Minimal | Dashboard estimate count and win rate are unchanged by amendments | RP-M1 |
| RP-M6 | Minimal | One-time backfill of past amendments from estimate history | RP-M1 |
| RP-C1 | Complete | Expand an Estimate Log row to see what changed: lines added, removed, repriced | RP-M3 |
| RP-C2 | Complete | Sales by estimator and by month, split into new sales and amendments | RP-M4 |
| RP-C3 | Complete · Exists in prototype | Change orders as their own record with their own number, each creating a sales entry (Feature 24) | RP-M1 |
| RP-C4 | Complete | Nightly check that each estimate's entries add up to its approved total, with a review list | RP-M1 |

What Minimal lays down so Complete needs no rework:

- Each entry keeps a link to the estimate history record that created it. RP-C1 reads that link; nothing new is stored.
- Each entry has a type field (Original, Amendment) from day one. Change orders (RP-C3) become a third type.
- Entries store the estimator, so RP-C2 is a new report on existing data.

## Shared foundations

| ID | Version | Item | Adds to |
| --- | --- | --- | --- |
| X-M1 | Minimal | A feature switch per organisation for each Complete item, all off by default | — |
| X-C1 | Complete | Plan gating: switches tied to subscription tiers, with an "Upgrade to unlock" card on locked features | X-M1 |
| X-M2 | Minimal | Accounting destination setting per organisation: None, QuickBooks Online, or Estimate Master Books. Minimal offers None and QuickBooks only. | — |
| X-M3 | Minimal | Accounting events: invoices, payments, deposits and refunds recorded as events inside Estimate Master, independent of any accounting system. Used by the QuickBooks sync now and by Books later. | — |

X-M1 is what makes Tim's paid add-on idea possible later. Each Complete item is switched on per organisation, so selling it as an add-on is a pricing decision, not a build.

## Decisions for Tim

- [x] Build order: design every version, Minimal and Complete, with markers on all of it. Tim picks from the prototype.
- [x] Customer messages: stage emails and automations send on their own only after a person clicks "Approve automation" on that rule. Until then, each message waits for one-click approval. Editing an approved rule removes its approval.
- [ ] Paid tiers: which Complete items go into which tier. Loren to analyse later.
- [x] Estimate Master Books: build it, with markers. The design has been reviewed from an accountant's point of view (tab 5). A licensed CPA should still sign off before any real customer's books go live.
- [x] Prototype duplicates: QuickBooks and Books screens can both show at once for visualisation. Remove one later if needed.

## Next steps

| Step | What you get | Status |
| --- | --- | --- |
| 1. Scope of work | This tab: every Minimal and Complete item with an ID | Done |
| 2. Final design documentation | Tabs 1 to 4 updated so every screen, panel and control is tagged with its item ID and badge, plus a screen list for the prototype | Done: tab 5 (Books) and tab 6 (Prototype Screens) added; tabs 1 to 4 carry version maps |
| 3. Figma designs | Screens drawn in Figma from step 2, with the Minimal / Complete badges | Paused: 29 draft frames exist but do not match the prototype (tab 7). Capture from the running prototype after Step 4 instead. |
| 4. Prototype prompt | A Claude prompt that builds the screens into your prototype, with the version switch and badges | Ready: EMTS\_BUILD\_MINIMAL\_COMPLETE.md, run in Claude Code in the emts-prototype repo, one phase at a time |

The existing tabs 1 to 4 currently mix some Complete items into the main spec (for example, the QuickBooks review list and Group by source). Step 2 fixes that by tagging each part.
