# EMTS prototype: build the Minimal and Complete versions (30 Sep call features)

You are working in the `emts-prototype` repo (Next.js 16, React 19, Tailwind v4, Zustand). This file tells you what to build, where to build it, and how to check it. Work in phases. Stop after each phase and report.

## 0. Read first

1. Read `AGENTS.md`. This Next.js version has breaking changes. Check `node_modules/next/dist/docs/` before writing routing or server code.
2. Read `README.md` sections "New features" and "How it fits together".
3. Skim these, because you will reuse them:
   - Markers: `features/components/ui/live.tsx` (`NewBadge`, `ConfirmBadge`, `SectionHeader`).
   - Demo controls: `features/components/layout/demo-bar.tsx` (the Prototype bar).
   - Shared UI: `components/ui/button.tsx`, `components/ui/display.tsx`, `features/components/ui/*` (`Badge`, `Card`, `Table`, `PillTabs`, `Modal`, `ConfirmDialog`, `Field`, `Input`, `Select`, `Switch`, `Banner`, `EmptyState`, `Stat`, `StatStrip`).
   - Stores: replica collections in `lib/store.tsx` and `lib/types.ts`; feature store in `features/lib/store/`; the bridge in `lib/bridge/`.
   - Rules and tests: `features/lib/rules/*.ts` and their `*.test.ts` files.

## 1. Ground rules

- **Use the existing design only.** No new fonts, colours, radii or shadows. Roboto body, Manrope headings, `Card` (16 px radius), `Button` variants, `Badge` tones. If a part exists, reuse it.
- **No duplicate pages.** Every item below names its host. Build inside that host. Do not add a Books sidebar item, an Automations sidebar item, a Settings › Integrations page, a Lead Capture page or an Email Events page.
- **Build-up, never rework.** Minimal parts always render. Complete parts are wrapped in `<FeatureGate item="…">` (Phase 0; switched in the dashboard New Features panel). Minimal code must already use the full data model, so Complete only adds screens and logic. For example, pipelines are stored as a list from day one.
- **Mark every new part.** Put `NewBadge` (with its feature number, if one applies) plus `VersionBadge item="ID"` on every new section, tab, button, column or field. Items marked "Exists" only get a `VersionBadge`.
- **Nothing contacts a customer on its own.** Sending stays sandbox and logged, like `features/components/features/marketing/automations-screen.tsx`. Customer messages from stage emails and automations wait for approval unless the rule has been approved (Phase 3).
- **Business rules are pure functions** in `features/lib/rules/`, with vitest tests. Store changes go through actions in `features/lib/store/actions/`, or through the replica collections for replica screens.
- **Match the surrounding copy style.** Short, plain labels, as on the neighbouring screens.
- **Sample data** comes from the existing seeds. If you need new records, add them to the seed files. Keep the numbers consistent, because the client checks the arithmetic.
- **After each phase:** run `npm run typecheck`, `npm test` and `npm run build`. Fix everything, then commit as `feat(emts-mc): phase N – <name>`. Stop and report the files changed, the routes to open, and anything you could not do. Wait for "continue" before the next phase.

## Item IDs

- QB = QuickBooks, CRM = CRM pipelines, JS = Job Scheduler emails, RP = Reports, BK = Books (inside Accounting), X = shared.
- `-M` = Minimal, `-C` = Complete. The letter after the dash decides the version.

---

## Phase 0 – Version switch and markers (X-M1)

> **Replaced by the New Features panel** (`EMTS_NEW_FEATURES_PANEL.md`). The Prototype bar's Version select and Hide markers switch, and `features/lib/prototype-version.ts`, are gone. The dashboard's New Features panel (`/dashboard#new-features`) now switches each feature's Minimal and Complete parts on or off, and "Show NEW badges on screens" brings the markers back. In the phases below, read `VersionGate item="…"` as `FeatureGate item="…"`, and "the Complete version" as "Complete ticked for that feature".

1. **`features/lib/feature-visibility.ts`** (replaces `prototype-version.ts`): a Zustand store persisted with the feature store's safe localStorage wrapper. Key: `emts-new-features`. State: `showNew` (master switch, default on), `showBadges` (default off) and one `{ minimal, complete }` row per feature (default Minimal on, Complete off). `keyForItem(id)` maps an item ID to its feature and part (the letter after the dash decides the part; X items follow QuickBooks). `isOn(state, keys, part)` answers whether a part shows. "Reset demo data" resets it. The features themselves are listed in `features/lib/feature-registry.ts`.
2. **`VersionBadge` in `features/components/ui/live.tsx`:** the same classes and shape as `NewBadge`. Minimal uses `bg-primary-700 text-white`. Complete uses `bg-purple-700 text-white` (brand purple fails 4.5:1 contrast with white). It carries `data-version-badge`, the text MINIMAL or COMPLETE, and a `Tooltip` reading `"{ID} · Minimal version"` or `"{ID} · Complete version"`. Like `NewBadge` and `ConfirmBadge`, it renders only when "Show NEW badges on screens" is on.
3. **`FeatureGate`:** `<FeatureGate item="CRM-C4">children</FeatureGate>` (or `feature={24}`, `featureKey="bk"`) renders children only while that part is switched on. `FeatureRouteGate` wraps whole views and routes; when off it shows an `EmptyState`: "This feature is switched off" / "Turn it on in New Features on the dashboard." with a button to `/dashboard#new-features`.
4. **Prototype bar (`demo-bar.tsx`):** a "New features panel" button that opens `/dashboard#new-features`.
5. **Tests:** `features/lib/feature-visibility.test.ts` (master switch, Complete implies Minimal, unticking Minimal unticks Complete, item mapping).

---

## Phase 1 – Reports: amended estimates (RP)

**Problem to fix.** In `components/reports/data.ts`, `soldDate()` returns `estimate.approvedAt`. Re-approving an amended estimate therefore moves the whole sale into the new month. `Estimate.versions` (`EstimateVersion`: version, date, total, status) already records each version.

**RP-M1: sales entries.** Add a pure rule `features/lib/rules/sales-entries.ts` with `salesEntries(estimate)` returning a list of `{ estimateId, estimateNumber, type: 'original' | 'amendment' | 'change_order', n, date, value, hours, estimatorId, versionRef }`.

- Take the versions that reached ACCEPTED, in date order.
- The first one gives an `original` entry with value = its total and hours = its labour hours.
- Each later accepted version gives an `amendment` entry with value = total − previous accepted total, and hours = hours − previous hours.
- The entry date is that version's date (the re-approval date).
- If both differences are 0, no entry is created. This is the client's "paint colour renamed" case.
- A negative difference gives a negative entry (RP-M2).
- Declined or abandoned amendments give nothing.
- Values exclude sales tax.
- Add an optional `laborHours` snapshot to `EstimateVersion`, written whenever a version is saved. For older versions without it, use an hours difference of 0.
- The sum of an estimate's entries must always equal its latest accepted total. Write a test for this.

**RP-M3.** In the Estimates Log tab (`components/reports/TableTabs.tsx`), show one row per entry. Label them Original, Amendment 1, Amendment 2, and so on. Rows with the same estimate number sit together on a light shared background. Negative values are red with a minus sign.

**RP-M4.** Jobs Sold, Sales Goal, and the dashboard Monthly Goal and Revenue widgets add up entries by entry date. Add three tiles above Jobs Sold: New sales, Amendments, Total.

**RP-M5.** Dashboard estimate counts and win rate still count estimates, not entries. Write a test that an amendment leaves them unchanged.

**RP-M6.** Run a one-time migration (see `lib/migrate.ts`) so existing data produces correct entries.

**RP-C1 (Complete).** A chevron on amendment rows opens a panel showing lines added, removed and repriced between the two versions.

**RP-C2 (Complete).** A new "Sales by Estimator" tab with columns Estimator, New sales, Amendments, Total, Estimates sold.

**RP-C3 (Exists).** Change orders (`features/components/features/change-orders`) become entries of type `change_order`. Show the entry on the change order.

**RP-C4 (Complete).** An amber flag on any estimate whose entries do not add up.

**Checks:**

- Sold for $100 on 1 Sep, amended to $150 and re-approved on 2 Oct: September shows $100 and October shows $50. The Estimates Log shows 2 rows with the same number.
- A paint colour change only: no new row.
- A drop of $300: a −$300 row in the month of re-approval. The earlier month is unchanged.
- The dashboard estimate count is unchanged after an amendment.

---

## Phase 2 – Job Scheduler emails (JS)

**Context.** The prototype does not send crew emails today. Simulate sending as a sandbox log, the same way marketing automations log their sends.

**JS-M1.** Saving, moving or cancelling a shift sends nothing. After a save, show a toast: "Saved. The crew has not been notified." with a "Notify now" action.

**JS-M2.** Keep a snapshot of what each person was last told about each job, in a new replica collection or feature-store slice, for example `scheduleNotifySnapshots`. A job is "unsent" for a person when its current dates, times or assignment differ from their snapshot. Unsent job bars show a small pill: orange dot plus the text "Changes not sent". If the job is changed back to match the snapshot, the pill disappears. Put this rule in `features/lib/rules/schedule-notify.ts`, with tests.

**JS-M3.** Add an "Unsent changes (N)" primary button in the Job Scheduling header, next to Bulk Reschedule, where N = people waiting. Hide it when N = 0. It opens a "Notify crew about schedule changes" `Modal`:

- one row per affected person, ticked by default;
- the number of jobs changed for them, expandable to a job list with the old dates struck through beside the new ones;
- people with no email shown unticked and greyed, with "No email on file";
- Select all and Clear all;
- footer buttons: Not now, Preview email, Send updates.

**JS-M4.** "Send updates" creates one Schedule Update message per ticked person, listing New jobs, Changed jobs and Removed from. Empty sections are left out. The message is logged, the person's snapshots update, and their pills clear. Preview email opens the rendered message.

**JS-C1 (Complete).** A "Send Email" button in the Edit Shift popup (`components/scheduling/ShiftSchedulePanel.tsx` or `components/jobs/ScheduleJobModal.tsx`). It opens the same modal, filtered to that job.

**JS-C2 (Complete).** After Bulk Reschedule is applied, the modal opens straight away, titled "N jobs moved. Notify the crew?".

**JS-C3 (Complete).** In `/settings/automated-messages`, add a Mode control (Automatic or Manual) to each template. The crew schedule template defaults to Manual. Do not create a new settings page.

**JS-C4 (Complete).** A Delivered or Not delivered pill per person after sending.

**JS-C5 (Complete).** Email and Text channel chips per person. Text sends are sandbox only, and carry the note "Needs state texting rules before go-live".

**JS-C6 (Complete).** An English / Español toggle on the preview, using the existing i18n if present.

**Checks:**

- 20 jobs changed for one person gives exactly 1 message.
- An unticked person gets nothing and keeps their pill.
- Moving a job and moving it back clears the pill without a send.

---

## Phase 3 – CRM pipelines (CRM)

**CRM-M1 and CRM-M2: pipelines and stages.**

- Extend `PipelineStage` (`lib/types/settings.ts`) with `pipelineId`, `system: boolean` and `sortOrder`.
- Add a `pipelines` list seeded with Sales and Production. Store it as a list, so more pipelines can be added later without a data change.
- System stages:
  - Sales: New (first), Sold (second last), Lost (last).
  - Production: Complete (last).
  - System stages can be renamed but not moved or deleted.
- Custom stages:
  - Sales defaults: Contacted, Estimate Scheduled, Pending.
  - Production defaults: Pick Colours, Ready to Schedule, Scheduled, In Progress, Touch-ups.
  - They can be added, renamed, recoloured, reordered, and deleted when empty ("Move the N cards in this stage first.").
  - Each pipeline has at most 12 stages.
- Upgrade `components/settings/config/PipelineStagesView.tsx` in place. Add Sales and Production tabs, rows with a drag handle, colour, name, card count and delete, lock icons on system stages, "+ Add stage" (inserted above Sold), and Save and Discard.
- The rules (order limits, delete guard, 12 cap) go in `features/lib/rules/lead-pipeline.ts`, with tests.

**CRM-M1 board.** In `/leads` (`KanbanBoard.tsx`), add a Sales / Production switch. The Production board shows jobs as cards.

**CRM-M3.** When a lead reaches Sold, or its estimate is approved, create exactly one Production card in the first Production stage. It is never duplicated on re-approval. Show the toast "{Name} moved to Sold. Added to Production › {Stage}." Moving a card out of Sold asks whether to keep it in Production or remove it.

**CRM-M4 (Exists).** `/website-form`.

**CRM-M5: tracked links.** In the website lead area (`/leads?view=website`, `website-leads-panel.tsx`), add a Tracked links card:

- a table with Name, Source, Link, Leads (30 days), Status and actions (Copy, QR code via `qrcode.react`, Pause);
- an "+ Add link" modal with Name and Source.

The link is `/website-form?src={source}&l={linkId}`. The form passes `src` and `l` through to `/api/website-form`. The lead source is set in this order:

1. the `src` tag;
2. the referring site (facebook.com → Facebook, instagram.com → Instagram, google → Google);
3. otherwise, Website.

A paused link shows "This form is not accepting requests right now." Put the source rule in `lib/website-form.ts`, with tests.

**CRM-M6.** Every lead card shows a source `Badge`. The board has a Source filter that is remembered per user.

**CRM-M7.** Stage history on the lead detail page (`/leads/[id]`): stage, pipeline, moved by, and when.

**CRM-C1 (Complete).** Group by: Stage / Source. In Source view, the columns are sources, each card shows its stage as a grey chip, and dragging between columns is disabled.

**CRM-C2 (Complete).** An "+ Add pipeline" option, for example Marketing, in the board switch and on the Pipeline Stages tabs.

**CRM-C3 (Complete).** In `/settings/automated-messages`, each template can be tied to a trigger: Estimate accepted, Estimate declined, Estimate no-show, or Job complete. Each shows an approval status pill: "Ask me first" (default) or "Approved · {name} · {date}". Show an "Approve automation" button for Owner and Admin only. It confirms with the trigger and message: "Messages from this rule will send without asking. Approve?" Any edit to the rule removes the approval.

**CRM-C4 (Complete).** Extend `/marketing/automations` with a rule editor made of stacked When / If / Then cards, plus the same approval status and Approve automation button. Store rules as linked steps: trigger, condition and action nodes with next and yes/no links. That way the list view and the flow view read the same data.

**CRM-C5 (Complete).** `/marketing/automations?view=flow`: a flow view of the same rule. It has a steps palette, a canvas with branch labels, and a settings panel. Start it read-only if full editing is too much for this phase, and say so in your report.

**CRM-C3 to C5: the approval queue.** Add `/marketing/automations?view=approvals`, a "Waiting for approval" list of prepared messages with Send, Edit, Skip and "Approve this automation" actions. Put a count on the Marketing nav item.

**CRM-C6 (Complete).** A "Connect Facebook Lead Ads" card, simulated.

**CRM-C7 (Complete).** A journey bar on lead detail showing the stage in each pipeline.

**Checks:**

- A stage with cards cannot be deleted.
- Sold creates one Production card, even after re-approval.
- A lead from `?src=facebook` has source Facebook.
- An unapproved rule never sends. It only adds to the approval queue.

---

## Phase 4 – QuickBooks (QB)

Most of Minimal already exists: the Settings › Accounting connection card, `/accounting`, Transfer Queue, Unallocated, the invoice QuickBooks state, and Job Margin. For those, add `VersionBadge` markers only.

- QB-M1, QB-M4, QB-M5, QB-M6, QB-M7 and QB-C6: markers on the existing parts.
- **X-M2 (Minimal).** At the top of Settings › Accounting, add an "Accounting destination" card with radio options None, QuickBooks Online, and Estimate Master Books. Books carries a `NewBadge`. Choosing Books confirms with "Switch to Estimate Master Books? QuickBooks will be disconnected." In the prototype, both QuickBooks and Books stay visible afterwards, for comparison. Store the choice in the feature store.
- **QB-M2.** Check that the sync options exist in Vendors & Mappings: income account, deposit account, tax mapping, and card payment method. Add any that are missing.
- **QB-M3.** In the migration section, add a first-connection "Match your contacts" step. Show Matched, Will be created, and Possible duplicates, with the counts from seed data. Each duplicate has a choice: Link to this customer, or Create new.
- **QB-C1 (Complete).** A Customer Review tab in `/accounting/unallocated` for customers created in QuickBooks, with Link to contact, Create as contact, and Ignore.
- **QB-C2 (Complete).** On contact detail, show the note "Updated from QuickBooks on {date}" where a field came back from QuickBooks.
- **QB-C3 (Exists).** Markers on the variance and deletion flags.
- **QB-C4 (Complete).** A QuickBooks card on contact detail (`/contacts/[id]`) and invoice detail, showing balance, status, last updated, and "Open in QuickBooks".
- **QB-C5 (Complete).** Supplier bills, receipts and credits flowing through the existing queue. Markers only where they already exist.

**Checks:** the destination choice persists across a reload, and a Books option exists that says QuickBooks will be disconnected.

---

## Phase 5 – Estimate Master Books, inside Accounting (BK)

Books is a mode of the existing Accounting module. It is not a new sidebar item. It shows when the destination is Books, and it always shows in the prototype for comparison.

These already exist; add markers only: BK-M4 (`/accounting/bills`), BK-M5 (Checkbook and Bank and Card Feeds), BK-M7 (period close in Settings › Accounting), BK-C1 (feeds, partly), BK-C7 (the Bookkeeper role), and BK-C8 (`/accounting/recurring`).

**Posting rules.** Add `features/lib/rules/ledger.ts` with `postingsFor(event)` returning balanced journal lines. Every entry's debits must equal its credits; test this. Use this preset chart of accounts:

| No. | Name | Type |
| --- | --- | --- |
| 1000 | Chase Checking | Bank |
| 1050 | Payments to deposit | Current asset |
| 1200 | Money owed by customers | Current asset |
| 2000 | Money owed to suppliers | Current liability |
| 2100 | Customer deposits | Current liability |
| 2200 | Sales tax to pay | Current liability |
| 2300 | Chase Card | Credit card |
| 3000 | Owner's equity | Equity |
| 3050 | Opening balance equity | Equity |
| 3100 | Owner draws | Equity |
| 3900 | Retained earnings | Equity |
| 4000 | Painting income | Income |
| 4100 | Other income | Income |
| 5000 | Paint and materials | Cost of jobs |
| 5100 | Subcontractors | Cost of jobs |
| 5200 | Equipment rental | Cost of jobs |
| 6000 | Vehicle and fuel | Expense |
| 6100 | Insurance | Expense |
| 6200 | Card processing fees | Expense |
| 6300 | Wages | Expense |
| 6310 | Payroll taxes | Expense |
| 6400 | Advertising | Expense |
| 6500 | Office and software | Expense |
| 6900 | Bad debts | Expense |

These are system accounts and cannot be deleted: 1000, 1050, 1200, 2000, 2100, 2200, 3050, 3900, 4000, 6200 and 6900.

| Event | Debit | Credit |
| --- | --- | --- |
| Deposit invoice sent | 1200 | 2100 |
| Progress or final invoice sent | 1200 | 4000, plus 2200 for any tax |
| Final invoice sent: deposits held for that job | 2100 | 4000 |
| Card payment received | 1050 | 1200 |
| Cheque, cash or transfer received | 1000 | 1200 |
| Card batch reaches the bank | 1000 net, and 6200 for the fee | 1050 gross |
| Refund before the final invoice | 2100 | 1000 |
| Refund after the final invoice | 4000 | 1000 |
| Invoice written off | 6900 | 1200 |
| Supplier bill entered | 5000–5200 (tagged to the job) or an expense account | 2000 |
| Supplier bill paid | 2000 | 1000 |
| Card purchase | the cost or expense account | 2300 |
| Card bill paid | 2300 | 1000 |
| Sales tax paid to the state | 2200 | 1000 |
| Owner draw | 3100 | 1000 |
| Opening balances | each asset account | 3050 (liabilities the other way round) |

Test with the seed job. Deposit INV-2026-112 is $2,000.00 and final INV-2026-118 is $5,958.00. After the final invoice, income for JOB-2026-37 must be $7,958.00, and Customer deposits for that job must be $0.00.

**Items:**

- **BK-M1.** A Books mode on `/accounting`, with tiles: Cash in bank, Owed to you, You owe, Profit this month.
- **BK-M2.** The chart of accounts in Settings › Accounting: add, edit and deactivate accounts. System accounts are locked.
- **BK-M3 and BK-M9.** A new `/accounting/journal` page in the Overview area. Columns: Date, Entry No., Source link, Account, Debit, Credit, Posted by. Each entry has a Reverse action with a required reason. There is no Delete.
- **BK-M10.** A Payments to deposit card on feeds and checkbook, with "Match batch" posting the fee to 6200.
- **BK-M11.** An owner-only "Write off" action on unpaid invoices, with a required reason. Hold overpayments as a customer credit.
- **BK-M12.** "Record payment to state" on the sales tax summary.
- **BK-M6 and BK-M13.** Reports: add Balance Sheet and a Sales tax summary to the finance report tabs (`components/reports/FeatureTabs.tsx`, next to Income & Expense and Aged Receivables). Every finance report gets a Cash / Accrual toggle, defaulting to Accrual. A year-end roll into 3900 runs when December is closed.
- **BK-M8.** Export the general ledger and trial balance as CSV and Excel (reuse `features/lib/export.ts`).
- **BK-C2 (Complete).** A Gusto pay run imported as a journal entry.
- **BK-C3 (Complete).** A job profit report built from Books entries.
- **BK-C4 (Complete).** Bills matched to supplier purchase orders.
- **BK-C5 (Complete).** A four-step "Move from QuickBooks" wizard in the migration section. It ends with "Import complete. QuickBooks has been disconnected."
- **BK-C6 (Complete).** A 1099 contractor report, and Budget versus actual.

**Checks:**

- Every posting balances.
- The Balance Sheet always balances (assets = liabilities + equity).
- A closed month rejects postings; they post on the 1st of the next open month with a note.
- Reconcile cannot finish until the difference is $0.00.

---

## Final report

After Phase 5, list for each item ID one of: Built, Exists (marker only), Partly built (and what is missing), or Not built (and why). Then list the routes to open in the Complete version so the client can click through everything in about 15 minutes.

---

## Decisions 2 Oct 2026 (D1–D7)

Made in the Prototype Alignment Check (EMTS Phase 2, tab 9). They override the matching rules above.

| # | Decision | Files changed | Where to see it |
| --- | --- | --- | --- |
| D1 | QuickBooks sync on save, at any time on any day; no exchange window. Retries after 1, 5, 30 and 120 minutes, then Needs Attention. Parent first (Customer → Project → Invoice → Payment). Idempotency key kept. Sync Log (7 days, 25 a page, newest first) and Needs Attention (count badge, Retry / Open record / Dismiss, "Everything is in sync."). Invoice lock: "Edit this invoice in QuickBooks". Start sync gate: "Map every tax region first", then from a start date (default the 1st of the month) or new records only. | `features/lib/rules/qbo-sync.ts` (+ tests, + `qbo-sync-flow.test.ts`), `features/lib/rules/finance.ts` (window removed), `features/lib/store/actions/finance.ts`, `features/types/index.ts`, `features/data/seed-finance.ts`, `features/components/features/finance/queue-screen.tsx`, `qbo-sync-parts.tsx`, `qbo-connection-card.tsx`, `finance-frame.tsx`, `accounting-screen.tsx`, `shared.tsx`, `components/invoices/InvoiceFeatureParts.tsx`, `features/components/layout/app-shell.tsx`, `app/accounting/needs-attention/page.tsx` | `/accounting/transfer-queue` (Sync Log), `/accounting/needs-attention`, `/settings/accounting`, an invoice page |
| D2 | Contact matching: matched on email (any case) OR exact display name. Possible duplicate only when the email matches one contact and the name another, or the name matches several. | `features/lib/rules/qbo-contacts.ts` (+ tests), `features/data/seed-finance.ts`, `features/lib/store/actions/qbo.test.ts` | `/settings/accounting` › Match your contacts |
| D3 | QuickBooks is a paid add-on (organisation flag, on for the demo, toggle in the Prototype bar). Without it the card says "Add QuickBooks to your plan." and has no Connect. With it, Owner and Admin (office manager) connect, disconnect, set sync options and confirm matches (`finance.connect`, live PAYMENT_CONFIG). | `features/lib/permissions.ts` (+ new `permissions.test.ts`), `features/lib/store/actions/finance.ts`, `qbo-connection-card.tsx`, `setup-screen.tsx`, `features/components/layout/demo-bar.tsx` | `/settings/accounting`; Prototype bar › QuickBooks add-on |
| D4 | Lead form: 5 submissions per hour per address. | `lib/website-form.ts` (`RATE_LIMIT`), `app/api/website-form/route.ts`, `website-leads-panel.tsx` | `/api/website-form` |
| D5 | Lead form fields: Full name 2–80, US phone (10 digits) or valid email (one required: "Please give us a phone number or email."), Property address, "What would you like painted?" (Interior, Exterior, Both, Cabinets, Other), Message up to 1,000. Thanks message. A match to an open lead still creates the lead, marked "Possible duplicate" with a link. | `lib/website-form.ts` (+ tests), `app/website-form/page.tsx`, `features/lib/rules/marketing.ts` (+ tests), `features/lib/store/actions/marketing.ts`, `marketing-engage.ts`, `features/types/index.ts`, `lib/types/core.ts`, `lib/bridge/map.ts`, `components/WebsiteInboxSync.tsx`, `components/leads/leadFeatures.tsx`, `LeadCard.tsx`, `LeadsTable.tsx`, `app/leads/[id]/page.tsx` | `/website-form`, `/leads` |
| D6 | Organisation-managed lead sources: 8 built in (non-deletable), Nextdoor, Thumbtack, Angi and Yard Sign seeded. Settings › Pipeline Stages › Lead sources: add, rename, deactivate; name required, ≤ 30, unique; a source with leads can't be deleted; admin only. Tracked links, `leadSourceFor()`, the Source filter and Group by Source use the list. | `features/lib/rules/lead-sources.ts` (+ tests), `lib/types/settings.ts`, `lib/types.ts`, `lib/data/settings-config.ts`, `lib/sampleData.ts`, `components/settings/config/LeadSourcesPanel.tsx`, `PipelineStagesView.tsx`, `components/leads/TrackedLinksCard.tsx`, `KanbanBoard.tsx`, `app/leads/page.tsx`, `components/WebsiteInboxSync.tsx`, `lib/website-form.test.ts` | `/settings/pipeline-stages` › Lead sources, `/leads?view=website` |
| D7 | Crew email subject "Schedule update from {Company}: {N} jobs changed" (Spanish equivalent). Template "Schedule Update (crew)". Old dates crossed through beside the new ones in the preview. | `features/lib/rules/schedule-notify.ts` (+ tests), `lib/data/settings-config.ts`, `lib/migrate.ts`, `components/scheduling/NotifyCrew.tsx` | `/job-scheduling` › Unsent changes › Preview; `/settings/automated-messages` |

Also: `features/lib/rules/marketing.test.ts` no longer fails on the first days of a month (the monthly-report test publishes a post now), and the README lists the real test count.
