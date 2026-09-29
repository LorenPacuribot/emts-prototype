# UI and UX Changes

The pass follows `docs/UI_UX_IMPROVEMENT_PROMPT.md`. Each phase adds its rows below.

Baseline before any edit: `npx vitest run` gave 48 files and 567 tests, all passing.

## Changes

### Phase 1: Foundations (C2, C3, S1–S3)

| Screen / area | What changed | Rule | Files |
| --- | --- | --- | --- |
| Feature button kit (every feature screen) | Now matches the live kit: `primary` is `bg-primary-600` with the soft blue shadow and border; `secondary` is white, gray border and `shadow-sm`; `md` uses `text-sm`; all sizes `rounded-lg`; `icon` is 36px like the live kit; `justify-center`; focus ring `ring-primary-400/60`. New sizes `xs`, `lg`, `icon-sm` and new variant `outline` (same as the live kit). New `loading` prop: shows a spinner, sets `aria-busy` and disables the button. New `danger-solid` variant (filled red, the live kit's `danger`). `danger` is still the red outline and the default variant is still `secondary`, so existing calls keep their meaning. | C2, S3, F3 | `features/components/ui/button.tsx` |
| Confirm dialogs | The destructive confirm button uses `danger-solid` instead of `dark` with a red class override. It looks the same. | C2 | `features/components/ui/dialog.tsx` |
| Feature UI kit (badge, card, misc, form, table, dialog, menu, live) | `slate-*` changed to `gray-*` and `emerald-*` to `green-*`. Hand-set sizes moved onto the type scale: badges, chips, table body, helper text and hints use `text-xs`; inputs, menu items, empty-state titles and toasts use `text-sm`; uppercase micro labels (`CardLabel`, `MicroLabel`, `TH`, `MicroPill`, `LiveLabel`, `NewBadge`, `ConfirmBadge`) use `text-xxs`; modal and drawer titles use `text-lg`. `EmptyState` is `rounded-2xl` like the live kit. | C2, C3, S1, S2, S3 | `features/components/ui/*.tsx` |
| Every feature screen, plus `app/**` and `components/**` (API routes excluded) | Scripted swap of `slate-50…950` to the same `gray-*` shade (1,119 classes) and `emerald-*` to the same `green-*` shade (173 classes). All prefixes and modifiers are kept (`bg-`, `text-`, `border-`, `ring-`, `from-`, `to-`, `divide-`, `hover:`, `/opacity`). | S1 | 242 files. See "Files" below. |
| Every screen | Scripted swap of 1,446 hand-set `text-[Npx]` sizes onto the C3 scale. From 7px to 10.5px: `text-xxs` when the same class string or `className={…}` expression has `uppercase` (275), otherwise `text-xs` (1,068 in total with the 11px–12.5px ones). 13px–14px became `text-sm` (65), 15px–16px `text-base` (25), 17px–18px `text-lg` (5), 20px `text-xl` (5), 22px `text-2xl` (1). Nothing people have to read is below 12px now. Only uppercase micro labels are 10px. | C3, S2 | Same sweep |
| Module page titles (`PageHeader`) | Title changed from `text-[26px] md:text-[28px]` to `font-heading text-3xl md:text-4xl` with `text-wrap: balance`, so it matches `LivePageTitle`. | C3, S2, S4, V3 | `features/components/layout/screen.tsx` |
| Class merging (all screens) | `text-xxs` (already defined in `app/globals.css`) was unknown to `tailwind-merge`, which treated it as a text colour. `cn("text-xxs text-gray-400")` quietly dropped `text-gray-400`. Both `cn` helpers now register `xxs` as a font size. | C3 (fix needed for the scale to work) | `features/lib/cn.ts`, `lib/utils.ts` |

Files: the sweep changed files under `features/components/features/**` (marketing, future-estimate, service, workforce, finance, procurement, properties, color-card, materials, estimates, change-orders, work-orders, leads, settings, public-record, contacts, reports, jobs, closeout, dashboard and others), `features/components/layout/*`, `features/components/tour/product-tour.tsx`, `features/components/ui/*`, `components/**` (settings, estimates, dashboard, leads, scheduling, jobs, presentations, invoices, contacts, ui, reports, Sidebar and others) and `app/**` pages. `git diff --stat` lists every file.

What Phase 1 kept on purpose:

- `NewBadge` stays `bg-emerald-500`. The `className` overrides passed to `<NewBadge …/>` (`text-emerald-700` on a white badge inside primary buttons) also stay emerald. The collapsed-nav "new" dots in `components/Sidebar.tsx` and `features/components/layout/icon-rail.tsx` stay `bg-emerald-500`, because they stand in for the NewBadge at nav level (hard rule 6). All other "new section" outlines (`isNew` ring and border) are now `green-*`, so they match each other.
- `IdChip` stays `rounded-md` (a square record-number chip, like the live `NumberChip`). `PillTabs` stays `rounded-xl` until Phase 4 (H4) restyles tabs and filter chips. Its text is now `text-xs`.

### Phase 2: Navigation (C1, H5, M4, N1–N3)

| Screen / area | What changed | Rule | Files |
| --- | --- | --- | --- |
| Main sidebar | The nav list scrolls inside the rail with the thin `custom-scrollbar`. A fade appears at the top once scrolled, and a fade plus chevron at the bottom while more items are below. Items are `py-2.5` instead of `py-3`. Collapsed icons have a tooltip with the label ("(new)" on the new modules). An "Operations" group label sits above the new modules when the rail is expanded. Keyboard focus inside the rail expands it, so labels show. | C1, N2 | `components/Sidebar.tsx` |
| Module headers | A crumb that repeats the one before it or the page title is dropped, so a landing page reads "Supplier Orders" and a sub-page "Supplier Orders › Returns". | H5, N1 | `features/components/layout/screen.tsx` (`headerCrumbs`) |
| Prototype bar | Docked in a slot the sidebar footer reserves below Logout on desktop, so it covers neither nav nor content. On phone and tablet it is a 44px round button raised clear of sticky bottom bars. All its controls are unchanged. | M4 | `features/components/layout/demo-bar.tsx`, `components/Sidebar.tsx` |
| Secondary sidebars (Time, Supplier Orders, Repaint Alerts, Accounting, Marketing) | Same group headings, dividers, item size, icon size and active colors as the Settings sidebar. Below lg it is a horizontal bar that scrolls. `aria-current` marks the active item. | N3 | `features/components/layout/sub-nav.tsx` |

### Phase 3: Words (C4, H9, H10, M1, W1–W5)

| Screen / area | What changed | Rule | Files |
| --- | --- | --- | --- |
| Change orders, color card, estimate, materials, supplier orders, paint history, QR links, finance reports, unallocated, labor cost, job cost, closeout | Every "Rule 1–5", "Cross-Feature Rule 1" and "Feature 27" in screen text was replaced by what it means ("Needs a priced change order signed by the customer", "Nothing goes out until you press send", "A leftover cent goes to the largest share, then to the lowest job number", "Repaint reminders count from this date"). "Labour (approved hours, Rule 3)" is "Labor (from approved hours)". Rule names in code comments and identifiers are unchanged. | C4, W2 | 20 files under `features/components/features/**`, `components/jobs/JobFeatures.tsx` |
| Every screen | US spelling in visible text: Color, Labor, Canceled, Canceling, Favorite, Behavior (172 strings in 70 files). A TypeScript-parser script changed only JSX text, display props (`title`, `label`, `description`, `placeholder`, `hint`, `aria-label` and similar), display fields in objects (`label`, `title`, `hint` and similar) and toast messages. Ids, types, store keys, route slugs, `data-tour` names and stored values (for example `status: 'Cancelled'`) were not touched. | H9, S7 | `app/**`, `components/**`, `features/components/**`, `features/lib/status.ts`, `lib/proposal.ts` |
| Nav, page titles, tour | "Time and Payroll", "Suppliers and Branches", "Returns and Credits", "Paint to Buy", "Containers to Buy". The "Send For Approval" button is "Send for approval". | H10, S7 | workforce, procurement, color-card, estimates and work-orders screens, `features/components/tour/tour-steps.ts` |
| Materials: Quantity states, Measured demand | Plain column names: "Paint needed", "From shelf stock", "Ordered, not confirmed", "Confirmed by supplier", "Still needed", "Can order now", "Area with coats", "With waste". The "−0.00 cancel · −0.00 return = 0.00" line only shows when something was canceled or returned, as a sentence. The formula paragraph is behind "How is this calculated?". The CSV export header says Color. | M1, W1, W5 | `features/components/features/materials/quantity-panel.tsx`, `demand-table.tsx`, `materials-sections.tsx` |
| Work order: paint color card tiles | "Outstanding · orderable 7.07 · 7.07 gal" is now two labeled rows, "Still needed" and "Can order now". The NEW badges on the "Approval" and quantity field labels are removed; the section keeps its NEW marker. | M1, M2 | `features/components/features/work-orders/details/wo-sections.tsx` |

### Phase 4: Page fixes (C5, H1–H4, H6, H7, M2, M3, M6–M9)

| Screen / area | What changed | Rule | Files |
| --- | --- | --- | --- |
| Work order | Sticky section index under "Back to Work Orders": Overview, Paint & materials, Orders, Checklist, Crew & time, Notes & photos. Chips scroll to the section and the one in view is highlighted. Chips for sections that aren't on the page (a work order with no prototype twin) are left out. Nothing is hidden, so tour targets and tests still render. For the Crew Lead role, the crew clock and crew time come straight after the header, and their chip moves up too. `LiveCard` has `scroll-mt-24` so the sticky bar doesn't cover a section's top. | C5, N4 | `components/ui/SectionIndex.tsx` (new), `app/work-orders/[id]/page.tsx`, `components/work-orders/WoFeatures.tsx`, `features/components/ui/live.tsx` |
| Work order: checklist | With no tasks, the "0 / 0 done" count and the empty progress bar are hidden, and the text says what appears there and to add the first task below. | M7, F2 | `app/work-orders/[id]/page.tsx` |
| Prototype-only controls | New `DemoButton` (variant `demo`): dashed amber border, flask icon and a "Demo" tag. Used for "Run now (as at 2 a.m.)" on Repaint Alerts (it was the page's primary button), "Simulate expiry", "Simulate suspension", "Simulate draft-only permission" and "Simulate scheduled time". | H1 | `features/components/ui/button.tsx`, `features/components/features/service/run-controls.tsx`, `marketing/accounts-screen.tsx`, `marketing/compose-screen.tsx` |
| One primary per view | Estimate header: "Create Change Order" and "Mark Approved" are secondary, so "View Job" or "Send" is the one filled button. Job page: "Mark Complete" is primary blue, like the work order (it was green). Mobile clock: "Clock Out" is primary like "Clock In" (it was black). Follow-Ups: row "Qualify" buttons are secondary. | H1, V1, S6 | `components/estimates/EstimateToolbar.tsx`, `components/estimates/FeatureSections.tsx`, `app/jobs/[id]/page.tsx`, `features/components/features/workforce/clock-screen.tsx`, `service/follow-ups-screen.tsx` |
| Estimate title | The project name is a one-line textarea that grows and wraps instead of an input that clipped it ("Main Floo"). Enter still finishes editing, and a line break is never saved. The toolbar goes under the title below 1536px (it was 1280px). | H2, V3 | `components/estimates/EstimateToolbar.tsx` |
| Disabled actions | "Amend Estimate" shows its blocked reason as visible text under the button (the tooltip stays, and the button's `aria-describedby` points at the text). Work order "Assigned Crew": "Choose a crew member in the list, then press Add." shows while nothing is chosen. | H3, F1 | `components/estimates/FeatureSections.tsx`, `app/work-orders/[id]/page.tsx` |
| Tabs and filters (every feature screen) | `PillTabs` has two looks. `kind="view"` gives underline tabs for the top-level views: Supplier Orders (Status board, Exception list…), Website Lead Review, Bank & Card Feeds, and the marketing reviews and inbox. The default is now small rounded outline chips with a primary tint when active, for filters and choices. A view row and a filter row never look the same. | H4, S5 | `features/components/ui/misc.tsx`, `procurement/supplier-orders-screen.tsx`, `leads/listings/website-leads-panel.tsx`, `finance/books-screens.tsx`, `marketing/growth-screens.tsx` |
| Contact › Paint History | The contact tabs stay on one row that scrolls sideways (they wrapped at lg). The service location (a select when there are several) and the four views share one bar with "New Estimate from History". "Export PDF ▾" and "Export CSV" are one "Export ▾" menu (staff PDF, customer PDF, CSV). The duplicate "QR Links" button is removed, because the QR Links view in the same bar opens it. | H6 | `app/contacts/[id]/page.tsx`, `features/components/features/contacts/details/paint-history-tab.tsx`, `features/components/features/properties/paint-history-screen.tsx` |
| Hours and money labels | Work order header and the job's Work Order Details card use the same words: "Estimated" (the estimate's hours), "Scheduled" (crew hours on the schedule) and "Logged" (hours logged, was "Rendered"), each with a one-line tooltip. Job Financials: "Paid to Date" is "Paid on invoices", with a tooltip saying a deposit taken before invoicing isn't counted. The job header's "Contract value" is "Original contract value". Job Cost's "Contract (ex tax)" is "Revised contract (ex tax, with change orders)". No number changed. | H7 | `app/work-orders/[id]/page.tsx`, `components/jobs/JobDetailCards.tsx`, `app/jobs/[id]/page.tsx`, `components/jobs/JobFeatures.tsx`, `features/components/features/jobs/details/job-details-screen.tsx` |
| NEW badges | Removed from field labels, table cells and repeated rows: color form fields, color tiles, affected-commitment banners, the public estimate color rows, lead table source cells, rate-suggestion column headers, contact job rows and time log rows. Section, tab, nav and menu-item badges stay. | M2 | `contacts/details/contact-details-screen.tsx`, `estimates/details/manage-color.tsx`, `paint-colors.tsx`, `estimates/view/public-estimate-screen.tsx`, `leads/listings/leads-list-screen.tsx`, `settings/settings-screens.tsx`, `work-orders/details/wo-sections.tsx` |
| Status chips | Change order rows already show one state chip plus at most one warning. The emergency warnings now carry an icon (triangle for overdue, clock for due), so they don't rely on color. | M3, A2 | `features/components/features/change-orders/shared.tsx` |
| Clickable table rows (16 feature tables) | The shared `TR` row, when it has `onClick`, gets a hover state, a trailing chevron, a focus ring, `tabIndex=0`, and opens with Enter or Space. Keys pressed inside a button or input in the row are left alone. | M8, A4, A5 | `features/components/ui/table.tsx` |
| Work order: crew time | "Time Log" and "Clocked time on this job" are one "Crew Time" card with two titled groups, "Hours by surface" and "Clock punches", in the same row layout. Rows say "Worked by …", then "Entered by …" (logged hours) or "Clocked by …" (punches). The Crew Clock card says "on this job", or warns "Clocked in at JOB-2026-1, not this job". | M6 | `features/components/features/work-orders/details/wo-sections.tsx` |
| Counts that looked wrong | Repaint Alerts "Open alerts" hint shows its breakdown ("3 live + 1 suppressed"). Follow-Ups "Escalated to owner" hint says it counts unqualified alerts past 14 days, and that the Escalated tab lists follow-ups. Contact "Total Jobs" is "Jobs in Estimate Master", with a tooltip saying imported paint records are under Paint History. No count changed. | M9, M7 | `features/components/features/service/alerts-screen.tsx`, `follow-ups-screen.tsx`, `app/contacts/[id]/page.tsx` |

## Moved, not removed

| Action | Was | Now |
| --- | --- | --- |
| Supplier Orders › Exception list | "Exception List" button in the page header, and the "Exception list" tab | The tab only (one click, same view) |
| Follow-Ups › show unqualified alerts | Primary "Qualify" button in the header, which set the Unqualified filter | The "Unqualified" filter chip (one click, same filter). Each row keeps its "Qualify" button. |
| Paint History › QR Links | Primary "QR Links" button in the paint record's header | The "QR Links" view in the Paint History bar just above (one click) |
| Paint History › Export PDF (staff or customer) and Export CSV | "Export PDF ▾" menu plus a separate "Export CSV" button | One "Export ▾" menu with all three (two clicks, as before for PDF) |

## Data questions

Nothing was recalculated. Each question needs a developer or the client to decide.

- Hours: a work order's "Estimated" sums the estimate's surface hours, and its "Scheduled" sums shift hours. The job card's "Estimated" is `job.estimatedHours` and its "Scheduled" sums the job crew's hours. For JOB-2026-5 the work order says 64.00 scheduled and the job says 45.00. Should both read the same source?
- Money: the job header shows `job.value` ($4,992.90 on JOB-2026-5), and Job Cost shows the revised contract ex tax ($5,819.40). Is `job.value` meant to include tax, change orders, both or neither?
- "Paid on invoices" ($0.00) sits beside "Deposit $1,664.30 collected" on the change orders card. Should a collected deposit count as paid on the job before it is invoiced?
- Estimate Area & Line Items can show "Product: No paint" and "Paint (gal) 0.00" while the color card above lists products and gallons, when a line isn't linked to a card color yet. Should unlinked lines pick up the card's product?
- Repaint Alerts: "Open alerts" counts live plus suppressed (not backlog), and the "Live" tab counts live only. Follow-Ups: "Escalated to owner" counts unqualified alerts past the 14-day clock, and the "Escalated" tab counts escalated follow-ups. The hints now say this. Should either number change?

## Not done

Phase 1:

- `features/lib/rules/lead-pipeline.ts` (`emerald-*` for the "Sold" stage) and `features/lib/rules/marketing-social.ts` (`emerald-*` on the Google Business chip, `slate-*` on the TikTok chip) still use those palettes. Both files are off limits (business rules). A developer should move these colour strings into a UI mapping, or approve editing them.
- `features/components/features/properties/qr-print.tsx` keeps its `text-[6.5pt]` to `text-[12pt]` sizes. They set the physical size of the printed QR sticker, so they are print measurements, not screen type.
- `components/settings/SettingsSidebar.tsx` keeps `lg:text-[0.95rem]` (about 15px, above the minimum). It is the live Settings sidebar, which N3 in Phase 2 uses as the model, so it was left for that phase.
- Tabs and filter chip styles (H4 and S5) are left for Phase 4.

Phase 3:

- Text written by the business rules is unchanged, because those files are off limits. Activity-log and toast messages from `features/lib/store/actions/**` and `features/lib/rules/**` still say "colour" and "Labour", and sometimes "Rule N" (for example the change-rule reasons and the "Colour" correction field). Stored values such as the job status `'Cancelled'` are shown as stored. A developer should map these to display labels, or approve editing them.
- "Jobs To Do" stays as it is. It is the live app's report and dashboard label, and "To-Do" is a compound noun.

Phase 4:

- Raw `<tr onClick>` rows outside the shared `TR` (the leads list table, scope of work, and the live Reports Activity and Interaction tables) keep their mouse-only behavior. They should move to the `TR` component or get the same keyboard handling.
- The feature prototype's own estimate screen (`features/components/features/estimates/details/project-toolbar.tsx`) isn't routed in the app, so its title was left as it is.
- Two product-tour stops point at targets that don't exist, before and after this pass: `surface-selector` and `warning-strip` in `features/components/tour/tour-steps.ts`. A developer should add the `data-tour` attributes or drop the stops.
