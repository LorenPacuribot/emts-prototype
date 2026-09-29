# EMTS Prototype: UI and UX Improvement Pass

Paste this whole file into Claude Code, opened on the `emts-replica` folder.

## Your role

You are a senior product designer who also writes production React. Your job is to make the Estimate Master (EMTS) prototype easier to use by looking at it. A new user should know where they are, what matters on the screen, and what to do next, without reading help text.

You are improving how things look, read and are arranged. You are **not** changing what the app does.

## The one hard rule: keep every behaviour

Before you change a file, check it against this list. If a change breaks any line, do not make it.

1. Do not edit business logic. These folders are off limits except for UI text that is not asserted by a test:
   - `features/lib/rules/`
   - `features/lib/store/` (including `actions/`)
   - `lib/bridge/`, `lib/auth/`, `lib/json-merge.ts`, `lib/remote-state.ts`
   - `features/data/`, `lib/data/` (seed data)
   - `features/types/`, `lib/types/`
   - `app/api/`, `proxy.ts`, `features/lib/permissions.ts`
2. Every button, link, field, menu item, filter, export and modal that exists today must still exist and still work. You may move an action into a menu, a tab or a disclosure, but it must stay reachable in two clicks or fewer from where it was.
3. Keep every `data-tour="..."` attribute on an element that is rendered on first load. The product tour (`features/components/tour/tour-steps.ts`) points at these. If you move a section, move its `data-tour` with it. Do not hide a tour target inside a closed tab.
4. Keep every `PermissionGate`, `hidden` prop and role check exactly as it is.
5. Keep routes and query strings (`?tab=`, `?view=`, `?po=`, `?co=`, `?id=`) working.
6. Keep all `NewBadge` and `ConfirmBadge` markers at section, tab and navigation level. You may remove them from individual field labels and table cells (see rule T6 below).
7. Do not change a number, a calculation or where a number comes from. If two screens show different numbers for the same thing, do not "fix" it. Label each number so the difference is clear, and list it under "Data questions" in your report.
8. `npm run typecheck`, `npm test` and `npm run build` must pass at the end, with the same test count as before you started.

Run `npm test` and note the test count before your first edit.

## What is wrong today (the audit)

This is what a review of the running prototype found at 1440×900, 1366×768, 820×1180 and 390×844. Fix these. The file paths are where to start.

### Critical

**C1. Five new modules are invisible on a normal laptop.** At 1366×768 the main sidebar shows items only down to Invoices. Presentation Builder, Reports, Time, Supplier Orders, Repaint Alerts, Accounting and Marketing sit below the fold in a list with `no-scrollbar`, so nothing tells the user they exist. When collapsed, the five new modules are unlabeled icons with a green dot.
- Files: `components/Sidebar.tsx`, `lib/constants.ts` (`MAIN_NAV`, `NEW_NAV`, `BOTTOM_NAV`).
- Fix: make the nav list scroll with a visible thin scrollbar (`custom-scrollbar`, which already exists in `globals.css`) and a fade at the bottom edge when more items are below. Tighten item height from `py-3` to `py-2.5` so more items fit. Give every collapsed icon a tooltip with its label. Add a small group label above the new modules when expanded ("Operations", or similar). Check the result at 1366×768 and 1280×720.

**C2. Two UI kits that look almost the same but are not.** The replica uses `components/ui/*` (gray palette, `text-sm`, `danger` is solid red, default button is `primary`). The feature screens use `features/components/ui/*` (slate palette, `text-[13px]`, `danger` is a red outline, default button is `secondary`, no `loading` prop). Across the code there are about 1,060 `slate-*` classes in `features/` and about 2,900 `gray-*` classes elsewhere, plus about 166 `emerald-*` next to 177 `green-*`. On screen this shows up as slightly different greys, greens and button weights on the same page.
- Fix: keep both import paths so nothing breaks, but make the feature kit match the live kit.
  - In `features/components/ui/button.tsx`, match the live sizes, radius, font size (`text-sm` for `md`) and shadow. Add the `loading` prop. Add a `danger-solid` variant for destructive confirmations and keep `danger` as the outline one, so existing calls do not change meaning.
  - In `features/components/ui/badge.tsx`, `card.tsx`, `misc.tsx`, `form.tsx`, `table.tsx`, `dialog.tsx`, swap `slate-*` for the matching `gray-*` and `emerald-*` for `green-*`. Leave `NewBadge` on `emerald-500` so it stays a distinct review marker.
  - Then sweep `features/components/features/**` for the same swaps.

**C3. Text is too small and has no scale.** There are 22 different hand-set font sizes in the code (`text-[7px]` up to `text-[28px]`). About 1,400 uses are under 12px, including `text-[10px]` (294 uses), `text-[9px]` (78), `text-[8px]` (6), `text-[8.5px]` and `text-[7px]`. Many of these are table text, status chips and helper copy that crews read on a phone in daylight.
- Fix: use this scale and nothing else.

  | Use | Class | Size |
  | --- | --- | --- |
  | Uppercase micro label only (column headers, eyebrows) | `text-xxs` + `uppercase tracking-wider` | 10px |
  | Chips, table cells, helper text, captions | `text-xs` | 12px |
  | Body, form fields, buttons | `text-sm` | 14px |
  | Card titles | `text-lg` | 18px |
  | Section titles | `text-xl md:text-2xl` | 20–24px |
  | Page titles | `text-3xl md:text-4xl` (list and settings) | 30–36px |

  Mapping: `[7px]`–`[10.5px]` become `text-xxs` if the text is uppercase, otherwise `text-xs`. `[11px]`–`[12.5px]` become `text-xs`. `[13px]`–`[14px]` become `text-sm`. `[15px]`–`[17px]` become `text-base` or `text-lg`. Larger ones map to the nearest step. Nothing a person must read to do their job goes below 12px.

**C4. Internal and developer language is on screen.** Users see "Cross-Feature Rule 1", "Colour Re-approvals (Rule 1)", "Labour (approved hours, Rule 3)", "(Rule 2)", "(Rule 4)", "(Rule 5)" and feature codes such as "F3" and "F18, 19, 22". Customers and crews do not know what Rule 1 is.
- Fix: replace each rule reference in UI text with what the rule means in plain words. Example: "Signed scope. You can save office-only changes (same brand, product line and colour, no price change). Anything else needs a change order." Keep the rule number only inside a tooltip if you want the team to trace it. Leave rule names in code comments and identifiers alone.
- The dashboard "Demo Journey" block may keep its F-codes because it is marked Prototype only. Nothing else may.

**C5. Work order page is one 5,800px scroll (8,900px on a phone).** `/work-orders/[id]` stacks header, client, location, crew, instructions, paint colour card, materials (six sub-panels), paint orders, task checklist, crew clock, time log, clocked time, field notes and photos. There is no way to jump to a section, and the crew clock is about 6,000px down on a phone.
- Files: `app/work-orders/[id]/page.tsx`, `features/components/features/work-orders/details/wo-sections.tsx`, `features/components/features/materials/*`.
- Fix: add a sticky section index under the header (chips on mobile, a horizontal bar on desktop): Overview, Paint & materials, Orders, Crew & time, Notes & photos. Each chip scrolls to its section (`scroll-mt-24` already exists on sections). Highlight the chip for the section in view. Do **not** turn these into tabs that hide content, because tour targets and tests expect the sections to render.
- For the Crew Lead role, show the crew clock card near the top (directly after the header) instead of near the bottom. Use the existing role from the store to decide the order. Do not change the clock logic.

### High

**H1. Too many primary buttons, and they disagree.** Examples: the estimate toolbar has two filled blue buttons ("View Job" and "Create Change Order"). The job page "Mark Complete" is green, the work order "Mark Complete" is blue, and the mobile clock "Clock Out" is black while "Clock In" is blue. Follow-Ups has a "Qualify" primary in the header and a "Qualify" primary on every row. Repaint Alerts makes the demo control "Run now (simulate 2 a.m.)" the primary action.
- Rule: one filled primary button per view, for the most likely next step. Everything else is `secondary` or lives in the kebab menu. Row actions are `secondary` or `ghost` size `sm`. The same action has the same colour on every screen ("Mark Complete" is always the same variant). Demo-only controls ("Run now", "Simulate another user's save", device simulation toggles) use a clearly marked prototype style: dashed border, flask icon, "Demo" label. Never primary.

**H2. Page titles get cut off.** On `/estimates/[id]` the title "Interior Repaint — Main Floor" is truncated to "Main Floo" because the toolbar takes the space.
- Files: `components/estimates/EstimateToolbar.tsx`, `features/components/features/estimates/details/project-toolbar.tsx`.
- Fix: title on its own row with `text-wrap: balance`, toolbar below it on narrow widths. Never clip a record name.

**H3. Disabled buttons do not say why, or say it only on hover.** "Amend Estimate" is greyed out and its reason lives only in a hover tooltip, which tablet and phone users never see. Crew "Add" in Assigned Crew is disabled with no hint.
- Fix: every disabled action shows its reason as visible helper text under or beside it (keep the tooltip too), and says what unlocks it. Example: "Amend is off once the job is in production. Create a change order instead." Use the reason the store or rule already returns where there is one; do not invent new rules.

**H4. Two stacked rows of identical-looking pill tabs.** Supplier Orders has "Status board / Exception list / Uncertain sends / Receipts / Requests" and, right below, "All / Preparing / Sent / Acknowledged ...", both styled as black-active pills. Users cannot tell which row is the view and which is the filter. The header also has an "Exception List" button that repeats the tab.
- Files: `features/components/features/procurement/supplier-orders-screen.tsx`, and the same pattern in service, workforce, finance and marketing screens.
- Rule: top level views use the underline tab style (or the live Reports `TabButton` segmented style). Filters inside a view use small outline chips, or a single select on mobile. Never two rows of the same component. Remove header buttons that only duplicate a tab, but keep the route or query it opened working.

**H5. Breadcrumbs repeat the page name.** "Supplier Orders | Supplier Orders", "Repaint Alerts | Repaint Alerts", "Accounting | Accounting".
- File: `features/components/layout/screen.tsx`.
- Fix: when the last crumb equals the section name, show only the section. For sub-pages show "Section › Page".

**H6. Contact Paint History is four layers deep.** Contact tabs, then a service location switcher, then sub-tabs (Paint History, Owners & Consent, QR Links, Touch-Up Reorders), then a card that has its own "QR Links" button and five toolbar buttons. The "Paint History" tab also wraps alone onto a second line.
- Files: `components/contacts/ContactTabs.tsx`, `features/components/features/properties/paint-history-screen.tsx`, `features/components/features/contacts/details/paint-history-tab.tsx`.
- Fix: keep all tabs on one row that scrolls horizontally on small screens. Merge the location switcher and sub-tabs into one bar ("420 Cedar Hollow Ln ▾ | History · Owners · QR links · Reorders"). Remove the duplicate "QR Links" button (the tab does the same). Put Export PDF, Export CSV and Corrections into one "Export ▾" plus one "Corrections" button.

**H7. Numbers that look like the same thing disagree across screens.** Do not change the maths (hard rule 7). Relabel so a person understands each one, then list them in your report.
- Work order header: "Total hours 17.78", "Assigned 64.00", "Rendered 27.00". Job page: "Assigned 45.00 hrs", "Total hours 17.78". Rename to what each actually measures (for example "Estimated", "Scheduled", "Logged"), with a one-line tooltip each. Use the same labels on both pages.
- Job page: Financials "Paid to Date $0.00" next to Change Orders "Deposit $1,664.30 collected". Header "Contract value $4,992.90" next to Job Cost "Contract (ex tax) $5,819.40". Say what each includes (original vs revised, with or without tax).
- Estimate Area & Line Items shows "Product: No paint" and "Paint (gal) 0.00" while the colour card above shows three products and 8.3 gallons.

**H8. Wide tables break on tablet and phone.** Materials "Measured demand" and "Quantity states", Time and Payroll, Supplier Orders, Repaint Alerts and Accounting tables cut off their last columns (Order, Flags, Exception, Owner, Exch.) even at 1440px, and hide most columns on a phone.
- Rule: below `md`, a table with more than four columns becomes a stacked card list (name and status on top, 2–4 key values as label/value pairs, the rest under "More"). At `md` and up, keep the table, but pin the first column and wrap it in `overflow-x-auto` with a visible scrollbar and a right-edge fade. Never let the page itself scroll sideways.

**H9. The same word is spelled two ways.** "Paint Color Card" sits next to "Colour approval" and "Colour Re-approvals" (86 "colour" vs 20 "color" in UI text). "Labor Config" in Settings, "Labour Cost" in Time (76 "Labour" vs 62 "Labor"). The client is in Texas and the live app uses US spelling.
- Fix: US English in every UI string: Color, Labor, Canceled (17 uses of "Cancelled" today). Change visible text only, not variable names, ids, types or store keys.

**H10. Title case bugs.** "Time And Payroll", "Returns And Credits", "Suppliers And Branches".
- Fix: Title Case with lower-case short words ("Time and Payroll") in nav and titles. Sentence case for buttons ("Create export batch"), matching the live app's buttons.

### Medium

**M1. Jargon and formulas as helper text.** The materials section shows "Coat-adj. area", "Base need", "Sent, unacknowledged", "Acknowledged (net)", "−0.00 cancel · −0.00 return = 0.00" and a full formula paragraph ("Outstanding = calculated − reserved shelf − ..."). The colour card shows "Outstanding · orderable 7.07 · 7.07 gal".
- Fix: plain column names ("Area with coats", "Paint needed", "Ordered, not confirmed", "Confirmed by supplier"). Move formulas behind a "How is this calculated?" disclosure next to the section title. Split "7.07 · 7.07 gal" into two labelled values ("Still needed 7.07 gal · Can order 7.07 gal").

**M2. NEW badges on every field.** On the work order colour card each tile has "Approval NEW" and "Outstanding · orderable NEW". On Time Log each row has a NEW chip. This is noise.
- Rule T6: one NEW badge per new section header, new tab or new nav item. Remove it from field labels, table cells and repeated rows. The section's green outline already says "new".

**M3. Status chips pile up.** A single change-order row shows "Approved", "Emergency · overdue" and "Deferred". Chips are 10–11px and rely on colour.
- Rule: one status chip per row (the current state), plus at most one warning chip. Every chip has an icon or text that works without colour. Map the same state to the same colour everywhere, using `features/lib/status.ts` as the single source.

**M4. The Prototype bar covers the app.** The bottom-left "Prototype · Business Owner" pill overlaps the sidebar's Logout item and the left edge of content on every page.
- File: `features/components/layout/demo-bar.tsx`.
- Fix: dock it inside the sidebar footer on desktop, or offset it so it never covers nav items or page content. On phone, make it a small button that does not overlap sticky action bars.

**M5. Simulation controls on real crew screens.** The mobile clock opens with "Device (simulated) No signal / Location permission denied" toggles above the job picker.
- Fix: move these into a collapsed "Demo controls" disclosure at the bottom of the screen, or into the Prototype bar. Keep them working.

**M6. Duplicate time lists on the work order.** "Time Log" (rows like "Luis Ortega … José Rivera · 9/24/2026 NEW") and "Clocked time on this job" show overlapping data in two styles. It is not clear who worked and who logged.
- Fix: one "Crew time" card with two clearly titled groups ("Hours by surface" and "Clock punches"), the same row layout for both, and "Worked by" / "Entered by" labels instead of two names side by side. The Crew Clock card should say which job the person is clocked into, and warn when it is not this job ("Kevin is clocked in at JOB-2026-1, not this job").

**M7. Empty and zero states.** "Task Checklist 0 / 0 done" with a grey bar. "Customer Stats: Total Jobs 0" beside "10 paint records". Empty cards give no next step.
- Rule: every empty state says what will appear and gives the one action to add the first item. Hide progress bars when the total is 0.

**M8. Clickable rows do not look clickable.** Repaint Alerts, Supplier Orders and Follow-Ups rows open a drawer on click, but have no chevron, hover state or cursor change. There are 4 `<tr onClick>` and 15 `<div onClick>` in the code.
- Fix: add `hover:bg-gray-50 cursor-pointer` and a trailing chevron to clickable rows. Make the click target a real `<button>` or `<Link>` inside the row so it works with a keyboard.

**M9. Counts do not match their labels.** Repaint Alerts says "Open alerts 4" and "Live 3". Follow-Ups says "Escalated to owner 1" and tab "Escalated 3".
- Fix: add the short definition under each stat ("4 open, including 1 suppressed") so the numbers reconcile. Do not change how they are counted.

## The rulebook (apply everywhere)

Use these as the acceptance test for every screen you touch.

### Navigation and orientation

- N1. The user can always answer "Where am I?" from the header: the section and page name, with no repeats.
- N2. Every module is visible in the sidebar at 1280×720 or the list shows that it scrolls.
- N3. Secondary navigation (the `SubNav` sidebar in Time, Supplier Orders, Repaint Alerts, Accounting, Marketing) uses the same style as the Settings sidebar. The active item matches the page title.
- N4. Pages longer than two screens get a sticky section index.
- N5. "Back to …" links and the browser back arrow go to the same place.

### Visual hierarchy

- V1. One primary action per view. It is the thing most users do next.
- V2. Group actions: primary, then up to two secondary buttons, then a kebab menu for the rest.
- V3. Record names never truncate in a header. They wrap.
- V4. Summary first: status and the two or three numbers that matter at the top of a page, detail below.
- V5. Use cards to separate objects, not to wrap every block. Sub-panels inside a card use a light background (`bg-gray-50`) instead of another bordered card.

### Consistency (match the live app)

- S1. Colours: `gray-*` neutrals, `primary-*` blue for actions and links, `green` / `amber` / `red` / `blue` / `purple` for states. No `slate-*` or `emerald-*` in new code (except `NewBadge`).
- S2. Type: only the scale in C3. Headings use `font-heading` (Manrope). Body uses Roboto.
- S3. Radius: cards `rounded-2xl`, inputs and buttons `rounded-lg`, chips `rounded-full`.
- S4. Page shells: list and settings pages use `LivePageTitle`. Detail pages use `AppHeader` plus the `max-w-[1100px]` body. New module screens use `Screen` plus `PageHeader`, but `PageHeader` must match `LivePageTitle` sizes.
- S5. Tabs: top-level tabs use one component everywhere. Filters use chips. See H4.
- S6. Same action, same word, same variant, on every screen.
- S7. US English. Sentence case for buttons, Title Case for page and nav titles.

### Words

- W1. Name things by what users recognise: "Paint order", not "PO lines"; "Confirmed by supplier", not "Acknowledged (net)".
- W2. No rule numbers, feature numbers, table names or internal ids in UI text, except record numbers users actually use (EST-2026-6, JOB-2026-5, WO-2026-5).
- W3. Buttons say what happens ("Send for approval", "Clock out"). The toast confirms it ("Sent for approval").
- W4. Errors and blocked actions say why and what to do next.
- W5. Helper text is one short line. Longer explanations go behind a "How does this work?" disclosure.

### Feedback and states

- F1. Every disabled control explains why.
- F2. Every empty state has a next step.
- F3. Loading states use `Skeleton`. Buttons that save show `loading`.
- F4. Destructive actions ask for confirmation inside the page (the existing `PopConfirm` or dialog). Never `window.confirm`.

### Devices and people

| Person | Device | What must be true |
| --- | --- | --- |
| Owner, office manager | Desktop 1366–1920 | Dense but readable tables. Everything in the sidebar visible. Approvals reachable in one click from the dashboard. |
| Estimator | Tablet 820×1180 | Estimate, colour card and change order work without sideways page scroll. Tap targets at least 40px. |
| Crew lead | Phone 390×844 | Clock, log hours, log material and closeout within one screen of opening the work order. Tap targets at least 44px. Text at least 12px, body 14px. Works in one hand: main actions in a sticky bottom bar. |
| Homeowner | Phone 390×844 | Public pages (`/paint-record/view`, `/estimates/view`, client view) have no staff jargon, no internal ids other than their estimate number, and one clear action. |

The public paint record page (`features/components/features/public-record/public-record-screen.tsx`) is the best screen in the prototype today. Use it as the model for clarity: big swatch, plain labels, one primary action, generous spacing.

### Accessibility (WCAG 2.1 AA)

- A1. Text contrast at least 4.5:1. `text-gray-400` on white fails for small text: use `text-gray-500` or darker for anything under 18px.
- A2. Status never by colour alone: add an icon or word.
- A3. Icon-only buttons have `aria-label` and a tooltip.
- A4. Every interactive element has a visible focus ring (`focus-visible:ring-2 ring-primary-400/60`).
- A5. Clickable rows and cards are real buttons or links.

## How to work

1. Run `npm install`, `npm run typecheck`, `npm test`, and record the test count.
2. Start the app (`npm run dev`) and sign in as `tim` (demo password, see `lib/auth/server.ts`).
3. Work in this order and commit after each step with a clear message:
   1. Foundations: C2, C3, S1–S3 (UI kits, colours, type scale). This fixes the most screens at once.
   2. Navigation: C1, H5, M4, N1–N3.
   3. Words: C4, H9, H10, M1, W1–W5.
   4. Page fixes: C5, H1, H2, H3, H4, H6, H7, M2, M3, M6–M9.
   5. Responsive: H8, M5, then the device table above.
   6. Accessibility: A1–A5.
4. After each step, check these screens at 1440×900, 1366×768, 820×1180 and 390×844:
   `/dashboard`, `/estimates/EST-2026-6`, `/jobs/JOB-2026-5`, `/work-orders/WO-2026-5`, `/contacts/C-ELENA?tab=paint-history`, `/time`, `/time/clock`, `/supplier-orders`, `/repaint-alerts`, `/repaint-alerts/follow-ups`, `/accounting`, `/settings/suppliers`, `/paint-record/view?token=k7Qm2xP9vR4tLw8e`, `/estimates/EST-2026-6/client-view`.
5. Start the product tour from the Prototype bar and click through every stop. Every callout must still point at its target.
6. Run `npm run typecheck`, `npm test` and `npm run build`. All must pass with the original test count.

## What to hand back

Write `docs/UI_CHANGES.md` with:

- A table of every change: screen, what changed, which rule it follows, files touched.
- "Moved, not removed": every action you moved into a menu, tab or disclosure, and where it is now.
- "Data questions": each number mismatch from H7 and M9 that needs a developer or the client to decide.
- "Not done": anything from this list you skipped, and why.
- Before and after screenshots of the work order, estimate, supplier orders and mobile clock, if you can take them.

If a fix would need a change to logic, data or permissions, stop, do not make it, and add it to "Not done" with a one-line reason.
