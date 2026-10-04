# Prototype Fit Review

The 29 Figma frames do not fit the prototype yet. They use a different font, sidebar, top bar and badge style. Several of them also redraw screens the prototype already has. Reviewed against [emts-prototype](https://github.com/LorenPacuribot/emts-prototype/tree/main) on 1 Oct 2026.

## Summary

The prototype is further along than this doc assumed. The 14 patent features are already built into it, each with a green NEW badge. That includes most of QuickBooks Minimal, a full set of Accounting book screens, Marketing automations, website lead capture and the Job Margin report.

Three things follow from that:

- **Reuse, don't redraw.** Every screen in tab 6 should extend an existing prototype screen, using its components. The host map below says which one.
- **Some scope items are already done.** They should be marked "Exists in prototype" in the Scope tab, so nobody estimates them twice.
- **Books extends Accounting.** Estimate Master Books should be a mode of the existing Accounting module, not a new sidebar item. Accounting already has Checkbook, Bank and Card Feeds, Recurring Expenses, Bills and Alerts.

Recommendation: skip rebuilding the Figma frames for now. The prototype is the real design system, so the next step should be the Step 4 prompt that builds these screens straight into the prototype. If Tim wants Figma pictures later, they can be captured from the running prototype, so they will match exactly.

## Design system audit

The prototype copies the live app's design tokens in `app/globals.css`. Its shared parts live in `components/ui/` (host screens) and `features/components/ui/` (feature screens). New work should use these and nothing else.

### Tokens

| Token | Value in the prototype | Source |
| --- | --- | --- |
| Body font | Roboto 400, 500, 700, 900 | `--font-sans` |
| Heading font | Manrope 400 to 800 | `--font-heading`, all h1 to h4 |
| Primary | #2563EB (600), #1D4ED8 (700), #EFF6FF (50) | `--color-primary-*` |
| Page background | gray-50 #F9FAFB | `body` |
| Text | gray-900 #111827, muted gray-500 #646C7B | `--color-ink`, `--color-gray-500` |
| Borders | gray-200 #E5E7EB | `--color-line` |
| Brand accents | purple #7A5FFF, green #5ED4B2, yellow #EAD94C, red #D62839, orange #FF9F1C | `--color-brand-*` |
| Smallest text | xxs, 10 px on 14 px line (12 px inside roomy module screens) | `--text-xxs`, `.roomy` |
| Card | 16 px radius, gray-200 border, white, shadow-sm | `Card` |
| Card shadow | 0 1px 2px rgba(15,23,42,0.05) | `--shadow-card` |
| Modal motion | fade 150 ms, pop 160 ms, slide 200 ms | `--animate-in-*` |

### Layout

| Part | Prototype | Source |
| --- | --- | --- |
| Sidebar | Icon rail, 104 px collapsed, 320 px on hover or pinned. 24 px lucide icons. Active item: primary-50 fill, primary-100 border, bold. | `components/Sidebar.tsx` |
| Sidebar groups | Main nav, then an "Operations" group of NEW modules (Time, Supplier Orders, Repaint Alerts, Accounting, Marketing), then Help & Support, Settings, Logout | `lib/constants.ts` |
| Top bar | 80 px, white, back and forward arrows, divider, breadcrumbs, user menu | `components/Navigation.tsx` |
| Page header | Manrope 30 px bold title, 16 px gray-500 subtitle, actions on the right, 32 px gap below | `PageHeader` |
| Feature modules | Screen frame with area navigation (L2 tabs) and roomy type scale | `features/components/layout/screen.tsx`, `area-nav.tsx` |
| Settings | Settings sidebar in three groups: Organization, Configuration, Libraries | `SettingsShell`, `SETTINGS_NAV` |

### Components to reuse

| Need in our screens | Use this prototype component |
| --- | --- |
| Buttons | `Button`: primary, secondary, outline, danger, danger-outline, dark, ghost, success; sizes xs to lg |
| Status pills | `Badge` with tones gray, blue, purple, green, amber, red, indigo, pink, dark |
| Record chips (EST-2026-74) | `IdChip` or `RefChip` |
| Stat tiles | `StatCard` or `Stat` / `StatStrip` |
| Tables | Feature `Table`, `THead`, `TH`, `TD`, `TR` (responsive `.rtable`) |
| Tabs | `PillTabs` (feature screens), Radix `Tabs` (host screens) |
| Forms | `Field`, `Input`, `Select`, `Textarea`, `Switch` |
| Dialogs | `Modal`, `ConfirmDialog` |
| Section headers on detail pages | `SectionHeader` (48 px round icon and heading) |
| Empty states | `EmptyState` |
| Notices | `Banner` |
| Toasts | `toast.success` and friends |
| Kanban | `components/leads/KanbanBoard.tsx`, `LeadCard.tsx` |

### Marker convention

The prototype already has two markers:

- `NewBadge`: green-700 background, white 10 px uppercase heavy text, 6 px radius. It means "not in the live app yet" and names its feature number in a tooltip.
- `ConfirmBadge`: amber outline, "Needs client confirmation".

Our Minimal / Complete markers should sit beside these, in the same shape, not replace them:

| Marker | Style (same shape as NewBadge) | Meaning |
| --- | --- | --- |
| NEW | Existing green NewBadge | Not in the live app |
| MINIMAL | primary-700 background, white text | In the first release |
| COMPLETE | purple-700 background, white text (brand purple #7A5FFF is too light: white text on it is about 4.3:1, below the 4.5:1 the prototype targets) | Only in the Complete version |
| Item ID | Tooltip on the marker, like NewBadge's feature number | For example, "CRM-C4" |

This drops the orange NEW MODULE badge. Books becomes part of Accounting, so the existing NEW badge already says it is new.

The Version switch (Minimal / Complete) and the Hide markers toggle go inside the existing Prototype bar (`features/components/layout/demo-bar.tsx`), under "Viewing as" and "Clock". That is where every other demo control already lives. They do not go in the top bar.

## Design critique: Figma frames against the prototype

The content holds up: the flows, the sample data, and the idea of marking every element are right. The problem is the look and the structure. A developer handed these frames would build a second style of screen next to the existing one.

### What works

- The flows are complete. Each screen shows its default, empty, error and success states where they matter.
- The sample data joins up across screens, and the arithmetic checks out. For example, the invoice lines total $5,958 and September totals $11,495.
- Every element carries its item ID, so the scope, the doc and the screens point at the same thing.
- The approval rules are visible in the UI, such as "Ask me first" and "Approve automation".

### Findings

| Finding | Severity | Fix |
| --- | --- | --- |
| The frames use Inter. The prototype uses Roboto for body text and Manrope for headings. | High | Use Roboto and Manrope everywhere. |
| The sidebar is a 220 px text list with a made-up menu (Books, Automations). The prototype uses a 104 px icon rail, and its Operations group holds Time, Supplier Orders, Repaint Alerts, Accounting and Marketing. | High | Draw the real icon rail. Put Books inside Accounting and automations inside Marketing. |
| A new "Settings › Integrations" page duplicates the existing QuickBooks card in Settings › Accounting. | High | Extend Settings › Accounting instead. |
| A separate Books module duplicates Accounting's Checkbook, Bank and Card Feeds, Recurring, Bills and Alerts screens. | High | Make Books a mode of Accounting, and add only what is missing (see the host map). |
| A new Automations module duplicates Marketing › Automations. That screen already has an owner-only switch to turn each automation on, which matches the Approve automation rule. | High | Extend Marketing › Automations with the rule builder, flow view and approval queue. |
| The Lead Capture page and public form duplicate the existing Website Lead Review (`/leads?view=website`) and `/website-form`. | Medium | Add tracked links to the existing website lead setup, and reuse the existing form. |
| The top bar is thin and puts the version switch in it. The prototype's top bar is 80 px, with back and forward arrows and breadcrumbs. | Medium | Use the real top bar. Move the version switch into the Prototype bar. |
| Markers use blue, purple and orange pills with borders. The prototype's markers are solid 6 px-radius pills (green NEW, amber confirmation). | Medium | Use the marker table in the audit above. |
| Page titles are 24 px. The prototype uses 30 px Manrope bold with a 16 px subtitle. | Low | Use `PageHeader`. |
| Cards use a 12 px radius. The prototype uses 16 px with shadow-sm. | Low | Use `Card`. |
| Settings pages have no Settings sidebar. | Low | Use `SettingsShell`, with new pages added to `SETTINGS_NAV`. |
| The Email Events page is new. The prototype already has Settings › Automated Messages for every email and SMS template. | Medium | Add the Automatic / Manual setting to Automated Messages. |

### Accessibility notes

- The COMPLETE marker colour needs purple-700, not brand purple, to reach 4.5:1 with white text.
- The "Changes not sent" marker must not rely on the orange dot alone. It needs its text label, as drawn.
- Board cards on iPad need a Move to menu as well as drag. This is already in the CRM spec, and matches Tim's iPad bug reports.

## Host map

Every screen from tab 6, mapped to where it belongs in the prototype. The status column uses three values:

- **Exists**: the prototype already has it. Reuse it and add only the markers.
- **Extend**: add the new parts to an existing screen.
- **New**: a new screen or modal, built inside an existing module with existing components.

### QuickBooks

| Screen | Host in the prototype | Status | What to add |
| --- | --- | --- | --- |
| S-QB1 Integrations | Settings › Accounting, `QuickBooksConnectionCard` in `finance-frame.tsx` | Extend | Accounting destination choice: QuickBooks or Books. Drop the separate Integrations page. |
| S-QB2 QuickBooks detail | `/accounting` connection strip, `/accounting/transfer-queue`, `/accounting/unallocated` | Exists | Customer Review (QB-C1) as a tab in Unallocated. |
| S-QB3 Connect and first match | Settings › Accounting, migration section in `setup-screen.tsx` | Extend | The contact-matching step. |
| S-QB4 Invoice synced | `/invoices/[id]`, QuickBooks state in `InvoiceFeatureParts.tsx` | Exists | Markers only. |
| S-QB5 Contact QuickBooks panel | `/contacts/[id]`, `ContactFeatures.tsx` | Extend | The QuickBooks card. |
| S-QB6 Job margin | `/reports?tab=job_margin` | Exists | Markers only. |

### CRM

| Screen | Host in the prototype | Status | What to add |
| --- | --- | --- | --- |
| S-CRM1 Boards | `/leads`, `KanbanBoard.tsx`, `LeadCard.tsx` | Extend | Sales / Production switch, Group by source. |
| S-CRM2 Pipeline Stages | `/settings/pipeline-stages`, `PipelineStagesView.tsx` (rename and colour today) | Extend | Add, reorder, delete, the Production tab, and locked system stages. |
| S-CRM3 Lead Capture | `/leads?view=website`, `website-leads-panel.tsx` | Extend | Tracked links per channel with QR codes. |
| S-CRM4 Public form | `/website-form` | Exists | Read the `src` tag from the link. |
| S-CRM5 Lead detail | `/leads/[id]`, `PipelineStatusBar.tsx` | Extend | Stage history, and the journey bar (Complete). |
| S-CRM6 Stage Emails | `/settings/automated-messages` | Extend | Trigger, approval status and the Approve automation button on each template. |
| S-CRM7 Automations | `/marketing/automations`, `automations-screen.tsx` | Extend | The When / If / Then rule editor. |
| S-CRM8 Flow builder | `/marketing/automations` | New | A flow view of the same rules. |
| S-CRM9 Approval queue | `/marketing/automations` or `/marketing/inbox` | Extend | The "waiting for approval" list. |

### Job Scheduler

| Screen | Host in the prototype | Status | What to add |
| --- | --- | --- | --- |
| S-JS1 Week view | `/job-scheduling`, `components/scheduling/Boards.tsx` | Extend | Changes-not-sent marker and Unsent changes button. |
| S-JS2 Notify crew | `/job-scheduling`, using `Modal` | New | The modal. |
| S-JS3 Email preview | Template preview from Automated Messages | New | The preview modal. |
| S-JS4 Edit Shift with Send Email | `ShiftSchedulePanel.tsx`, `ScheduleJobModal.tsx` | Extend | The Send Email button. |
| S-JS5 Bulk Reschedule notify | The existing Bulk Reschedule flow | Extend | Open Notify crew after Apply. |
| S-JS6 Email Events | `/settings/automated-messages` | Extend | An Automatic / Manual setting per template. Drop the separate page. |

### Reports

| Screen | Host in the prototype | Status | What to add |
| --- | --- | --- | --- |
| S-RP1 Estimate Log | `/reports`, Estimates Log tab in `TableTabs.tsx` | Extend | One row per sales entry, and the expand panel. |
| S-RP2 Jobs Sold | `/reports`, Jobs Sold and Sales Goal tabs | Extend | Totals from entries, and the new-sales / amendments split. |
| S-RP3 Sales by estimator | `/reports` | New | A tab. |
| S-RP4 Change order | Change orders feature (`features/components/features/change-orders`) | Exists | Show the sales entry it creates. |

### Books (inside Accounting)

| Screen | Host in the prototype | Status | What to add |
| --- | --- | --- | --- |
| S-BK1 Overview | `/accounting` overview | Extend | A Books mode when the destination is Books. |
| S-BK2 Chart of accounts | Settings › Accounting, mappings in `setup-screen.tsx` | Extend | The 24-account preset and account editing. |
| S-BK3 Journal | `/accounting`, Overview area | New | A Journal page. |
| S-BK4 Bills | `/accounting/bills` | Exists | The Books postings. |
| S-BK5 Banking | `/accounting/checkbook`, `/accounting/feeds` | Exists | Payments to deposit (BK-M10), and the reconcile-to-$0.00 finish. |
| S-BK6 Reports | `/reports?tab=income_expense`, `aged_receivables` | Extend | Balance Sheet, sales tax summary, and the Cash / Accrual toggle. |
| S-BK7 Close and export | Settings › Accounting periods (close period and audit export exist) | Extend | The year-end roll. |
| S-BK8 Move from QuickBooks | Settings › Accounting migration | Extend | The customer and opening balance import. |
| S-BK9 Accountant role | `/settings/roles-permissions`, existing Bookkeeper role | Exists | Confirm Bookkeeper covers adjusting entries. |

### Scope items that already exist

These should be marked "Exists in prototype" in the Scope tab. The dev team should then estimate only the gap between the prototype and production, not a new build.

- QuickBooks: QB-M1 (connection card), QB-M4 to QB-M7 (exchange queue, invoice state, lock), QB-C3 (variance and deletion flags), QB-C6 (job margin).
- CRM: CRM-M4 (hosted website form).
- Books: BK-M4 (bills), BK-M5 (checkbook and feeds), BK-M7 (period close), BK-C1 (feeds, partly), BK-C7 (Bookkeeper role), BK-C8 (recurring).
- Reports: RP-C3 (change orders).

## Code Connect and next steps

Code Connect cannot be set up yet, for two reasons:

- It needs a Figma Organization or Enterprise plan. AbroadWorks is on Professional.
- It links published Figma components to code. The 29 frames are drawings, not published components.

It is also not needed for this work. The prototype's components (`Button`, `Badge`, `Card`, `NewBadge` and the rest) are already the source of truth, so the build prompt can name them directly.

### Next steps

1. **Mark existing items.** Update the Scope tab so items already in the prototype say "Exists in prototype".
2. **Re-host the screens.** Update tab 6 so each screen names its host from the map above, and remove the duplicate pages: Integrations, a separate Books module, a separate Automations module, Lead Capture, and Email Events.
3. **Write the Step 4 prompt** for Claude Code in the prototype repo. It should:
   - add a `VersionBadge` next to `NewBadge`;
   - add the Version switch and Hide markers toggle to the Prototype bar;
   - build each Extend and New item into its host, with the existing components.
4. **Figma, if still wanted.** Once the prototype has the screens, capture them into Figma so the pictures match the real thing. This also avoids spending the limited Figma tool calls on drawing by hand.
