# Spec Check

All 30 checks pass. They cover the seven decisions of 2 Oct (D1–D7, tab 9) and the items tab 9 flagged in tabs 1, 2 and 4. The first pass on commit 9f530a6 found 18 passes, 3 partial and 9 failures; commit f9041e5 fixed the twelve. The "First check" column shows the earlier result.

Checked against commit f9041e5 on 2 Oct 2026 with unit and flow tests (733 passing), typecheck, build, and a browser walkthrough of every fixed item. Copied into this doc on 5 Oct 2026 from docs/emts-phase-2/10-spec-check.md in the repo.

## D1 – QuickBooks sync timing (tab 1)

| # | Check | First check | Now | How it works |
| --- | --- | --- | --- | --- |
| 1 | Sync on save, any hour, any day | Pass | **Pass** | No exchange window. A record is sent when it is saved. |
| 2 | Auto retry at 1, 5, 30, 120 min, then Needs Attention | Pass | **Pass** | All four retries run. The record moves after the 4th failed retry (5th attempt). |
| 3 | Parent first: Customer → Project → Invoice → Payment | Pass | **Pass** | A child waits ("Waiting for parent") until its parent is accepted. |
| 4 | No duplicates on resend | Pass | **Pass** | The idempotency key is kept per record version. |
| 5 | Sync now, disabled while syncing | Pass | **Pass** |  |
| 6 | Start sync gate | Partial | **Pass** | Needs income account, deposit account, card payment method and every tax region. Shows "Map every tax region first". Then: from a start date (default the 1st of the month) or new records only. |
| 7 | Contacts and jobs sent when saved | Fail | **Pass** | A new or edited contact and a new signed job are sent within 15 seconds. An edit updates the same QuickBooks customer. A lead is never sent. |
| 8 | Invoice amount and date locked once sent | Fail | **Pass** | The invoice page's Edit becomes a disabled "Edit this invoice in QuickBooks". |
| 9 | Sync Log | Partial | **Pass** | Time, Record type, EM number (link), QuickBooks ref, Direction, Result. Filters: dates (last 7 days), record type, result. Newest first, 25 a page, kept 12 months. |
| 10 | Needs Attention | Pass | **Pass** | Plain-words reason, first failure, attempts, Retry, Open record, Dismiss (flags only), count badge, "Everything is in sync." |
| 11 | Disconnect confirmation | Fail | **Pass** | "Stop syncing with {CompanyName}? Records already in QuickBooks stay there." |
| 12 | Reconnect needed | Fail | **Pass** | Sync pauses, the card shows "Sync is paused. {N} records are waiting.", admins are notified, waiting records send after Reconnect. |
| 13 | Activity log strings | Fail | **Pass** | Connect, Disconnect, Options, Sent, Failed, Variance, Deleted and Review lines word for word. |

## D2 and D3 – matching and the add-on (tab 1)

| # | Check | First check | Now | How it works |
| --- | --- | --- | --- | --- |
| 14 | Match on email OR exact name; duplicate only on a split or several names | Pass | **Pass** | Names are compared ignoring case and extra spaces. |
| 15 | No add-on: card locked, "Add QuickBooks to your plan.", no Connect | Pass | **Pass** | The Prototype bar has a QuickBooks add-on switch. |
| 16 | Only Owner and Admin (PAYMENT\_CONFIG) connect, change options and confirm matches | Pass | **Pass** | Admin is the office manager in the prototype. |

## D4, D5 and D6 – lead form and sources (tab 2)

| # | Check | First check | Now | How it works |
| --- | --- | --- | --- | --- |
| 17 | 5 submissions per hour per address | Pass | **Pass** |  |
| 18 | Form fields and validation | Partial | **Pass** | Full name 2–80; US phone, 10 digits; valid email; one of the two required. Property address with lookup; "What would you like painted?" dropdown; message up to 1,000. |
| 19 | Thanks message | Pass | **Pass** | "Thanks, we've received your request and will be in touch soon." |
| 20 | Match to an open lead: still created, marked "Possible duplicate" with a link | Pass | **Pass** |  |
| 21 | In-app notice "New lead from {Source}: {Name}." | Fail | **Pass** | Sent to the owner, the office manager and the default estimator. |
| 22 | Lead sources tab: 8 built in, admin-added, 30 characters, unique, no delete with leads | Pass | **Pass** | A rename keeps the old name, so existing leads keep their source. |
| 23 | Tracked links, Source filter and Group by Source use the list | Pass | **Pass** |  |
| 24 | Stages, sources and links editable by Admin Master Data only | Fail | **Pass** | Everyone else sees them read-only. |

## D7 – crew emails (tab 4)

| # | Check | First check | Now | How it works |
| --- | --- | --- | --- | --- |
| 25 | Subject "Schedule update from {Company}: {N} jobs changed" | Pass | **Pass** | English and Spanish. |
| 26 | Template "Schedule Update (crew)" | Pass | **Pass** |  |
| 27 | Old dates crossed through beside the new ones | Pass | **Pass** | In the email preview. |
| 28 | Send Email disabled with "No changes to send." | Fail | **Pass** | Sending for one job shows "Update sent to {N} people." |
| 29 | Activity log per person | Fail | **Pass** | Sent, unticked and not-delivered lines in tab 4's wording. |

## Build health

| # | Check | First check | Now | How it works |
| --- | --- | --- | --- | --- |
| 30 | Typecheck, tests, build, README | Pass | **Pass** | 733 tests pass. The start-of-month test is fixed. The README count is updated. |

## Choices the spec left open

These were settled in the code and are now written into tabs 1 and 2.

- **Default estimator.** The organisation now has a default estimator setting (Priya Shah in the demo). New website leads are assigned to them, and they get the new-lead notice.
- **Address lookup.** The prototype suggests from a short local list. The real build needs an address service.
- **Lead or contact.** A person is sent to QuickBooks once they have a job or estimate. Before that they are a lead, and leads are never sent.
- **Retry count.** Tab 1 now says the record moves after the fourth failed retry (the fifth attempt), so the 120-minute retry runs.

## Not part of this check

- Tab 3 (Amended estimates), tab 5 (Books) and the 14 v1.0 features. Tab 9 marks them as matching.
- What tab 9 lists as Mocked or Open: real Intuit OAuth, real email and bank delivery, and the CPA sign-off.
- Tab 9's "Fixes this doc needs" list, which is about the spec doc, not the code.
