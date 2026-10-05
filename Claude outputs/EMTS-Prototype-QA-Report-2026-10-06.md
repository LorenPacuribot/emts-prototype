# EMTS Prototype QA Report — New Features and Break Scenarios

**Date:** 6 October 2026
**Build tested:** `emts-prototype` main, commit `f0f7e95` (5 Oct 2026)
**Environment:** production build (`npm run build` + `npm start`), prototype sign-in mode, no Supabase. Chromium via Playwright. Users: tim (Owner), dana (Office Manager), grace (Bookkeeper), priya (Estimator), luis (Crew Lead), marcus.

## Overall result

**NOT READY — FIX REQUIRED.**

The automated checks are green and the main happy paths work. But testing turned up 73 defects. 1 is Critical and 16 are High. Most of them sit in QuickBooks sync ordering, Books postings, role permissions, the public lead inbox and date handling.

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm test` | Pass (748 tests in 65 files) |
| `npm run build` | Pass (all routes) |
| Browser testing | 73 defects: 1 Critical, 16 High, 29 Medium, 27 Low |

I re-checked 4 of the top findings myself after the area testers finished: C-01, D-01, D-02 and D-07. All 4 reproduced.

## How to read this report

- Each bug has an ID by area: **A** = New Features panel and tours, **B** = QuickBooks and Books, **C** = CRM, lead form and marketing, **D** = scheduling emails, amendments and security.
- Every bug was reproduced at least twice in a fresh browser.
- Severity follows business impact, not looks.
- Scripts are in `qa/a–d/` and screenshots in `qa/shots/` in the cloud session. They are not in the repo.

## Fix first (Critical and High)

| ID | Area | Problem | Severity |
|---|---|---|---|
| C-01 | Lead form | `/api/website-form` is public. Anyone can list every pending lead (name, phone, email, address), delete leads, or overwrite one by reusing its `ref`. | Critical |
| D-01 | Security | Open redirect: `/login?next=/%09/evil.com` sends the user to evil.com after sign-in. A user who is already signed in is sent there just by opening the link. | High |
| D-02 | Security | Crew lead and estimator can open owner-only Settings by URL and save them. Payment gateway key saved as luis, stored in plain text. Team Access shows Edit/Delete/Add Member. | High |
| D-03 | Scheduling | Estimator, crew lead and bookkeeper can reschedule jobs and send crew updates. Spec 04 says only schedulers see Send. | High |
| D-04 | Reports | An approval made in the evening is booked in the next day or month. Reports group by UTC date but show local date. | High |
| D-05 | Amendments | Any edit to an amendment of a seeded estimate re-prices it ($6,327.94 to $1,063.13) and books a −$5,158.50 entry. | High |
| D-06 | Scheduling | A refused schedule move rolls back the job dates but not the shifts and crew days. The Notify modal then offers the wrong dates. | High |
| D-07 | Marketing | Tracked links (`/r/FALL-IG`, `/r/FALL-DOOR-QR`) crash with "This page couldn't load". | High |
| B-01 | QuickBooks | An invoice is sent before its Customer and Project. Breaks D1 parent order. | High |
| B-02 | QuickBooks | Sync runs before contact matching is confirmed, so a duplicate QuickBooks customer is created. | High |
| B-03 | QuickBooks | With destination set to "None", records still go to QuickBooks. | High |
| B-04 | Books | Sent invoices and recorded payments never post to the Books journal. | High |
| B-05 | QuickBooks | A synced invoice can be deleted or voided. Nothing is sent to QuickBooks and there is no warning. | High |
| B-06 | Books | Reconcile drops uncleared cheques forever. They can't be reconciled later. | High |
| C-02 | Lead form | A website lead lands in one staff browser only. Other staff never see it (without Supabase). | High |
| C-03 | Leads | When several leads arrive together, the second data store keeps only 1–2 of them. The missing ones skip Website Lead Review and duplicate checks. | High |
| C-04 | Tracked links | A paused tracked link still creates leads. The server never checks the paused state. | High |

### Also worth raising before go-live (from reading the code, not proven in the browser)

`/api/state` trusts a client-sent `X-EMTS-Page` header to decide guest access. Public marketing pages like `/lp/fall-interior` and `/r/FALL-IG` pass that check. Once Supabase is on, anyone could read and overwrite the whole shared copy by sending that header, including the payment gateway key from D-02. This could not be tested live because Supabase is not configured. Treat it as Critical until a developer confirms or rules it out.

## Area A — New Features panel and feature tours

**Result:** works well. No Critical or High bugs.

### What passed

- The master switch hides the Operations group, the 4 new Settings pages, the colour card, change orders and the new Reports tabs. Eleven direct URLs show the "This feature is switched off" page with a working link.
- Turning the master switch back on restores each row exactly as it was.
- Minimal/Complete rules work. All Minimal, All Complete and Reset work. The count is correct in every combination tried.
- No empty tabs, blank columns or stray dividers in any state tried.
- Choices survive a reload. "Reset demo data" restores the defaults.
- Rapid toggling, all 44 "Where to find it" links, aria-labels and keyboard toggling are fine.
- Tours start, step, resume after reload, warn when you leave the page, and offer "Switch on" when their feature is off.

### Bugs

| ID | Problem | Severity |
|---|---|---|
| A-01 | With Feature 33 and Books off but QuickBooks on, the QuickBooks row's "Accounting" link opens a switched-off page. `/accounting` doesn't check QuickBooks; `/settings/accounting` does. | Medium |
| A-02 | Some NEW/Minimal markers stay with the master switch off (dashboard Revenue, Estimates Log header, Pipeline Stages header). They are outside any gate. | Medium |
| A-03 | At 390px wide, the Details list is squeezed into a 58px column and overflows the card. Checkboxes are 16px, under the 24px touch target. | Medium |
| A-04 | `/dashboard#feature-tours` doesn't scroll to the card on a fresh load. | Low |
| A-05 | With the master switch off, Tab still reaches the Details buttons and links in the greyed table. | Low |
| A-06 | A hidden report opened by URL highlights the wrong area (Sales instead of Production). | Low |
| A-07 | Wrong value types in the saved state (e.g. `showNew:"false"`) are used without checks. Can show Complete on without Minimal. Only reachable by editing localStorage. | Low |
| A-08 | Feature tours buttons stay visible when the Feature tours card is hidden, and land on nothing. | Low |
| A-09 | Changes don't reach other open tabs. A stale tab can write old values back. | Low |
| A-10 | Wording differs from the spec: "Core modules (each built as one package)" instead of "Built in the prototype", and "Feature 24 · Core module" instead of "Feature 24". | Low |

**Not testable:** "Not built yet" rows. Every feature in the registry is marked `built: true`.

## Area B — QuickBooks integration and Estimate Master Books

**Result:** retry timing, Sync Log, the tax-region gate, invoice lock and most of D2 work. Ordering, destination handling and Books postings are broken.

### What passed

- D1 retries at +1, +5, +30 and +120 minutes, then Needs Attention with a count badge, Retry and Open record.
- Retry and Sync now don't create duplicate sends.
- Sync Log: newest first, 25 rows a page, last 7 days, filter by type.
- Start sync gate blocks until every tax region is mapped.
- A sent invoice is locked with "Edit this invoice in QuickBooks".
- D2 matching handles case, spaces, empty email and multi-name matches.
- D3: add-on off shows "Add QuickBooks to your plan."; estimator and crew are blocked; Admin can connect and disconnect.
- Books: Balance Sheet always balances; Reverse needs a reason; duplicate account numbers are refused; accounts with entries can only be deactivated.

### Bugs

| ID | Problem | Severity |
|---|---|---|
| B-01 | Invoice sent before its Customer and Project. `pendingParent()` treats a supplier bill on the same job as proof the project exists. | High |
| B-02 | Duplicate QuickBooks customer created before matching is confirmed. | High |
| B-03 | Destination "None" still sends to QuickBooks. | High |
| B-04 | Books: invoices and payments never post to the journal. | High |
| B-05 | Synced invoice can be deleted or voided with no sync and no warning. | High |
| B-06 | Reconcile drops uncleared cheques forever. | High |
| B-07 | Bookkeeper can change sync options and confirm matches. D3 says Owner and Admin only. | Medium |
| B-08 | Deleting a synced payment sends a −$50 "correction" payment. Payments that came from QuickBooks can be deleted. | Medium |
| B-09 | Sync Log date filter uses the UTC date, not the user's local date. | Medium |
| B-10 | A second QuickBooks customer with an already-matched email appears in no matching group. | Medium |
| B-11 | Seed data: Draft invoice INV-2026-3 is already in QuickBooks and locked. | Medium |
| B-12 | Switching Books → QuickBooks reconnects without the Connect step, then sends records saved while on Books. | Medium |
| B-13 | Invoice balance ignores the amount changed in QuickBooks ($2,283.33 shown vs $2,233.33 owed). | Medium |
| B-14 | Books has no manual journal entry screen, which spec 05 requires. | Medium |
| B-15 | Gusto pay run accepts negative wages. | Medium |
| B-16 | A synced contact can be deleted with no QuickBooks warning. | Medium |
| B-17 | Half-cent Gusto amounts fail with "does not balance". | Low |
| B-18 | Fast clicks on Sync now run several syncs and use up retry attempts. | Low |
| B-19 | Owner can't Dismiss a "Changed in QuickBooks" flag. | Low |
| B-20 | No QuickBooks badge on synced contacts and jobs. | Low |
| B-21 | Chart of accounts accepts duplicate account names. | Low |
| B-22 | Activity log typos: "Check Check 1190", double full stop, wrong field name. | Low |
| B-23 | QuickBooks card and matching stay visible in Books mode. | Low |
| B-24 | Demo gaps: no way to make a record fail, Start sync gate unreachable, clock can't move forward. | Low |

**Question for Tim:** name matching ignores case, but D2 says "exact display name". Which is wanted?

## Area C — CRM pipelines, website lead form, lead sources, marketing media

**Result:** form validation, duplicate marking, XSS handling, lead sources and media permissions work. The inbox API and lead delivery are the weak points.

### What passed

- D5 validation works in the form and again on the server (name 2–80, phone or email, the 5 painted options, message ≤ 1,000, honeypot, site key).
- D4: the 6th submission from one address gets 429.
- Duplicates are marked "Possible duplicate" with a link, across case, spaces and phone formats.
- Script and HTML in submissions show as plain text. Nothing runs.
- D6 lead sources: built-ins locked; add/rename/delete rules work; non-admins are read-only.
- Pipeline stages, drag rules and Stage History work.
- Media upload handles PNG/JPEG, rejects bad files cleanly, and blocks photos without permission.

### Bugs

| ID | Problem | Severity |
|---|---|---|
| C-01 | Public inbox API: read, delete and overwrite pending leads without sign-in. | Critical |
| C-02 | A website lead goes to one staff browser only. | High |
| C-03 | Leads arriving together are lost from the second data store. | High |
| C-04 | Paused tracked link still creates leads. | High |
| C-05 | Rate limit bypassed by changing the `X-Forwarded-For` header. With no header, all visitors share one slot. | Medium |
| C-06 | Failed attempts (typos, bad key) use up the 5-per-hour limit. | Medium |
| C-07 | New lead appears after about 26 seconds. Spec 02 says within 10. | Medium |
| C-08 | A deleted Production stage comes back after reload. | Medium |
| C-09 | Adding a source with a renamed source's old name takes over its leads. | Medium |
| C-10 | A no-permission photo uploaded from the composer gets stuck selected and blocks scheduling. | Medium |
| C-11 | Card source badges show the old name after a rename. | Low |
| C-12 | Website Lead Review contradicts D5 and the board (says "New lead" for a duplicate; flags phone/town as missing). | Low |
| C-13 | Phone check accepts letters and impossible numbers (`0000000000`). | Low |
| C-14 | Emoji count as two characters; the form silently cuts text. | Low |
| C-15 | Leaving out `startedAt` skips the bot timing check. | Low |
| C-16 | No warning for Instagram's 2,200-character caption limit. | Low |

## Area D — Scheduling emails, amended estimates, access and security

**Result:** the crew email itself is right (one summary, correct subject, Spanish, struck-through old dates). Permissions, date grouping and amendment pricing are not.

### What passed

- Saving a schedule sends nothing; one summary per person on Send.
- Subject and N are correct; Spanish works; template exists; notify twice doesn't resend.
- Multiple amendments add up exactly; tax-only changes book nothing; credit change orders book correctly.
- Forged, expired and garbage session cookies are rejected.
- Most open-redirect payloads are blocked (only the tab/newline trick gets through).
- Bad and revoked customer tokens show proper "link not valid" pages.

### Bugs

| ID | Problem | Severity |
|---|---|---|
| D-01 | Open redirect after sign-in via `%09`, `%0a`, `%0d`. | High |
| D-02 | Owner-only Settings open and save for any role. | High |
| D-03 | Non-schedulers can change the schedule and send crew updates. | High |
| D-04 | Evening approvals land in the wrong day/month in reports. | High |
| D-05 | Amendment edits re-price seeded estimates. | High |
| D-06 | Refused schedule move leaves shifts and crew days moved. | High |
| D-07 | Tracked links `/r/...` crash. | High |
| D-08 | Declining an amendment marks the whole sold estimate "Declined" and the lead "lost". | Medium |
| D-09 | Adding one crew member, or Apply with no change, flags every crew member as changed. | Medium |
| D-10 | Move and move back in the Edit Schedule panel keeps "Changes not sent". | Medium |
| D-11 | Success toasts show when the change was refused. | Medium |
| D-12 | Amend Estimate on EST-2026-41 fails with "Estimate not found". | Medium |
| D-13 | Reports show dollar values to roles without financial access. | Medium |
| D-14 | Jobs Sold rounds to whole dollars, so cards don't add up ($22,469 − $5,159 shown as $17,311). | Medium |
| D-15 | Estimates Log mixes pre-tax and tax-included amounts in one column. | Medium |
| D-16 | Change Orders panel calls a tax-included total "pre-tax". | Medium |
| D-17 | Prototype controls (Viewing as, Reset demo data) show for signed-out visitors on `/lp/*`. | Medium |
| D-18 | Crew email has no work-order links and no crew lead. | Low |
| D-19 | Crew with no email stay "waiting" forever and are logged as "unticked". | Low |
| D-20 | `/passport` is public in `proxy.ts` but has no page (404). | Low |
| D-21 | A Draft estimate is fully visible through its customer link. | Low |
| D-22 | The Original row's Email column shows the re-send date. | Low |
| D-23 | "Viewing as" picker is shown to non-owners and silently snaps back. | Low |

## Themes behind many bugs

1. **Permissions are checked in the menu, not on the page.** D-02, D-03, D-13, B-07. The rules in `permissions.ts` exist but pages don't enforce them on direct URLs.
2. **UTC vs local dates.** D-04 and B-09. Anything grouped by `iso.slice(0,10)` will be wrong for evening activity. Tim checks numbers live, so this will be noticed.
3. **Per-browser storage without Supabase.** C-02, C-03, A-09. Several features only behave as described once shared storage is on. Test again with Supabase before the demo.
4. **Seed data quirks.** D-05, D-12, B-11. Some seeded records don't match what the rules expect.

## Recommendation

**NOT READY — FIX REQUIRED** for the 17 Critical/High items above.

Suggested order:

1. Security: C-01, D-01, D-02, then the `/api/state` header check.
2. Money and reports: D-04, D-05, B-01–B-06.
3. Workflow: D-03, D-06, D-07, C-02–C-04.
4. Medium and Low items in normal backlog grooming.

Next step: draft Jira tickets for the Critical and High items (bugs under EMTS-213), for approval before filing.
