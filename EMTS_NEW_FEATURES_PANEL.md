# EMTS prototype: one "New Features" panel on the dashboard instead of scattered badges

You are working in the `emts-prototype` repo (Next.js 16, React 19, Tailwind v4, Zustand). Read `AGENTS.md` first: this Next.js version has breaking changes, so check `node_modules/next/dist/docs/` before routing or server code.

## Why

Today every new part of the prototype carries a green NEW badge. There are 91 `<NewBadge>` uses across 50 files. The client finds them scattered and confusing.

Replace them with one control panel on the dashboard. It lists every new feature, says where to find it, and lets the viewer switch each feature on or off. The badges stay in the code but are hidden by default.

## What the client sees

At the top of `/dashboard`, a full-width card titled **New Features**:

1. **A master checkbox: "Show new features".** Ticked by default.
   - Unticking it hides every new feature everywhere in the app: sections, tabs, buttons, columns, fields, sidebar items and settings pages. The prototype then looks like the live app.
   - Ticking it again restores each row exactly as it was.
   - While it is unticked, the table below is greyed out and its checkboxes are disabled.
2. **Quick buttons:** "All Minimal", "All Complete" and "Reset".
   - All Minimal ticks Minimal on every row and unticks Complete.
   - All Complete ticks both.
   - Reset goes back to the defaults.
3. **A table** with these columns, in this order:

| Column | Content |
| --- | --- |
| Feature | Feature name in bold, with its feature number or item prefix below in small grey text (for example, "Feature 24" or "QB"). |
| Breakdown | One or two plain sentences on what it does. A "Details" link expands a list of its parts: the Minimal items, and the Complete items if any. |
| Where to find it | One or more links to the screens, for example "Estimates › Colour card". Clicking one goes there. |
| Minimal | Checkbox. Ticked shows the feature's Minimal parts; unticked hides them. |
| Complete | Checkbox. Ticked shows the feature's Complete parts; unticked hides them. Shows "—" when the feature has no Complete version. |

4. **Two groups of rows,** each with a small group header:
   - **"Built in the prototype"**: the 14 patent features that are already built. They have no Minimal / Complete split, so the Minimal checkbox means "the feature as built" and Complete shows "—".
   - **"From the 30 Sep call"**: QuickBooks integration, CRM lead pipelines, Job scheduling emails, Amended estimates in reports, and Estimate Master Books.
5. **A small switch at the bottom: "Show NEW badges on screens".** Off by default. Turning it on brings back the green NEW badges and any Minimal / Complete badges, for walkthroughs where markers help.

## Rules

- **Complete builds on Minimal.**
  - Ticking Complete also ticks Minimal.
  - Unticking Minimal also unticks Complete.
  - Complete can never be on while Minimal is off.
- **Hiding is display only.** Never delete or change data when something is hidden. Turning it back on shows everything as it was.
- **A part labelled with several features** (for example, `feature={[3, 24]}`) shows when any of those features is on.
- **A hidden feature that has its own route** shows an `EmptyState` when the route is opened directly (for example, `/time` with Feature 22 off). Title: "This feature is switched off". Message: "Turn it on in New Features on the dashboard." Action: a button linking to `/dashboard#new-features`.
- **Hidden sidebar items** are removed from the rail. If every item in the Operations group is hidden, hide the group label too. Hidden Settings pages are removed from the Settings sidebar the same way.
- **Tabs, columns and filters that belong to a hidden feature** are removed cleanly. Do not leave empty tab slots, blank columns or orphan dividers.
- **Defaults:** master on, every row's Minimal on, every Complete off, badges hidden.
- **Persistence:** save the state in localStorage, using the same safe storage wrapper as `features/lib/store/index.ts`. Key: `emts-new-features`. Add a "Reset" option, and make the Prototype bar's "Reset demo data" reset this too.

## Build steps

### 1. Registry: `features/lib/feature-registry.ts`

Create one list, `FEATURES`, as the single source of truth for the panel and the gates. Each entry has:

- `key` (`'f3'`, `'f18'` … `'qb'`, `'crm'`, `'js'`, `'rp'`, `'bk'`)
- `group` (`'built'` or `'sep30'`)
- `number` (the feature number for built features)
- `prefix` (`'QB'` and so on, for the 30 Sep features)
- `name`
- `breakdown`
- `where: { label, href }[]`
- `parts: { minimal: string[]; complete: string[] }` (item IDs or short part names)
- `built: boolean`

Seed it from this table. Check every name and location against the code comments (each feature file starts with "Feature N — …") and against `lib/constants.ts`, and correct anything that differs.

| Key | Feature | Breakdown (draft) | Where to find it (check) |
| --- | --- | --- | --- |
| f3 | Project-specific colour card | Lists each paint colour, product and sheen for a job, with versions and customer approval. | Estimates › estimate › Colour card |
| f18 | Material calculation and orders | Works out paint and materials from the estimate, with waste, and builds the order. | Estimates (preliminary list), Work Orders › Materials |
| f19 | Supplier integration | Sends purchase orders to supplier branches and tracks acknowledgment, pickup and returns. | Supplier Orders, Settings › Suppliers |
| f21 | Estimated versus actual | Compares estimated cost and hours with what the job really used. | Reports › Job Performance, Jobs › cost and hours card |
| f22 | Employee hours and payroll | Crew clock-in and clock-out, approvals, disputes and payroll export. | Time, Work Orders › crew clock, Job Scheduling › crew actual hours |
| f24 | Change orders | Adds, removes or credits work on a signed estimate, and the amend rule. | Estimates › Change orders |
| f25 | Property and paint history | Keeps every past job and paint used at an address. | Contacts › Paint History |
| f26 | Customer QR paint record | A QR link the customer can open to see their paint record. | Contacts › Paint History, `/paint-record/view` |
| f27 | Paint life and repaint alerts | Flags surfaces when their paint is due for renewal. | Repaint Alerts, Settings › Repaint Intervals |
| f28 | Future estimating and re-ordering | Builds a new estimate from history and re-orders the same paint. | Estimates › From history, Contacts › reorders |
| f29 | Repaint follow-up | Assigns and tracks follow-up attempts for due repaints. | Repaint Alerts › Follow-ups, Leads › repaint follow-up card |
| f30 | Estimating feedback | Shows where estimates were over or under, to improve rates. | Reports › Estimating Feedback |
| f33 | Accounting | The QuickBooks connection, transfer queue, bills, checkbook, feeds and finance reports. | Accounting, Settings › Accounting, Invoices › QuickBooks state |
| f34 | Marketing | Social posts, campaigns, automations and website lead review. | Marketing, Settings › Social Accounts, Leads › Website leads |
| qb | QuickBooks integration | Sends contacts, jobs, invoices and payments to QuickBooks, and brings payment status back. | Settings › Accounting, Accounting, Invoices |
| crm | CRM lead pipelines | Sales and Production boards, your own stages, and leads from tracked links with the source set automatically. | Lead Pipeline, Settings › Pipeline Stages, Leads › Website leads |
| js | Job scheduling emails | No email on every save; one summary email per person, sent when you choose. | Job Scheduling |
| rp | Amended estimates in reports | An amendment counts only its difference, in the month it is re-approved. | Reports › Estimates Log and Jobs Sold |
| bk | Estimate Master Books | Built-in accounting as a mode of Accounting: journal, chart of accounts, reconciliation, Balance Sheet. | Accounting (Books mode), Settings › Accounting |

If a 30 Sep feature is not built yet, set `built: false`. Its row then shows a grey "Not built yet" pill, and its checkboxes are disabled.

### 2. Visibility store: `features/lib/feature-visibility.ts`

- A Zustand store, persisted under `emts-new-features`. State:
  - `showNew: boolean`
  - `showBadges: boolean`
  - `rows: Record<FeatureKey, { minimal: boolean; complete: boolean }>`
- Actions: `setShowNew`, `setShowBadges`, `setMinimal(key, on)`, `setComplete(key, on)` (applying the build-up rule), `allMinimal`, `allComplete` and `reset`.
- Pure helper `isOn(state, keys: FeatureKey | FeatureKey[], part: 'minimal' | 'complete' = 'minimal')`: false when `showNew` is off; otherwise true when any listed key has that part on.
- Helpers to map existing markers:
  - `keyForFeature(n)` turns 3 into `'f3'`.
  - `keyForItem(id)` maps `'CRM-C4'` to `{ key: 'crm', part: 'complete' }`. The prefixes are QB, CRM, JS, RP and BK. X items follow `'qb'`.
- Tests in `features/lib/feature-visibility.test.ts`:
  - The master switch hides everything.
  - Complete implies Minimal.
  - Unticking Minimal unticks Complete.
  - Multi-feature parts show when any listed feature is on.
  - Reset restores the defaults.

### 3. Gates

In `features/components/ui/live.tsx`, next to `NewBadge`:

- `<FeatureGate feature={24}>` or `feature={[3, 24]}`, or `<FeatureGate item="CRM-C4">`, or `<FeatureGate featureKey="crm" part="complete">`. It renders children only when `isOn(...)` is true.
- `<FeatureRouteGate …>` for whole routes, showing the EmptyState described in the rules.
- Change `NewBadge` (and `VersionBadge` and `ConfirmBadge`, if present) to render nothing unless `showBadges` is on. Keep their markup otherwise unchanged.
- Export everything from `features/components/ui/index.ts`.

### 4. Retrofit every new part

1. Run `grep -rn "<NewBadge" --include=*.tsx .` to list all 91 uses.
2. For each one, find the element the badge labels: the section, card, tab, button, table column, field or nav item. Wrap that element in `<FeatureGate>`, using the same `feature` value as the badge.
3. Where a badge sits inside a list definition rather than JSX, filter the list through `isOn` instead of wrapping. This applies to tab arrays, `NEW_NAV` and `SETTINGS_NAV` items with `isNew`, report tabs in `components/reports/FeatureTabs.tsx`, and column configs.
4. Wrap each new module route (`/time`, `/supplier-orders`, `/repaint-alerts`, `/accounting`, `/marketing`, and the NEW settings pages) in `FeatureRouteGate`.
5. If `docs/EMTS_BUILD_MINIMAL_COMPLETE.md` has been run, also replace each `VersionGate item="…"` with `FeatureGate item="…"`. Remove the old version store, and remove the Version select from the Prototype bar. Then update that doc's Phase 0 to say the dashboard panel replaces the version switch.
6. Keep a checklist in your report: every file touched, and every badge that could not be cleanly gated, with the reason.

### 5. The panel: `components/dashboard/NewFeaturesPanel.tsx`

- Place it at the top of the dashboard, above the existing widgets, with `id="new-features"`.
- Use existing parts only:
  - `Card` and `CardTitle` (with a Sparkles icon);
  - the feature `Table` / `THead` / `TH` / `TD` (responsive);
  - the Checkbox from `components/ui/form.tsx` (Radix);
  - `Button` (secondary, size sm) for the quick buttons;
  - `Badge` for the "Not built yet" pill;
  - `Switch` for "Show NEW badges on screens".
- Give each checkbox a clear label for screen readers, for example `aria-label="Show Minimal version of CRM lead pipelines"`.
- Under the title, show a one-line count: "{n} of {total} features showing".
- Link the Prototype bar to the panel: add a "New features panel" button that goes to `/dashboard#new-features`.

### 6. Checks

Run `npm run typecheck`, `npm test` and `npm run build`. Then walk through these by hand:

1. Untick "Show new features". The sidebar shows no Operations group, the estimate page shows no colour card or change orders, and Reports shows no Job Performance, Estimating Feedback or finance tabs. Opening `/time` shows "This feature is switched off". Tick it again, and everything is back.
2. Untick Minimal on Feature 24. The change order parts disappear on estimates, and nothing else changes.
3. Tick Complete on CRM. Minimal ticks itself. Untick Minimal, and Complete unticks.
4. Reload the page. All choices are kept. "Reset demo data" on the Prototype bar restores the defaults.
5. Turn on "Show NEW badges on screens". The green badges are back in their old places.
6. No page has an empty tab, blank column or stray divider in any combination you try.

Commit as `feat(prototype): New Features panel replaces scattered badges`. Report the files changed, the badges you could not gate (with reasons), and the routes to try.
