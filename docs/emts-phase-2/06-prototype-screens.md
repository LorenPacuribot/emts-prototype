# Prototype Screens

> Update 1 Oct: tab 7 (Prototype Fit Review) replaces the visual conventions below with the prototype's real design system. That means Roboto and Manrope, the icon rail, NewBadge-style markers, and the version switch in the Prototype bar. It also maps each screen to its existing host. Where the two tabs disagree, tab 7 wins.

This tab is the single design reference for the prototype and for Figma. Each screen lists its layout and every element, tagged with its item ID from the Scope tab. Behaviour and rules live in tabs 1 to 5; this tab covers what each screen shows.

## Conventions

### Version switch

- A "Version: Minimal / Complete" segmented control sits in the prototype's top bar, left of the notifications bell. Default: Minimal.
- Minimal hides every element tagged COMPLETE. Complete shows everything.
- A screen that exists only in Complete is hidden from menus in Minimal. Opening its route directly shows "This screen is part of the Complete version" with a button to switch.
- The switch is saved in the browser, so reloading keeps the choice.

### Badges

| Badge | Colour | Text | Where it goes |
| --- | --- | --- | --- |
| Minimal | Blue background #DBEAFE, text #1D4ED8 | MINIMAL | Top-right of each screen title, and of panels that are Minimal |
| Complete | Purple background #EDE9FE, text #6D28D9 | COMPLETE | Top-right of every Complete-only screen, panel, column or button |
| New module | Orange background #FFEDD5, text #C2410C | NEW MODULE | Beside the Minimal or Complete badge on every Books screen |
| Item ID | No background, grey #6B7280 | For example, CRM-C4 | Right after the badge |

Badge size: 10 px uppercase text, 2 px by 6 px padding, fully rounded. On a button, the badge sits above its top-right corner, not inside it.

A "Hide markers" switch beside the version control removes all badges, for clean screenshots to show Tim.

Duplicates are allowed. The prototype is for visualisation, so it can show things the real product would not show together, such as the QuickBooks screens and the Books screens at the same time. Anything not needed is removed later.

### Reuse the prototype's existing parts

- Keep the prototype's current sidebar, top bar, cards, tables, modals, toasts and the yellow "Shared data is unavailable" banner.
- Modals follow the existing pattern: title, close icon, body, right-aligned Cancel and primary button.
- New settings pages go in the existing Settings sidebar groups.

### Sample data

Use the same people and records on every screen, so the story joins up when Tim clicks through.

| Type | Sample |
| --- | --- |
| Company | Master's Touch Painting |
| Owner | Tim Skelly |
| Estimators | Priya Shah, Marcus Lee |
| Crew | Braden Skelly, Luis Ortega, Dana Ruiz |
| Contacts | Mike Nelson, 4111 85th Ave NE, Shoreview MN; Jeff Carter; Beth Carver |
| New lead | Jordan Irons, received 29 Sep 2026, source Facebook |
| Estimates | EST-2026-74 Mike Nelson, sold $6,463 on 18 Aug, amended +$1,495 on 23 Sep |
| Jobs | JOB-2026-37 Nelson Interior, 6 to 8 Oct |
| Invoices | INV-2026-112 deposit $2,000, INV-2026-118 final $5,958 |

## Screen inventory

34 screens in total: 22 show in Minimal, and Complete adds 12 more. Screens marked "Minimal + Complete parts" show in both versions and gain extra elements in Complete.

| Screen | Name | Route | Version | Item IDs |
| --- | --- | --- | --- | --- |
| S-QB1 | Settings › Integrations | /settings/accounting | Minimal | QB-M1, X-M2 |
| S-QB2 | QuickBooks detail | /accounting, /accounting/transfer-queue, /accounting/unallocated | Minimal + Complete parts | QB-M2, QB-M6, QB-C1, QB-C3 |
| S-QB3 | Connect and first match (modal flow) | modal on /settings/accounting | Minimal | QB-M1, QB-M3 |
| S-QB4 | Invoice detail, synced and locked | /invoices/INV-2026-118 | Minimal + Complete parts | QB-M5, QB-M7, QB-C4 |
| S-QB5 | Contact detail, QuickBooks panel | /contacts/mike-nelson | Minimal + Complete parts | QB-M7, QB-C2, QB-C4 |
| S-QB6 | Job margin report | /reports?tab=job\_margin | Complete | QB-C5, QB-C6 |
| S-CRM1 | Lead Pipeline board | /leads | Minimal + Complete parts | CRM-M1, CRM-M3, CRM-M6, CRM-C1, CRM-C2 |
| S-CRM2 | Settings › Pipeline Stages | /settings/pipeline-stages | Minimal + Complete parts | CRM-M2, CRM-C2 |
| S-CRM3 | Settings › Lead Capture | /leads?view=website | Minimal + Complete parts | CRM-M4, CRM-M5, CRM-C6 |
| S-CRM4 | Public lead form | /website-form | Minimal | CRM-M4, CRM-M5 |
| S-CRM5 | Lead detail | /leads/LEAD-2026-19 | Minimal + Complete parts | CRM-M7, CRM-C7 |
| S-CRM6 | Settings › Stage Emails | /settings/automated-messages | Complete | CRM-C3 |
| S-CRM7 | Automations list and rule editor | /marketing/automations | Complete | CRM-C4, approval rule |
| S-CRM8 | Flow builder | /marketing/automations?view=flow | Complete | CRM-C5 |
| S-CRM9 | Messages waiting for approval | /marketing/automations?view=approvals | Complete | CRM-C3, CRM-C4 |
| S-JS1 | Job Scheduling week view | /job-scheduling | Minimal + Complete parts | JS-M1, JS-M2, JS-M3 |
| S-JS2 | Notify crew modal | modal on S-JS1 | Minimal + Complete parts | JS-M3, JS-C4, JS-C5 |
| S-JS3 | Schedule Update email preview | modal on S-JS2 | Minimal + Complete parts | JS-M4, JS-C6 |
| S-JS4 | Edit Shift popup with Send Email | modal on S-JS1 | Complete | JS-C1 |
| S-JS5 | Bulk Reschedule then Notify step | modal on S-JS1 | Complete | JS-C2 |
| S-JS6 | Settings › Email Events | /settings/automated-messages | Complete | JS-C3, JS-C5 |
| S-RP1 | Estimate Log | /reports (Estimates Log tab) | Minimal + Complete parts | RP-M3, RP-C1, RP-C4 |
| S-RP2 | Jobs Sold by month | /reports (Jobs Sold tab) | Minimal | RP-M1, RP-M2, RP-M4 |
| S-RP3 | Sales by estimator | /reports (new Sales by Estimator tab) | Complete | RP-C2 |
| S-RP4 | Change order detail | /estimates/EST-2026-74/change-orders/CO-1 | Complete | RP-C3 |
| S-BK1 | Books overview | /accounting (Books mode) | Minimal (new module) | BK-M1 |
| S-BK2 | Chart of accounts | /settings/accounting (chart of accounts) | Minimal (new module) | BK-M2 |
| S-BK3 | Journal | /accounting/journal (new) | Minimal + Complete parts (new module) | BK-M3, BK-M9, BK-C2, BK-C8 |
| S-BK4 | Bills and expenses | /accounting/bills | Minimal + Complete parts (new module) | BK-M4, BK-C4, BK-C8 |
| S-BK5 | Banking and reconciliation | /accounting/checkbook, /accounting/feeds | Minimal + Complete parts (new module) | BK-M5, BK-M10, BK-C1 |
| S-BK6 | Books reports | /reports (finance tabs) | Minimal + Complete parts (new module) | BK-M6, BK-M11, BK-M12, BK-M13, BK-C3, BK-C6 |
| S-BK7 | Month close and export | /settings/accounting (periods) | Minimal (new module) | BK-M7, BK-M8, BK-M13 |
| S-BK8 | Move from QuickBooks wizard | /settings/accounting (migration) | Complete (new module) | BK-C5 |
| S-BK9 | Accountant role | /settings/roles-permissions | Complete (new module) | BK-C7 |

Not drawn as screens: RP-M5 (dashboard counts stay the same), RP-M6 (one-time backfill), JS-M1 as a rule, and X-M1, X-M3 (behind the scenes). X-C1 appears as an "Upgrade to unlock" card on any Complete screen when the plan does not include it.

## QuickBooks screens

Behaviour and rules: tab 1.

### S-QB1 — Settings › Integrations · MINIMAL · QB-M1

- Settings sidebar: new item "Integrations" under Organization, with a red count badge when Needs Attention has items.
- Title "Integrations", subtitle "Connect Estimate Master to the tools you already use."
- Accounting destination (X-M2): a card with three radio options — None, QuickBooks Online, Estimate Master Books. The Books option carries the NEW MODULE badge. Picking it opens a confirmation: "Switch to Estimate Master Books? QuickBooks will be disconnected." In the prototype, QuickBooks and Books both stay visible so Tim can compare them. In the real product, choosing Books hides QuickBooks.
- Card grid, 3 per row:
  - QuickBooks Online: logo, status pill (Connected, green), "Master's Touch Painting Inc.", "Last sync 2 min ago", buttons Manage and Sync now.
  - Authorize.Net: status pill Connected (Sandbox), button Manage (links to the existing Payment Gateway page).
  - Google Calendar, Stripe: status Not connected, button Connect, both greyed with "Coming soon".

### S-QB2 — QuickBooks detail · MINIMAL · QB-M2, QB-M6

- Breadcrumb Settings › Integrations › QuickBooks Online.
- Status strip: green Connected pill, company name, "Connected by Tim Skelly on 5 Oct 2026", "Last sync 7:42 AM", buttons Sync now, Disconnect.
- Tabs under the strip:
  1. Sync Log (QB-M6): table Time, Record, Number, QuickBooks ref, Direction arrow, Result pill. Sample rows: 7:42 AM Invoice INV-2026-118 → Sent; 7:41 AM Payment $2,000.00 ← Received; 7:30 AM Contact Jordan Irons → Sent.
  2. Needs Attention (QB-M6), with count: row "Contact Beth Carver — A different customer in QuickBooks already uses this name", 4 attempts, buttons Retry, Open record.
     - Variance row (COMPLETE · QB-C3): "Invoice INV-2026-112 changed in QuickBooks from $2,000.00 to $1,950.00", buttons Open record, Dismiss.
  3. Customer Review (COMPLETE · QB-C1): row "Hannah Brooks, created in QuickBooks 3 Oct", buttons Link to contact, Create as contact, Ignore.
  4. Sync options (QB-M2): Income account dropdown "Painting Income", Deposit account "Chase Checking ••4821", Card payment method "Credit Card", Tax mapping table (Minnesota 6.875% → "MN State"), Save button.
- Empty states as in tab 1.

### S-QB3 — Connect and first match · MINIMAL · QB-M1, QB-M3

Three-step modal on S-QB1, with a step indicator at the top.

1. "Connect QuickBooks Online": explanation, button Continue to Intuit. The prototype shows a fake Intuit sign-in panel with Approve.
2. "Match your contacts": three groups with counts — Matched (42), Will be created in QuickBooks (17), Possible duplicates (2). Each duplicate row has a dropdown: Link to this customer, Create new.
3. "What to send": radio "Contacts and jobs from 1 Oct 2026" (date picker) or "New records only". Button Start sync.

### S-QB4 — Invoice detail, synced · MINIMAL · QB-M5, QB-M7

- Existing invoice page for INV-2026-118.
- Beside the invoice number: green chip "In QuickBooks" with a link icon (QB-M7).
- Amount and date fields read-only with a lock icon and the hint "Edit this invoice in QuickBooks" (QB-M5).
- Payment status row: "Paid in full · 4 Oct 2026 · recorded in QuickBooks".
- Right-side panel (COMPLETE · QB-C4): "QuickBooks" card with Balance $0.00, Status Paid, Last updated, button Open in QuickBooks.

### S-QB5 — Contact detail · MINIMAL · QB-M7

- Existing contact page for Mike Nelson with the "In QuickBooks" chip (QB-M7).
- COMPLETE · QB-C2: small note under the phone field "Updated from QuickBooks on 3 Oct".
- COMPLETE · QB-C4: QuickBooks card with open balance, total invoiced this year, and Open in QuickBooks.

### S-QB6 — Job margin report · COMPLETE · QB-C5, QB-C6

- Reports › Job Margin. Filters: date range, estimator.
- Table: Job, Customer, Invoiced (excl. tax), Materials (from QuickBooks bills), Labour, Job cost, Margin %, with a coloured margin pill (under 30% amber, under 15% red).
- Sample: JOB-2026-37 Nelson Interior, $7,958.00, $1,120.00, $2,860.00, $3,980.00, 50.0%.

## CRM screens

Behaviour and rules: tab 2. Complete-only screens S-CRM6 to S-CRM9 follow the Scope tab items; their full rules are written when Tim picks Complete.

### S-CRM1 — Lead Pipeline board · MINIMAL · CRM-M1, CRM-M3, CRM-M6

- Title "Lead Pipeline". Pipeline switch as a segmented control: Sales | Production (CRM-M1). In Complete, the switch becomes a dropdown with Sales, Production, Marketing, and "+ Add pipeline" (COMPLETE · CRM-C2).
- Right of the title: View Archived, Add New Lead (Sales only).
- Filter bar: search, Source (multi-select), Estimator, Date received, Board / Table toggle. Group by: Stage / Source (COMPLETE · CRM-C1).
- Sales columns with sample cards: New Lead (Jordan Irons · Facebook badge · 29 Sep), Contacted, Estimate Scheduled, Pending, Sold (Mike Nelson · Website badge), Lost.
- Card: name, city, lead number, source badge (CRM-M6), received date, next follow-up, phone and email icons.
- Production columns: Pick Colours (Mike Nelson · JOB-2026-37 · $7,958), Ready to Schedule, Scheduled, In Progress, Touch-ups, Complete.
- Toast after dropping on Sold: "Mike Nelson moved to Sold. Added to Production › Pick Colours." (CRM-M3).
- Group by Source view (COMPLETE · CRM-C1): columns Website, Facebook, Instagram, Referral; each card shows its stage as a small grey chip.

### S-CRM2 — Settings › Pipeline Stages · MINIMAL · CRM-M2

- Replaces today's rename-only grid with a list.
- Tabs: Sales, Production. In Complete, one tab per pipeline plus "+ Add pipeline" (COMPLETE · CRM-C2).
- Each row: drag handle, colour dot, name field, card count, bin icon. System rows (New, Sold, Lost, Complete) show a lock icon and "System stage" tooltip instead of handle and bin.
- "+ Add stage" button above the Sold row. Footer: Discard changes, Save changes.
- Delete blocked state: inline red text "Move the 3 cards in this stage first."

### S-CRM3 — Settings › Lead Capture · MINIMAL · CRM-M4, CRM-M5

- Top card: "Your lead form", the form link with Copy, a Preview button, and a small thumbnail of S-CRM4.
- Tracked links table: Name, Source, Link, Leads (30 days), Status, actions (Copy, QR code, Pause). Sample rows: Facebook page · Facebook · 14 · Active; Instagram bio · Instagram · 6 · Active; Website button · Website · 22 · Active.
- "+ Add link" opens a modal: Name, Source dropdown, Save.
- COMPLETE · CRM-C6: a card below, "Connect Facebook Lead Ads", with a Connect button and "Leads from your Facebook ads arrive here directly."

### S-CRM4 — Public lead form · MINIMAL · CRM-M4

- Full-page form on a white background, mobile-first, company logo and name at the top.
- Title "Request a free estimate". Fields in order: Full name, Phone, Email, Property address, What would you like painted?, Message. Button "Send request".
- Success state: green tick, "Thanks, we've received your request and will be in touch soon."
- Error state: "Please give us a phone number or email." under both fields.

### S-CRM5 — Lead detail · MINIMAL · CRM-M7

- Existing lead page for Jordan Irons.
- Source line: "Facebook · via Facebook page link · 29 Sep 2026".
- Stage history list (CRM-M7): New Lead 29 Sep by system; Contacted 30 Sep by Priya Shah.
- COMPLETE · CRM-C7: journey bar across the top showing Sales › Contacted, Production › not started, Marketing › not started.

### S-CRM6 — Settings › Stage Emails · COMPLETE · CRM-C3

- One row per trigger: Estimate accepted, Estimate declined, Estimate no-show, Job complete.
- Each row: template dropdown (from Automated Messages), approval status pill ("Ask me first" grey, or "Approved · Tim Skelly · 2 Oct" green), an "Approve automation" button (Owner and Admin only), and an on/off switch. Approving opens a confirmation showing the trigger and the full message: "Messages from this rule will send without asking. Approve?"

### S-CRM7 — Automations · COMPLETE · CRM-C4

- List: rule name, trigger, actions summary, runs (30 days), approval status, Approve automation button, on/off. Editing an approved rule shows "Saving will remove the approval" before saving. Sample: "Estimate follow-up" — When estimate is sent, if no reply in 3 days, then prepare Follow-up email and move to Pending.
- New rule editor, three stacked cards: When (trigger dropdown), If (conditions, optional), Then (actions: prepare email, prepare text, move stage, assign task, wait). Button "Open as flow" goes to S-CRM8.

### S-CRM8 — Flow builder · COMPLETE · CRM-C5

- Canvas with a left palette (Trigger, Wait, Condition, Prepare email, Prepare text, Move stage, Assign task) and a right settings panel for the selected step.
- Sample flow: Estimate sent → Wait 3 days → Condition: approved? → Yes: Prepare "Thank you" email → Move to Sold; No: Condition: declined? → Yes: Prepare "Sorry to miss you" email → Move to Lost; No: Prepare follow-up → loop back to Wait.
- Top bar: flow name, approval status pill, Approve automation, on/off, Save, "View as list" (back to S-CRM7).

### S-CRM9 — Messages waiting for approval · COMPLETE · CRM-C3, CRM-C4

- List of prepared messages: customer, message name, prepared by (rule name), prepared at, preview, buttons Send, Edit, Skip.
- Sidebar count badge on Automations when messages are waiting. Each message also offers "Approve this automation", so future messages from the same rule send on their own.

## Job Scheduler screens

Behaviour and rules: tab 4.

### S-JS1 — Job Scheduling week view · MINIMAL · JS-M1, JS-M2, JS-M3

- Existing week view, week of 5 Oct 2026, with job bars.
- Header, right side: Day / Week / Month, Bulk Reschedule, and a new button "Unsent changes (3)" with an envelope icon (JS-M3). Hidden when nothing is waiting.
- Job bars with unsent changes show a small envelope with an orange dot at the right end (JS-M2). Sample: JOB-2026-37 Nelson Interior moved from 2 Oct to 6 Oct.
- Toast after any save: "Saved. The crew has not been notified." with a "Notify now" link (JS-M1).

### S-JS2 — Notify crew modal · MINIMAL · JS-M3

- Title "Notify crew about schedule changes".
- Select all / Clear all links.
- One row per person, all ticked: Braden Skelly — 2 jobs changed; Luis Ortega — 1 job changed, 1 removed; Dana Ruiz — No email on file (greyed, unticked).
- Each row expands to show its jobs with old and new dates.
- COMPLETE · JS-C5: channel chips per row, Email and Text.
- COMPLETE · JS-C4: after sending, each row shows Delivered or Not delivered.
- Footer: Not now, Preview email (opens S-JS3), Send updates.

### S-JS3 — Schedule Update email preview · MINIMAL · JS-M4

- Email-style card. Subject "Schedule update from Master's Touch Painting: 2 jobs changed".
- Sections: New jobs, Changed jobs (old dates crossed through), Removed from. Each job: name, address, dates, shift times, crew lead, "View work order" link.
- COMPLETE · JS-C6: language toggle English / Español above the preview.

### S-JS4 — Edit Shift popup with Send Email · COMPLETE · JS-C1

- Existing Edit Shift popup. New "Send Email" button in the footer, left of Assign shift.
- Opens S-JS2 filtered to this job only.
- Disabled state tooltip: "No changes to send."

### S-JS5 — Bulk Reschedule then Notify · COMPLETE · JS-C2

- After Apply on Bulk Reschedule, S-JS2 opens automatically with the title "8 jobs moved. Notify the crew?"

### S-JS6 — Settings › Email Events · COMPLETE · JS-C3, JS-C5

- Table: Event, Who receives it, Channel (Email, Text), Mode (Automatic / Manual dropdown), Template link.
- Sample rows: Crew schedule change · Crew · Email · Manual; Estimate sent · Customer · Email · Automatic; Invoice sent · Customer · Email · Automatic; Payment received · Customer · Email · Automatic.
- Note at the top: "This list is filled from Tanmoy's email event list."

## Reports screens

Behaviour and rules: tab 3.

### S-RP1 — Estimate Log · MINIMAL · RP-M3

- Existing Reports › Estimate Log table with new columns: Estimate No., Entry, Customer, Date, Value, Hours, Status.
- Sample rows, grouped with a light shared background:
  - EST-2026-74 · Original · Mike Nelson · 18 Aug 2026 · $6,463.00 · 38.0 h · Accepted
  - EST-2026-74 · Amendment 1 · Mike Nelson · 23 Sep 2026 · +$1,495.00 · +8.0 h · Accepted
  - EST-2026-81 · Original · Beth Carver · 5 Sep 2026 · $2,000.00 · 12.0 h · Accepted
  - EST-2026-81 · Amendment 1 · Beth Carver · 12 Oct 2026 · −$300.00 (red) · −2.0 h · Accepted
- COMPLETE · RP-C1: a chevron on amendment rows expands a panel: "Added: Hallway walls, 2 coats, $1,495.00."
- COMPLETE · RP-C4: an amber warning icon on any estimate whose entries do not add up, with a tooltip.

### S-RP2 — Jobs Sold by month · MINIMAL · RP-M1, RP-M2, RP-M4

- Month picker. Summary tiles: New sales, Amendments, Total for the month.
- Sample for September 2026: New sales $10,000.00, Amendments +$1,495.00, Total $11,495.00.
- Table: Date, Estimate No., Entry, Customer, Estimator, Value, Hours.
- Monthly bar chart of totals, with negative amendments shown below the zero line.

### S-RP3 — Sales by estimator · COMPLETE · RP-C2

- Filters: month range. Table: Estimator, New sales, Amendments, Total, Estimates sold.
- Sample: Priya Shah $18,240 / +$1,495 / $19,735 / 6; Marcus Lee $12,100 / −$300 / $11,800 / 4.

### S-RP4 — Change order detail · COMPLETE · RP-C3

- Change order CO-1 on EST-2026-74: number, status (Sent, Signed), lines added and removed, total change +$1,495.00, customer signature date, and the sales entry it created.

## Estimate Master Books screens

Behaviour and rules: tab 5. Every screen here carries the orange NEW MODULE badge next to its Minimal or Complete badge. No new sidebar item: Books screens live inside the existing Accounting module (Operations group), shown when the accounting destination is Books.

### S-BK1 — Books overview · NEW MODULE · MINIMAL · BK-M1

- Title "Books", period picker (default: This month, October 2026).
- Four tiles: Cash in bank $24,310.00; Owed to you $5,958.00; You owe $1,120.00; Profit this month $6,210.00.
- Panels: Profit and Loss snapshot (income, costs, profit bars for the last 6 months); To do (3 bank lines to match, 1 bill due this week, September not yet closed).
- Quick actions: New bill, Import bank statement, Close month.

### S-BK2 — Chart of accounts · NEW MODULE · MINIMAL · BK-M2

- Table grouped by type: Assets, Liabilities, Equity, Income, Cost of jobs, Expenses. Columns: Number, Name, Type, Balance, Status.
- Uses the 24-account preset in tab 5, for example 1000 Chase Checking, 1050 Payments to deposit, 2300 Chase Card, 3900 Retained earnings, 4000 Painting income, 5000 Paint and materials.
- "+ Add account" opens a modal: Number, Name, Type, Description. System accounts show a lock icon.

### S-BK3 — Journal · NEW MODULE · MINIMAL · BK-M3, BK-M9

- Table: Date, Entry No., Source (link to invoice, payment, bill), Account, Debit, Credit, Posted by.
- Sample entry JE-0412, 23 Sep, from INV-2026-118: Money owed by customers debit $5,958.00; Painting income credit $5,958.00. (Labour-only invoice, so no sales tax line; a taxed invoice adds a Sales tax to pay credit.)
- Each entry has a Reverse button; there is no Delete (BK-M9). Reversed entries show a grey "Reversed by JE-0418" chip.
- COMPLETE · BK-C2: an entry from "Gusto pay run 30 Sep" with a Gusto chip.
- COMPLETE · BK-C8: a "Recurring" filter and a repeat icon on recurring entries.

### S-BK4 — Bills and expenses · NEW MODULE · MINIMAL · BK-M4

- List: Supplier, Bill No., Date, Due, Amount, Status (Unpaid, Paid), Job.
- Sample: Sherwin-Williams Plano Parkway · SW-88213 · 25 Sep · 25 Oct · $1,120.00 · Unpaid · JOB-2026-37.
- New bill form: Supplier, Bill No., Date, Due date, lines (Account, Job, Description, Amount), receipt photo upload, Save.
- Record payment modal: Pay from account, Date, Amount.
- COMPLETE · BK-C4: "Matched to PO JOB-2026-5-PO-02" chip on the bill, with quantities received.
- COMPLETE · BK-C8: "Repeat this bill monthly" option on the form.

### S-BK5 — Banking and reconciliation · NEW MODULE · MINIMAL · BK-M5

- Account cards: Chase Checking ••4821 and Chase Card ••9910 (shown as money owed), each with book balance and last statement balance. A "Payments to deposit" card (BK-M10) shows "Card payments waiting: $2,000.00" and a Match batch button.
- Import statement button: CSV upload, column mapping step, preview.
- Reconcile view, two columns: bank lines on the left, matching book entries on the right, with Match, Create entry, and Exclude buttons. Footer shows difference, which must reach $0.00 before Finish.
- COMPLETE · BK-C1: "Connect bank feed" button on each account card and a "Live feed" chip once connected.

### S-BK6 — Books reports · NEW MODULE · MINIMAL · BK-M6

- Report list: Profit and Loss, Balance Sheet, Money owed to you (aging), Money you owe (aging), Sales tax summary. Each opens with a date range, a Cash / Accrual toggle (BK-M13), and Export (PDF, CSV). The sales tax summary has "Record payment to state" (BK-M12). Aging rows have an owner-only "Write off" action (BK-M11).
- Aging layout: Customer, Current, 1–30, 31–60, 61–90, Over 90 days, Total.
- COMPLETE · BK-C3: Job profit report.
- COMPLETE · BK-C6: 1099 contractors, and Budget versus actual.

### S-BK7 — Month close and export · NEW MODULE · MINIMAL · BK-M7, BK-M8

- Month list: September 2026 · Open · Close button; August 2026 · Closed by Tim Skelly on 3 Sep · lock icon.
- Close checklist before confirming: bank reconciled, no unmatched lines, bills entered. Closing December shows "Profit for 2026 will move to Retained earnings" (BK-M13).
- Export panel: General ledger, Trial balance, as CSV or Excel, for a chosen period.

### S-BK8 — Move from QuickBooks · NEW MODULE · COMPLETE · BK-C5

- Four-step wizard: Connect QuickBooks once, Choose what to bring (customers, open invoices, opening balances as at a date), Review, Import.
- Final screen: "Import complete. QuickBooks has been disconnected."

### S-BK9 — Accountant role · NEW MODULE · COMPLETE · BK-C7

- Settings › Roles & Permissions gains an "Accountant" role: can view all Books screens, can post adjusting entries, cannot edit invoices, bills or settings.
