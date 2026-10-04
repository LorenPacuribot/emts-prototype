# EMTS Phase 2

Oct 1, 2026 · @Lors

## Overview

This doc holds four feature design specs from the Estimate Master Update call on 30 Sep 2026. Each has its own tab. They follow the house module template, with Acceptance Criteria for QA sign-off.

| Tab | Feature | Why Tim wants it | Builds on |
| --- | --- | --- | --- |
| 1 | QuickBooks integration | His newest subscriber moved from Paint Scout and needs invoices and contacts in QuickBooks to stay | Feature 33 design (one owner per field) |
| 2 | CRM lead pipelines | Leads from forms should land in the board by themselves; separate Sales and Production boards like Paint Scout | CR-5 (23 Sep), Settings › Pipeline Stages |
| 3 | Amended estimates in reports | Monthly sales totals he can trust | CR-2 (23 Sep), EMTS-414 |
| 4 | Job scheduling emails | Stop the flood of crew emails; control who is told and when | CR-3 (23 Sep) |

Tabs 1 and 2 come first because Tim asked for prices on them straight away, and Amlan's QuickBooks estimate is due Monday 5 Oct. Tabs 3 and 4 are smaller and were already partly defined on 23 Sep.

Sources: the Gemini notes and Fireflies transcript of the 30 Sep call, the 23 Sep weekly handoff, the Feature 33 design, and the Live App Inventory.

## Decisions applied

These were recommended by Claude and agreed by Loren on 1 Oct, based on what Tim asked for on the call. Tim has not yet confirmed them.

| Area | Decision | Based on |
| --- | --- | --- |
| QuickBooks | Estimate Master sends contacts, jobs, invoices and payments; QuickBooks sends back payment status only | Tim's list on the call; Feature 33 one-owner rule |
| QuickBooks | Customers created in QuickBooks go to a review list, never straight into Leads | Tim's lead-versus-contact question |
| QuickBooks | Managing QuickBooks from inside Estimate Master is Phase 2 | Call decision: connect first, replace later |
| QuickBooks | Sync on save, with a retry queue and Sync now | Tim expects payments to "just show up" |
| CRM | Sales and Production built in; more pipelines later with paid tiers | Tim: "those are the main two" |
| CRM | New, Sold, Lost and Complete are locked; everything else is editable | Dashboard and reports depend on them |
| CRM | Source set automatically by tracked link; shown as badge, filter and Group by | Tim did not want customers asked where they came from |
| CRM | Sold creates a Production card automatically | Tim: once sold, it becomes a production thing |
| Reports | No change in value or hours → no new entry | Tim's paint colour example |
| Reports | Price drops create a negative entry in the month of the change | Past months stay closed |
| Reports | Entries use the re-approval date; hours follow value | Tanmoy's example; Tim on 23 Sep |
| Emails | Nothing sends on save; one summary email per person; sent from Edit Shift, Bulk Reschedule, or Unsent changes | Tim's 30 Sep request; CR-3 |

## Open questions

- [ ] Tim: does the QuickBooks mapping in tab 1 match what he meant by two-way sync?
- [ ] Tim: confirm the default Production stages (Pick Colours, Ready to Schedule, Scheduled, In Progress, Touch-ups, Complete).
- [ ] Amlan: front-end and back-end estimate for QuickBooks, due Monday 5 Oct. Also confirm the Intuit developer app and sandbox company.
- [ ] Amlan: when is a job created — at estimate approval (live app) or at payment (SRS)? Tab 1 sends the QuickBooks Project when the job is created. This is OQ-10.
- [ ] Bookkeeper: income account, deposit account and tax code mapping for Master's Touch Painting.
- [ ] Tanmoy: does anything move leads into Contacted, Scheduled or Pending automatically today? If so, those stay locked stages.
- [ ] Tanmoy: should moving a Production card change the job's own status, or stay a separate board for now?
- [ ] Tanmoy: can past amendments be backfilled from saved estimate history?
- [ ] Tim: are the blank hours on the Jobs Sold report (23 Sep) the same problem as tab 3, or a separate bug?
- [ ] Tanmoy: full list of automated email events for tab 4, component 4.
- [ ] Kevin and Tim: which subscription tier includes QuickBooks and the CRM pipelines.
